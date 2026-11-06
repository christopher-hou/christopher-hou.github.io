import { describe, it, expect } from 'vitest';
import { paycheckBreakdown, project } from '../assets/js/engine.js';
import { federalTaxOwed } from '../assets/js/tax.js';
import { STANDARD_DEDUCTION_2026 } from '../assets/js/tax-data.js';

const base = {
  currentAge: 30, retirementAge: 65, income: 100000, wageGrowth: 0,
  contributionPercent: 0.05, rateOfReturn: 0.07, inflation: 0,
  payFrequency: 'monthly',
  // 22% is the true bracket for $100k wages, so the entered rate is honest.
  currentTaxMode: 'flat',
  currentFederalRate: 0.22, currentStateRate: 0,
  retirementTaxMode: 'flat',
  retirementFederalRate: 0.22, retirementStateRate: 0,
  capitalGainsRate: 0.15, capAtLimit: true,
  employerMatchRate: 0, employerMatchLimit: 0,
  taxSavingsTreatment: 'invest',
};
const withBase = (over = {}) => ({ ...base, ...over });
const breakdown = (over = {}) => {
  const inputs = withBase(over);
  return paycheckBreakdown(inputs, project(inputs));
};

describe('actual tax and take-home pay', () => {
  it('computes federal tax from the brackets, not from the entered rate', () => {
    const b = breakdown();
    const expected = federalTaxOwed(100000 - 5000 - STANDARD_DEDUCTION_2026);
    expect(b.tax.trad).toBeCloseTo(expected, 2);
  });

  it('taxes the Roth saver on unsheltered wages', () => {
    const b = breakdown();
    expect(b.tax.roth).toBeCloseTo(federalTaxOwed(100000 - STANDARD_DEDUCTION_2026), 2);
    expect(b.tax.roth).toBeGreaterThan(b.tax.trad);
  });

  it('adds state tax at the entered flat rate', () => {
    const none = breakdown({ currentStateRate: 0 });
    const some = breakdown({ currentStateRate: 0.09 });
    expect(some.tax.roth - none.tax.roth).toBeCloseTo(100000 * 0.09, 2);
  });

  it('leaves take-home pay as what is left after tax, saving and the side account', () => {
    const b = breakdown();
    expect(b.takeHome.roth).toBeCloseTo(100000 - 5000 - b.tax.roth, 2);
    expect(b.takeHome.trad)
      .toBeCloseTo(100000 - 5000 - b.tax.trad - b.sideDeposit.trad, 2);
  });

  it('agrees between the two options when the entered rate matches the brackets', () => {
    // Equal out-of-pocket is only truly equal if the marginal rate is honest.
    const b = breakdown();
    expect(Math.abs(b.takeHome.trad - b.takeHome.roth)).toBeLessThan(5);
    expect(b.rateMismatch).toBe(false);
  });
});

describe('take-home pay falls as tax rises — the thing the chart hid', () => {
  it('drops as the state tax rate climbs', () => {
    const rates = [0, 0.05, 0.10];
    const homes = rates.map((s) => breakdown({ currentStateRate: s }).takeHome.roth);
    for (let i = 1; i < homes.length; i++) {
      expect(homes[i]).toBeLessThan(homes[i - 1]);
    }
  });

  it('drops as income tax rises even while the retirement stack grows', () => {
    const low = breakdown({ currentStateRate: 0 });
    const high = breakdown({ currentStateRate: 0.12 });
    const lowResult = project(withBase({ currentStateRate: 0 }));
    const highResult = project(withBase({ currentStateRate: 0.12 }));
    // The Traditional retirement total goes UP...
    expect(highResult.traditional.total).toBeGreaterThan(lowResult.traditional.total);
    // ...while the money you actually live on goes DOWN.
    expect(high.takeHome.trad).toBeLessThan(low.takeHome.trad);
  });
});

describe('detecting an entered rate the income cannot support', () => {
  it('flags a marginal rate far above what the brackets imply', () => {
    // $50k of wages is a 22% bracket; claiming 50% federal is not credible.
    const b = breakdown({ income: 50000, currentFederalRate: 0.5 });
    expect(b.rateMismatch).toBe(true);
    expect(b.impliedMarginalRate).toBeLessThan(0.5);
  });

  it('reports the rate the brackets actually imply, including state', () => {
    const b = breakdown({ income: 100000, currentStateRate: 0.05 });
    expect(b.impliedMarginalRate).toBeCloseTo(0.22 + 0.05, 2);
  });

  it('does not flag an honest rate', () => {
    expect(breakdown({ income: 100000, currentFederalRate: 0.22 }).rateMismatch).toBe(false);
  });

  it('flags a side account funded by a refund that does not exist', () => {
    // $50k of wages sits in the 12% bracket after the deduction, so a claimed
    // 50% rate would sweep far more into the brokerage than tax actually
    // refunds — which is what makes a high rate look like free money.
    const b = breakdown({ income: 50000, currentFederalRate: 0.5, currentStateRate: 0 });
    expect(b.phantomRefund).toBe(true);
    expect(b.phantomAmount).toBeGreaterThan(0);
    expect(b.sideDeposit.trad).toBeGreaterThan(b.actualTaxSaving);
  });

  it('reports no phantom refund when the entered rate is honest', () => {
    const b = breakdown();
    expect(b.phantomRefund).toBe(false);
    expect(b.sideDeposit.trad).toBeCloseTo(b.actualTaxSaving, 1);
  });

  it('measures the phantom as the gap between the sweep and the real refund', () => {
    const b = breakdown({ income: 50000, currentFederalRate: 0.5, currentStateRate: 0 });
    expect(b.phantomAmount).toBeCloseTo(b.sideDeposit.trad - b.actualTaxSaving, 6);
  });

  it('keeps take-home pay consistent between the options when honest', () => {
    expect(breakdown().unaffordable).toBe(false);
  });
});
