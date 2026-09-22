import { describe, it, expect } from 'vitest';
import { project, defaultInputs } from '../assets/js/engine.js';

/**
 * When a single retirement rate `t` applies to all of a person's pre-tax
 * withdrawals — which is what "your combined retirement tax rate" means to a
 * reader — the employer match cancels algebraically:
 *
 *   roth(t) = rothBalance + matchBalance(1 - t)
 *   trad(t) = (tradBalance + matchBalance)(1 - t) + sideAfterTax
 *
 * The matchBalance(1 - t) term appears on both sides and drops out, leaving
 *
 *   t = 1 - (rothBalance - sideAfterTax) / tradBalance
 *
 * The match is identical money taxed identically, so it cannot shift the
 * threshold. It shifts the *gap* at any given rate, which is a different
 * thing and is what the brackets-mode effective rates capture.
 */
const tieAt = (inputs, t) => project({
  ...inputs, retirementTaxMode: 'flat', retirementFederalRate: t, retirementStateRate: 0,
});

describe('the break-even rate is the rate at which the two actually tie', () => {
  it('produces a genuine tie under the shipped defaults', () => {
    const base = { ...defaultInputs(), retirementStateRate: 0 };
    const t = project(base).breakEvenRetirementRate;
    const tied = tieAt(base, t);
    expect(tied.difference).toBeLessThan(1);
    expect(tied.winner).toBe('tie');
  });

  it('ties across match levels, because the match cancels', () => {
    for (const employerMatchRate of [0, 0.5, 1, 2, 3]) {
      const base = { ...defaultInputs(), employerMatchRate, retirementStateRate: 0 };
      const t = project(base).breakEvenRetirementRate;
      expect(tieAt(base, t).difference, `match ${employerMatchRate}`).toBeLessThan(1);
    }
  });

  it('is unchanged by the size of the match', () => {
    const at = (employerMatchRate) => project({
      ...defaultInputs(), employerMatchRate, retirementStateRate: 0,
    }).breakEvenRetirementRate;
    expect(at(0)).toBeCloseTo(at(1), 9);
    expect(at(1)).toBeCloseTo(at(3), 9);
  });

  it('ties across incomes and contribution levels', () => {
    for (const [income, contributionPercent] of [[45000, 0.06], [120000, 0.15], [300000, 0.1]]) {
      const base = { ...defaultInputs(), income, contributionPercent, retirementStateRate: 0 };
      const t = project(base).breakEvenRetirementRate;
      expect(tieAt(base, t).difference, `${income}/${contributionPercent}`).toBeLessThan(1);
    }
  });

  it('matches the closed form exactly', () => {
    const r = project({ ...defaultInputs(), retirementStateRate: 0 });
    const expected = 1 - (r.roth.balance - r.traditional.side.afterTax) / r.traditional.balance;
    expect(r.breakEvenRetirementRate).toBeCloseTo(expected, 9);
  });
});

describe('break-even under each tax-savings treatment', () => {
  it('is exactly zero when the refund is spent, matching what the UI says', () => {
    // No side account, and identical balances, so the threshold collapses to
    // zero: Roth wins at any positive rate. The UI has always said this; the
    // engine now agrees instead of reporting 1.43%.
    const r = project({ ...defaultInputs(), taxSavingsTreatment: 'spend' });
    expect(r.breakEvenRetirementRate).toBe(0);
  });

  it('confirms Roth wins at every positive rate in spend mode', () => {
    const base = { ...defaultInputs(), taxSavingsTreatment: 'spend', retirementStateRate: 0 };
    for (const t of [0.005, 0.01, 0.02, 0.2]) {
      expect(tieAt(base, t).winner, `rate ${t}`).toBe('roth');
    }
  });

  it('ties under gross-up too', () => {
    const base = {
      ...defaultInputs(), income: 60000, taxSavingsTreatment: 'gross-up',
      retirementStateRate: 0,
    };
    const t = project(base).breakEvenRetirementRate;
    expect(tieAt(base, t).difference).toBeLessThan(1);
  });

  it('lands near the contribution-side rate when there is no gains drag', () => {
    // Classic result: with no tax drag on the side account, the accounts tie
    // when the retirement rate equals the rate the deduction was worth.
    const base = {
      ...defaultInputs(), wageGrowth: 0, inflation: 0, capitalGainsRate: 0,
      retirementStateRate: 0,
    };
    const r = project(base);
    expect(r.breakEvenRetirementRate).toBeCloseTo(r.currentCombinedRate, 4);
  });
});
