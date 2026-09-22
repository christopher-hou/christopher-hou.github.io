// @ts-check
import {
  FEDERAL_BRACKETS_2026,
  STANDARD_DEDUCTION_2026,
  LTCG_BRACKETS_2026,
  DEFERRAL_LIMIT_2026,
  CATCH_UP_50,
  CATCH_UP_60_63,
} from './tax-data.js';

/**
 * Marginal federal rate on a given TAXABLE income.
 * A value sitting exactly on a boundary belongs to the higher bracket, which
 * is where the next dollar earned would actually be taxed.
 * @param {number} taxableIncome
 * @param {ReadonlyArray<{rate: number, min: number, max: number}>} [brackets]
 * @returns {number}
 */
export function marginalRate(taxableIncome, brackets = FEDERAL_BRACKETS_2026) {
  const income = Number.isFinite(taxableIncome) ? Math.max(0, taxableIncome) : 0;
  for (const bracket of brackets) {
    if (income < bracket.max) return bracket.rate;
  }
  return brackets[brackets.length - 1].rate;
}

/**
 * Total federal tax on a TAXABLE income, stacking brackets.
 * @param {number} taxableIncome
 * @param {ReadonlyArray<{rate: number, min: number, max: number}>} [brackets]
 * @returns {number}
 */
export function federalTaxOwed(taxableIncome, brackets = FEDERAL_BRACKETS_2026) {
  const income = Number.isFinite(taxableIncome) ? Math.max(0, taxableIncome) : 0;
  let owed = 0;
  for (const bracket of brackets) {
    if (income <= bracket.min) break;
    const slice = Math.min(income, bracket.max) - bracket.min;
    owed += slice * bracket.rate;
  }
  return owed;
}

/**
 * @param {number} taxableIncome
 * @returns {number} average rate across the whole taxable income
 */
export function effectiveRate(taxableIncome) {
  const income = Number.isFinite(taxableIncome) ? Math.max(0, taxableIncome) : 0;
  if (income === 0) return 0;
  return federalTaxOwed(income) / income;
}

/**
 * The effective rate on a withdrawal: the tax the withdrawal actually causes,
 * divided by the withdrawal.
 *
 * This is the honest way to tax retirement income. A marginal rate assumes
 * every dollar is taxed at the top rate you reach, but withdrawals fill the
 * standard deduction and the low brackets first. Taking the difference
 * between total tax with and without the withdrawal also handles other income
 * correctly: it consumes the low brackets first, so the withdrawal stacks on
 * top of it.
 *
 * @param {number} withdrawal taxable withdrawal for the year
 * @param {number} [otherIncome] pension, Social Security, etc.
 * @param {number} [deduction]
 * @returns {number}
 */
export function incrementalEffectiveRate(
  withdrawal,
  otherIncome = 0,
  deduction = STANDARD_DEDUCTION_2026,
) {
  if (!Number.isFinite(withdrawal) || withdrawal <= 0) return 0;
  const other = Math.max(0, otherIncome);
  const taxWithout = federalTaxOwed(Math.max(0, other - deduction));
  const taxWith = federalTaxOwed(Math.max(0, other + withdrawal - deduction));
  return (taxWith - taxWithout) / withdrawal;
}

/**
 * @param {number} grossIncome
 * @param {number} [preTaxContribution] traditional 401(k) deferral
 * @param {number} [deduction]
 * @returns {number}
 */
export function estimateCurrentMarginalRate(
  grossIncome,
  preTaxContribution = 0,
  deduction = STANDARD_DEDUCTION_2026,
) {
  const taxable = Math.max(0, grossIncome - preTaxContribution - deduction);
  return marginalRate(taxable);
}

/**
 * Estimated marginal rate in retirement.
 *
 * Works in TODAY'S dollars on purpose: brackets are inflation-indexed, so
 * comparing a real balance against today's brackets is the correct frame.
 * @param {number} realBalance projected balance in today's dollars
 * @param {number} [withdrawalRate]
 * @param {number} [otherIncome] Social Security, pension, etc., today's dollars
 * @param {number} [deduction]
 * @returns {number}
 */
export function estimateRetirementMarginalRate(
  realBalance,
  withdrawalRate = 0.04,
  otherIncome = 0,
  deduction = STANDARD_DEDUCTION_2026,
) {
  const withdrawal = Math.max(0, realBalance) * withdrawalRate;
  const taxable = Math.max(0, withdrawal + otherIncome - deduction);
  return marginalRate(taxable);
}

/**
 * The rate a pre-tax deduction is actually worth: the tax it removes, divided
 * by its size.
 *
 * This is the right number for valuing a Traditional contribution, and it is
 * not the same as a marginal rate. A deferral large enough to straddle a
 * bracket boundary is worth a blend of the two rates, and one that reaches
 * below the standard deduction is worth nothing at all.
 *
 * @param {number} wages gross wages before the deferral
 * @param {number} deduction the pre-tax amount deferred
 * @param {number} [standardDeduction]
 * @returns {number}
 */
export function deductionRateOnSlice(
  wages,
  deduction,
  standardDeduction = STANDARD_DEDUCTION_2026,
) {
  if (!Number.isFinite(deduction) || deduction <= 0) return 0;
  const taxable = (w) => Math.max(0, w - standardDeduction);
  const saved = federalTaxOwed(taxable(wages)) - federalTaxOwed(taxable(wages - deduction));
  return Math.max(0, saved / deduction);
}

/**
 * Long-term capital gains rate implied by a gross income.
 * @param {number} grossIncome
 * @param {number} [deduction]
 * @returns {number}
 */
export function capitalGainsRate(grossIncome, deduction = STANDARD_DEDUCTION_2026) {
  const taxable = Math.max(0, grossIncome - deduction);
  return marginalRate(taxable, LTCG_BRACKETS_2026);
}

/**
 * 402(g) elective deferral limit including age-based catch-ups.
 * @param {number} age age attained during the contribution year
 * @param {number} [baseLimit]
 * @returns {number}
 */
export function deferralLimitForAge(age, baseLimit = DEFERRAL_LIMIT_2026) {
  if (age >= 60 && age <= 63) return baseLimit + CATCH_UP_60_63;
  if (age >= 50) return baseLimit + CATCH_UP_50;
  return baseLimit;
}

/**
 * @param {number} rate
 * @returns {string}
 */
export function bracketLabel(rate) {
  const bracket = FEDERAL_BRACKETS_2026.find((b) => b.rate === rate);
  const pct = `${Math.round(rate * 100)}%`;
  if (!bracket) return `${pct} bracket`;
  const upper = bracket.max === Infinity
    ? 'and up'
    : `to $${bracket.max.toLocaleString('en-US')}`;
  return `${pct} bracket — taxable income $${bracket.min.toLocaleString('en-US')} ${upper}`;
}
