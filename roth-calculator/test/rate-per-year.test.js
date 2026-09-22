import { describe, it, expect } from 'vitest';
import { project, defaultInputs } from '../assets/js/engine.js';
import { deductionRateOnSlice } from '../assets/js/tax.js';

const base = () => ({ ...defaultInputs(), currentStateRate: 0, capitalGainsRate: 0 });

describe('the deduction is valued year by year, not frozen at year one', () => {
  it('records each year’s own deduction rate in the schedule', () => {
    // Valued in today's dollars, because brackets are inflation-indexed.
    const r = project({ ...base(), income: 60000, wageGrowth: 0.04, inflation: 0.025 });
    const real = (value, year) => value / Math.pow(1.025, year - 1);
    for (const row of [r.schedule[0], r.schedule.at(-1)]) {
      expect(row.deductionRate).toBeCloseTo(
        deductionRateOnSlice(real(row.income, row.year), real(row.rothContribution, row.year)), 8,
      );
    }
  });

  it('lets the rate rise as income climbs through the brackets', () => {
    // 4% wages against 2.5% inflation is real growth, so the rate really does
    // climb: $60k becomes $95,929 in today's money by retirement.
    const r = project({ ...base(), income: 60000, wageGrowth: 0.04, inflation: 0.025 });
    expect(r.schedule[0].deductionRate).toBeCloseTo(0.12, 4);
    expect(r.schedule.at(-1).deductionRate).toBeCloseTo(0.22, 4);
  });

  it('funds the side account at each year’s rate, not year one’s', () => {
    const r = project({ ...base(), income: 60000, wageGrowth: 0.04 });
    const expected = r.schedule.reduce(
      (total, row) => total + row.rothContribution * row.deductionRate, 0,
    );
    expect(r.traditional.side.basis).toBeCloseTo(expected, 4);
    // Freezing year one's 12% would have understated this badly.
    expect(r.traditional.side.basis)
      .toBeGreaterThan(r.totalContributions * 0.12 * 1.2);
  });

  it('leaves a flat income unaffected, since every year has the same rate', () => {
    const r = project({ ...base(), income: 60000, wageGrowth: 0, inflation: 0 });
    const rates = new Set(r.schedule.map((row) => row.deductionRate.toFixed(8)));
    expect(rates.size).toBe(1);
    expect(r.traditional.side.basis)
      .toBeCloseTo(r.totalContributions * r.schedule[0].deductionRate, 4);
  });

  it('reports year one’s rate as the headline current rate', () => {
    const r = project({ ...base(), income: 60000, wageGrowth: 0.04 });
    expect(r.currentFederalRate).toBeCloseTo(r.schedule[0].deductionRate, 8);
  });
});

describe('the deduction rate uses the contribution actually made', () => {
  it('values a capped contribution on the capped slice', () => {
    // 40% of $150k is $60k requested, but the IRS caps it at $24,500. The
    // deduction is only worth what that smaller slice removes.
    const r = project({ ...base(), income: 150000, contributionPercent: 0.4, capAtLimit: true });
    expect(r.schedule[0].rothContribution).toBeCloseTo(24500, 6);
    expect(r.schedule[0].deductionRate)
      .toBeCloseTo(deductionRateOnSlice(150000, 24500), 8);
    // The uncapped slice would have been valued about a point lower.
    expect(r.schedule[0].deductionRate)
      .toBeGreaterThan(deductionRateOnSlice(150000, 60000));
  });

  it('is unaffected by the cap when the cap does not bind', () => {
    const r = project({ ...base(), income: 150000, contributionPercent: 0.1, capAtLimit: true });
    expect(r.schedule[0].deductionRate)
      .toBeCloseTo(deductionRateOnSlice(150000, 15000), 8);
  });
});

describe('invariants survive year-varying rates', () => {
  it('keeps out-of-pocket cost equal across a rising income', () => {
    const r = project({ ...base(), income: 60000, wageGrowth: 0.04 });
    expect(r.traditional.outOfPocket).toBeCloseTo(r.roth.outOfPocket, 4);
  });

  it('keeps out-of-pocket equal under gross-up too', () => {
    const r = project({
      ...base(), income: 60000, wageGrowth: 0.04, taxSavingsTreatment: 'gross-up',
    });
    expect(r.traditional.outOfPocket).toBeCloseTo(r.roth.outOfPocket, 4);
  });

  it('grosses up each year at that year’s own rate', () => {
    const r = project({
      ...base(), income: 60000, wageGrowth: 0.04, taxSavingsTreatment: 'gross-up',
    });
    const first = r.schedule[0];
    const last = r.schedule.at(-1);
    expect(first.tradContribution)
      .toBeCloseTo(first.rothContribution / (1 - first.deductionRate), 4);
    expect(last.tradContribution / last.rothContribution)
      .toBeGreaterThan(first.tradContribution / first.rothContribution);
  });

  it('still equals a flat rate exactly in flat mode', () => {
    const r = project({
      ...base(), currentTaxMode: 'flat', currentFederalRate: 0.24,
      currentStateRate: 0.05, wageGrowth: 0.04,
    });
    for (const row of r.schedule) expect(row.deductionRate).toBeCloseTo(0.29, 8);
    expect(r.traditional.side.basis).toBeCloseTo(r.totalContributions * 0.29, 4);
  });

  it('never produces a phantom refund in brackets mode, at any income', () => {
    for (const income of [30000, 60000, 120000, 400000]) {
      const r = project({ ...base(), income, wageGrowth: 0.04 });
      const funded = r.schedule.reduce(
        (t, row) => t + row.rothContribution * row.deductionRate, 0,
      );
      expect(r.traditional.side.basis).toBeCloseTo(funded, 4);
    }
  });
});
