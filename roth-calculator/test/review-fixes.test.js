import { describe, it, expect } from 'vitest';
import { project, defaultInputs, paycheckBreakdown } from '../assets/js/engine.js';
import { decodeState } from '../assets/js/state.js';

describe('break-even solves across ALL pre-tax money, including the match', () => {
  // The match is taxed at the very rate being solved for, so holding its
  // after-tax value fixed while solving overstated the threshold.
  it('lands Traditional exactly on the Roth total at the stated rate', () => {
    // Re-projecting at the break-even rate also re-prices the Roth saver's
    // own match, so the two totals in that run are not the comparison. The
    // claim is that Traditional, taxed at this rate, reaches the Roth total
    // the verdict was quoting.
    const base = { ...defaultInputs(), retirementStateRate: 0 };
    const original = project(base);
    const t = original.breakEvenRetirementRate;
    const atRate = project({
      ...base, retirementTaxMode: 'flat', retirementFederalRate: t, retirementStateRate: 0,
    });
    expect(atRate.traditional.total).toBeCloseTo(original.roth.total, 0);
  });

  it('holds for the shipped defaults, not just a match-free fixture', () => {
    const d = defaultInputs();
    expect(d.employerMatchRate).toBeGreaterThan(0);
    const r = project(d);
    const expected = 1 - (r.roth.total - r.traditional.side.afterTax)
      / (r.traditional.balance + r.traditional.match.balance);
    expect(r.breakEvenRetirementRate).toBeCloseTo(expected, 9);
  });

  it('holds across a range of match levels', () => {
    for (const matchRate of [0, 0.5, 1, 2]) {
      const base = { ...defaultInputs(), employerMatchRate: matchRate, retirementStateRate: 0 };
      const original = project(base);
      const t = original.breakEvenRetirementRate;
      const atRate = project({
        ...base, retirementTaxMode: 'flat', retirementFederalRate: t, retirementStateRate: 0,
      });
      expect(atRate.traditional.total, `match ${matchRate}`)
        .toBeCloseTo(original.roth.total, 0);
    }
  });

  it('is lower than the old match-as-constant formula would have given', () => {
    const r = project(defaultInputs());
    const old = 1 - (r.roth.total - r.traditional.match.afterTax - r.traditional.side.afterTax)
      / r.traditional.balance;
    expect(r.breakEvenRetirementRate).toBeLessThan(old);
  });
});

describe('the deduction is valued against inflation-indexed brackets', () => {
  // Real brackets move with inflation. Applying fixed 2026 brackets to
  // nominal future income invented decades of bracket creep.
  it('holds the rate steady when real income is flat', () => {
    const r = project({ ...defaultInputs(), inflation: 0.05, wageGrowth: 0.05 });
    expect(r.schedule.at(-1).deductionRate)
      .toBeCloseTo(r.schedule[0].deductionRate, 6);
  });

  it('keeps the rate steady at every inflation level when wages track it', () => {
    for (const inflation of [0, 0.025, 0.05, 0.08]) {
      const r = project({ ...defaultInputs(), inflation, wageGrowth: inflation });
      expect(r.schedule.at(-1).deductionRate, `inflation ${inflation}`)
        .toBeCloseTo(r.schedule[0].deductionRate, 6);
    }
  });

  it('matches a frozen rate, which is the control for bracket creep', () => {
    // Real return held constant, so every row describes the same real economy.
    // Any difference between deriving the rate and freezing it is bracket
    // creep against un-indexed brackets. Before the fix this sweep moved the
    // real gap by more than 27x while the frozen control barely moved; the two
    // should now agree closely at every inflation level.
    const realGap = (inflation, over) => project({
      ...defaultInputs(), inflation, wageGrowth: inflation,
      rateOfReturn: 1.07 * (1 + inflation) - 1, ...over,
    }).real.difference;

    for (const inflation of [0, 0.025, 0.05, 0.08]) {
      const derived = realGap(inflation, {});
      const frozen = realGap(inflation, {
        currentTaxMode: 'flat', currentFederalRate: 0.12, currentStateRate: 0.05,
      });
      expect(derived, `inflation ${inflation}`).toBeCloseTo(frozen, -2);
    }
  });

  it('still raises the rate when income genuinely outgrows inflation', () => {
    const r = project({ ...defaultInputs(), income: 60000, wageGrowth: 0.05, inflation: 0.02 });
    expect(r.schedule.at(-1).deductionRate).toBeGreaterThan(r.schedule[0].deductionRate);
  });

  it('lowers the rate when income falls behind inflation', () => {
    const r = project({ ...defaultInputs(), income: 200000, wageGrowth: 0, inflation: 0.05 });
    expect(r.schedule.at(-1).deductionRate).toBeLessThan(r.schedule[0].deductionRate);
  });
});

describe('the employer match DOES move the verdict under progressive brackets', () => {
  // The opposite of what the old docs and the old test claimed. The Roth
  // saver's match fills the low brackets the Traditional saver has already
  // consumed, so their effective rates differ.
  it('narrows the gap as the match grows, in brackets mode', () => {
    const gap = (rate) => project({ ...defaultInputs(), employerMatchRate: rate }).difference;
    expect(gap(0)).toBeGreaterThan(gap(1));
    expect(gap(1)).toBeGreaterThan(gap(2));
  });

  it('gives the Roth saver a lower effective rate than the Traditional saver', () => {
    const r = project(defaultInputs());
    expect(r.roth.effectiveFederalRate).toBeLessThan(r.traditional.effectiveFederalRate);
  });

  it('leaves the gap untouched under a single flat rate, where it cancels', () => {
    const gap = (rate) => project({
      ...defaultInputs(), employerMatchRate: rate, retirementTaxMode: 'flat',
    }).difference;
    expect(gap(0)).toBeCloseTo(gap(1), 6);
    expect(gap(1)).toBeCloseTo(gap(2), 6);
  });
});

describe('URL booleans fall back to the default when malformed', () => {
  it('keeps the default for an unrecognised value', () => {
    for (const q of ['?capAtLimit=yes', '?capAtLimit=', '?capAtLimit=maybe', '?capAtLimit=2']) {
      expect(decodeState(q).capAtLimit, q).toBe(defaultInputs().capAtLimit);
    }
  });

  it('still honours explicit true and false', () => {
    expect(decodeState('?capAtLimit=1').capAtLimit).toBe(true);
    expect(decodeState('?capAtLimit=true').capAtLimit).toBe(true);
    expect(decodeState('?capAtLimit=0').capAtLimit).toBe(false);
    expect(decodeState('?capAtLimit=false').capAtLimit).toBe(false);
  });
});

describe('gross-up stops equalising once the IRS cap binds', () => {
  it('reports equalized=false when the cap truncates the grossed-up deferral', () => {
    const inputs = {
      ...defaultInputs(), income: 300000, contributionPercent: 0.1,
      taxSavingsTreatment: 'gross-up', capAtLimit: true,
    };
    const b = paycheckBreakdown(inputs, project(inputs));
    expect(b.contribution.trad).toBeCloseTo(b.contribution.roth, 6);
    expect(b.equalized).toBe(false);
    expect(b.costGap).toBeGreaterThan(1000);
  });

  it('still equalises when the cap does not bind', () => {
    const inputs = {
      ...defaultInputs(), income: 60000, contributionPercent: 0.1,
      taxSavingsTreatment: 'gross-up', capAtLimit: true,
    };
    const b = paycheckBreakdown(inputs, project(inputs));
    expect(b.equalized).toBe(true);
  });
});
