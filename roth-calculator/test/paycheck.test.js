import { describe, it, expect } from 'vitest';
import { paycheckBreakdown, project } from '../assets/js/engine.js';

// The user's own example: $100k salary, 5% deferral, 27% combined marginal.
const base = {
  currentAge: 30, retirementAge: 65, income: 100000, wageGrowth: 0,
  contributionPercent: 0.05, rateOfReturn: 0.07, inflation: 0,
  payFrequency: 'monthly',
  currentTaxMode: 'flat',
  currentFederalRate: 0.22, currentStateRate: 0.05,
  retirementTaxMode: 'flat',
  retirementFederalRate: 0.22, retirementStateRate: 0.05,
  capitalGainsRate: 0.15, capAtLimit: true,
  employerMatchRate: 0, employerMatchLimit: 0,
  taxSavingsTreatment: 'invest',
};
const withBase = (over = {}) => ({ ...base, ...over });
const breakdown = (over = {}) => {
  const inputs = withBase(over);
  return paycheckBreakdown(inputs, project(inputs));
};

describe('paycheckBreakdown: the same amount reaches the 401(k) either way', () => {
  const b = breakdown();

  it('defers an identical contribution on both sides', () => {
    expect(b.contribution.trad).toBeCloseTo(5000, 6);
    expect(b.contribution.roth).toBeCloseTo(5000, 6);
  });

  it('differs only in how much of your pay is exposed to tax', () => {
    expect(b.taxableWages.trad).toBeCloseTo(95000, 6);
    expect(b.taxableWages.roth).toBeCloseTo(100000, 6);
  });

  it('charges the Roth saver tax on the wages they did not shelter', () => {
    // 5,000 of extra taxable wages at a 27% combined marginal rate.
    expect(b.extraTax.roth).toBeCloseTo(1350, 6);
    expect(b.extraTax.trad).toBe(0);
  });

  it('cuts take-home pay by the contribution for Roth, and by less for pre-tax', () => {
    expect(b.takeHomeCut.roth).toBeCloseTo(5000, 6);
    expect(b.takeHomeCut.trad).toBeCloseTo(3650, 6);
  });

  it('routes exactly the tax saving into the brokerage account', () => {
    expect(b.sideDeposit.trad).toBeCloseTo(1350, 6);
    expect(b.sideDeposit.roth).toBe(0);
  });

  it('lands on an identical total cost, which is the whole point', () => {
    expect(b.totalCost.trad).toBeCloseTo(5000, 6);
    expect(b.totalCost.roth).toBeCloseTo(5000, 6);
    expect(b.equalized).toBe(true);
  });

  it('agrees with the career-long out-of-pocket figures', () => {
    const r = project(withBase());
    expect(r.traditional.outOfPocket).toBeCloseTo(r.roth.outOfPocket, 6);
  });

  it('reports a per-paycheck view as well as an annual one', () => {
    expect(b.periodsPerYear).toBe(12);
    expect(b.perPeriod.contribution.roth).toBeCloseTo(5000 / 12, 6);
    expect(b.perPeriod.totalCost.roth).toBeCloseTo(5000 / 12, 6);
  });
});

describe('paycheckBreakdown under gross-up', () => {
  const b = breakdown({ taxSavingsTreatment: 'gross-up' });

  it('defers more pre-tax rather than opening a side account', () => {
    expect(b.contribution.trad).toBeCloseTo(5000 / 0.73, 4);
    expect(b.contribution.roth).toBeCloseTo(5000, 6);
    expect(b.sideDeposit.trad).toBe(0);
  });

  it('shelters more wages, so the Roth tax gap is larger', () => {
    expect(b.taxableWages.trad).toBeCloseTo(100000 - 5000 / 0.73, 4);
    expect(b.extraTax.roth).toBeCloseTo((5000 / 0.73) * 0.27, 4);
  });

  it('still equalizes the total cost', () => {
    expect(b.totalCost.trad).toBeCloseTo(5000, 4);
    expect(b.totalCost.roth).toBeCloseTo(5000, 4);
    expect(b.equalized).toBe(true);
  });
});

describe('paycheckBreakdown when the savings are spent', () => {
  const b = breakdown({ taxSavingsTreatment: 'spend' });

  it('leaves Roth costing more, and says so', () => {
    expect(b.totalCost.roth).toBeCloseTo(5000, 6);
    expect(b.totalCost.trad).toBeCloseTo(3650, 6);
    expect(b.equalized).toBe(false);
  });

  it('quantifies how much more expensive Roth is', () => {
    expect(b.costGap).toBeCloseTo(1350, 6);
  });
});

describe('paycheckBreakdown edge cases', () => {
  it('handles a zero contribution', () => {
    const b = breakdown({ contributionPercent: 0 });
    expect(b.contribution.roth).toBe(0);
    expect(b.totalCost.roth).toBe(0);
    expect(b.equalized).toBe(true);
  });

  it('reflects a contribution trimmed by the IRS cap', () => {
    const b = breakdown({ income: 400000, contributionPercent: 0.2, capAtLimit: true });
    expect(b.contribution.roth).toBeCloseTo(24500, 6);
    expect(b.capped).toBe(true);
  });

  it('shows the employer match as money neither option pays for', () => {
    const b = breakdown({ employerMatchRate: 1, employerMatchLimit: 0.04 });
    expect(b.match.trad).toBeCloseTo(4000, 6);
    expect(b.match.roth).toBeCloseTo(4000, 6);
    // It is not part of what the contribution costs you.
    expect(b.totalCost.roth).toBeCloseTo(5000, 6);
  });

  it('never emits non-finite numbers at a 100% tax rate', () => {
    const b = breakdown({ currentFederalRate: 0.5, currentStateRate: 0.5 });
    for (const v of [b.totalCost.trad, b.totalCost.roth, b.contribution.trad]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('returns zeros rather than throwing when there are no contribution years', () => {
    const b = breakdown({ retirementAge: 30 });
    expect(b.contribution.roth).toBe(0);
    expect(Number.isFinite(b.totalCost.trad)).toBe(true);
  });
});

describe('side-account basis is available in both dollar views', () => {
  it('exposes a nominal basis equal to the total tax saving', () => {
    const r = project(withBase({ inflation: 0 }));
    expect(r.traditional.side.basis)
      .toBeCloseTo(r.totalContributions * r.currentCombinedRate, 6);
  });

  it('exposes a real basis, discounted from each year it was funded', () => {
    const r = project(withBase({ inflation: 0.025 }));
    expect(r.real.traditional.side.basis).toBeGreaterThan(0);
    expect(r.real.traditional.side.basis).toBeLessThan(r.traditional.side.basis);
  });

  it('keeps the real basis below the real side-account balance', () => {
    const r = project(withBase({ inflation: 0.025, rateOfReturn: 0.07 }));
    expect(r.real.traditional.side.basis).toBeLessThan(r.real.traditional.side.balance);
  });
});
