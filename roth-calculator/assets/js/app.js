// @ts-check
import { project, TAX_SAVINGS_TREATMENTS } from './engine.js';
import { FIELDS, toDisplayValue, toModelValue } from './fields.js';
import { decodeState, encodeState } from './state.js';
import {
  clamp, formatCurrency, formatPercent, formatSignedCurrency, parseNumber,
} from './format.js';
import { renderBarChart, renderLineChart } from './chart.js';
import {
  capitalGainsRate, estimateCurrentMarginalRate, estimateRetirementMarginalRate, bracketLabel,
} from './tax.js';
import { DEFAULT_WITHDRAWAL_RATE, TAX_YEAR } from './tax-data.js';

const THEME_KEY = 'roth-calc-theme';

let inputs = decodeState(window.location.search);
/** @type {'nominal'|'real'} */
let basis = 'nominal';
/** @type {Map<string, {number: HTMLInputElement, range: HTMLInputElement|null, hint: HTMLElement}>} */
const controls = new Map();

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

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

    helpToggle.addEventListener('click', () => {
      const open = helpToggle.getAttribute('aria-expanded') === 'true';
      helpToggle.setAttribute('aria-expanded', String(!open));
      help.hidden = open;
    });

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

    controls.set(field.key, { number, range, hint });
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
  controls.set(field.key, { number: /** @type {any} */ (select), range: null, hint });
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
  controls.set(field.key, { number: /** @type {any} */ (box), range: null, hint });
  return wrap;
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
    case 'currentFederalRate':
      return bracketLabel(inputs.currentFederalRate);
    case 'retirementFederalRate':
      return bracketLabel(inputs.retirementFederalRate);
    case 'currentStateRate':
      return `Combined rate today: ${formatPercent(result.currentCombinedRate, 1)}`;
    case 'retirementStateRate':
      return `Combined rate in retirement: ${formatPercent(result.retirementCombinedRate, 1)}`;
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
  const result = project(inputs);
  if (key === 'currentFederalRate') {
    const preTax = inputs.income * inputs.contributionPercent;
    setValue(key, estimateCurrentMarginalRate(inputs.income, preTax));
  } else if (key === 'retirementFederalRate') {
    // Estimated in today's dollars, because brackets are inflation-indexed.
    setValue(key, estimateRetirementMarginalRate(
      result.real.traditional.balance, DEFAULT_WITHDRAWAL_RATE, 0,
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

  const query = encodeState(inputs);
  const url = query
    ? `${window.location.pathname}?${query}`
    : window.location.pathname;
  window.history.replaceState(null, '', url);
}

function view(result) {
  return basis === 'real' ? result.real : result;
}

function renderVerdict(result) {
  const v = view(result);
  const label = basis === 'real' ? " in today's dollars" : '';

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
      `After taxes, ${name} gives you ${formatCurrency(isRoth ? v.roth.afterTax : v.traditional.total)}`
      + ` versus ${formatCurrency(isRoth ? v.traditional.total : v.roth.afterTax)}${label}`
      + ` — a ${formatPercent(v.difference / Math.max(1, Math.min(v.roth.afterTax, v.traditional.total)), 1)} edge.`;
  }

  const breakEven = result.breakEvenRetirementRate;
  $('verdict-breakeven').innerHTML = result.taxSavingsTreatment === 'spend'
    ? 'Because the Traditional tax savings are spent rather than invested, Roth wins '
      + 'at any retirement tax rate above 0%. Switch that assumption to compare fairly.'
    : `Traditional wins whenever your combined retirement tax rate comes in below `
      + `<strong>${formatPercent(breakEven, 1)}</strong>. `
      + `You entered <strong>${formatPercent(result.retirementCombinedRate, 1)}</strong>, `
      + `against <strong>${formatPercent(result.currentCombinedRate, 1)}</strong> today.`;
}

function renderCharts(result) {
  const v = view(result);
  const colors = {
    trad: cssVar('--trad'), tradSoft: cssVar('--trad-soft'), roth: cssVar('--roth'),
  };
  const investing = result.taxSavingsTreatment === 'invest';

  renderBarChart(/** @type {HTMLElement} */ ($('bar-chart')), {
    title: 'Traditional versus Roth balances at retirement, before and after taxes',
    groups: [
      {
        label: 'At retirement (pre-tax)',
        bars: [
          {
            name: 'Traditional',
            segments: [
              { value: v.traditional.balance, fill: colors.trad },
              { value: investing ? v.traditional.side.balance : 0, fill: colors.tradSoft },
            ],
          },
          { name: 'Roth', segments: [{ value: v.roth.balance, fill: colors.roth }] },
        ],
      },
      {
        label: 'After taxes',
        bars: [
          {
            name: 'Traditional',
            segments: [
              { value: v.traditional.afterTax, fill: colors.trad },
              { value: investing ? v.traditional.side.afterTax : 0, fill: colors.tradSoft },
            ],
          },
          { name: 'Roth', segments: [{ value: v.roth.afterTax, fill: colors.roth }] },
        ],
      },
    ],
  });

  const legend = [
    { label: 'Traditional 401(k)', color: colors.trad },
    investing ? { label: 'Taxable side account', color: colors.tradSoft } : null,
    { label: 'Roth 401(k)', color: colors.roth },
  ].filter(Boolean);
  $('chart-legend').innerHTML = legend.map(swatch).join('');

  $('chart-note').textContent = noteFor(result);

  renderLineChart(/** @type {HTMLElement} */ ($('line-chart')), {
    title: 'Account balances from now until retirement',
    xLabel: 'Age',
    series: [
      {
        name: 'Traditional + side account',
        stroke: colors.trad,
        points: result.schedule.map((r) => ({
          x: r.age + 1,
          y: (basis === 'real' ? r.tradBalance / Math.pow(1 + inputs.inflation, r.year) : r.tradBalance)
            + (investing
              ? (basis === 'real' ? r.sideBalance / Math.pow(1 + inputs.inflation, r.year) : r.sideBalance)
              : 0),
        })),
      },
      {
        name: 'Roth',
        stroke: colors.roth,
        points: result.schedule.map((r) => ({
          x: r.age + 1,
          y: basis === 'real' ? r.rothBalance / Math.pow(1 + inputs.inflation, r.year) : r.rothBalance,
        })),
      },
    ],
  });
  $('line-legend').innerHTML = [
    { label: investing ? 'Traditional + side account' : 'Traditional', color: colors.trad },
    { label: 'Roth', color: colors.roth },
  ].map(swatch).join('');
}

function noteFor(result) {
  const treatment = TAX_SAVINGS_TREATMENTS.find((t) => t.value === result.taxSavingsTreatment);
  const dollars = basis === 'real'
    ? "Shown in today's dollars, discounted for inflation."
    : `Shown in future dollars at age ${inputs.retirementAge}, not adjusted for inflation.`;
  return `${dollars} ${treatment?.detail ?? ''}`;
}

function swatch(item) {
  return `<span class="legend-item"><span class="legend-swatch" style="background:${item.color}"></span>${item.label}</span>`;
}

function renderCompare(result) {
  const v = view(result);
  const investing = result.taxSavingsTreatment === 'invest';
  const tradWins = result.winner === 'traditional';
  const rothWins = result.winner === 'roth';

  const rows = [
    ['Total contributed', formatCurrency(v.traditional.contributions), formatCurrency(v.roth.contributions)],
    ['Take-home pay given up', formatCurrency(v.traditional.outOfPocket), formatCurrency(v.roth.outOfPocket)],
    ['401(k) balance at retirement', formatCurrency(v.traditional.balance), formatCurrency(v.roth.balance)],
    investing ? ['Taxable side account', formatCurrency(v.traditional.side.balance), '—'] : null,
    ['Tax due on withdrawal', formatCurrency(v.traditional.balance - v.traditional.afterTax), formatCurrency(0)],
    investing ? ['Tax due on side account', formatCurrency(v.traditional.side.balance - v.traditional.side.afterTax), '—'] : null,
  ].filter(Boolean);

  const head = `<thead><tr><th scope="col">Measure</th>
    <th scope="col">Traditional</th><th scope="col">Roth</th></tr></thead>`;
  const body = rows.map(([label, a, b]) =>
    `<tr><th scope="row">${label}</th><td>${a}</td><td>${b}</td></tr>`).join('');
  const total = `<tr class="row-total"><th scope="row">After-tax value</th>
    <td class="${tradWins ? 'col-win' : ''}">${formatCurrency(v.traditional.total)}</td>
    <td class="${rothWins ? 'col-win' : ''}">${formatCurrency(v.roth.afterTax)}</td></tr>
    <tr><th scope="row">Difference</th>
    <td>${formatSignedCurrency(v.traditional.total - v.roth.afterTax)}</td>
    <td>${formatSignedCurrency(v.roth.afterTax - v.traditional.total)}</td></tr>`;

  $('compare-table').innerHTML = `${head}<tbody>${body}${total}</tbody>`;
}

function renderSchedule(result) {
  const investing = result.taxSavingsTreatment === 'invest';
  const grossUp = result.taxSavingsTreatment === 'gross-up';
  const head = `<thead><tr>
    <th scope="col">Age</th><th scope="col">Income</th>
    <th scope="col">Roth contribution</th>
    ${grossUp ? '<th scope="col">Trad. contribution</th>' : ''}
    <th scope="col">401(k) balance</th>
    ${investing ? '<th scope="col">Side account</th>' : ''}
  </tr></thead>`;

  const body = result.schedule.map((row) => {
    const deflate = (v) => (basis === 'real' ? v / Math.pow(1 + inputs.inflation, row.year) : v);
    return `<tr class="${row.capped ? 'is-capped' : ''}">
      <td>${row.age}</td>
      <td>${formatCurrency(deflate(row.income))}</td>
      <td>${formatCurrency(row.rothContribution)}</td>
      ${grossUp ? `<td>${formatCurrency(row.tradContribution)}</td>` : ''}
      <td>${formatCurrency(deflate(row.tradBalance))}</td>
      ${investing ? `<td>${formatCurrency(deflate(row.sideBalance))}</td>` : ''}
    </tr>`;
  }).join('');

  $('schedule-table').innerHTML = `${head}<tbody>${body}</tbody>`;
}

function renderCaveats(result) {
  const items = [
    'Federal brackets, the standard deduction and contribution limits are '
      + `${TAX_YEAR} figures for a <strong>single filer</strong>. Other filing statuses use different brackets.`,
    'Your entered rates are <strong>marginal</strong> rates. Real withdrawals fill the lower '
      + 'brackets first, so an effective rate in retirement is usually lower than the marginal one — '
      + 'which tilts the result toward Traditional.',
    'State tax is a single flat rate. Bracketed state taxes, the federal deduction for state '
      + 'tax, and SALT interactions are ignored.',
    'Employer match is excluded. It is pre-tax in both scenarios, so it does not change the choice.',
    'No modeling of required minimum distributions, Medicare IRMAA surcharges, Social Security '
      + 'taxation, the saver’s credit, or early-withdrawal penalties.',
    'Returns are assumed steady. Real markets are not, and sequence-of-returns risk is not modeled.',
  ];
  if (result.everCapped) {
    items.unshift('Your contribution hits the IRS elective deferral limit in at least one year, '
      + 'so the highlighted rows in the schedule were capped.');
  }
  if (result.taxSavingsTreatment === 'gross-up') {
    items.unshift('Grossing up assumes you can actually defer the larger amount — check it '
      + 'against the IRS limit and your plan rules.');
  }
  $('caveat-list').innerHTML = items.map((t) => `<li>${t}</li>`).join('');
}

/* ------------------------------ chrome ------------------------------ */

function wireChrome() {
  for (const seg of document.querySelectorAll('.seg')) {
    seg.addEventListener('click', () => {
      basis = /** @type {'nominal'|'real'} */ (seg.getAttribute('data-basis'));
      for (const other of document.querySelectorAll('.seg')) {
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
    render();
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
render();
