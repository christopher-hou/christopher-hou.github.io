// @ts-check
import { PAY_FREQUENCIES, TAX_SAVINGS_TREATMENTS, RETIREMENT_TAX_MODES } from './engine.js';

/**
 * @typedef {Object} Field
 * @property {string} key
 * @property {string} label
 * @property {'int'|'money'|'percent'|'select'|'boolean'} kind
 * @property {string} help
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {string} [group]
 * @property {boolean} [estimator] render an "Estimate" button
 * @property {(inputs: Record<string, any>) => boolean} [visibleWhen] hide when false
 * @property {Array<{value: string, label: string, detail?: string}>} [options]
 */

/** @type {ReadonlyArray<Field>} */
export const FIELDS = Object.freeze([
  {
    key: 'currentAge', label: 'Current age', kind: 'int',
    min: 18, max: 70, step: 1, group: 'basics',
    help: 'Your age today. Contributions run from this age until the year before you retire.',
  },
  {
    key: 'retirementAge', label: 'Age at retirement', kind: 'int',
    min: 45, max: 75, step: 1, group: 'basics',
    help: 'The age you expect to start withdrawing. Longer horizons favor whichever account compounds tax-free.',
  },
  {
    key: 'income', label: 'Current income', kind: 'money',
    min: 0, max: 500000, step: 1000, group: 'basics',
    help: 'Your gross annual salary before taxes or deductions.',
  },
  {
    key: 'wageGrowth', label: 'Wage growth per year', kind: 'percent',
    min: 0, max: 10, step: 0.1, group: 'basics',
    help: 'Average annual raise you expect. Your contribution grows with your salary, since it is a percent of income.',
  },
  {
    key: 'contributionPercent', label: 'Contribution', kind: 'percent',
    min: 0, max: 50, step: 0.5, group: 'basics',
    help: 'The share of your gross income you defer each year. Employer match is excluded, as it is pre-tax either way and does not affect the choice.',
  },
  {
    key: 'employerMatchRate', label: 'Employer match', kind: 'percent',
    min: 0, max: 200, step: 5, group: 'basics',
    help: 'How much of your own contribution your employer adds. 100% means a dollar-for-dollar match; 50% means fifty cents on the dollar.',
  },
  {
    key: 'employerMatchLimit', label: 'Match applies up to', kind: 'percent',
    min: 0, max: 15, step: 0.5, group: 'basics',
    help: 'The share of your pay the match stops at. "100% up to 4%" means you must contribute at least 4% to collect the full match.',
  },
  {
    key: 'payFrequency', label: 'Pay frequency', kind: 'select',
    options: PAY_FREQUENCIES.map((f) => ({ value: f.value, label: f.label })),
    group: 'basics',
    help: 'How often you are paid. Contributions are invested each pay period, so more frequent pay compounds slightly sooner.',
  },
  {
    key: 'rateOfReturn', label: 'Rate of return', kind: 'percent',
    min: 0, max: 12, step: 0.1, group: 'basics',
    help: 'Expected average annual investment return before inflation. Both accounts are assumed to hold the same investments.',
  },

  {
    key: 'currentFederalRate', label: 'Federal tax rate now', kind: 'percent',
    min: 0, max: 50, step: 1, group: 'taxes', estimator: true,
    help: 'Your marginal federal rate today — the rate on your next dollar of income. Use Estimate to derive it from the 2026 single-filer brackets.',
  },
  {
    key: 'currentStateRate', label: 'State tax rate now', kind: 'percent',
    min: 0, max: 14, step: 0.1, group: 'taxes',
    help: 'Your marginal state income tax rate today. Enter 0 if your state has no income tax.',
  },
  {
    key: 'retirementTaxMode', label: 'Retirement tax', kind: 'select',
    options: RETIREMENT_TAX_MODES.map((m) => ({
      value: m.value, label: m.label, detail: m.detail,
    })),
    group: 'taxes',
    help: 'How federal tax on withdrawals is worked out. Estimating from brackets is more accurate, because withdrawals fill the standard deduction and the low brackets before reaching your top rate.',
  },
  {
    key: 'withdrawalRate', label: 'Annual withdrawal rate', kind: 'percent',
    min: 2, max: 10, step: 0.1, group: 'taxes',
    visibleWhen: (i) => i.retirementTaxMode !== 'flat',
    help: 'The share of your balance you draw each year in retirement. 4% is the common rule of thumb. Larger withdrawals reach into higher brackets.',
  },
  {
    key: 'otherRetirementIncome', label: 'Other retirement income', kind: 'money',
    min: 0, max: 200000, step: 1000, group: 'taxes',
    visibleWhen: (i) => i.retirementTaxMode !== 'flat',
    help: 'Social Security, a pension or other taxable income, in today\u2019s dollars. It fills the low brackets first, pushing your 401(k) withdrawals into higher ones.',
  },
  {
    key: 'retirementFederalRate', label: 'Federal tax rate in retirement', kind: 'percent',
    min: 0, max: 50, step: 1, group: 'taxes', estimator: true,
    visibleWhen: (i) => i.retirementTaxMode === 'flat',
    help: 'The marginal federal rate you expect on withdrawals. Use Estimate to derive it from your projected balance in today’s dollars.',
  },
  {
    key: 'retirementStateRate', label: 'State tax rate in retirement', kind: 'percent',
    min: 0, max: 14, step: 0.1, group: 'taxes',
    help: 'State rate where you plan to retire. Retiring to a no-income-tax state strongly favors Traditional.',
  },
  {
    key: 'inflation', label: 'Inflation rate', kind: 'percent',
    min: 0, max: 8, step: 0.1, group: 'taxes',
    help: 'Average annual inflation. Used to show results in today’s dollars and to index the IRS contribution limit forward.',
  },

  {
    key: 'taxSavingsTreatment', label: 'The Traditional tax savings', kind: 'select',
    options: TAX_SAVINGS_TREATMENTS.map((t) => ({
      value: t.value, label: t.label, detail: t.detail,
    })),
    group: 'assumptions',
    help: 'Pre-tax contributions cost less take-home pay than Roth. This sets what the comparison does with that difference, which is what makes it a fair fight.',
  },
  {
    key: 'capitalGainsRate', label: 'Capital gains rate', kind: 'percent',
    min: 0, max: 25, step: 1, group: 'assumptions', estimator: true,
    help: 'Federal long-term capital gains rate applied to the taxable side account’s growth. Only used when the tax savings are invested.',
  },
  {
    key: 'capAtLimit', label: 'Cap at the IRS contribution limit', kind: 'boolean',
    group: 'assumptions',
    help: 'Limits each year to the 402(g) elective deferral maximum ($24,500 in 2026, plus age-based catch-ups), indexed forward by inflation.',
  },
]);

const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

/**
 * @param {string} key
 * @returns {Field|undefined}
 */
export function fieldByKey(key) {
  return BY_KEY.get(key);
}

/**
 * Percent fields are displayed as whole percents but stored as fractions.
 * @param {Field} field
 * @param {number} displayValue
 * @returns {number}
 */
export function toModelValue(field, displayValue) {
  return field.kind === 'percent' ? displayValue / 100 : displayValue;
}

/**
 * @param {Field} field
 * @param {number} modelValue
 * @returns {number}
 */
export function toDisplayValue(field, modelValue) {
  return field.kind === 'percent' ? modelValue * 100 : modelValue;
}
