// @ts-check
import { formatCompactCurrency, formatCurrency } from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const TWEEN_MS = 320;
/** Last numeric values drawn per container, so a redraw can animate from them. */
const lastValues = new WeakMap();
/** In-flight animation frame per container, so a redraw cancels the old one. */
const running = new WeakMap();

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Ease-out cubic: fast start, gentle settle. */
function ease(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Tweens a flat array of numbers and calls `draw` each frame. Falls back to
 * drawing the final values immediately when the shape changed or the viewer
 * asked for reduced motion.
 * @param {HTMLElement} container
 * @param {number[]} target
 * @param {(values: number[]) => void} draw
 */
function animateValues(container, target, draw) {
  const pending = running.get(container);
  if (pending) cancelAnimationFrame(pending);

  const from = lastValues.get(container);
  lastValues.set(container, target);

  const canTween = from
    && from.length === target.length
    && !prefersReducedMotion()
    && typeof requestAnimationFrame === 'function';

  if (!canTween) {
    draw(target);
    return;
  }

  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / TWEEN_MS);
    const k = ease(t);
    draw(target.map((to, i) => from[i] + (to - from[i]) * k));
    if (t < 1) {
      running.set(container, requestAnimationFrame(step));
    } else {
      running.delete(container);
    }
  };
  running.set(container, requestAnimationFrame(step));
}

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
  const scale = niceScale(Math.max(
    ...config.groups.flatMap((g) => g.bars.map((b) => sum(b.segments))), 1,
  ));
  // The axis maximum rides along as the last tweened value. Snapping it
  // instead would make every bar dip before growing whenever the scale grew.
  const target = [
    ...config.groups.flatMap((g) => g.bars.flatMap((b) => b.segments.map((x) => x.value))),
    scale.max,
  ];
  animateValues(container, target, (values) => drawBarChart(
    container, config, values.slice(0, -1), { max: values.at(-1), ticks: scale.ticks },
  ));
}

/**
 * @param {HTMLElement} container
 * @param {any} config
 * @param {number[]} values flat segment values, in config order
 * @param {{max: number, ticks: number[]}} scale
 */
function drawBarChart(container, config, values, scale) {
  container.textContent = '';
  const { groups, title } = config;

  const W = 560;
  const H = 300;
  const pad = { top: 16, right: 12, bottom: 44, left: 62 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const { max, ticks } = scale;

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
    if (tick > max) continue;
    const y = yOf(tick);
    svg.appendChild(el('line', {
      x1: pad.left, x2: pad.left + plotW, y1: y, y2: y, class: 'chart-grid',
    }));
    svg.appendChild(el('text', {
      x: pad.left - 8, y: y + 4, class: 'chart-tick', 'text-anchor': 'end',
    }, formatCompactCurrency(tick)));
  }

  let cursorIndex = 0;
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
      let stacked = 0;
      for (const segment of bar.segments) {
        const value = values[cursorIndex++] ?? 0;
        if (value <= 0) continue;
        const top = yOf(stacked + value);
        const bottom = yOf(stacked);
        const height = Math.max(0, bottom - top);
        svg.appendChild(el('rect', {
          x, y: top, width: barW, height,
          class: `chart-bar seg-${segment.tone}`,
        }));
        // Only label a band with room for the text, otherwise it collides
        // with its neighbours.
        if (height >= 16) {
          svg.appendChild(el('text', {
            x: x + barW / 2, y: top + height / 2 + 3.5,
            class: `chart-seg-label seg-label-${segment.tone}`,
            'text-anchor': 'middle',
          }, formatCompactCurrency(value)));
        }
        stacked += value;
      }
      svg.appendChild(el('text', {
        x: x + barW / 2, y: yOf(stacked) - 6, class: 'chart-value', 'text-anchor': 'middle',
      }, formatCompactCurrency(stacked)));
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
  const ys = config.series.flatMap((serie) => serie.points.map((p) => p.y));
  if (ys.length < 2) { container.textContent = ''; return; }
  const scale = niceScale(Math.max(...ys, 1));
  const target = [...ys, scale.max];
  animateValues(container, target, (values) => drawLineChart(
    container, config, values.slice(0, -1), { max: values.at(-1), ticks: scale.ticks },
  ));
}

/**
 * @param {HTMLElement} container
 * @param {any} config
 * @param {number[]} values flat y values, in series order
 * @param {{max: number, ticks: number[]}} scale
 */
function drawLineChart(container, config, values, scale) {
  container.textContent = '';
  const { series, xLabel, title } = config;
  const allX = series.flatMap((serie) => serie.points.map((p) => p.x));
  if (allX.length < 2) return;

  const W = 560;
  const H = 260;
  const pad = { top: 16, right: 14, bottom: 42, left: 62 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);
  const { max: yMax, ticks } = scale;

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
    if (tick > yMax) continue;
    const y = yOf(tick);
    svg.appendChild(el('line', {
      x1: pad.left, x2: pad.left + plotW, y1: y, y2: y, class: 'chart-grid',
    }));
    svg.appendChild(el('text', {
      x: pad.left - 8, y: y + 4, class: 'chart-tick', 'text-anchor': 'end',
    }, formatCompactCurrency(tick)));
  }

  let cursor = 0;
  for (const serie of series) {
    const points = serie.points.map((p) => [xOf(p.x), yOf(values[cursor++] ?? 0)]);
    svg.appendChild(el('path', {
      d: svgPath(/** @type {Array<[number, number]>} */ (points)),
      fill: 'none',
      'stroke-width': 2.5,
      'stroke-linejoin': 'round',
      class: `chart-line seg-${serie.tone}`,
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
      const parts = bar.segments
        .filter((segment) => segment.value > 0)
        .map((segment) => `${segment.tone} ${formatCurrency(segment.value)}`)
        .join(', ');
      row.insertCell().textContent =
        `${formatCurrency(sum(bar.segments))}${parts ? ` (${parts})` : ''}`;
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
