import { describe, it, expect } from 'vitest';
import { niceScale, svgPath } from '../assets/js/chart.js';

describe('niceScale', () => {
  it('rounds the axis maximum up to a readable number', () => {
    expect(niceScale(2139267).max).toBe(2500000);
    expect(niceScale(87).max).toBe(100);
    expect(niceScale(1).max).toBe(1);
  });

  it('never cuts off the data', () => {
    for (const v of [1, 7, 99, 100, 101, 12345, 999999, 2139267, 1e9]) {
      expect(niceScale(v).max).toBeGreaterThanOrEqual(v);
    }
  });

  it('produces ascending ticks starting at zero and ending at the max', () => {
    const { max, ticks } = niceScale(2139267);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(max);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
  });

  it('degrades gracefully for zero and invalid maximums', () => {
    expect(niceScale(0).max).toBeGreaterThan(0);
    expect(niceScale(NaN).max).toBeGreaterThan(0);
    expect(niceScale(-5).max).toBeGreaterThan(0);
    expect(niceScale(0).ticks.length).toBeGreaterThan(1);
  });

  it('honors a requested tick count approximately', () => {
    const { ticks } = niceScale(1000, 5);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(9);
  });
});

describe('svgPath', () => {
  it('builds a polyline path from points', () => {
    expect(svgPath([[0, 10], [5, 20]])).toBe('M 0 10 L 5 20');
  });

  it('returns an empty string for too few points', () => {
    expect(svgPath([])).toBe('');
    expect(svgPath([[1, 1]])).toBe('M 1 1');
  });

  it('rounds coordinates to keep the markup small', () => {
    expect(svgPath([[0.12345, 9.87654]])).toBe('M 0.12 9.88');
  });
});
