import { describe, it, expect } from 'vitest';
import { FIELDS, fieldByKey, toModelValue, toDisplayValue } from '../assets/js/fields.js';
import { defaultInputs } from '../assets/js/engine.js';

describe('field definitions', () => {
  it('covers every input the engine reads', () => {
    const defaults = defaultInputs();
    for (const key of Object.keys(defaults)) {
      expect(fieldByKey(key), `missing field definition for ${key}`).toBeTruthy();
    }
  });

  it('includes the inputs added beyond the AARP calculator', () => {
    for (const key of [
      'currentStateRate', 'retirementStateRate', 'inflation', 'wageGrowth',
      'contributionPercent',
    ]) {
      expect(fieldByKey(key)).toBeTruthy();
    }
  });

  it('does not include a contribution type input', () => {
    expect(FIELDS.some((f) => /contributionType/i.test(f.key))).toBe(false);
  });

  it('has no flat-dollar contribution field', () => {
    expect(fieldByKey('annualContribution')).toBeUndefined();
    expect(fieldByKey('contributionPercent').kind).toBe('percent');
  });

  it('gives every field a label and help text', () => {
    for (const f of FIELDS) {
      expect(f.label, f.key).toBeTruthy();
      expect(f.help, `${f.key} needs help text`).toBeTruthy();
      expect(f.help.length, `${f.key} help too short`).toBeGreaterThan(20);
    }
  });

  it('keeps every default inside its own min/max range', () => {
    const defaults = defaultInputs();
    for (const f of FIELDS) {
      if (f.kind === 'select' || f.kind === 'boolean') continue;
      const display = toDisplayValue(f, defaults[f.key]);
      expect(display, `${f.key} default below min`).toBeGreaterThanOrEqual(f.min);
      expect(display, `${f.key} default above max`).toBeLessThanOrEqual(f.max);
    }
  });

  it('offers a valid default for every select field', () => {
    const defaults = defaultInputs();
    for (const f of FIELDS.filter((x) => x.kind === 'select')) {
      expect(f.options.some((o) => o.value === defaults[f.key]), f.key).toBe(true);
    }
  });
});

describe('percent conversion', () => {
  it('converts a displayed percent to a model fraction', () => {
    const f = fieldByKey('currentFederalRate');
    expect(toModelValue(f, 24)).toBeCloseTo(0.24, 10);
  });

  it('converts a model fraction back to a displayed percent', () => {
    const f = fieldByKey('currentFederalRate');
    expect(toDisplayValue(f, 0.24)).toBeCloseTo(24, 10);
  });

  it('round-trips without drift', () => {
    const f = fieldByKey('inflation');
    for (const pct of [0, 2.5, 7, 12.5]) {
      expect(toDisplayValue(f, toModelValue(f, pct))).toBeCloseTo(pct, 10);
    }
  });

  it('leaves non-percent fields untouched', () => {
    const f = fieldByKey('income');
    expect(toModelValue(f, 50000)).toBe(50000);
    expect(toDisplayValue(f, 50000)).toBe(50000);
  });
});
