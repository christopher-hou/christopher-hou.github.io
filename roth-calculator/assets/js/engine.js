// @ts-check
import { deferralLimitForAge, incrementalEffectiveRate } from './tax.js';
import { DEFERRAL_LIMIT_2026 } from './tax-data.js';

/**
 * @typedef {Object} Inputs
 * @property {number} currentAge
 * @property {number} retirementAge
 * @property {number} income                gross annual, today's dollars
 * @property {number} wageGrowth            fraction per year
 * @property {number} contributionPercent   fraction of gross income
 * @property {number} employerMatchRate     fraction of your contribution matched
 * @property {number} employerMatchLimit    matched only up to this fraction of pay
 * @property {number} rateOfReturn          nominal annual fraction
 * @property {number} inflation             fraction per year
 * @property {string} payFrequency
 * @property {number} currentFederalRate
 * @property {number} currentStateRate
 * @property {'brackets'|'flat'} [retirementTaxMode]
 * @property {number} retirementFederalRate used only in 'flat' mode
 * @property {number} retirementStateRate
 * @property {number} [withdrawalRate]      used only in 'brackets' mode
 * @property {number} [otherRetirementIncome] today's dollars, 'brackets' mode
 * @property {number} capitalGainsRate      federal LTCG on the side account
 * @property {'invest'|'gross-up'|'spend'} [taxSavingsTreatment]
 * @property {boolean} [investTaxSavings]   legacy alias: false means 'spend'
 * @property {boolean} capAtLimit
 */

export const PAY_FREQUENCIES = Object.freeze([
  { value: 'weekly', label: 'Weekly', periods: 52 },
  { value: 'biweekly', label: 'Every two weeks', periods: 26 },
  { value: 'semimonthly', label: 'Twice a month', periods: 24 },
  { value: 'monthly', label: 'Monthly', periods: 12 },
  { value: 'annually', label: 'Once a year', periods: 1 },
].map(Object.freeze));

/**
 * How the Traditional scenario spends the tax deduction it receives. Without
 * one of these adjustments the comparison is unfair, because a $X Roth
 * contribution costs more take-home pay than a $X pre-tax contribution.
 */
export const TAX_SAVINGS_TREATMENTS = Object.freeze([
  {
    value: 'invest',
    label: 'Invest the refund in a brokerage account',
    detail: 'Contribute the same percent either way, and put the Traditional tax savings into a taxable account. Its gains are taxed at retirement.',
  },
  {
    value: 'gross-up',
    label: 'Contribute more pre-tax instead',
    detail: "Raise the Traditional contribution to the point where both options cost the same take-home pay. This is AARP's method.",
  },
  {
    value: 'spend',
    label: 'Spend the refund',
    detail: 'Contribute the same percent either way and spend the Traditional tax savings. Roth then wins almost automatically, because it is the more expensive option.',
  },
].map(Object.freeze));

export const RETIREMENT_TAX_MODES = Object.freeze([
  {
    value: 'brackets',
    label: 'Estimate from tax brackets',
    detail: 'Works out the tax your withdrawals actually trigger, filling the standard deduction and the low brackets first. More accurate than a single rate.',
  },
  {
    value: 'flat',
    label: 'Use a flat rate I enter',
    detail: 'Applies one rate to the whole balance. Simple, but it overstates the tax a real retiree pays.',
  },
].map(Object.freeze));

/**
 * @param {string} frequency
 * @returns {number}
 */
export function periodsPerYearFor(frequency) {
  const match = PAY_FREQUENCIES.find((f) => f.value === frequency);
  return match ? match.periods : 12;
}

/** @returns {Inputs} */
export function defaultInputs() {
  return {
    currentAge: 30,
    retirementAge: 65,
    income: 50000,
    wageGrowth: 0.03,
    contributionPercent: 0.1,
    employerMatchRate: 1,
    employerMatchLimit: 0.04,
    rateOfReturn: 0.07,
    inflation: 0.025,
    payFrequency: 'monthly',
    currentFederalRate: 0.22,
    currentStateRate: 0.05,
    retirementTaxMode: 'brackets',
    retirementFederalRate: 0.22,
    retirementStateRate: 0.05,
    withdrawalRate: 0.04,
    otherRetirementIncome: 0,
    capitalGainsRate: 0.15,
    taxSavingsTreatment: 'invest',
    capAtLimit: true,
  };
}

/** @param {unknown} v @param {number} fallback */
function num(v, fallback = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Projects both options to retirement and decides which wins.
 *
 * Fairness note: contributing $X to a Roth costs $X of take-home pay, while
 * $X pre-tax costs only $X·(1−t_now). To compare like with like, the
 * Traditional scenario either sweeps the difference into a taxable side
 * account or defers a larger amount. See TAX_SAVINGS_TREATMENTS.
 *
 * Employer match note: the match is always pre-tax, even for a Roth saver,
 * so it is modeled as a separate traditional sub-account on BOTH sides. It
 * cannot change which option wins, but it does add taxable retirement income
 * to the Roth scenario, which matters once tax is computed from brackets.
 *
 * @param {Inputs} inputs
 */
export function project(inputs) {
  const currentAge = num(inputs.currentAge, 30);
  const years = Math.max(0, Math.floor(num(inputs.retirementAge, 65) - currentAge));
  const income = Math.max(0, num(inputs.income));
  const wageGrowth = num(inputs.wageGrowth);
  const contributionPercent = Math.max(0, num(inputs.contributionPercent));
  const matchRate = Math.max(0, num(inputs.employerMatchRate));
  const matchLimit = Math.max(0, num(inputs.employerMatchLimit));
  const rateOfReturn = num(inputs.rateOfReturn);
  const inflation = num(inputs.inflation);
  const periodsPerYear = periodsPerYearFor(inputs.payFrequency);
  const capAtLimit = inputs.capAtLimit !== false;
  const taxSavingsTreatment = resolveTreatment(inputs);
  const retirementTaxMode = RETIREMENT_TAX_MODES.some((m) => m.value === inputs.retirementTaxMode)
    ? /** @type {'brackets'|'flat'} */ (inputs.retirementTaxMode)
    : 'brackets';

  const currentRate = num(inputs.currentFederalRate) + num(inputs.currentStateRate);
  const retirementStateRate = num(inputs.retirementStateRate);
  const withdrawalRate = Math.max(0, num(inputs.withdrawalRate, 0.04));
  const otherRetirementIncome = Math.max(0, num(inputs.otherRetirementIncome));
  // A taxable side account's gains are state-taxed as ordinary income on top
  // of the federal long-term capital gains rate.
  const sideGainsRate = Math.min(
    1, Math.max(0, num(inputs.capitalGainsRate) + retirementStateRate),
  );

  // Geometric per-period rate, so a stated annual return is honored exactly
  // no matter how finely the year is sliced by pay frequency.
  const periodRate = Math.pow(1 + rateOfReturn, 1 / periodsPerYear) - 1;

  // Under gross-up, the Traditional side defers more so that both cost
  // identical take-home pay.
  const grossUpFactor = taxSavingsTreatment === 'gross-up' && currentRate < 1
    ? 1 / (1 - currentRate)
    : 1;

  let rothBalance = 0;
  let tradBalance = 0;
  let rothMatchBalance = 0;
  let tradMatchBalance = 0;
  let sideBalance = 0;
  let sideBasis = 0;
  let totalRothContributions = 0;
  let totalTradContributions = 0;
  let totalRothMatch = 0;
  let totalTradMatch = 0;
  // Discounted from the year each contribution is made. Deflating the whole
  // stream by the terminal deflator would overstate inflation's effect, since
  // an early contribution is only a year old, not a whole career.
  let realRothContributions = 0;
  let realTradContributions = 0;
  let realSideBasis = 0;
  let everCapped = false;
  /** @type {Array<Object>} */
  const schedule = [];

  for (let y = 0; y < years; y++) {
    const age = currentAge + y;
    const yearIncome = income * Math.pow(1 + wageGrowth, y);
    const desired = yearIncome * contributionPercent;

    const limit = capAtLimit
      ? deferralLimitForAge(age, DEFERRAL_LIMIT_2026) * Math.pow(1 + inflation, y)
      : Infinity;

    const rothContribution = Math.min(desired, limit);
    const tradContribution = Math.min(desired * grossUpFactor, limit);
    const capped = capAtLimit && (desired > limit || desired * grossUpFactor > limit);
    if (capped) everCapped = true;

    // Plans match actual deferrals, so the match follows what was really
    // contributed after any cap, not the percent originally requested.
    const matchCeiling = matchLimit * yearIncome;
    const rothMatch = Math.min(rothContribution, matchCeiling) * matchRate;
    const tradMatch = Math.min(tradContribution, matchCeiling) * matchRate;

    const rothPerPeriod = rothContribution / periodsPerYear;
    const tradPerPeriod = tradContribution / periodsPerYear;
    const rothMatchPerPeriod = rothMatch / periodsPerYear;
    const tradMatchPerPeriod = tradMatch / periodsPerYear;
    // The refund is only invested under the 'invest' treatment.
    const sidePerPeriod = taxSavingsTreatment === 'invest'
      ? rothPerPeriod * currentRate
      : 0;

    for (let p = 0; p < periodsPerYear; p++) {
      rothBalance = rothBalance * (1 + periodRate) + rothPerPeriod;
      tradBalance = tradBalance * (1 + periodRate) + tradPerPeriod;
      rothMatchBalance = rothMatchBalance * (1 + periodRate) + rothMatchPerPeriod;
      tradMatchBalance = tradMatchBalance * (1 + periodRate) + tradMatchPerPeriod;
      sideBalance = sideBalance * (1 + periodRate) + sidePerPeriod;
      sideBasis += sidePerPeriod;
    }
    totalRothContributions += rothContribution;
    totalTradContributions += tradContribution;
    totalRothMatch += rothMatch;
    totalTradMatch += tradMatch;

    const yearDeflator = Math.pow(1 + inflation, y + 1);
    realRothContributions += rothContribution / yearDeflator;
    realTradContributions += tradContribution / yearDeflator;
    realSideBasis += (sidePerPeriod * periodsPerYear) / yearDeflator;

    schedule.push({
      year: y + 1,
      age,
      income: yearIncome,
      contribution: rothContribution,
      rothContribution,
      tradContribution,
      rothMatch,
      tradMatch,
      capped,
      limit: Number.isFinite(limit) ? limit : null,
      rothBalance,
      tradBalance,
      rothMatchBalance,
      tradMatchBalance,
      sideBalance,
    });
  }

  const deflator = Math.pow(1 + inflation, years);
  /** @param {number} v */
  const real = (v) => (Number.isFinite(v / deflator) ? v / deflator : 0);

  // Pre-tax money subject to income tax at withdrawal. For a Roth saver that
  // is the employer match alone; for a Traditional saver it is match plus
  // their own deferrals.
  const tradPreTax = tradBalance + tradMatchBalance;
  const rothPreTax = rothMatchBalance;

  // Brackets are inflation-indexed, so the effective rate is computed in
  // today's dollars against today's brackets.
  const tradWithdrawal = real(tradPreTax) * withdrawalRate;
  const rothWithdrawal = real(rothPreTax) * withdrawalRate;

  const flatFederal = num(inputs.retirementFederalRate);
  const tradEffectiveFederal = retirementTaxMode === 'brackets'
    ? incrementalEffectiveRate(tradWithdrawal, otherRetirementIncome)
    : flatFederal;
  const rothEffectiveFederal = retirementTaxMode === 'brackets'
    ? incrementalEffectiveRate(rothWithdrawal, otherRetirementIncome)
    : flatFederal;

  const tradRetirementRate = tradEffectiveFederal + retirementStateRate;
  const rothRetirementRate = rothEffectiveFederal + retirementStateRate;

  const sideGains = Math.max(0, sideBalance - sideBasis);
  const sideAfterTax = sideBalance - sideGains * sideGainsRate;

  const rothAfterTax = rothBalance;
  const rothMatchAfterTax = rothMatchBalance * (1 - rothRetirementRate);
  const rothTotal = rothAfterTax + rothMatchAfterTax;

  const tradAfterTax = tradBalance * (1 - tradRetirementRate);
  const tradMatchAfterTax = tradMatchBalance * (1 - tradRetirementRate);
  const tradTotal = tradAfterTax + tradMatchAfterTax + sideAfterTax;

  // The rate on the employee's own pre-tax balance that would tie the two.
  // Match and side account are held fixed, since neither depends on it.
  const breakEvenRetirementRate = tradBalance > 0
    ? Math.max(0, 1 - (rothTotal - tradMatchAfterTax - sideAfterTax) / tradBalance)
    : 0;

  const difference = Math.abs(rothTotal - tradTotal);
  const TIE_EPSILON = 1;
  /** @type {'roth'|'traditional'|'tie'} */
  let winner = 'tie';
  if (difference > TIE_EPSILON) winner = rothTotal > tradTotal ? 'roth' : 'traditional';

  return {
    years,
    periodsPerYear,
    taxSavingsTreatment,
    retirementTaxMode,
    totalContributions: totalRothContributions,
    totalTraditionalContributions: totalTradContributions,
    everCapped,
    currentCombinedRate: currentRate,
    // Kept for display: what the Traditional retiree actually pays.
    retirementCombinedRate: tradRetirementRate,
    sideGainsRate,
    firstYearContribution: schedule.length ? schedule[0].rothContribution : 0,
    roth: {
      balance: rothBalance,
      afterTax: rothAfterTax,
      preTaxBalance: rothPreTax,
      total: rothTotal,
      // Roth contributions come from already-taxed pay, so the gross
      // contribution is the full take-home cost. The match is free money and
      // is not a cost on either side.
      outOfPocket: totalRothContributions,
      contributions: totalRothContributions,
      effectiveFederalRate: rothEffectiveFederal,
      retirementRate: rothRetirementRate,
      annualWithdrawal: rothWithdrawal,
      match: {
        balance: rothMatchBalance, afterTax: rothMatchAfterTax, contributions: totalRothMatch,
      },
    },
    traditional: {
      balance: tradBalance,
      afterTax: tradAfterTax,
      preTaxBalance: tradPreTax,
      total: tradTotal,
      // Pre-tax contributions cost less take-home; the difference either
      // funds the side account, buys a larger deferral, or is spent.
      outOfPocket: totalTradContributions * (1 - currentRate) + sideBasis,
      contributions: totalTradContributions,
      effectiveFederalRate: tradEffectiveFederal,
      retirementRate: tradRetirementRate,
      annualWithdrawal: tradWithdrawal,
      match: {
        balance: tradMatchBalance, afterTax: tradMatchAfterTax, contributions: totalTradMatch,
      },
      side: { balance: sideBalance, basis: sideBasis, gains: sideGains, afterTax: sideAfterTax },
    },
    breakEvenRetirementRate,
    winner,
    difference,
    real: {
      deflator,
      roth: {
        balance: real(rothBalance),
        afterTax: real(rothAfterTax),
        preTaxBalance: real(rothPreTax),
        total: real(rothTotal),
        outOfPocket: realRothContributions,
        contributions: realRothContributions,
        match: { balance: real(rothMatchBalance), afterTax: real(rothMatchAfterTax) },
      },
      traditional: {
        balance: real(tradBalance),
        afterTax: real(tradAfterTax),
        preTaxBalance: real(tradPreTax),
        total: real(tradTotal),
        outOfPocket: realTradContributions * (1 - currentRate) + realSideBasis,
        contributions: realTradContributions,
        match: { balance: real(tradMatchBalance), afterTax: real(tradMatchAfterTax) },
        side: { balance: real(sideBalance), afterTax: real(sideAfterTax) },
      },
      totalContributions: realRothContributions,
      totalTraditionalContributions: realTradContributions,
      difference: real(difference),
    },
    schedule,
  };
}

/**
 * @param {Inputs} inputs
 * @returns {'invest'|'gross-up'|'spend'}
 */
function resolveTreatment(inputs) {
  const known = TAX_SAVINGS_TREATMENTS.some((t) => t.value === inputs.taxSavingsTreatment);
  if (known) return /** @type {'invest'|'gross-up'|'spend'} */ (inputs.taxSavingsTreatment);
  if (inputs.investTaxSavings === false) return 'spend';
  return 'invest';
}
