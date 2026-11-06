// @ts-check

/**
 * @param {number} value
 * @param {{cents?: boolean}} [options]
 * @returns {string}
 */
export function formatCurrency(value, options = {}) {
  const n = Number.isFinite(value) ? value : 0;
  const digits = options.cents ? 2 : 0;
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${n < 0 ? '-' : ''}$${abs}`;
}

/**
 * @param {number} value
 * @param {{cents?: boolean}} [options]
 * @returns {string}
 */
export function formatSignedCurrency(value, options = {}) {
  const n = Number.isFinite(value) ? value : 0;
  const body = formatCurrency(n, options);
  return n > 0 ? `+${body}` : body;
}

/**
 * @param {number} rate fraction, e.g. 0.24
 * @param {number} [decimals]
 * @returns {string}
 */
export function formatPercent(rate, decimals = 0) {
  const n = Number.isFinite(rate) ? rate : 0;
  return `${(n * 100).toFixed(decimals)}%`;
}

/**
 * Formats large dollar figures compactly for chart axes.
 * @param {number} value
 * @returns {string}
 */
export function formatCompactCurrency(value) {
  const n = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${trimZero(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}$${trimZero(abs / 1e3)}k`;
  return `${sign}$${Math.round(abs)}`;
}

/** @param {number} n */
function trimZero(n) {
  return n.toFixed(1).replace(/\.0$/, '');
}

/**
 * Parses user input that may carry currency, percent or thousands decoration.
 * @param {unknown} raw
 * @param {number} [fallback]
 * @returns {number}
 */
export function parseNumber(raw, fallback = 0) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : fallback;
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/[$,%\s,]/g, '');
  if (cleaned === '' || cleaned === '-') return fallback;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
