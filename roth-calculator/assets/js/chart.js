// @ts-check
import { formatCompactCurrency, formatCurrency } from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Rounds an axis maximum up to a 1/2/2.5/5 x 10^n step so tick labels read
 * as round numbers.
 * @param {number} rawMax
 * @param {number} [tickCount]
 * @returns {{max: number, step: number, ticks: number[]}}
 */
export function niceScale(rawMax, tickCount = 5) {
  const max = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 1;
  const count = Math.max(2, Math.min(10, Math.round(tickCount)));
  const rough = max / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / magnitude;
  const niceNormalized = [1, 2, 2.5, 5, 10].find((n) => normalized <= n) ?? 10;
  const step = niceNormalized * magnitude;
  const niceMax = Math.ceil(max / step) * step;

  const ticks = [];
  // Accumulate by index rather than adding `step` repeatedly, so floating
  // point error cannot drift the final tick off the axis maximum.
  const steps = Math.round(niceMax / step);
  for (let i = 0; i <= steps; i++) ticks.push(Number((step * i).toPrecision(12)));
  return { max: niceMax, step, ticks };
}

/**
 * @param {Array<[number, number]>} points
 * @returns {string}
 */
export function svgPath(points) {
  if (!points.length) return '';
  return points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${round(x)} ${round(y)}`)
    .join(' ');
}

/** @param {number} n */
function round(n) {
  return Number(n.toFixed(2));
}

/**
 * @param {string} name
 * @param {Record<string, string|number>} attrs
 * @param {string} [text]
 */
function el(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Grouped bar chart. A bar may carry multiple stacked segments.
 *
 * @param {HTMLElement} container
 * @param {{
 *   groups: Array<{label: string, bars: Array<{name: string, segments: Array<{value: number, fill: string}>}>}>,
 *   title: string,
 * }} config
 */
export function renderBarChart(container, config) {
  container.textContent = '';
  const { groups, title } = config;

  const W = 560;
  const H = 300;
  const pad = { top: 16, right: 12, bottom: 44, left: 62 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const dataMax = Math.max(
    ...groups.flatMap((g) => g.bars.map((b) => sum(b.segments))),
    1,
  );
  const { max, ticks } = niceScale(dataMax);

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chart',
    role: 'img',
    'aria-label': title,
    preserveAspectRatio: 'xMidYMid meet',
  });
  svg.appendChild(el('title', {}, title));

  /** @param {number} v */
  const yOf = (v) => pad.top + plotH - (v / max) * plotH;

  for (const tick of ticks) {
    const y = yOf(tick);
    svg.appendChild(el('line', {
      x1: pad.left, x2: pad.left + plotW, y1: y, y2: y, class: 'chart-grid',
    }));
    svg.appendChild(el('text', {
      x: pad.left - 8, y: y + 4, class: 'chart-tick', 'text-anchor': 'end',
    }, formatCompactCurrency(tick)));
  }

  const groupW = plotW / groups.length;
  groups.forEach((group, gi) => {
    const barCount = group.bars.length;
    const gutter = groupW * 0.18;
    const usable = groupW - gutter * 2;
    const barW = Math.min(64, usable / barCount - 8);
    const groupLeft = pad.left + gi * groupW + gutter;
    const spread = (usable - barW * barCount) / Math.max(1, barCount - 1);

    group.bars.forEach((bar, bi) => {
      const x = groupLeft + bi * (barW + spread);
      let cursor = 0;
      for (const segment of bar.segments) {
        if (segment.value <= 0) continue;
        const top = yOf(cursor + segment.value);
        const bottom = yOf(cursor);
        svg.appendChild(el('rect', {
          x, y: top, width: barW, height: Math.max(0, bottom - top),
          fill: segment.fill, class: 'chart-bar',
        }));
        cursor += segment.value;
      }
      const total = sum(bar.segments);
      svg.appendChild(el('text', {
        x: x + barW / 2, y: yOf(total) - 6, class: 'chart-value', 'text-anchor': 'middle',
      }, formatCompactCurrency(total)));
    });

    svg.appendChild(el('text', {
      x: pad.left + gi * groupW + groupW / 2,
      y: H - 14,
      class: 'chart-axis-label',
      'text-anchor': 'middle',
    }, group.label));
  });

  svg.appendChild(el('line', {
    x1: pad.left, x2: pad.left + plotW, y1: pad.top + plotH, y2: pad.top + plotH,
    class: 'chart-axis',
  }));

  container.appendChild(svg);
  container.appendChild(dataTable(groups));
}

/**
 * Balance-over-time line chart.
 * @param {HTMLElement} container
 * @param {{
 *   series: Array<{name: string, stroke: string, points: Array<{x: number, y: number}>}>,
 *   xLabel: string, title: string,
 * }} config
 */
export function renderLineChart(container, config) {
  container.textContent = '';
  const { series, xLabel, title } = config;
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return;

  const W = 560;
  const H = 260;
  const pad = { top: 16, right: 14, bottom: 42, left: 62 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const xMin = Math.min(...all.map((p) => p.x));
  const xMax = Math.max(...all.map((p) => p.x));
  const { max: yMax, ticks } = niceScale(Math.max(...all.map((p) => p.y), 1));

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chart',
    role: 'img',
    'aria-label': title,
    preserveAspectRatio: 'xMidYMid meet',
  });
  svg.appendChild(el('title', {}, title));

  const xOf = (v) => pad.left + ((v - xMin) / Math.max(1, xMax - xMin)) * plotW;
  const yOf = (v) => pad.top + plotH - (v / yMax) * plotH;

  for (const tick of ticks) {
    const y = yOf(tick);
    svg.appendChild(el('line', {
      x1: pad.left, x2: pad.left + plotW, y1: y, y2: y, class: 'chart-grid',
    }));
    svg.appendChild(el('text', {
      x: pad.left - 8, y: y + 4, class: 'chart-tick', 'text-anchor': 'end',
    }, formatCompactCurrency(tick)));
  }

  for (const s of series) {
    svg.appendChild(el('path', {
      d: svgPath(s.points.map((p) => [xOf(p.x), yOf(p.y)])),
      fill: 'none',
      stroke: s.stroke,
      'stroke-width': 2.5,
      'stroke-linejoin': 'round',
      class: 'chart-line',
    }));
  }

  const xTickCount = Math.min(6, xMax - xMin + 1);
  for (let i = 0; i < xTickCount; i++) {
    const v = Math.round(xMin + ((xMax - xMin) * i) / Math.max(1, xTickCount - 1));
    svg.appendChild(el('text', {
      x: xOf(v), y: H - 22, class: 'chart-tick', 'text-anchor': 'middle',
    }, String(v)));
  }

  svg.appendChild(el('line', {
    x1: pad.left, x2: pad.left + plotW, y1: pad.top + plotH, y2: pad.top + plotH,
    class: 'chart-axis',
  }));
  svg.appendChild(el('text', {
    x: pad.left + plotW / 2, y: H - 4, class: 'chart-axis-label', 'text-anchor': 'middle',
  }, xLabel));

  container.appendChild(svg);
}

/** @param {Array<{value: number}>} segments */
function sum(segments) {
  return segments.reduce((t, s) => t + (Number.isFinite(s.value) ? s.value : 0), 0);
}

/**
 * Screen readers cannot read a chart, so every chart ships an equivalent
 * table that is visually hidden but present in the accessibility tree.
 * @param {Array<{label: string, bars: Array<{name: string, segments: Array<{value: number}>}>}>} groups
 */
function dataTable(groups) {
  const wrap = document.createElement('div');
  wrap.className = 'sr-only';
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  head.appendChild(th(''));
  for (const bar of groups[0]?.bars ?? []) head.appendChild(th(bar.name));
  const body = table.createTBody();
  for (const group of groups) {
    const row = body.insertRow();
    row.appendChild(th(group.label));
    for (const bar of group.bars) {
      row.insertCell().textContent = formatCurrency(sum(bar.segments));
    }
  }
  wrap.appendChild(table);
  return wrap;
}

/** @param {string} text */
function th(text) {
  const cell = document.createElement('th');
  cell.textContent = text;
  return cell;
}
