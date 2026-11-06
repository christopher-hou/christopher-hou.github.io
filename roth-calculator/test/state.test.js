import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from '../assets/js/state.js';
import { defaultInputs } from '../assets/js/engine.js';

describe('URL state', () => {
  it('round-trips a full input set', () => {
    const inputs = { ...defaultInputs(), income: 123456, contributionPercent: 0.175 };
    const decoded = decodeState(encodeState(inputs));
    expect(decoded.income).toBeCloseTo(123456, 6);
    expect(decoded.contributionPercent).toBeCloseTo(0.175, 6);
    expect(decoded.payFrequency).toBe(inputs.payFrequency);
  });

  it('omits values equal to the defaults to keep the URL short', () => {
    expect(encodeState(defaultInputs())).toBe('');
    expect(encodeState({ ...defaultInputs(), income: 99000 })).toContain('income=99000');
  });

  it('falls back to defaults for a missing or malformed query', () => {
    expect(decodeState('')).toEqual(defaultInputs());
    expect(decodeState('?income=abc').income).toBe(defaultInputs().income);
    expect(decodeState('?nonsense=1')).toEqual(defaultInputs());
  });

  it('tolerates a leading question mark either way', () => {
    expect(decodeState('?income=70000').income).toBe(70000);
    expect(decodeState('income=70000').income).toBe(70000);
  });

  it('clamps out-of-range values into their field bounds', () => {
    expect(decodeState('?currentAge=999').currentAge).toBeLessThanOrEqual(70);
    expect(decodeState('?currentAge=-5').currentAge).toBeGreaterThanOrEqual(18);
    expect(decodeState('?contributionPercent=900').contributionPercent).toBeLessThanOrEqual(1);
  });

  it('rejects an invalid select value', () => {
    expect(decodeState('?payFrequency=hourly').payFrequency)
      .toBe(defaultInputs().payFrequency);
    expect(decodeState('?taxSavingsTreatment=bogus').taxSavingsTreatment)
      .toBe(defaultInputs().taxSavingsTreatment);
  });

  it('encodes and decodes booleans', () => {
    const decoded = decodeState(encodeState({ ...defaultInputs(), capAtLimit: false }));
    expect(decoded.capAtLimit).toBe(false);
    expect(decodeState(encodeState({ ...defaultInputs(), capAtLimit: true })).capAtLimit).toBe(true);
  });

  it('produces state the engine can consume directly', () => {
    expect(Object.keys(decodeState('?income=80000')).sort())
      .toEqual(Object.keys(defaultInputs()).sort());
  });
});
