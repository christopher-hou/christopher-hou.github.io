import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The tween must resume from where the bars are actually drawn. Reading the
 * previous *target* instead makes an interrupted tween snap forward to a
 * position the bars never occupied, then ease on from there — visible while
 * dragging a slider, which fires far faster than the 320ms tween.
 *
 * Note on method: a single bar cannot detect this, because its height is
 * `value / axisMax` and the axis maximum tweens alongside the value, holding
 * the ratio nearly constant. A second, unchanging bar pins the axis so the
 * first bar's height becomes proportional to its value.
 */
describe('interrupted tweens resume from the rendered position', () => {
  let frames;
  let now;
  let created;

  const flush = (count) => {
    for (let i = 0; i < count; i++) {
      const queued = frames.shift();
      if (!queued) return;
      now += 16;
      queued(now);
    }
  };

  beforeEach(() => {
    frames = [];
    now = 0;
    created = [];
    vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => { frames.length = 0; });
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('document', {
      createElementNS: () => {
        const node = {
          _attrs: {},
          setAttribute(k, v) { this._attrs[k] = v; },
          appendChild() {},
          textContent: '',
        };
        created.push(node);
        return node;
      },
      createElement: () => ({
        className: '', appendChild() {},
        createTHead: () => ({ insertRow: () => ({ appendChild() {} }) }),
        createTBody: () => ({ insertRow: () => ({ appendChild() {}, insertCell: () => ({}) }) }),
      }),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('never jumps past where it was drawn when interrupted', async () => {
    vi.resetModules();
    const { renderBarChart } = await import('../assets/js/chart.js');

    const el = /** @type {any} */ ({ textContent: '', appendChild() {} });
    // Height of the moving bar; the anchor bar pins the axis so this is
    // proportional to its value.
    const movingBarHeight = () => {
      const rect = created.filter((n) => n._attrs.class === 'chart-bar seg-trad').at(-1);
      return rect ? Number(rect._attrs.height) : undefined;
    };

    const config = (value) => ({
      title: 'test',
      groups: [{
        label: 'g',
        bars: [
          { name: 'moving', segments: [{ value, tone: 'trad' }] },
          { name: 'anchor', segments: [{ value: 5000, tone: 'roth' }] },
        ],
      }],
    });

    renderBarChart(el, config(100));
    flush(3);

    created = [];
    renderBarChart(el, config(4000));
    flush(2);
    const partway = movingBarHeight();
    expect(partway, 'tween should be underway').toBeGreaterThan(0);

    created = [];
    renderBarChart(el, config(100));
    flush(1);
    const afterInterrupt = movingBarHeight();

    // With the bug, `from` is 4000 and this first frame lands near the full
    // height of the old target instead of near where we actually were.
    expect(afterInterrupt).toBeLessThanOrEqual(partway + 0.5);
  });
});
