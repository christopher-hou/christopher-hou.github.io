import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { project, defaultInputs } from '../assets/js/engine.js';
import { decodeState } from '../assets/js/state.js';
import { FIELDS } from '../assets/js/fields.js';

describe('the math modules stay free of the DOM', () => {
  // The whole point of the split is that the projection can be tested in Node
  // and reasoned about without a browser.
  const pure = ['engine.js', 'tax.js', 'tax-data.js', 'fields.js', 'state.js', 'format.js'];

  it.each(pure)('%s references no browser globals', (file) => {
    const source = readFileSync(new URL(`../assets/js/${file}`, import.meta.url), 'utf8');
    for (const global of ['document', 'window', 'localStorage', 'navigator']) {
      expect(source, `${file} touches ${global}`).not.toMatch(new RegExp(`\\b${global}\\b`));
    }
  });
});

describe('the shipped page has no build step and no third-party runtime deps', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  it('loads only local assets', () => {
    const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    for (const url of urls) {
      if (url.startsWith('#')) continue;
      expect(url, `${url} is not a relative local path`).not.toMatch(/^(https?:)?\/\//);
    }
  });

  it('uses relative paths so it works in any subdirectory', () => {
    const urls = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]);
    for (const url of urls) {
      expect(url, `${url} is absolute from the domain root`).not.toMatch(/^\//);
    }
  });

  it('declares a container for every field group', () => {
    for (const group of new Set(FIELDS.map((f) => f.group))) {
      expect(html, `no container for group ${group}`)
        .toContain(`data-group="${group}"`);
    }
  });

  it('has no leftover contribution-type control', () => {
    expect(html).not.toMatch(/contribution type/i);
  });
});

describe('end-to-end default scenario', () => {
  const result = project(defaultInputs());

  it('produces plausible figures for a 30-year-old earning $50k', () => {
    expect(result.years).toBe(35);
    // 10% of a $50k salary growing 3%/yr, compounding at 7%
    expect(result.totalContributions).toBeGreaterThan(280_000);
    expect(result.totalContributions).toBeLessThan(320_000);
    expect(result.roth.balance).toBeGreaterThan(900_000);
    expect(result.roth.balance).toBeLessThan(1_200_000);
  });

  it('reports a break-even rate spanning the career\u2019s deduction rates', () => {
    // Not bounded by year one's rate: later years fund the side account at
    // higher rates as income climbs, so the break-even reflects the career
    // average and lands between the first and last year's rates.
    expect(result.breakEvenRetirementRate).toBeGreaterThan(0);
    expect(result.breakEvenRetirementRate)
      .toBeGreaterThanOrEqual(result.schedule[0].deductionRate);
    expect(result.breakEvenRetirementRate)
      .toBeLessThanOrEqual(result.schedule.at(-1).deductionRate);
  });

  it('shows real values below nominal ones under positive inflation', () => {
    expect(result.real.roth.afterTax).toBeLessThan(result.roth.afterTax);
  });

  it('picks Roth when rates are flat, because of the side-account tax drag', () => {
    // With equal current and retirement rates the only difference left is the
    // capital gains tax on the taxable side account, so Roth edges it out.
    // The employer match cancels out: it is identical and taxed identically
    // on both sides, so it drops out of the difference entirely.
    const flat = project({
      ...defaultInputs(), currentTaxMode: 'flat', retirementTaxMode: 'flat',
    });
    expect(flat.winner).toBe('roth');
    expect(flat.difference).toBeCloseTo(
      flat.traditional.side.balance - flat.traditional.side.afterTax, 6,
    );
  });

  it('prefers Traditional once retirement tax is computed from brackets', () => {
    // Real withdrawals fill the deduction and low brackets first, so the
    // effective rate lands far below the marginal rate a user would type.
    expect(result.retirementTaxMode).toBe('brackets');
    expect(result.traditional.effectiveFederalRate).toBeLessThan(0.22);
    expect(result.winner).toBe('traditional');
  });
});

describe('scenarios a user would actually test', () => {
  it('favors Traditional for a high earner retiring to a no-tax state', () => {
    const r = project({
      ...defaultInputs(),
      income: 250000, currentFederalRate: 0.32, currentStateRate: 0.093,
      retirementFederalRate: 0.22, retirementStateRate: 0,
    });
    expect(r.winner).toBe('traditional');
  });

  it('favors Roth for someone who really is in a low bracket now', () => {
    // Pinned to flat mode: the point is a genuinely low current rate against
    // a high retirement rate. In brackets mode a $45k salary growing 3% for
    // forty years does not stay in a low bracket, and the tool correctly
    // says so instead.
    const r = project({
      ...defaultInputs(),
      currentAge: 24, income: 45000,
      currentTaxMode: 'flat', currentFederalRate: 0.12, currentStateRate: 0,
      retirementTaxMode: 'flat',
      retirementFederalRate: 0.24, retirementStateRate: 0.05,
    });
    expect(r.winner).toBe('roth');
  });

  it('keeps a shared link reproducing the same verdict', () => {
    const query = '?income=250000&currentFederalRate=32&retirementFederalRate=22&retirementStateRate=0';
    const a = project(decodeState(query));
    const b = project(decodeState(query));
    expect(a.winner).toBe(b.winner);
    expect(a.difference).toBe(b.difference);
  });
});
