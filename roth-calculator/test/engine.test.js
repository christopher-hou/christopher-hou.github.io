import { describe, it, expect } from 'vitest';
import { project, PAY_FREQUENCIES, defaultInputs, periodsPerYearFor } from '../assets/js/engine.js';

/** Baseline: no growth, no inflation, no tax drag — the easiest case to verify by hand. */
const flat = {
  currentAge: 30,
  retirementAge: 65,
  income: 100000,
  wageGrowth: 0,
  contributionPercent: 0.1,
  rateOfReturn: 0,
  inflation: 0,
  payFrequency: 'annually',
  currentTaxMode: 'flat',
  retirementTaxMode: 'flat',
  currentFederalRate: 0.22,
  currentStateRate: 0,
  retirementFederalRate: 0.22,
  retirementStateRate: 0,
  capitalGainsRate: 0,
  investTaxSavings: true,
  capAtLimit: false,
};

const withDefaults = (over = {}) => ({ ...flat, ...over });

describe('pay frequency', () => {
  it('maps each frequency to its periods per year', () => {
    expect(periodsPerYearFor('weekly')).toBe(52);
    expect(periodsPerYearFor('biweekly')).toBe(26);
    expect(periodsPerYearFor('semimonthly')).toBe(24);
    expect(periodsPerYearFor('monthly')).toBe(12);
    expect(periodsPerYearFor('annually')).toBe(1);
  });

  it('exposes a frequency list for the UI', () => {
    expect(PAY_FREQUENCIES.map((f) => f.value)).toContain('monthly');
  });

  it('falls back to monthly for an unknown frequency', () => {
    expect(periodsPerYearFor('fortnightly-ish')).toBe(12);
  });
});

describe('defaultInputs', () => {
  it('produces a complete, runnable input set', () => {
    const r = project(defaultInputs());
    expect(r.roth.afterTax).toBeGreaterThan(0);
  });

  it('has no "contribution type" input — the calculator determines it', () => {
    expect(Object.keys(defaultInputs())).not.toContain('contributionType');
  });

  it('expresses contributions as a fraction of income, not a flat amount', () => {
    const d = defaultInputs();
    expect(d.contributionPercent).toBeGreaterThan(0);
    expect(d.contributionPercent).toBeLessThan(1);
    expect(d).not.toHaveProperty('annualContribution');
  });
});

describe('basic projection', () => {
  it('runs one year per year between now and retirement', () => {
    const r = project(withDefaults());
    expect(r.years).toBe(35);
    expect(r.schedule).toHaveLength(35);
    expect(r.schedule[0].age).toBe(30);
    expect(r.schedule.at(-1).age).toBe(64);
  });

  it('sums contributions with no return as percent x income x years', () => {
    const r = project(withDefaults());
    expect(r.totalContributions).toBeCloseTo(10000 * 35, 6);
    expect(r.roth.balance).toBeCloseTo(350000, 6);
  });

  it('returns all zeros when retirement age equals current age', () => {
    const r = project(withDefaults({ retirementAge: 30 }));
    expect(r.years).toBe(0);
    expect(r.roth.balance).toBe(0);
    expect(r.traditional.total).toBe(0);
    expect(r.schedule).toHaveLength(0);
    expect(Number.isFinite(r.difference)).toBe(true);
  });

  it('clamps a retirement age below the current age to zero years', () => {
    const r = project(withDefaults({ retirementAge: 25 }));
    expect(r.years).toBe(0);
  });

  it('produces zero balances at a zero contribution rate', () => {
    const r = project(withDefaults({ contributionPercent: 0 }));
    expect(r.roth.balance).toBe(0);
    expect(r.traditional.side.balance).toBe(0);
  });
});

describe('compounding', () => {
  it('deposits at period end, so one annual period earns no return', () => {
    const r = project(withDefaults({ retirementAge: 31, rateOfReturn: 0.07 }));
    expect(r.roth.balance).toBeCloseTo(10000, 6);
  });

  it('compounds an annual ordinary annuity correctly', () => {
    // year 1: 10,000. year 2: 10,000*1.07 + 10,000 = 20,700
    const r = project(withDefaults({ retirementAge: 32, rateOfReturn: 0.07 }));
    expect(r.roth.balance).toBeCloseTo(20700, 4);
  });

  it('honors the stated annual return regardless of pay frequency', () => {
    // A lump sum must grow at exactly 7%/yr however finely we slice the year.
    const oneYearGrowth = (freq) => {
      const r = project(withDefaults({
        retirementAge: 32, rateOfReturn: 0.07, payFrequency: freq,
      }));
      // Year 2's balance minus year 2 contributions = growth on year 1's money.
      return r.roth.balance - r.totalContributions;
    };
    // Monthly deposits earn intra-year growth that annual deposits do not,
    // so monthly ends higher — but not by more than a year of return.
    expect(oneYearGrowth('monthly')).toBeGreaterThan(oneYearGrowth('annually'));
    expect(oneYearGrowth('monthly')).toBeLessThan(oneYearGrowth('annually') + 10000 * 0.07);
  });

  it('grows monotonically with the rate of return', () => {
    const at = (rate) => project(withDefaults({ rateOfReturn: rate })).roth.balance;
    expect(at(0.07)).toBeGreaterThan(at(0.04));
    expect(at(0.12)).toBeGreaterThan(at(0.07));
  });
});

describe('wage growth', () => {
  it('grows each year\'s contribution with income', () => {
    const r = project(withDefaults({ wageGrowth: 0.03, retirementAge: 33 }));
    expect(r.schedule[0].contribution).toBeCloseTo(10000, 6);
    expect(r.schedule[1].contribution).toBeCloseTo(10300, 6);
    expect(r.schedule[2].contribution).toBeCloseTo(10609, 6);
  });

  it('raises total contributions above the flat-wage case', () => {
    const flatTotal = project(withDefaults()).totalContributions;
    const grownTotal = project(withDefaults({ wageGrowth: 0.03 })).totalContributions;
    expect(grownTotal).toBeGreaterThan(flatTotal);
  });
});

describe('the two accounts receive identical gross contributions', () => {
  it('leaves Roth and Traditional pre-tax balances equal', () => {
    const r = project(withDefaults({ rateOfReturn: 0.07, wageGrowth: 0.03 }));
    expect(r.traditional.balance).toBeCloseTo(r.roth.balance, 6);
  });
});

describe('out-of-pocket cost is equalized (the fairness invariant)', () => {
  it('costs the same take-home pay in both scenarios', () => {
    const r = project(withDefaults({ rateOfReturn: 0.07, currentStateRate: 0.05 }));
    expect(r.traditional.outOfPocket).toBeCloseTo(r.roth.outOfPocket, 6);
  });

  it('funds the side account with exactly the tax savings', () => {
    const r = project(withDefaults({ currentFederalRate: 0.22, currentStateRate: 0.05 }));
    expect(r.traditional.side.basis).toBeCloseTo(r.totalContributions * 0.27, 6);
  });

  it('spends rather than invests the savings when the toggle is off', () => {
    const r = project(withDefaults({ investTaxSavings: false }));
    expect(r.traditional.side.balance).toBe(0);
    expect(r.traditional.outOfPocket).toBeLessThan(r.roth.outOfPocket);
  });
});

describe('taxes at retirement', () => {
  it('leaves Roth untaxed', () => {
    const r = project(withDefaults({ rateOfReturn: 0.07 }));
    expect(r.roth.afterTax).toBeCloseTo(r.roth.balance, 6);
  });

  it('taxes the Traditional balance at the combined retirement rate', () => {
    const r = project(withDefaults({
      rateOfReturn: 0.07, retirementFederalRate: 0.22, retirementStateRate: 0.05,
    }));
    expect(r.traditional.afterTax).toBeCloseTo(r.traditional.balance * (1 - 0.27), 6);
  });

  it('taxes only the gains in the side account', () => {
    const r = project(withDefaults({ rateOfReturn: 0.07, capitalGainsRate: 0.15 }));
    const { balance, basis, afterTax } = r.traditional.side;
    expect(afterTax).toBeCloseTo(balance - (balance - basis) * 0.15, 6);
    expect(afterTax).toBeGreaterThan(basis);
  });

  it('adds the retirement state rate to the capital gains rate', () => {
    const noState = project(withDefaults({ rateOfReturn: 0.07, capitalGainsRate: 0.15 }));
    const withState = project(withDefaults({
      rateOfReturn: 0.07, capitalGainsRate: 0.15, retirementStateRate: 0.05,
    }));
    expect(withState.traditional.side.afterTax).toBeLessThan(noState.traditional.side.afterTax);
  });
});

describe('break-even retirement tax rate', () => {
  it('equals the current combined rate when there is no capital gains drag', () => {
    const r = project(withDefaults({
      rateOfReturn: 0.07, currentFederalRate: 0.24, currentStateRate: 0.05,
      capitalGainsRate: 0, retirementStateRate: 0,
    }));
    expect(r.breakEvenRetirementRate).toBeCloseTo(0.29, 6);
  });

  it('satisfies the closed form: breakEven = sideAfterTax / balance', () => {
    const r = project(withDefaults({ rateOfReturn: 0.07, capitalGainsRate: 0.15 }));
    expect(r.breakEvenRetirementRate)
      .toBeCloseTo(r.traditional.side.afterTax / r.traditional.balance, 9);
  });

  it('sits below the current rate once gains are taxed', () => {
    const r = project(withDefaults({
      rateOfReturn: 0.07, currentFederalRate: 0.24, capitalGainsRate: 0.15,
    }));
    expect(r.breakEvenRetirementRate).toBeLessThan(0.24);
  });

  it('actually produces a tie when the retirement rate lands on it', () => {
    const first = project(withDefaults({ rateOfReturn: 0.07, capitalGainsRate: 0.15 }));
    const tied = project(withDefaults({
      rateOfReturn: 0.07,
      capitalGainsRate: 0.15,
      retirementFederalRate: first.breakEvenRetirementRate,
      retirementStateRate: 0,
    }));
    expect(tied.difference).toBeCloseTo(0, 4);
    expect(tied.winner).toBe('tie');
  });

  it('is zero when the tax savings are spent, so Roth always wins', () => {
    const r = project(withDefaults({ rateOfReturn: 0.07, investTaxSavings: false }));
    expect(r.breakEvenRetirementRate).toBe(0);
    expect(r.winner).toBe('roth');
  });
});

describe('the verdict', () => {
  it('favors Roth when the retirement rate exceeds the break-even', () => {
    const r = project(withDefaults({
      rateOfReturn: 0.07, currentFederalRate: 0.12, currentStateRate: 0,
      retirementFederalRate: 0.32, retirementStateRate: 0, capitalGainsRate: 0,
    }));
    expect(r.winner).toBe('roth');
    expect(r.difference).toBeGreaterThan(0);
  });

  it('favors Traditional when the retirement rate falls below the break-even', () => {
    const r = project(withDefaults({
      rateOfReturn: 0.07, currentFederalRate: 0.32, currentStateRate: 0.1,
      retirementFederalRate: 0.12, retirementStateRate: 0, capitalGainsRate: 0,
    }));
    expect(r.winner).toBe('traditional');
    expect(r.difference).toBeGreaterThan(0);
  });

  it('reports the difference as a positive magnitude favoring the winner', () => {
    const r = project(withDefaults({ rateOfReturn: 0.07 }));
    expect(r.difference).toBeCloseTo(Math.abs(r.roth.afterTax - r.traditional.total), 6);
  });

  it('models relocating to a no-tax state as favoring Traditional', () => {
    const stay = project(withDefaults({
      rateOfReturn: 0.07, currentStateRate: 0.093, retirementStateRate: 0.093,
      currentFederalRate: 0.24, retirementFederalRate: 0.24, capitalGainsRate: 0,
    }));
    const move = project(withDefaults({
      rateOfReturn: 0.07, currentStateRate: 0.093, retirementStateRate: 0,
      currentFederalRate: 0.24, retirementFederalRate: 0.24, capitalGainsRate: 0,
    }));
    expect(move.traditional.total).toBeGreaterThan(stay.traditional.total);
    expect(move.winner).toBe('traditional');
  });
});

describe('inflation', () => {
  it('discounts nominal results into today\'s dollars', () => {
    const r = project(withDefaults({ rateOfReturn: 0.07, inflation: 0.025 }));
    const deflator = Math.pow(1.025, 35);
    expect(r.real.roth.afterTax).toBeCloseTo(r.roth.afterTax / deflator, 4);
    expect(r.real.traditional.total).toBeCloseTo(r.traditional.total / deflator, 4);
  });

  it('leaves real equal to nominal at zero inflation', () => {
    const r = project(withDefaults({ rateOfReturn: 0.07, inflation: 0 }));
    expect(r.real.roth.afterTax).toBeCloseTo(r.roth.afterTax, 6);
  });

  it('does not change which account wins', () => {
    const base = withDefaults({ rateOfReturn: 0.07, currentFederalRate: 0.32, retirementFederalRate: 0.12 });
    expect(project({ ...base, inflation: 0 }).winner)
      .toBe(project({ ...base, inflation: 0.04 }).winner);
  });

  it('reports the real difference consistently with the real totals', () => {
    const r = project(withDefaults({ rateOfReturn: 0.07, inflation: 0.025 }));
    expect(r.real.difference)
      .toBeCloseTo(Math.abs(r.real.roth.afterTax - r.real.traditional.total), 4);
  });
});

describe('IRS elective deferral cap', () => {
  it('caps a contribution that exceeds the limit', () => {
    const r = project(withDefaults({
      income: 500000, contributionPercent: 0.3, capAtLimit: true, retirementAge: 31,
    }));
    expect(r.schedule[0].contribution).toBeCloseTo(24500, 6);
    expect(r.schedule[0].capped).toBe(true);
  });

  it('leaves an under-limit contribution alone', () => {
    const r = project(withDefaults({ capAtLimit: true, retirementAge: 31 }));
    expect(r.schedule[0].contribution).toBeCloseTo(10000, 6);
    expect(r.schedule[0].capped).toBe(false);
  });

  it('indexes the limit forward by the inflation rate', () => {
    const r = project(withDefaults({
      income: 500000, contributionPercent: 0.3, capAtLimit: true,
      inflation: 0.025, retirementAge: 33,
    }));
    expect(r.schedule[1].contribution).toBeCloseTo(24500 * 1.025, 4);
    expect(r.schedule[2].contribution).toBeCloseTo(24500 * 1.025 ** 2, 4);
  });

  it('raises the limit with age-based catch-up contributions', () => {
    const r = project(withDefaults({
      currentAge: 49, retirementAge: 52, income: 500000,
      contributionPercent: 0.3, capAtLimit: true,
    }));
    expect(r.schedule[0].contribution).toBeCloseTo(24500, 6);       // age 49
    expect(r.schedule[1].contribution).toBeCloseTo(32500, 6);       // age 50
  });

  it('ignores the limit entirely when the cap is off', () => {
    const r = project(withDefaults({
      income: 500000, contributionPercent: 0.3, capAtLimit: false, retirementAge: 31,
    }));
    expect(r.schedule[0].contribution).toBeCloseTo(150000, 6);
    expect(r.schedule[0].capped).toBe(false);
  });

  it('flags whether any year hit the cap', () => {
    expect(project(withDefaults({ capAtLimit: true })).everCapped).toBe(false);
    expect(project(withDefaults({
      income: 500000, contributionPercent: 0.3, capAtLimit: true,
    })).everCapped).toBe(true);
  });
});

describe('robustness', () => {
  it('never emits NaN or Infinity for plausible extreme inputs', () => {
    const extremes = [
      { currentAge: 18, retirementAge: 75, income: 0, contributionPercent: 0.5 },
      { rateOfReturn: 0.12, inflation: 0.08, wageGrowth: 0.1 },
      { currentFederalRate: 0.37, currentStateRate: 0.14, retirementFederalRate: 0.37, retirementStateRate: 0.14 },
      { currentFederalRate: 0, currentStateRate: 0, retirementFederalRate: 0, retirementStateRate: 0 },
      { income: 1e7, contributionPercent: 0.5, capAtLimit: true },
      { payFrequency: 'weekly', rateOfReturn: 0.12 },
    ];
    for (const over of extremes) {
      const r = project(withDefaults(over));
      for (const v of [
        r.roth.balance, r.roth.afterTax, r.traditional.balance, r.traditional.afterTax,
        r.traditional.side.balance, r.traditional.side.afterTax, r.traditional.total,
        r.breakEvenRetirementRate, r.difference, r.totalContributions,
        r.real.roth.afterTax, r.real.traditional.total, r.real.difference,
      ]) {
        expect(Number.isFinite(v), `non-finite for ${JSON.stringify(over)}`).toBe(true);
      }
    }
  });

  it('does not mutate the input object', () => {
    const input = withDefaults();
    const snapshot = JSON.stringify(input);
    project(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('is deterministic', () => {
    const a = project(withDefaults({ rateOfReturn: 0.07 }));
    const b = project(withDefaults({ rateOfReturn: 0.07 }));
    expect(a.roth.afterTax).toBe(b.roth.afterTax);
    expect(a.traditional.total).toBe(b.traditional.total);
  });

  it('clamps a negative contribution percent to zero', () => {
    const r = project(withDefaults({ contributionPercent: -0.1 }));
    expect(r.roth.balance).toBe(0);
  });

  it('exposes a schedule suitable for charting balances over time', () => {
    const r = project(withDefaults({ rateOfReturn: 0.07 }));
    const last = r.schedule.at(-1);
    expect(last).toHaveProperty('rothBalance');
    expect(last).toHaveProperty('tradBalance');
    expect(last).toHaveProperty('sideBalance');
    expect(last.rothBalance).toBeCloseTo(r.roth.balance, 6);
    // balances increase year over year with positive contributions and return
    for (let i = 1; i < r.schedule.length; i++) {
      expect(r.schedule[i].rothBalance).toBeGreaterThan(r.schedule[i - 1].rothBalance);
    }
  });
});

describe('real (inflation-adjusted) contribution totals', () => {
  it('discounts each year\'s contribution from the year it was made', () => {
    // Discounting the whole stream by the terminal deflator would be wrong:
    // a contribution made in year 1 is discounted by one year, not thirty-five.
    const r = project(withDefaults({ inflation: 0.025, retirementAge: 33 }));
    const expected = 10000 / 1.025 + 10000 / 1.025 ** 2 + 10000 / 1.025 ** 3;
    expect(r.real.totalContributions).toBeCloseTo(expected, 4);
  });

  it('sits above the naive terminal-deflator figure', () => {
    const r = project(withDefaults({ inflation: 0.025 }));
    expect(r.real.totalContributions)
      .toBeGreaterThan(r.totalContributions / r.real.deflator);
  });

  it('equals the nominal total at zero inflation', () => {
    const r = project(withDefaults({ inflation: 0 }));
    expect(r.real.totalContributions).toBeCloseTo(r.totalContributions, 6);
  });

  it('discounts out-of-pocket cost the same way, preserving the fairness invariant', () => {
    const r = project(withDefaults({ inflation: 0.025, currentStateRate: 0.05 }));
    expect(r.real.traditional.outOfPocket).toBeCloseTo(r.real.roth.outOfPocket, 6);
    expect(r.real.roth.outOfPocket).toBeLessThan(r.roth.outOfPocket);
  });
});
