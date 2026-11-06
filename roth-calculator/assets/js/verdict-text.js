// @ts-check
import { breakEvenIsComparable } from './engine.js';
import { marginalRate } from './tax.js';
import { STANDARD_DEDUCTION_2026 } from './tax-data.js';
import { formatCurrency, formatPercent } from './format.js';

/**
 * Prose for the verdict card, built as pure functions of the projection.
 *
 * These live outside app.js because three separate defects have been
 * sentences that asserted something the numbers beside them contradicted --
 * "identical totals" when they differed, "capped both contributions" when
 * only one was capped, and a rate quoted on an employer match that did not
 * exist. A template string inside a DOM handler cannot be tested; these can.
 */

/**
 * @param {ReturnType<import('./engine.js').project>} result
 * @returns {boolean}
 */
export function hasEmployerMatch(result) {
  return result.roth.match.balance > 0;
}

/**
 * The paragraph beneath the headline, explaining what the reader has to judge.
 *
 * @param {ReturnType<import('./engine.js').project>} result
 * @param {{otherRetirementIncome?: number}} inputs
 * @returns {string} HTML
 */
export function breakEvenSentence(result, inputs) {
  if (result.taxSavingsTreatment === 'spend') {
    return 'Because the Traditional tax savings are spent rather than invested, Roth wins '
      + 'at any retirement tax rate above 0%. Switch that assumption to compare fairly.';
  }

  if (breakEvenIsComparable(result)) {
    return 'Traditional wins whenever your combined retirement tax rate comes in below '
      + `<strong>${formatPercent(result.breakEvenRetirementRate, 1)}</strong>. `
      + `You entered <strong>${formatPercent(result.retirementCombinedRate, 1)}</strong>, `
      + `against <strong>${formatPercent(result.currentCombinedRate, 1)}</strong> today.`;
  }

  // Brackets mode: the threshold assumes one shared rate, which is exactly
  // what this mode does not have. Report the derived rates instead.
  const marginal = marginalRate(Math.max(0,
    result.traditional.annualWithdrawal + (inputs.otherRetirementIncome ?? 0)
      - STANDARD_DEDUCTION_2026));

  const traditionalClause =
    `Drawing ${formatCurrency(result.traditional.annualWithdrawal)} a year, Traditional `
    + 'withdrawals face an <strong>effective</strong> rate of '
    + `<strong>${formatPercent(result.traditional.retirementRate, 1)}</strong> — not the `
    + `${formatPercent(marginal, 0)} marginal rate, because the standard deduction and the low `
    + 'brackets fill first.';

  // Without a match the Roth saver holds no pre-tax money at all, so there is
  // no rate to quote and nothing to say.
  const rothClause = hasEmployerMatch(result)
    ? ` A Roth saver pays <strong>${formatPercent(result.roth.retirementRate, 1)}</strong> on `
      + 'their employer match, which is the only pre-tax money they hold.'
    : ' A Roth saver owes nothing at all, holding no pre-tax money.';

  return `${traditionalClause}${rothClause} `
    + `Today you pay <strong>${formatPercent(result.currentCombinedRate, 1)}</strong>. `
    + '<em>Switch retirement tax to a flat rate to explore a break-even threshold.</em>';
}
