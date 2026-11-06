import { describe, it, expect } from 'vitest';
import { project } from '../assets/js/engine.js';

const base = {
  currentAge: 30, retirementAge: 65, income: 100000, wageGrowth: 0,
  contributionPercent: 0.05, rateOfReturn: 0, inflation: 0,
  payFrequency: 'annually',
  currentFederalRate: 0.22, currentStateRate: 0.05,
  retirementTaxMode: 'flat',
  retirementFederalRate: 0.22, retirementStateRate: 0.05,
  capitalGainsRate: 0, capAtLimit: false, taxSavingsTreatment: 'invest',
  employerMatchRate: 0, employerMatchLimit: 0,
};
const withBase = (over = {}) => ({ ...base, ...over });

describe('employer match sizing', () => {
  it('matches the employee contribution up to the limit', () => {
    // 5% contribution, employer matches 100% of the first 4% of pay
    const r = project(withBase({
      employerMatchRate: 1, employerMatchLimit: 0.04, retirementAge: 31,
    }));
    expect(r.schedule[0].rothMatch).toBeCloseTo(4000, 6);
  });

  it('matches only what you actually contribute when you are under the limit', () => {
    const r = project(withBase({
      contributionPercent: 0.03, employerMatchRate: 1, employerMatchLimit: 0.04,
      retirementAge: 31,
    }));
    expect(r.schedule[0].rothMatch).toBeCloseTo(3000, 6);
  });

  it('applies a partial match rate', () => {
    // 50% of the first 6% of pay, contributing 6%
    const r = project(withBase({
      contributionPercent: 0.06, employerMatchRate: 0.5, employerMatchLimit: 0.06,
      retirementAge: 31,
    }));
    expect(r.schedule[0].rothMatch).toBeCloseTo(3000, 6);
  });

  it('is zero when there is no match', () => {
    const r = project(withBase({ retirementAge: 31 }));
    expect(r.schedule[0].rothMatch).toBe(0);
    expect(r.roth.match.balance).toBe(0);
  });

  it('is zero when you contribute nothing, since there is nothing to match', () => {
    const r = project(withBase({
      contributionPercent: 0, employerMatchRate: 1, employerMatchLimit: 0.04,
      retirementAge: 31,
    }));
    expect(r.schedule[0].rothMatch).toBe(0);
  });

  it('grows with wages like the employee contribution does', () => {
    const r = project(withBase({
      wageGrowth: 0.03, employerMatchRate: 1, employerMatchLimit: 0.04, retirementAge: 33,
    }));
    expect(r.schedule[0].rothMatch).toBeCloseTo(4000, 6);
    expect(r.schedule[1].rothMatch).toBeCloseTo(4120, 6);
  });
});

describe('the match is pre-tax in BOTH scenarios', () => {
  const matched = withBase({
    employerMatchRate: 1, employerMatchLimit: 0.04, rateOfReturn: 0.07,
  });

  it('gives the Roth saver a taxable sub-account too', () => {
    const r = project(matched);
    expect(r.roth.match.balance).toBeGreaterThan(0);
    // Taxed at withdrawal even though the employee's own money is Roth.
    expect(r.roth.match.afterTax).toBeCloseTo(r.roth.match.balance * (1 - 0.27), 6);
  });

  it('holds an identical match balance in both scenarios', () => {
    const r = project(matched);
    expect(r.traditional.match.balance).toBeCloseTo(r.roth.match.balance, 6);
  });

  it('cancels out under a single flat retirement rate', () => {
    // This fixture is flat mode, which forces one shared rate on both sides.
    // The match term is then algebraically identical either way, so it must
    // cancel. That is a property of flat mode, NOT of the engine in general --
    // see the brackets-mode test below.
    for (const [now, ret] of [[0.12, 0.32], [0.32, 0.12], [0.22, 0.22]]) {
      const noMatch = project(withBase({
        rateOfReturn: 0.07, currentFederalRate: now, retirementFederalRate: ret,
      }));
      const withMatch = project(withBase({
        rateOfReturn: 0.07, currentFederalRate: now, retirementFederalRate: ret,
        employerMatchRate: 1, employerMatchLimit: 0.04,
      }));
      expect(withMatch.winner).toBe(noMatch.winner);
      expect(withMatch.difference).toBeCloseTo(noMatch.difference, 6);
    }
  });

  it('does NOT cancel under progressive brackets, which is the shipped default', () => {
    // The Roth saver's only pre-tax money is the match, so their withdrawal is
    // small and fills the low brackets. The Traditional saver has already used
    // those brackets on their own balance. Different effective rates, so the
    // match genuinely shifts the answer.
    const gap = (employerMatchRate) => project(withBase({
      rateOfReturn: 0.07, retirementTaxMode: 'brackets',
      employerMatchRate, employerMatchLimit: 0.04,
    })).difference;
    expect(gap(0)).toBeGreaterThan(gap(1));
    expect(gap(1)).toBeGreaterThan(gap(2));
  });

  it('gives the Roth saver the lower effective rate of the two', () => {
    const r = project(withBase({
      rateOfReturn: 0.07, retirementTaxMode: 'brackets',
      employerMatchRate: 1, employerMatchLimit: 0.04,
    }));
    expect(r.roth.effectiveFederalRate).toBeLessThan(r.traditional.effectiveFederalRate);
  });

  it('raises both totals by the same after-tax amount', () => {
    const noMatch = project(withBase({ rateOfReturn: 0.07 }));
    const withMatch = project(withBase({
      rateOfReturn: 0.07, employerMatchRate: 1, employerMatchLimit: 0.04,
    }));
    const lift = withMatch.roth.match.afterTax;
    expect(withMatch.roth.total - noMatch.roth.total).toBeCloseTo(lift, 6);
    expect(withMatch.traditional.total - noMatch.traditional.total).toBeCloseTo(lift, 6);
  });

  it('counts the match as free money, not as out-of-pocket cost', () => {
    const r = project(withBase({
      rateOfReturn: 0.07, employerMatchRate: 1, employerMatchLimit: 0.04,
    }));
    const noMatch = project(withBase({ rateOfReturn: 0.07 }));
    expect(r.roth.outOfPocket).toBeCloseTo(noMatch.roth.outOfPocket, 6);
  });
});

describe('match interaction with grossing up', () => {
  it('can earn more match when grossing up lifts you toward the limit', () => {
    // Contributing 3% with a 4% match limit: grossing up to 3/(1-0.27) = 4.1%
    // clears the limit, so the Traditional side captures the full match.
    const r = project(withBase({
      contributionPercent: 0.03, taxSavingsTreatment: 'gross-up',
      employerMatchRate: 1, employerMatchLimit: 0.04, retirementAge: 31,
    }));
    expect(r.schedule[0].rothMatch).toBeCloseTo(3000, 6);
    expect(r.schedule[0].tradMatch).toBeCloseTo(4000, 6);
  });

  it('leaves the match equal when the limit already binds on both sides', () => {
    const r = project(withBase({
      contributionPercent: 0.10, taxSavingsTreatment: 'gross-up',
      employerMatchRate: 1, employerMatchLimit: 0.04, retirementAge: 31,
    }));
    expect(r.schedule[0].tradMatch).toBeCloseTo(r.schedule[0].rothMatch, 6);
  });
});

describe('totals including the match', () => {
  it('reports a combined after-tax total for each option', () => {
    const r = project(withBase({
      rateOfReturn: 0.07, employerMatchRate: 1, employerMatchLimit: 0.04,
    }));
    expect(r.roth.total).toBeCloseTo(r.roth.afterTax + r.roth.match.afterTax, 6);
    expect(r.traditional.total).toBeCloseTo(
      r.traditional.afterTax + r.traditional.match.afterTax + r.traditional.side.afterTax, 6,
    );
  });

  it('still reports the difference as the gap between combined totals', () => {
    const r = project(withBase({
      rateOfReturn: 0.07, employerMatchRate: 1, employerMatchLimit: 0.04,
      currentFederalRate: 0.32,
    }));
    expect(r.difference).toBeCloseTo(Math.abs(r.roth.total - r.traditional.total), 6);
  });
});
