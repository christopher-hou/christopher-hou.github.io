import { describe, it, expect } from 'vitest';
import { formatCurrency, formatPercent, formatSignedCurrency, parseNumber, clamp } from '../assets/js/format.js';

describe('formatCurrency', () => {
  it('formats whole dollars with no cents', () => {
    expect(formatCurrency(1234.56)).toBe('$1,235');
    expect(formatCurrency(0)).toBe('$0');
    expect(formatCurrency(1000000)).toBe('$1,000,000');
  });

  it('handles negatives', () => {
    expect(formatCurrency(-500)).toBe('-$500');
  });

  it('coerces non-finite values to $0 rather than emitting NaN', () => {
    expect(formatCurrency(NaN)).toBe('$0');
    expect(formatCurrency(Infinity)).toBe('$0');
  });

  it('can include cents when asked', () => {
    expect(formatCurrency(1234.56, { cents: true })).toBe('$1,234.56');
  });
});

describe('formatSignedCurrency', () => {
  it('prefixes a plus sign for positive amounts', () => {
    expect(formatSignedCurrency(500)).toBe('+$500');
    expect(formatSignedCurrency(-500)).toBe('-$500');
    expect(formatSignedCurrency(0)).toBe('$0');
  });
});

describe('formatPercent', () => {
  it('renders a rate as a percentage', () => {
    expect(formatPercent(0.24)).toBe('24%');
    expect(formatPercent(0.075, 1)).toBe('7.5%');
    expect(formatPercent(0)).toBe('0%');
  });

  it('rounds to the requested precision', () => {
    expect(formatPercent(0.23456, 2)).toBe('23.46%');
  });
});

describe('parseNumber', () => {
  it('strips currency and percent decoration', () => {
    expect(parseNumber('$50,000')).toBe(50000);
    expect(parseNumber('24%')).toBe(24);
    expect(parseNumber('  1,234.5 ')).toBe(1234.5);
  });

  it('returns the fallback for unparseable input', () => {
    expect(parseNumber('', 7)).toBe(7);
    expect(parseNumber('abc', 7)).toBe(7);
    expect(parseNumber(null, 0)).toBe(0);
  });

  it('preserves negative numbers', () => {
    expect(parseNumber('-42')).toBe(-42);
  });
});

describe('clamp', () => {
  it('bounds a value to the inclusive range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('falls back to the minimum for non-finite input', () => {
    expect(clamp(NaN, 3, 10)).toBe(3);
  });
});
