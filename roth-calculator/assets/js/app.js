// @ts-check
import { project, paycheckBreakdown, TAX_SAVINGS_TREATMENTS } from './engine.js';
import { FIELDS, toDisplayValue, toModelValue } from './fields.js';
import { decodeState, encodeState } from './state.js';
import {
  clamp, formatCurrency, formatPercent, formatSignedCurrency, parseNumber,
} from './format.js';
import { renderBarChart, renderLineChart } from './chart.js';
import {
  capitalGainsRate, estimateCurrentMarginalRate, estimateRetirementMarginalRate, bracketLabel,
  marginalRate,
} from './tax.js';
import { DEFAULT_WITHDRAWAL_RATE, STANDARD_DEDUCTION_2026, TAX_YEAR } from './tax-data.js';

const THEME_KEY = 'roth-calc-theme';

let inputs = decodeState(window.location.search);
/** @type {'nominal'|'real'} */
let basis = 'nominal';
/** @type {'year'|'period'} */
let period = 'year';
/** @type {Map<string, {number: HTMLInputElement, range: HTMLInputElement|null, hint: HTMLElement}>} */
const controls = new Map();

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/* ------------------------------ input rendering ------------------------------ */

function buildFields() {
  const template = /** @type {HTMLTemplateElement} */ ($('field-row'));

  for (const field of FIELDS) {
    const list = document.querySelector(`.field-list[data-group="${field.group}"]`);
    if (!list) continue;

    if (field.kind === 'boolean') { list.appendChild(booleanField(field)); continue; }
    if (field.kind === 'select') { list.appendChild(selectField(field)); continue; }

    const row = /** @type {HTMLElement} */ (template.content.cloneNode(true).firstElementChild);
    const label = /** @type {HTMLLabelElement} */ (row.querySelector('.field-label'));
    const number = /** @type {HTMLInputElement} */ (row.querySelector('.field-number'));
    const range = /** @type {HTMLInputElement} */ (row.querySelector('.field-range'));
    const help = /** @type {HTMLElement} */ (row.querySelector('.field-help'));
    const helpToggle = /** @type {HTMLButtonElement} */ (row.querySelector('.help-toggle'));
    const estimate = /** @type {HTMLButtonElement} */ (row.querySelector('.field-estimate'));
    const hint = /** @type {HTMLElement} */ (row.querySelector('.field-hint'));

    const id = `f-${field.key}`;
    label.textContent = field.label;
    label.htmlFor = id;
    number.id = id;
    number.setAttribute('aria-describedby', `${id}-help`);
    help.id = `${id}-help`;
    help.textContent = field.help;
    helpToggle.setAttribute('aria-label', `What is “${field.label}”?`);

    range.min = String(field.min);
    range.max = String(field.max);
    range.step = String(field.step);
    range.setAttribute('aria-label', `${field.label} slider`);
    row.querySelector('.bound-min').textContent = boundText(field, field.min);
    row.querySelector('.bound-max').textContent = boundText(field, field.max);

    helpToggle.addEventListener('click', () => toggleHelp(helpToggle, field));

    if (field.estimator) {
      estimate.hidden = false;
      estimate.addEventListener('click', () => runEstimator(field.key));
    }

    range.addEventListener('input', () => {
      setValue(field.key, toModelValue(field, Number(range.value)));
    });
    number.addEventListener('change', () => commitNumber(field, number));
    number.addEventListener('blur', () => commitNumber(field, number));
    number.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commitNumber(field, number); }
    });

    controls.set(field.key, { number, range, hint, row });
    list.appendChild(row);
  }
}

function commitNumber(field, input) {
  const current = toDisplayValue(field, inputs[field.key]);
  const next = clamp(parseNumber(input.value, current), field.min, field.max);
  setValue(field.key, toModelValue(field, next));
}

function boundText(field, value) {
  if (field.kind === 'percent') return `${value}%`;
  if (field.kind === 'money') return formatCurrency(value);
  return String(value);
}

function displayText(field, modelValue) {
  const value = toDisplayValue(field, modelValue);
  if (field.kind === 'percent') {
    const decimals = (field.step ?? 1) < 1 ? 1 : 0;
    return `${Number(value.toFixed(decimals))}%`;
  }
  if (field.kind === 'money') return formatCurrency(value);
  return String(Math.round(value));
}

function selectField(field) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const id = `f-${field.key}`;

  const label = document.createElement('label');
  label.className = 'field-label';
  label.htmlFor = id;
  label.textContent = field.label;

  const select = document.createElement('select');
  select.className = 'field-select';
  select.id = id;
  for (const option of field.options ?? []) {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    select.appendChild(node);
  }
  select.addEventListener('change', () => setValue(field.key, select.value));

  const hint = document.createElement('p');
  hint.className = 'field-hint';

  wrap.append(label, select, hint);
  controls.set(field.key, { number: /** @type {any} */ (select), range: null, hint, row: wrap });
  return wrap;
}

function booleanField(field) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const id = `f-${field.key}`;

  const row = document.createElement('div');
  row.className = 'field-check';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.id = id;
  const label = document.createElement('label');
  label.htmlFor = id;
  label.className = 'field-label';
  label.textContent = field.label;
  row.append(box, label);

  const hint = document.createElement('p');
  hint.className = 'field-hint';
  hint.textContent = field.help;

  box.addEventListener('change', () => setValue(field.key, box.checked));
  wrap.append(row, hint);
  controls.set(field.key, { number: /** @type {any} */ (box), range: null, hint, row: wrap });
  return wrap;
}

/* ------------------------------ help popover ------------------------------ */

/** @type {HTMLButtonElement|null} */
let openHelpTrigger = null;

/**
 * @param {HTMLButtonElement} trigger
 * @param {{label: string, help: string}} field
 */
function toggleHelp(trigger, field) {
  if (openHelpTrigger === trigger) { closeHelp(); return; }
  openHelp(trigger, field);
}

/**
 * @param {HTMLButtonElement} trigger
 * @param {{label: string, help: string}} field
 */
function openHelp(trigger, field) {
  const popover = $('help-popover');
  if (openHelpTrigger) openHelpTrigger.setAttribute('aria-expanded', 'false');

  $('help-popover-title').textContent = field.label;
  $('help-popover-body').textContent = field.help;
  popover.setAttribute('aria-label', `About ${field.label}`);
  popover.hidden = false;

  openHelpTrigger = trigger;
  trigger.setAttribute('aria-expanded', 'true');
  positionHelp(trigger);
  /** @type {HTMLButtonElement} */ ($('help-popover-close')).focus();
}

function closeHelp() {
  const popover = $('help-popover');
  popover.hidden = true;
  if (openHelpTrigger) {
    openHelpTrigger.setAttribute('aria-expanded', 'false');
    // Returning focus to the ? keeps keyboard navigation where it was.
    openHelpTrigger.focus();
    openHelpTrigger = null;
  }
}

/** @param {HTMLElement} trigger */
function positionHelp(trigger) {
  const popover = $('help-popover');
  const anchorRect = trigger.getBoundingClientRect();
  const box = popover.getBoundingClientRect();
  const GAP = 10;
  const EDGE = 12;

  // Flip above the trigger when there is not enough room below it.
  const below = anchorRect.bottom + GAP + box.height <= window.innerHeight - EDGE;
  const top = below
    ? anchorRect.bottom + GAP
    : Math.max(EDGE, anchorRect.top - GAP - box.height);

  const preferredLeft = anchorRect.left + anchorRect.width / 2 - box.width / 2;
  const left = clamp(preferredLeft, EDGE, Math.max(EDGE, window.innerWidth - box.width - EDGE));

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
  popover.setAttribute('data-placement', below ? 'below' : 'above');
  // Keep the caret pointing at the ? even when the card was clamped sideways.
  const caretX = clamp(anchorRect.left + anchorRect.width / 2 - left, 12, box.width - 12);
  popover.style.setProperty('--caret-x', `${caretX}px`);
}

function wireHelpPopover() {
  $('help-popover-close').addEventListener('click', closeHelp);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openHelpTrigger) { e.preventDefault(); closeHelp(); }
  });

  document.addEventListener('pointerdown', (e) => {
    if (!openHelpTrigger) return;
    const target = /** @type {Node} */ (e.target);
    if ($('help-popover').contains(target) || openHelpTrigger.contains(target)) return;
    closeHelp();
  });

  // The card is fixed-position, so it would drift away from its ? on scroll.
  for (const target of [window, document.querySelector('.inputs')]) {
    target?.addEventListener('scroll', () => { if (openHelpTrigger) closeHelp(); }, { passive: true });
  }
  window.addEventListener('resize', () => { if (openHelpTrigger) positionHelp(openHelpTrigger); });
}

/* ------------------------------ state plumbing ------------------------------ */

function setValue(key, value) {
  inputs = { ...inputs, [key]: value };
  render();
}

function syncControls(result) {
  for (const field of FIELDS) {
    const control = controls.get(field.key);
    if (!control) continue;
    const value = inputs[field.key];

    if (control.row) {
      const hidden = typeof field.visibleWhen === 'function'
        ? !field.visibleWhen(inputs)
        : false;
      control.row.hidden = hidden;
      if (hidden && openHelpTrigger && control.row.contains(openHelpTrigger)) closeHelp();
    }

    if (field.kind === 'boolean') {
      /** @type {HTMLInputElement} */ (control.number).checked = Boolean(value);
    } else if (field.kind === 'select') {
      /** @type {HTMLSelectElement} */ (/** @type {any} */ (control.number)).value = String(value);
      const detail = field.options?.find((o) => o.value === value)?.detail;
      if (detail) control.hint.textContent = detail;
    } else {
      control.number.value = displayText(field, value);
      if (control.range) control.range.value = String(toDisplayValue(field, value));
      control.hint.textContent = hintFor(field.key, result);
    }
  }
}

function hintFor(key, result) {
  switch (key) {
    case 'contributionPercent': {
      const annual = inputs.income * inputs.contributionPercent;
      const perPeriod = annual / result.periodsPerYear;
      return `${formatCurrency(annual)} a year — ${formatCurrency(perPeriod)} per paycheck`;
    }
    case 'employerMatchRate': {
      if (!inputs.employerMatchRate || !inputs.employerMatchLimit) return 'No employer match';
      const matched = Math.min(inputs.contributionPercent, inputs.employerMatchLimit)
        * inputs.employerMatchRate;
      const short = inputs.contributionPercent < inputs.employerMatchLimit;
      return `${formatCurrency(inputs.income * matched)} a year of free money`
        + (short ? ` — contribute ${formatPercent(inputs.employerMatchLimit, 1)} to get it all` : '');
    }
    case 'employerMatchLimit':
      return 'The match is pre-tax in both options, so it never changes the answer';
    case 'withdrawalRate':
      return `About ${formatCurrency(result.traditional.annualWithdrawal)} a year in today\u2019s dollars`;
    case 'otherRetirementIncome':
      return inputs.otherRetirementIncome > 0
        ? 'Fills the low brackets first, taxing withdrawals higher'
        : 'Social Security, pension or similar (today\u2019s dollars)';
    case 'currentTaxMode': {
      if (result.currentTaxMode !== 'brackets' || !result.schedule.length) return '';
      const first = result.schedule[0].deductionRate;
      const last = result.schedule.at(-1).deductionRate;
      return Math.abs(last - first) < 0.005
        ? `Your deduction is worth ${formatPercent(first, 1)} combined`
        : `Worth ${formatPercent(first, 1)} now, rising to ${formatPercent(last, 1)} `
          + 'by retirement as your pay grows';
    }
    case 'currentFederalRate':
      return bracketLabel(inputs.currentFederalRate);
    case 'retirementFederalRate':
      return bracketLabel(inputs.retirementFederalRate);
    case 'currentStateRate':
      return `Combined rate today: ${formatPercent(result.currentCombinedRate, 1)}`
        + (result.currentTaxMode === 'brackets'
          ? ` (${formatPercent(result.currentFederalRate, 1)} federal, worked out from your income)`
          : '');
    case 'retirementStateRate':
      return result.retirementTaxMode === 'brackets'
        ? `Projected combined rate: ${formatPercent(result.traditional.retirementRate, 1)} on Traditional withdrawals`
        : `Combined rate in retirement: ${formatPercent(result.retirementCombinedRate, 1)}`;
    case 'retirementAge':
      return `${result.years} years of contributions`;
    case 'income':
      return inputs.wageGrowth > 0 && result.schedule.length
        ? `Grows to ${formatCurrency(result.schedule.at(-1).income)} by retirement`
        : 'Gross salary before taxes';
    case 'inflation':
      return `${formatCurrency(1000)} in ${result.years} years buys what `
        + `${formatCurrency(1000 / result.real.deflator)} buys today`;
    case 'rateOfReturn': {
      const realReturn = (1 + inputs.rateOfReturn) / (1 + inputs.inflation) - 1;
      return `About ${formatPercent(realReturn, 1)} after inflation`;
    }
    case 'capitalGainsRate':
      return inputs.taxSavingsTreatment === 'invest'
        ? `Plus state: ${formatPercent(result.sideGainsRate, 1)} on side-account gains`
        : 'Not used unless the tax savings are invested';
    default:
      return '';
  }
}

/* ------------------------------ estimators ------------------------------ */

function runEstimator(key) {
  if (key === 'currentFederalRate') {
    const preTax = inputs.income * inputs.contributionPercent;
    setValue(key, estimateCurrentMarginalRate(inputs.income, preTax));
  } else if (key === 'retirementFederalRate') {
    // Estimated in today's dollars, because brackets are inflation-indexed.
    // Uses the withdrawal rate and other income the user has already set:
    // those fields are hidden in flat mode but their values persist, and
    // ignoring them produced an estimate that silently matched the default.
    const result = project(inputs);
    setValue(key, estimateRetirementMarginalRate(
      result.real.traditional.preTaxBalance,
      inputs.withdrawalRate ?? DEFAULT_WITHDRAWAL_RATE,
      inputs.otherRetirementIncome ?? 0,
    ));
  } else if (key === 'capitalGainsRate') {
    setValue(key, capitalGainsRate(inputs.income));
  }
}

/* ------------------------------ results ------------------------------ */

function render() {
  const result = project(inputs);
  syncControls(result);
  renderVerdict(result);
  renderCharts(result);
  renderCompare(result);
  renderSchedule(result);
  renderCaveats(result);
  renderPaycheck(result);
  renderFairness(result);

  const query = encodeState(inputs);
  const url = query
    ? `${window.location.pathname}?${query}`
    : window.location.pathname;
  window.history.replaceState(null, '', url);
}

function view(result) {
  return basis === 'real' ? result.real : result;
}

let verdictFadeTimer = 0;

function flashVerdict() {
  const card = $('verdict');
  if (!card || !document.documentElement.classList.contains('theme-ready')) return;
  card.classList.add('is-updating');
  clearTimeout(verdictFadeTimer);
  verdictFadeTimer = setTimeout(() => card.classList.remove('is-updating'), 90);
}

let lastWinner = null;

function renderVerdict(result) {
  const v = view(result);
  const label = basis === 'real' ? " in today's dollars" : '';

  // Only signal a genuine flip. Flashing on every slider tick would be noise.
  if (lastWinner !== null && lastWinner !== result.winner) flashVerdict();
  lastWinner = result.winner;

  const headline = $('verdict-headline');
  const detail = $('verdict-detail');

  if (result.years === 0) {
    headline.textContent = 'Set a retirement age above your current age';
    detail.textContent = 'There are no contribution years to project yet.';
    $('verdict-breakeven').textContent = '';
    return;
  }
  if (result.totalContributions === 0) {
    headline.textContent = 'Set a contribution above 0%';
    detail.textContent = 'Nothing is being contributed, so there is nothing to compare.';
    $('verdict-breakeven').textContent = '';
    return;
  }

  if (result.winner === 'tie') {
    headline.innerHTML = 'It is a tie';
    detail.textContent =
      `Both options land within ${formatCurrency(v.difference)} of each other${label}. `
      + 'At these rates the choice is close enough that other factors should decide it.';
  } else {
    const isRoth = result.winner === 'roth';
    const name = isRoth ? 'Roth' : 'Traditional';
    headline.innerHTML =
      `A <span class="${isRoth ? 'win-roth' : 'win-trad'}">${name} 401(k)</span> `
      + `leaves you ${formatCurrency(v.difference)} better off`;
    detail.textContent =
      `After taxes, ${name} gives you ${formatCurrency(isRoth ? v.roth.total : v.traditional.total)}`
      + ` versus ${formatCurrency(isRoth ? v.traditional.total : v.roth.total)}${label}`
      + ` — a ${formatPercent(v.difference / Math.max(1, Math.min(v.roth.total, v.traditional.total)), 1)} edge.`;
  }

  // A verdict drawn from a comparison the page itself knows is unequal should
  // not be stated as a plain fact in the headline.
  const fairness = paycheckBreakdown(inputs, result);
  const warning = $('verdict-warning');
  if (warning) {
    warning.hidden = fairness.equalized || result.taxSavingsTreatment === 'spend';
    warning.innerHTML = warning.hidden ? '' :
      `<strong>Treat this verdict with caution.</strong> The two options do not cost the same: `
      + `Traditional is ${formatCurrency(fairness.costGap)} a year cheaper. The IRS limit has `
      + `capped the Traditional contribution at ${formatCurrency(fairness.contribution.trad)}, so `
      + `grossing up cannot go any further. That unspent money is not modelled anywhere. `
      + 'Switch the tax-savings assumption to investing the refund for a fair comparison.';
  }

  const breakEven = result.breakEvenRetirementRate;
  if (result.taxSavingsTreatment === 'spend') {
    $('verdict-breakeven').innerHTML =
      'Because the Traditional tax savings are spent rather than invested, Roth wins '
      + 'at any retirement tax rate above 0%. Switch that assumption to compare fairly.';
  } else if (result.retirementTaxMode === 'brackets') {
    // Both sides of this comparison are derived rather than guessed, which is
    // the whole point of the bracket mode.
    $('verdict-breakeven').innerHTML =
      `Traditional wins below a combined retirement rate of <strong>${formatPercent(breakEven, 1)}</strong>. `
      + `Drawing ${formatCurrency(result.traditional.annualWithdrawal)} a year puts you at an `
      + `<strong>effective</strong> rate of <strong>${formatPercent(result.traditional.retirementRate, 1)}</strong> `
      + `— not the ${formatPercent(marginalRate(Math.max(0,
        result.traditional.annualWithdrawal + inputs.otherRetirementIncome - STANDARD_DEDUCTION_2026)), 0)} `
      + `marginal rate, because the standard deduction and the low brackets fill first. `
      + `Today you pay <strong>${formatPercent(result.currentCombinedRate, 1)}</strong>.`;
  } else {
    $('verdict-breakeven').innerHTML =
      `Traditional wins whenever your combined retirement tax rate comes in below `
      + `<strong>${formatPercent(breakEven, 1)}</strong>. `
      + `You entered <strong>${formatPercent(result.retirementCombinedRate, 1)}</strong>, `
      + `against <strong>${formatPercent(result.currentCombinedRate, 1)}</strong> today.`;
  }
}

function renderCharts(result) {
  const v = view(result);
  const investing = result.taxSavingsTreatment === 'invest';
  const hasMatch = result.roth.match.balance > 0;

  const bars = (tradOwn, tradMatch, side, rothOwn, rothMatch) => [
    {
      name: 'Traditional',
      segments: [
        { value: tradOwn, tone: 'trad' },
        { value: hasMatch ? tradMatch : 0, tone: 'match' },
        { value: investing ? side : 0, tone: 'side' },
      ],
    },
    {
      name: 'Roth',
      segments: [
        { value: rothOwn, tone: 'roth' },
        { value: hasMatch ? rothMatch : 0, tone: 'match' },
      ],
    },
  ];

  renderBarChart(/** @type {HTMLElement} */ ($('bar-chart')), {
    title: 'Traditional versus Roth balances at retirement, before and after taxes',
    groups: [
      {
        label: 'At retirement (pre-tax)',
        bars: bars(
          v.traditional.balance, v.traditional.match.balance, v.traditional.side.balance,
          v.roth.balance, v.roth.match.balance,
        ),
      },
      {
        label: 'After taxes',
        bars: bars(
          v.traditional.afterTax, v.traditional.match.afterTax, v.traditional.side.afterTax,
          v.roth.afterTax, v.roth.match.afterTax,
        ),
      },
    ],
  });

  // With nothing to draw, the chart suppresses itself; a legend and a note
  // describing an absent chart would just be debris.
  const hasData = result.traditional.total > 0 || result.roth.total > 0;
  const legend = [
    { label: 'Traditional 401(k)', tone: 'trad' },
    hasMatch ? { label: 'Employer match (pre-tax in both)', tone: 'match' } : null,
    investing ? { label: 'Taxable side account', tone: 'side' } : null,
    { label: 'Roth 401(k)', tone: 'roth' },
  ].filter(Boolean);
  $('chart-legend').innerHTML = hasData ? legend.map(swatch).join('') : '';
  $('chart-note').textContent = hasData ? noteFor(result) : '';
  $('line-legend').innerHTML = '';
  const emptyMessage = result.years === 0
    ? 'Nothing to chart yet — set a retirement age above your current age.'
    : 'Nothing to chart yet — set a contribution above 0%.';
  $('bar-chart').innerHTML = hasData ? $('bar-chart').innerHTML
    : `<p class="chart-empty">${emptyMessage}</p>`;
  renderTakeHomeStrip(result);
  renderEconWarning(result);

  const deflate = (value, year) => (basis === 'real'
    ? value / Math.pow(1 + inputs.inflation, year)
    : value);

  renderLineChart(/** @type {HTMLElement} */ ($('line-chart')), {
    title: 'Account balances from now until retirement',
    xLabel: 'Age',
    series: [
      {
        name: 'Traditional',
        tone: 'trad',
        points: result.schedule.map((r) => ({
          x: r.age + 1,
          y: deflate(r.tradBalance + r.tradMatchBalance + (investing ? r.sideBalance : 0), r.year),
        })),
      },
      {
        name: 'Roth',
        tone: 'roth',
        points: result.schedule.map((r) => ({
          x: r.age + 1,
          y: deflate(r.rothBalance + r.rothMatchBalance, r.year),
        })),
      },
    ],
  });
  $('line-legend').innerHTML = hasData ? [
    { label: investing ? 'Traditional + match + side account' : 'Traditional + match', tone: 'trad' },
    { label: hasMatch ? 'Roth + match' : 'Roth', tone: 'roth' },
  ].map(swatch).join('') : '';
}

/**
 * The growing Traditional stack invites "more tax, more money". Showing
 * today's take-home pay directly beneath it makes the other half of the
 * picture impossible to miss.
 * @param {ReturnType<typeof project>} result
 */
function renderTakeHomeStrip(result) {
  const strip = $('takehome-strip');
  if (!strip) return;
  const b = paycheckBreakdown(inputs, result);

  if (b.contribution.roth === 0 && b.gross === 0) { strip.hidden = true; return; }
  strip.hidden = false;

  const same = Math.abs(b.takeHome.trad - b.takeHome.roth) < 5;
  strip.innerHTML = same
    ? `<span class="strip-label">Take-home pay today</span>`
      + `<strong>${formatCurrency(b.takeHome.roth)}</strong>`
      + `<span class="strip-note">a year, the same either way \u2014 this is what tax actually `
      + `costs you, and it falls as rates rise</span>`
    : `<span class="strip-label">Take-home pay today</span>`
      + `<strong>${formatCurrency(b.takeHome.trad)}</strong>`
      + `<span class="strip-note">Traditional vs `
      + `${formatCurrency(b.takeHome.roth)} Roth</span>`;
}

/**
 * Wage growth and inflation are independent inputs, so they can be set to an
 * economy that does not make sense. The usual symptom is that results stop
 * responding to inflation at all, because the real balance has collapsed far
 * enough that withdrawals fall inside the standard deduction.
 * @param {ReturnType<typeof project>} result
 */
function renderEconWarning(result) {
  const box = $('econ-warning');
  if (!box) return;
  const messages = [];

  const wageGap = inputs.inflation - inputs.wageGrowth;
  if (wageGap > 0.005 && result.years > 0) {
    const finalReal = result.schedule.at(-1).income / result.real.deflator;
    messages.push(
      `<strong>Your pay is set to fall behind inflation.</strong> Wages grow `
      + `${formatPercent(inputs.wageGrowth, 1)} a year against `
      + `${formatPercent(inputs.inflation, 1)} inflation, so by retirement your salary is worth `
      + `${formatCurrency(finalReal)} in today's money, down from `
      + `${formatCurrency(inputs.income)}. That shrinks every real figure below, and is usually `
      + 'not what you meant — try setting wage growth at or above inflation.',
    );
  }

  if (result.retirementTaxMode === 'brackets'
      && result.traditional.effectiveFederalRate === 0
      && result.traditional.preTaxBalance > 0) {
    messages.push(
      `<strong>Your projected withdrawals fall below the standard deduction.</strong> `
      + `Drawing ${formatCurrency(result.traditional.annualWithdrawal)} a year in today's money `
      + `is under the ${formatCurrency(STANDARD_DEDUCTION_2026)} standard deduction, so federal tax works out to `
      + 'zero and results stop responding to further changes. That is arithmetic, not a '
      + 'forecast — it means the assumptions have pushed your real balance very low.',
    );
  }

  box.hidden = messages.length === 0;
  box.innerHTML = messages.join('<br><br>');
}

function noteFor(result) {
  const treatment = TAX_SAVINGS_TREATMENTS.find((t) => t.value === result.taxSavingsTreatment);
  const dollars = basis === 'real'
    ? "Shown in today's dollars, discounted for inflation."
    : `Shown in future dollars at age ${inputs.retirementAge}, not adjusted for inflation.`;
  // This chart compares two wrappers for one fixed contribution. It is not a
  // measure of whether you are better off, and saying so here heads off the
  // reading that a higher tax rate grows your wealth.
  const scope = 'This compares two ways of making the same contribution \u2014 it is not a '
    + 'measure of your overall wealth, which falls as tax rises. Your current tax rate does '
    + 'not appear in the Roth calculation at all, which is why only the Traditional side '
    + 'moves when you change it.';
  return `${dollars} ${treatment?.detail ?? ''} ${scope}`;
}

function swatch(item) {
  return `<span class="legend-item"><span class="legend-swatch seg-${item.tone}"></span>${item.label}</span>`;
}

function renderCompare(result) {
  const v = view(result);
  const investing = result.taxSavingsTreatment === 'invest';
  const grossUp = result.taxSavingsTreatment === 'gross-up';
  const hasMatch = result.roth.match.balance > 0;
  const tradWins = result.winner === 'traditional';
  const rothWins = result.winner === 'roth';
  const brackets = result.retirementTaxMode === 'brackets';

  const section = (text) => ({ section: text });
  const row = (label, a, b, cls = '') => ({ label, a, b, cls });

  const items = [
    section('What it costs you'),
    row('Paid into the 401(k)', formatCurrency(v.traditional.contributions), formatCurrency(v.roth.contributions),
      grossUp ? '' : 'row-muted'),
    investing
      ? row('Paid into the taxable side account', formatCurrency(v.traditional.side.basis ?? 0), '\u2014')
      : null,
    row('Total take-home pay given up', formatCurrency(v.traditional.outOfPocket), formatCurrency(v.roth.outOfPocket),
      result.taxSavingsTreatment === 'spend' ? '' : 'row-rule row-equal'),

    section('What you have at retirement'),
    row('Your own 401(k) balance', formatCurrency(v.traditional.balance), formatCurrency(v.roth.balance),
      grossUp ? '' : 'row-muted'),
    hasMatch
      ? row('Employer match balance', formatCurrency(v.traditional.match.balance), formatCurrency(v.roth.match.balance), 'row-muted')
      : null,
    investing
      ? row('Taxable side account', formatCurrency(v.traditional.side.balance), '\u2014')
      : null,

    section('What tax takes'),
    // A rate on a Roth saver with no employer match applies to nothing, so
    // printing one would imply tax they do not owe.
    row(
      brackets ? 'Effective rate on withdrawals' : 'Rate on withdrawals',
      result.traditional.preTaxBalance > 0 ? formatPercent(result.traditional.retirementRate, 1) : '\u2014',
      result.roth.preTaxBalance > 0 ? formatPercent(result.roth.retirementRate, 1) : '\u2014',
    ),
    row('Tax on your own balance', formatCurrency(v.traditional.balance - v.traditional.afterTax), formatCurrency(0)),
    hasMatch
      ? row('Tax on the employer match', formatCurrency(v.traditional.match.balance - v.traditional.match.afterTax), formatCurrency(v.roth.match.balance - v.roth.match.afterTax))
      : null,
    investing
      ? row('Tax on the side account', formatCurrency(v.traditional.side.balance - v.traditional.side.afterTax), '\u2014')
      : null,
  ].filter(Boolean);

  const head = `<thead><tr><th scope="col">Measure</th>
    <th scope="col">Traditional</th><th scope="col">Roth</th></tr></thead>`;
  const body = items.map((item) => (item.section
    ? `<tr class="row-section"><th scope="row" colspan="3">${item.section}</th></tr>`
    : `<tr class="${item.cls}"><th scope="row">${item.label}</th><td>${item.a}</td><td>${item.b}</td></tr>`
  )).join('');
  const total = `<tr class="row-total"><th scope="row">After-tax value</th>
    <td class="${tradWins ? 'col-win' : ''}">${formatCurrency(v.traditional.total)}</td>
    <td class="${rothWins ? 'col-win' : ''}">${formatCurrency(v.roth.total)}</td></tr>
    <tr><th scope="row">Difference</th>
    <td>${formatSignedCurrency(v.traditional.total - v.roth.total)}</td>
    <td>${formatSignedCurrency(v.roth.total - v.traditional.total)}</td></tr>`;

  $('compare-table').innerHTML = `${head}<tbody>${body}${total}</tbody>`;

  // Several rows are identical on purpose, which looks like a bug unless said
  // out loud.
  const note = $('compare-note');
  if (!note) return;
  if (result.taxSavingsTreatment === 'spend') {
    note.textContent = 'Take-home pay given up is NOT equal here, because the Traditional tax '
      + 'savings are being spent. That is what makes this comparison unfair to Traditional.';
  } else if (grossUp) {
    note.textContent = 'Take-home pay given up is identical by design. The Traditional column '
      + 'shows a larger contribution and balance because the tax saving buys a bigger deferral.';
  } else {
    note.textContent = 'The contribution and 401(k) balance rows are identical because the same '
      + 'amount is deferred either way — tax is never taken out of the contribution itself. '
      + 'Take-home pay given up is identical too, because the side account absorbs exactly the '
      + 'tax saving. That equality is what makes the bottom line a fair comparison.';
  }
}

function renderSchedule(result) {
  const investing = result.taxSavingsTreatment === 'invest';
  const grossUp = result.taxSavingsTreatment === 'gross-up';
  const hasMatch = result.roth.match.balance > 0;
  const head = `<thead><tr>
    <th scope="col">Age</th><th scope="col">Income</th>
    <th scope="col">Your contribution</th>
    ${grossUp ? '<th scope="col">Trad. contribution</th>' : ''}
    ${hasMatch ? '<th scope="col">Match</th>' : ''}
    <th scope="col">401(k) balance</th>
    ${investing ? '<th scope="col">Side account</th>' : ''}
  </tr></thead>`;

  const body = result.schedule.map((row) => {
    const deflate = (value) => (basis === 'real'
      ? value / Math.pow(1 + inputs.inflation, row.year)
      : value);
    return `<tr class="${row.capped ? 'is-capped' : ''}">
      <td>${row.age}</td>
      <td>${formatCurrency(deflate(row.income))}</td>
      <td>${formatCurrency(row.rothContribution)}</td>
      ${grossUp ? `<td>${formatCurrency(row.tradContribution)}</td>` : ''}
      ${hasMatch ? `<td>${formatCurrency(row.rothMatch)}</td>` : ''}
      <td>${formatCurrency(deflate(row.tradBalance + row.tradMatchBalance))}</td>
      ${investing ? `<td>${formatCurrency(deflate(row.sideBalance))}</td>` : ''}
    </tr>`;
  }).join('');

  $('schedule-table').innerHTML = `${head}<tbody>${body}</tbody>`;
}

function renderCaveats(result) {
  const items = [
    'Federal brackets, the standard deduction and contribution limits are '
      + `${TAX_YEAR} figures for a <strong>single filer</strong>. Other filing statuses use different brackets.`,
    'State tax is a single flat rate. Bracketed state taxes, the federal deduction for state '
      + 'tax, and SALT interactions are ignored.',
    'The employer match is modeled as pre-tax in both options, which is how nearly all plans '
      + 'work. Since SECURE 2.0 some plans offer a Roth match; if yours does and you elect it, '
      + 'the match is taxable income in the year you receive it and then grows tax-free.',
    'No modeling of required minimum distributions, Medicare IRMAA surcharges, the saver\u2019s '
      + 'credit, or early-withdrawal penalties.',
    'Returns are assumed steady. Real markets are not, and sequence-of-returns risk is not modeled.',
    'The taxable side account is treated kindly, in three ways that stack and all favor '
      + 'Traditional: its gains are taxed once at the end rather than annually on dividends '
      + 'and distributions; it is assumed sold in a single year at one flat rate, when a large '
      + 'sale would itself climb the capital gains brackets; and the <em>Estimate</em> button '
      + 'derives that rate from your income <strong>today</strong>, though the account is sold '
      + 'in retirement when your income is usually lower.',
    'The comparison prices only the <strong>incremental</strong> cost of contributing, never '
      + 'your baseline tax bill. A higher current tax rate therefore widens Traditional\u2019s '
      + 'lead without anything on the chart getting worse \u2014 but you are poorer overall, '
      + 'which the take-home pay row above shows.',
  ];

  if (result.retirementTaxMode === 'brackets') {
    items.splice(1, 0,
      'Retirement tax is computed from the brackets on a single representative year of '
      + 'withdrawals, then applied to the whole balance. A real drawdown varies year to year.');
    if (inputs.otherRetirementIncome > 0) {
      items.splice(2, 0,
        'Other retirement income is treated as fully taxable. Social Security is only '
        + '0\u201385% taxable depending on total income, so entering a full benefit here '
        + 'overstates the tax somewhat.');
    }
  } else {
    items.splice(1, 0,
      'You are using a <strong>flat marginal rate</strong> for retirement, which overstates '
      + 'the tax a real retiree pays. Switching to "Estimate from tax brackets" models the '
      + 'standard deduction and the low brackets properly.');
  }

  if (result.everCapped) {
    items.unshift('Your contribution hits the IRS elective deferral limit in at least one year, '
      + 'so the highlighted rows in the schedule were capped.');
  }
  if (result.taxSavingsTreatment === 'gross-up') {
    items.unshift('Grossing up assumes you can actually defer the larger amount \u2014 check it '
      + 'against the IRS limit and your plan rules.');
  }
  $('caveat-list').innerHTML = items.map((t) => `<li>${t}</li>`).join('');
}

function renderPaycheck(result) {
  const b = paycheckBreakdown(inputs, result);
  const per = period === 'period' ? b.perPeriod : b;
  const scale = period === 'period' ? 1 / b.periodsPerYear : 1;
  const $$ = (x) => formatCurrency(x, { cents: period === 'period' });
  /** Renders an outflow, without the pointless minus sign on zero. */
  const out = (x) => (Math.abs(x) < 0.005 ? $$(0) : `\u2212${$$(x)}`);

  const label = period === 'period'
    ? `each of your ${b.periodsPerYear} paychecks a year`
    : 'a year';

  const rows = [
    ['Gross pay', $$(per.gross), $$(per.gross), 'row-muted'],
    ['Into the 401(k)', out(per.contribution.trad), out(per.contribution.roth), ''],
    ['Wages you still pay tax on', $$(b.taxableWages.trad * scale), $$(b.taxableWages.roth * scale), 'row-muted'],
    [
      `Tax on the wages you did not shelter, at ${formatPercent(b.rate, 1)}`,
      out(per.extraTax.trad),
      out(per.extraTax.roth),
      '',
    ],
    ['Cut to your take-home pay', $$(per.takeHomeCut.trad), $$(per.takeHomeCut.roth), 'row-rule'],
  ];

  if (b.treatment === 'invest') {
    rows.push(['Into a taxable brokerage account instead', out(per.sideDeposit.trad), '\u2014', '']);
  }
  if (b.match.roth > 0) {
    rows.push([
      'Employer match added on top (costs you nothing)',
      `+${$$(b.match.trad * scale)}`,
      `+${$$(b.match.roth * scale)}`,
      'row-muted',
    ]);
  }

  // Without these two rows the panel implies a higher tax rate leaves you
  // richer, because nothing else on screen ever shows the tax bill itself.
  rows.push(['Income tax you actually pay', out(per.tax.trad), out(per.tax.roth), 'row-rule']);
  rows.push([
    'Take-home pay left to live on',
    $$(per.takeHome.trad),
    $$(per.takeHome.roth),
    'row-muted',
  ]);

  const head = `<thead><tr><th scope="col">${label.charAt(0).toUpperCase()}${label.slice(1)}</th>
    <th scope="col">Traditional</th><th scope="col">Roth</th></tr></thead>`;
  const body = rows.map(([text, a, c, cls]) =>
    `<tr class="${cls}"><th scope="row">${text}</th><td>${a}</td><td>${c}</td></tr>`).join('');
  const total = `<tr class="row-total ${b.equalized ? 'row-equal' : ''}">
    <th scope="row">Total cost to you</th>
    <td>${$$(per.totalCost.trad)}</td><td>${$$(per.totalCost.roth)}</td></tr>`;

  $('paycheck-table').innerHTML = `${head}<tbody>${body}${total}</tbody>`;

  renderRateWarning(b);

  if (b.contribution.roth === 0) {
    $('paycheck-note').textContent = 'Set a contribution above 0% to see the breakdown.';
  } else if (b.treatment === 'spend') {
    $('paycheck-note').textContent =
      `The totals do not match: Roth costs you ${formatCurrency(b.costGap)} more ${label}. `
      + 'That is why it ends up worth more — you put more in. Switch the tax-savings '
      + 'assumption to compare the two fairly.';
  } else if (!b.equalized) {
    // Gross-up cannot equalise once the 402(g) cap truncates the larger
    // deferral, and claiming otherwise would be plainly contradicted by the
    // totals directly above.
    $('paycheck-note').textContent =
      `These totals do not match, so this is not yet a fair comparison. The IRS limit has `
      + `capped the Traditional contribution at ${formatCurrency(b.contribution.trad)}, so `
      + `grossing up cannot raise it any further — leaving Traditional `
      + `${formatCurrency(b.costGap)} ${label} cheaper, and that money is not being invested `
      + 'anywhere. Switch to investing the refund in a brokerage account to compare them fairly.';
  } else if (b.treatment === 'gross-up') {
    $('paycheck-note').textContent =
      `Identical totals, so this is a fair comparison. Note the Traditional column defers `
      + `${formatCurrency(b.contribution.trad - b.contribution.roth)} more ${label} — that is what `
      + 'the tax saving buys.';
  } else {
    $('paycheck-note').textContent =
      'Identical totals, so this is a fair comparison. The same amount reaches the 401(k) '
      + 'either way; what differs is the tax on the rest of your pay, which comes out of '
      + 'take-home rather than out of the account.';
  }
}

/**
 * A high entered rate makes Traditional look better without anything on
 * screen getting worse, which reads as "more tax, more money." That only
 * happens when the entered rate outruns what the brackets actually refund,
 * so say so where it is visible.
 * @param {ReturnType<typeof paycheckBreakdown>} b
 */
function renderRateWarning(b) {
  const box = $('rate-warning');
  if (!box) return;

  if (b.unaffordable) {
    box.hidden = false;
    box.innerHTML = '<strong>This plan costs more than you earn.</strong> Tax plus your '
      + 'contribution exceed your gross pay, so the projection below is not achievable.';
    return;
  }

  if (b.phantomRefund && b.treatment === 'invest') {
    box.hidden = false;
    box.innerHTML =
      `<strong>Your tax rate is higher than your income supports.</strong> At `
      + `${formatCurrency(b.gross)} the 2026 brackets refund about `
      + `${formatCurrency(b.actualTaxSaving)} a year on this contribution, but a `
      + `${formatPercent(b.rate, 1)} rate sweeps ${formatCurrency(b.sideDeposit.trad)} into the `
      + `side account — ${formatCurrency(b.phantomAmount)} of which tax never actually gives `
      + `you back. That flatters Traditional. Use <em>Estimate</em> to set a rate of about `
      + `${formatPercent(b.impliedMarginalRate, 1)}.`;
    return;
  }

  if (b.rateMismatch) {
    box.hidden = false;
    box.innerHTML =
      `<strong>Check your current tax rate.</strong> At ${formatCurrency(b.gross)} the 2026 `
      + `brackets imply about ${formatPercent(b.impliedMarginalRate, 1)} combined, but you have `
      + `entered ${formatPercent(b.rate, 1)}. Use <em>Estimate</em> next to the federal rate to `
      + 'match them up.';
    return;
  }

  box.hidden = true;
  box.innerHTML = '';
}

function renderFairness(result) {
  const panel = $('fairness');
  if (!panel) return;
  const rate = result.currentCombinedRate;
  const contribution = inputs.income * inputs.contributionPercent;
  const saving = contribution * rate;

  if (result.taxSavingsTreatment === 'gross-up') {
    panel.innerHTML =
      `<p>Putting ${formatCurrency(contribution)} into a <strong>Roth</strong> costs you the full `
      + `${formatCurrency(contribution)} of take-home pay, because that money is already taxed.</p>`
      + `<p>Putting ${formatCurrency(contribution)} in <strong>pre-tax</strong> costs only `
      + `${formatCurrency(contribution * (1 - rate))}, because the deduction saves you `
      + `${formatCurrency(saving)} in tax. Pre-tax is the cheaper option, so comparing both at `
      + `${formatCurrency(contribution)} would not be a fair fight.</p>`
      + `<p>You have chosen to close that gap by <strong>contributing more pre-tax</strong>: the `
      + `Traditional side defers ${formatCurrency(contribution / Math.max(0.01, 1 - rate))} so that both `
      + `options cost the same ${formatCurrency(contribution)} of take-home pay.</p>`;
  } else if (result.taxSavingsTreatment === 'invest') {
    panel.innerHTML =
      `<p>Putting ${formatCurrency(contribution)} into a <strong>Roth</strong> costs you the full `
      + `${formatCurrency(contribution)} of take-home pay, because that money is already taxed.</p>`
      + `<p>Putting the same ${formatCurrency(contribution)} in <strong>pre-tax</strong> costs only `
      + `${formatCurrency(contribution * (1 - rate))}, because the deduction saves you `
      + `${formatCurrency(saving)} in tax \u2014 so Traditional leaves an extra `
      + `${formatCurrency(saving)} in your pocket this year.</p>`
      + `<p>The <strong>&ldquo;taxable side account&rdquo;</strong> is simply where that `
      + `${formatCurrency(saving)} a year goes: an ordinary brokerage account, because it will not fit `
      + `in the 401(k). It exists only on the Traditional side, and only so that both options cost you `
      + `the same take-home pay. Without it you would be comparing `
      + `${formatCurrency(contribution)} of your money against ${formatCurrency(contribution * (1 - rate))} `
      + `of your money, which would flatter Roth unfairly.</p>`;
  } else {
    panel.innerHTML =
      `<p>You have chosen to <strong>spend</strong> the Traditional tax savings of about `
      + `${formatCurrency(saving)} a year rather than invest them.</p>`
      + `<p>That makes Roth win almost automatically \u2014 but not because Roth is better. It wins `
      + `because you are putting ${formatCurrency(contribution)} of take-home pay into it versus only `
      + `${formatCurrency(contribution * (1 - rate))} into Traditional. It is the more expensive option, `
      + `so of course it ends up worth more. For a fair comparison, pick one of the other two options.</p>`;
  }
}

/* ------------------------------ chrome ------------------------------ */

function wireChrome() {
  for (const seg of document.querySelectorAll('.seg:not(.period-seg)')) {
    seg.addEventListener('click', () => {
      basis = /** @type {'nominal'|'real'} */ (seg.getAttribute('data-basis'));
      for (const other of document.querySelectorAll('.seg:not(.period-seg)')) {
        other.classList.toggle('is-active', other === seg);
        other.setAttribute('aria-pressed', String(other === seg));
      }
      render();
    });
  }

  for (const seg of document.querySelectorAll('.period-seg')) {
    seg.addEventListener('click', () => {
      period = /** @type {'year'|'period'} */ (seg.getAttribute('data-period'));
      for (const other of document.querySelectorAll('.period-seg')) {
        other.classList.toggle('is-active', other === seg);
        other.setAttribute('aria-pressed', String(other === seg));
      }
      render();
    });
  }

  $('reset').addEventListener('click', () => {
    inputs = decodeState('');
    render();
  });

  const toggle = /** @type {HTMLButtonElement} */ ($('theme-toggle'));
  const syncTheme = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    $('theme-toggle-label').textContent = dark ? 'Light' : 'Dark';
    toggle.setAttribute('aria-pressed', String(dark));
  };
  toggle.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode */ }
    syncTheme();
  });
  syncTheme();

  $('copy-link').addEventListener('click', async () => {
    const status = $('copy-status');
    try {
      await navigator.clipboard.writeText(window.location.href);
      status.textContent = 'Copied';
    } catch (e) {
      status.textContent = 'Copy the address bar instead';
    }
    setTimeout(() => { status.textContent = ''; }, 2500);
  });
}

buildFields();
wireChrome();
wireHelpPopover();
render();

// Enabled only after the first render, so the initial paint does not animate
// its own colors in from nothing.
requestAnimationFrame(() => {
  requestAnimationFrame(() => document.documentElement.classList.add('theme-ready'));
});
