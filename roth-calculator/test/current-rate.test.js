import { describe, it, expect } from 'vitest';
import { project, defaultInputs, CURRENT_TAX_MODES } from '../assets/js/engine.js';
import { deductionRateOnSlice } from '../assets/js/tax.js';

describe('deductionRateOnSlice', () => {
  it('is the tax a deduction actually saves, divided by the deduction', () => {
    // $50k wages, $5k deferred. Taxable goes 33,900 -> 28,900, both inside the
    // 12% band, so the deduction is worth exactly 12%.
    expect(deductionRateOnSlice(50000, 5000)).toBeCloseTo(0.12, 6);
  });

  it('handles a deduction that straddles two brackets', () => {
    // $55k wages: taxable 38,900 -> 28,900 crosses nothing, still 12%.
    // $58k wages with a 12k deferral: 41,900 -> 29,900, still 12%.
    expect(deductionRateOnSlice(58000, 12000)).toBeCloseTo(0.12, 6);
    // A deferral spanning the 22%/12% boundary blends the two.
    const blended = deductionRateOnSlice(70000, 10000);
    expect(blended).toBeGreaterThan(0.12);
    expect(blended).toBeLessThan(0.22);
  });

  it('is zero when the wages are already inside the standard deduction', () => {
    expect(deductionRateOnSlice(15000, 5000)).toBe(0);
  });

  it('is zero for a zero deduction', () => {
    expect(deductionRateOnSlice(100000, 0)).toBe(0);
  });

  it('never exceeds the top marginal rate', () => {
    expect(deductionRateOnSlice(2_000_000, 24500)).toBeLessThanOrEqual(0.37);
  });

  it('rises with income', () => {
    let prev = -1;
    for (const income of [30000, 60000, 120000, 250000, 700000]) {
      const rate = deductionRateOnSlice(income, 5000);
      expect(rate).toBeGreaterThanOrEqual(prev);
      prev = rate;
    }
  });
});

describe('current tax mode', () => {
  it('offers brackets and flat', () => {
    expect(CURRENT_TAX_MODES.map((m) => m.value)).toEqual(['brackets', 'flat']);
  });

  it('derives the rate from brackets by default', () => {
    const d = defaultInputs();
    expect(d.currentTaxMode).toBe('brackets');
  });

  it('ignores a typed federal rate while in brackets mode', () => {
    const a = project({ ...defaultInputs(), currentFederalRate: 0 });
    const b = project({ ...defaultInputs(), currentFederalRate: 0.5 });
    expect(a.traditional.total).toBeCloseTo(b.traditional.total, 6);
    expect(a.currentCombinedRate).toBeCloseTo(b.currentCombinedRate, 6);
  });

  it('honors a typed federal rate in flat mode', () => {
    const a = project({ ...defaultInputs(), currentTaxMode: 'flat', currentFederalRate: 0 });
    const b = project({ ...defaultInputs(), currentTaxMode: 'flat', currentFederalRate: 0.5 });
    expect(b.currentCombinedRate).toBeGreaterThan(a.currentCombinedRate);
  });

  it('reports the derived federal rate for display', () => {
    const r = project({ ...defaultInputs(), income: 50000, contributionPercent: 0.1 });
    expect(r.currentFederalRate).toBeCloseTo(0.12, 6);
    expect(r.currentCombinedRate).toBeCloseTo(0.12 + 0.05, 6);
  });
});

describe('the paradox is unreachable in brackets mode', () => {
  // The old failure: typing a bigger tax rate grew the Traditional stack
  // without anything else getting worse. With the rate derived from income,
  // there is no knob that does that.
  it('cannot inflate the side account by typing a higher rate', () => {
    const sides = [0, 0.2, 0.5].map(
      (fed) => project({ ...defaultInputs(), currentFederalRate: fed }).traditional.side.balance,
    );
    expect(new Set(sides.map((x) => Math.round(x))).size).toBe(1);
  });

  it('moves the side account only when income genuinely changes the rate', () => {
    const low = project({ ...defaultInputs(), income: 50000 });
    const high = project({ ...defaultInputs(), income: 250000 });
    expect(high.currentCombinedRate).toBeGreaterThan(low.currentCombinedRate);
  });

  it('keeps the derived rate inside the statutory range', () => {
    for (const income of [0, 20000, 50000, 200000, 1_000_000]) {
      const r = project({ ...defaultInputs(), income });
      expect(r.currentFederalRate).toBeGreaterThanOrEqual(0);
      expect(r.currentFederalRate).toBeLessThanOrEqual(0.37);
    }
  });

  it('produces no phantom refund by construction', () => {
    const r = project(defaultInputs());
    // The sweep into the side account equals the real tax saving. Summed per
    // year, because each year's deduction is valued at that year's own rate.
    const saving = r.schedule.reduce(
      (total, row) => total + row.rothContribution * row.deductionRate, 0,
    );
    expect(r.traditional.side.basis).toBeCloseTo(saving, 4);
  });
});
