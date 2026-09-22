// @ts-check
import { defaultInputs } from './engine.js';
import { FIELDS, fieldByKey, toDisplayValue, toModelValue } from './fields.js';
import { clamp, parseNumber } from './format.js';

/**
 * Serializes inputs to a query string, omitting anything still at its
 * default so a shared link stays readable.
 * @param {Record<string, any>} inputs
 * @returns {string}
 */
export function encodeState(inputs) {
  const defaults = defaultInputs();
  const params = new URLSearchParams();
  for (const field of FIELDS) {
    const value = inputs[field.key];
    if (value === undefined || value === defaults[field.key]) continue;
    if (field.kind === 'boolean') {
      params.set(field.key, value ? '1' : '0');
    } else if (field.kind === 'select') {
      params.set(field.key, String(value));
    } else {
      params.set(field.key, String(round(toDisplayValue(field, Number(value)))));
    }
  }
  return params.toString();
}

/**
 * Parses a query string back into engine inputs, clamping to field bounds and
 * falling back to defaults for anything missing or unparseable.
 * @param {string} search
 * @returns {Record<string, any>}
 */
export function decodeState(search) {
  const inputs = defaultInputs();
  const params = new URLSearchParams(
    typeof search === 'string' && search.startsWith('?') ? search.slice(1) : search || '',
  );
  for (const [key, raw] of params.entries()) {
    const field = fieldByKey(key);
    if (!field) continue;
    if (field.kind === 'boolean') {
      inputs[key] = raw === '1' || raw === 'true';
    } else if (field.kind === 'select') {
      if (field.options?.some((o) => o.value === raw)) inputs[key] = raw;
    } else {
      const fallback = toDisplayValue(field, inputs[key]);
      const display = clamp(parseNumber(raw, fallback), field.min ?? 0, field.max ?? Infinity);
      inputs[key] = toModelValue(field, display);
    }
  }
  return inputs;
}

/** @param {number} n */
function round(n) {
  return Number(n.toFixed(4));
}
