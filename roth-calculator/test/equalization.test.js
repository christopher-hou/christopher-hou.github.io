import { describe, it, expect } from 'vitest';
import { project, TAX_SAVINGS_TREATMENTS } from '../assets/js/engine.js';

const base = {
  currentAge: 30,
  retirementAge: 65,
  income: 50000,
  wageGrowth: 0,
  contributionPercent: 0.3,
  rateOfReturn: 0.07,
  inflation: 0,
  payFrequency: 'monthly',
  currentTaxMode: 'flat',
  retirementTaxMode: 'flat',
  currentFederalRate: 0.24,
  currentStateRate: 0,
  retirementFederalRate: 0.22,
  retirementStateRate: 0,
  capitalGainsRate: 0,
  capAtLimit: false,
  taxSavingsTreatment: 'invest',
};
const withBase = (over = {}) => ({ ...base, ...over });

describe('tax savings treatment options', () => {
  it('offers invest, gross-up and spend', () => {
    expect(TAX_SAVINGS_TREATMENTS.map((t) => t.value))
      .toEqual(['invest', 'gross-up', 'spend']);
  });

  it('defaults to investing the savings when unspecified', () => {
    const { taxSavingsTreatment, ...noTreatment } = withBase();
    expect(project(noTreatment).taxSavingsTreatment).toBe('invest');
  });

  it('still honors the legacy investTaxSavings flag', () => {
    const { taxSavingsTreatment, ...rest } = withBase();
    expect(project({ ...rest, investTaxSavings: false }).taxSavingsTreatment).toBe('spend');
  });

  it('falls back to invest for an unknown treatment', () => {
    expect(project(withBase({ taxSavingsTreatment: 'nonsense' })).taxSavingsTreatment)
      .toBe('invest');
  });
});

describe('gross-up equalization (the AARP method)', () => {
  it('scales the pre-tax contribution up by 1/(1 - current rate)', () => {
    const r = project(withBase({ taxSavingsTreatment: 'gross-up', retirementAge: 31 }));
    expect(r.schedule[0].rothContribution).toBeCloseTo(15000, 6);
    expect(r.schedule[0].tradContribution).toBeCloseTo(15000 / 0.76, 4);
  });

  it('uses no side account', () => {
    const r = project(withBase({ taxSavingsTreatment: 'gross-up' }));
    expect(r.traditional.side.balance).toBe(0);
  });

  it('leaves the Traditional balance above the Roth balance', () => {
    const r = project(withBase({ taxSavingsTreatment: 'gross-up' }));
    expect(r.traditional.balance).toBeCloseTo(r.roth.balance / 0.76, 4);
  });

  it('reproduces the AARP reference figures within 1%', () => {
    const r = project(withBase({ taxSavingsTreatment: 'gross-up' }));
    expect(r.roth.balance).toBeGreaterThan(2_100_000);
    expect(r.roth.balance).toBeLessThan(2_180_000);
    // AARP's "Trad. 401(k) at retirement" bar reads ~$2.80M
    expect(r.traditional.balance).toBeGreaterThan(2_780_000);
    expect(r.traditional.balance).toBeLessThan(2_840_000);
  });

  it('keeps out-of-pocket cost equal, which is the point of grossing up', () => {
    const r = project(withBase({ taxSavingsTreatment: 'gross-up', currentStateRate: 0.05 }));
    expect(r.traditional.outOfPocket).toBeCloseTo(r.roth.outOfPocket, 4);
  });

  it('breaks even exactly at the current combined rate', () => {
    const r = project(withBase({
      taxSavingsTreatment: 'gross-up', currentFederalRate: 0.24, currentStateRate: 0.05,
    }));
    expect(r.breakEvenRetirementRate).toBeCloseTo(0.29, 6);
  });

  it('ties when the retirement rate equals the current rate', () => {
    const r = project(withBase({
      taxSavingsTreatment: 'gross-up',
      currentFederalRate: 0.24, currentStateRate: 0,
      retirementFederalRate: 0.24, retirementStateRate: 0,
    }));
    expect(r.difference).toBeCloseTo(0, 4);
    expect(r.winner).toBe('tie');
  });

  it('still respects the IRS deferral cap on the grossed-up amount', () => {
    const r = project(withBase({
      taxSavingsTreatment: 'gross-up', capAtLimit: true, retirementAge: 31,
      income: 100000, contributionPercent: 0.2, // 20k roth -> 26.3k grossed up
    }));
    expect(r.schedule[0].rothContribution).toBeCloseTo(20000, 6);
    expect(r.schedule[0].tradContribution).toBeCloseTo(24500, 6);
    expect(r.schedule[0].capped).toBe(true);
  });
});

describe('the two equalization methods agree on the verdict', () => {
  it('picks the same winner with no capital gains drag', () => {
    for (const [fedNow, fedRet] of [[0.12, 0.32], [0.32, 0.12], [0.24, 0.24]]) {
      const inputs = withBase({
        currentFederalRate: fedNow, retirementFederalRate: fedRet, capitalGainsRate: 0,
      });
      expect(project({ ...inputs, taxSavingsTreatment: 'invest' }).winner)
        .toBe(project({ ...inputs, taxSavingsTreatment: 'gross-up' }).winner);
    }
  });

  it('shares the same break-even rate with no capital gains drag', () => {
    const inputs = withBase({ capitalGainsRate: 0, currentFederalRate: 0.24 });
    const a = project({ ...inputs, taxSavingsTreatment: 'invest' });
    const b = project({ ...inputs, taxSavingsTreatment: 'gross-up' });
    expect(a.breakEvenRetirementRate).toBeCloseTo(b.breakEvenRetirementRate, 9);
  });
});

describe('spend treatment', () => {
  it('has no side account and no gross-up', () => {
    const r = project(withBase({ taxSavingsTreatment: 'spend' }));
    expect(r.traditional.side.balance).toBe(0);
    expect(r.traditional.balance).toBeCloseTo(r.roth.balance, 6);
  });

  it('costs less out of pocket, which is why Roth wins', () => {
    const r = project(withBase({ taxSavingsTreatment: 'spend' }));
    expect(r.traditional.outOfPocket).toBeLessThan(r.roth.outOfPocket);
    expect(r.winner).toBe('roth');
  });
});
