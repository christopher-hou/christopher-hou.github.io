// @ts-check

/**
 * 2026 federal tax constants for a SINGLE filer.
 * Source: IRS Rev. Proc. 2025-32 inflation adjustments for tax year 2026.
 * Ranges are TAXABLE income (after deductions), not gross income.
 * @type {ReadonlyArray<{rate: number, min: number, max: number}>}
 */
export const FEDERAL_BRACKETS_2026 = Object.freeze([
  { rate: 0.10, min: 0, max: 12400 },
  { rate: 0.12, min: 12400, max: 50400 },
  { rate: 0.22, min: 50400, max: 105700 },
  { rate: 0.24, min: 105700, max: 201775 },
  { rate: 0.32, min: 201775, max: 256225 },
  { rate: 0.35, min: 256225, max: 640600 },
  { rate: 0.37, min: 640600, max: Infinity },
].map(Object.freeze));

export const STANDARD_DEDUCTION_2026 = 16100;

/**
 * Long-term capital gains rate thresholds, 2026 single filer (taxable income).
 * @type {ReadonlyArray<{rate: number, min: number, max: number}>}
 */
export const LTCG_BRACKETS_2026 = Object.freeze([
  { rate: 0.00, min: 0, max: 49450 },
  { rate: 0.15, min: 49450, max: 545500 },
  { rate: 0.20, min: 545500, max: Infinity },
].map(Object.freeze));

/** 402(g) elective deferral limit, 2026. */
export const DEFERRAL_LIMIT_2026 = 24500;

/** Age 50+ catch-up, 2026. */
export const CATCH_UP_50 = 8000;

/**
 * SECURE 2.0 "super" catch-up for ages 60-63 only.
 * Note: from 2026 this catch-up must be Roth for high earners (prior-year
 * FICA wages over $150k), which the UI flags but the projection ignores.
 */
export const CATCH_UP_60_63 = 11250;

/** Withdrawal rate used by the retirement-bracket estimator. */
export const DEFAULT_WITHDRAWAL_RATE = 0.04;

export const TAX_YEAR = 2026;
