import { describe, it, expect } from 'vitest';
import {
  FEDERAL_BRACKETS_2026,
  STANDARD_DEDUCTION_2026,
  DEFERRAL_LIMIT_2026,
} from '../assets/js/tax-data.js';
import {
  marginalRate,
  federalTaxOwed,
  effectiveRate,
  estimateCurrentMarginalRate,
  estimateRetirementMarginalRate,
  capitalGainsRate,
  deferralLimitForAge,
  bracketLabel,
} from '../assets/js/tax.js';

describe('2026 bracket data', () => {
  it('has all seven statutory rates in ascending order', () => {
    expect(FEDERAL_BRACKETS_2026.map((b) => b.rate)).toEqual([
      0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37,
    ]);
  });

  it('starts at zero and ends unbounded', () => {
    expect(FEDERAL_BRACKETS_2026[0].min).toBe(0);
    expect(FEDERAL_BRACKETS_2026.at(-1).max).toBe(Infinity);
  });

  it('is contiguous — each bracket begins where the previous ended', () => {
    for (let i = 1; i < FEDERAL_BRACKETS_2026.length; i++) {
      expect(FEDERAL_BRACKETS_2026[i].min).toBe(FEDERAL_BRACKETS_2026[i - 1].max);
    }
  });

  it('matches the published 2026 single-filer figures', () => {
    expect(FEDERAL_BRACKETS_2026[0].max).toBe(12400);
    expect(FEDERAL_BRACKETS_2026[1].max).toBe(50400);
    expect(FEDERAL_BRACKETS_2026[2].max).toBe(105700);
    expect(FEDERAL_BRACKETS_2026[3].max).toBe(201775);
    expect(FEDERAL_BRACKETS_2026[4].max).toBe(256225);
    expect(FEDERAL_BRACKETS_2026[5].max).toBe(640600);
    expect(STANDARD_DEDUCTION_2026).toBe(16100);
    expect(DEFERRAL_LIMIT_2026).toBe(24500);
  });
});

describe('marginalRate', () => {
  it('picks the bracket containing the taxable income', () => {
    expect(marginalRate(0)).toBe(0.1);
    expect(marginalRate(12399)).toBe(0.1);
    expect(marginalRate(12400)).toBe(0.12);
    expect(marginalRate(50400)).toBe(0.22);
    expect(marginalRate(105700)).toBe(0.24);
    expect(marginalRate(201775)).toBe(0.32);
    expect(marginalRate(256225)).toBe(0.35);
    expect(marginalRate(640600)).toBe(0.37);
    expect(marginalRate(5_000_000)).toBe(0.37);
  });

  it('treats a bracket boundary as the start of the higher bracket', () => {
    expect(marginalRate(50399.99)).toBe(0.12);
    expect(marginalRate(50400)).toBe(0.22);
  });

  it('returns the lowest rate for zero or negative taxable income', () => {
    expect(marginalRate(-1000)).toBe(0.1);
  });
});

describe('federalTaxOwed', () => {
  it('is zero on zero taxable income', () => {
    expect(federalTaxOwed(0)).toBe(0);
  });

  it('applies a single bracket correctly', () => {
    expect(federalTaxOwed(10000)).toBeCloseTo(1000, 2);
  });

  it('stacks brackets rather than applying one rate to everything', () => {
    // 12,400 @ 10% = 1,240; remaining 7,600 @ 12% = 912
    expect(federalTaxOwed(20000)).toBeCloseTo(1240 + 912, 2);
  });

  it('is continuous across a bracket boundary', () => {
    const below = federalTaxOwed(50399.99);
    const above = federalTaxOwed(50400.01);
    expect(Math.abs(above - below)).toBeLessThan(0.01);
  });

  it('is monotonically increasing', () => {
    let prev = -1;
    for (const income of [0, 5e3, 3e4, 8e4, 15e4, 25e4, 5e5, 1e6]) {
      const owed = federalTaxOwed(income);
      expect(owed).toBeGreaterThan(prev);
      prev = owed;
    }
  });

  it('never exceeds the top marginal rate overall', () => {
    expect(federalTaxOwed(1e6) / 1e6).toBeLessThan(0.37);
  });
});

describe('effectiveRate', () => {
  it('is below the marginal rate for a progressive schedule', () => {
    const taxable = 100000;
    expect(effectiveRate(taxable)).toBeLessThan(marginalRate(taxable));
  });

  it('is zero when there is no taxable income', () => {
    expect(effectiveRate(0)).toBe(0);
  });
});

describe('estimateCurrentMarginalRate', () => {
  it('subtracts the standard deduction before finding the bracket', () => {
    // 60k income - 16.1k deduction = 43.9k taxable -> 12% bracket
    expect(estimateCurrentMarginalRate(60000, 0)).toBe(0.12);
  });

  it('subtracts pre-tax contributions too', () => {
    // 80k - 16.1k = 63.9k -> 22%. Deduct 15k pre-tax -> 48.9k -> 12%.
    expect(estimateCurrentMarginalRate(80000, 0)).toBe(0.22);
    expect(estimateCurrentMarginalRate(80000, 15000)).toBe(0.12);
  });

  it('floors at the lowest bracket for low income', () => {
    expect(estimateCurrentMarginalRate(10000, 0)).toBe(0.1);
  });

  it('handles high income', () => {
    expect(estimateCurrentMarginalRate(700000, 0)).toBe(0.37);
  });
});

describe('estimateRetirementMarginalRate', () => {
  it('derives a rate from a withdrawal percentage of the real balance', () => {
    // 4% of 1M = 40k, less the 16.1k deduction = 23.9k taxable -> 12%
    expect(estimateRetirementMarginalRate(1_000_000, 0.04, 0)).toBe(0.12);
  });

  it('includes other retirement income such as Social Security', () => {
    // 40k withdrawal + 30k other = 70k, less 16.1k = 53.9k -> 22%
    expect(estimateRetirementMarginalRate(1_000_000, 0.04, 30000)).toBe(0.22);
  });

  it('returns the lowest bracket when the balance is tiny', () => {
    expect(estimateRetirementMarginalRate(1000, 0.04, 0)).toBe(0.1);
  });
});

describe('capitalGainsRate', () => {
  it('is 0% for low income, 15% mid, 20% high (2026 single)', () => {
    expect(capitalGainsRate(30000)).toBe(0);
    expect(capitalGainsRate(100000)).toBe(0.15);
    expect(capitalGainsRate(700000)).toBe(0.2);
  });
});

describe('deferralLimitForAge', () => {
  it('is the base limit under 50', () => {
    expect(deferralLimitForAge(30)).toBe(24500);
    expect(deferralLimitForAge(49)).toBe(24500);
  });

  it('adds the standard catch-up at 50', () => {
    expect(deferralLimitForAge(50)).toBe(24500 + 8000);
    expect(deferralLimitForAge(59)).toBe(24500 + 8000);
  });

  it('applies the SECURE 2.0 super catch-up for ages 60 through 63', () => {
    expect(deferralLimitForAge(60)).toBe(24500 + 11250);
    expect(deferralLimitForAge(63)).toBe(24500 + 11250);
  });

  it('reverts to the standard catch-up at 64', () => {
    expect(deferralLimitForAge(64)).toBe(24500 + 8000);
  });
});

describe('bracketLabel', () => {
  it('describes the bracket a rate belongs to', () => {
    expect(bracketLabel(0.22)).toContain('22%');
  });
});
