import { describe, it, expect } from 'vitest';
import { incrementalEffectiveRate, marginalRate } from '../assets/js/tax.js';
import { project } from '../assets/js/engine.js';

describe('incrementalEffectiveRate', () => {
  it('is the tax actually caused by the withdrawal, divided by the withdrawal', () => {
    // 40k withdrawal, no other income, 16.1k deduction -> 23.9k taxable.
    // 12,400 @ 10% = 1,240; 11,500 @ 12% = 1,380. Total 2,620 on 40,000.
    expect(incrementalEffectiveRate(40000, 0)).toBeCloseTo(2620 / 40000, 8);
  });

  it('comes in below the marginal rate, because lower brackets fill first', () => {
    const withdrawal = 80000;
    const effective = incrementalEffectiveRate(withdrawal, 0);
    const marginal = marginalRate(withdrawal - 16100);
    expect(effective).toBeLessThan(marginal);
  });

  it('rises as other income consumes the low brackets first', () => {
    const alone = incrementalEffectiveRate(40000, 0);
    const stacked = incrementalEffectiveRate(40000, 60000);
    expect(stacked).toBeGreaterThan(alone);
  });

  it('charges nothing when the withdrawal fits inside the standard deduction', () => {
    expect(incrementalEffectiveRate(10000, 0)).toBe(0);
  });

  it('gives the leftover deduction to the withdrawal when other income is small', () => {
    // 10k other income leaves 6.1k of deduction for the withdrawal.
    const rate = incrementalEffectiveRate(20000, 10000);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(0.12);
  });

  it('approaches the top marginal rate for very large withdrawals', () => {
    expect(incrementalEffectiveRate(5_000_000, 0)).toBeGreaterThan(0.33);
    expect(incrementalEffectiveRate(5_000_000, 0)).toBeLessThan(0.37);
  });

  it('is zero for a zero or negative withdrawal', () => {
    expect(incrementalEffectiveRate(0, 50000)).toBe(0);
    expect(incrementalEffectiveRate(-100, 50000)).toBe(0);
  });

  it('rises monotonically with the size of the withdrawal', () => {
    let prev = -1;
    for (const w of [20000, 40000, 80000, 150000, 300000]) {
      const rate = incrementalEffectiveRate(w, 0);
      expect(rate).toBeGreaterThan(prev);
      prev = rate;
    }
  });
});

const base = {
  currentAge: 30, retirementAge: 65, income: 100000, wageGrowth: 0.03,
  contributionPercent: 0.1, rateOfReturn: 0.07, inflation: 0.025,
  payFrequency: 'monthly',
  currentFederalRate: 0.24, currentStateRate: 0.05,
  retirementFederalRate: 0.24, retirementStateRate: 0.05,
  capitalGainsRate: 0.15, capAtLimit: true, taxSavingsTreatment: 'invest',
  employerMatchRate: 1, employerMatchLimit: 0.04,
  retirementTaxMode: 'brackets', withdrawalRate: 0.04, otherRetirementIncome: 0,
};
const withBase = (over = {}) => ({ ...base, ...over });

describe('bracket-based retirement tax mode', () => {
  it('derives an effective rate well below the entered marginal rate', () => {
    const r = project(withBase());
    expect(r.traditional.effectiveFederalRate).toBeLessThan(0.24);
    expect(r.traditional.effectiveFederalRate).toBeGreaterThan(0);
  });

  it('taxes the Traditional balance more heavily than the Roth saver\'s match', () => {
    // The Traditional retiree withdraws far more, so more of it lands in
    // higher brackets. This asymmetry is invisible to a flat-rate model.
    const r = project(withBase());
    expect(r.traditional.effectiveFederalRate)
      .toBeGreaterThan(r.roth.effectiveFederalRate);
  });

  it('pushes both effective rates up when other retirement income is added', () => {
    const none = project(withBase({ otherRetirementIncome: 0 }));
    const some = project(withBase({ otherRetirementIncome: 40000 }));
    expect(some.traditional.effectiveFederalRate)
      .toBeGreaterThan(none.traditional.effectiveFederalRate);
    expect(some.roth.effectiveFederalRate)
      .toBeGreaterThan(none.roth.effectiveFederalRate);
  });

  it('raises the effective rate with a larger withdrawal rate', () => {
    const low = project(withBase({ withdrawalRate: 0.03 }));
    const high = project(withBase({ withdrawalRate: 0.06 }));
    expect(high.traditional.effectiveFederalRate)
      .toBeGreaterThan(low.traditional.effectiveFederalRate);
  });

  it('adds the state rate on top of the derived federal rate', () => {
    const r = project(withBase({ retirementStateRate: 0.05 }));
    expect(r.traditional.retirementRate)
      .toBeCloseTo(r.traditional.effectiveFederalRate + 0.05, 8);
  });

  it('favors Traditional more than a flat marginal rate does', () => {
    // The whole point: a flat 24% overstates the tax a real retiree pays.
    const flat = project(withBase({ retirementTaxMode: 'flat' }));
    const brackets = project(withBase({ retirementTaxMode: 'brackets' }));
    expect(brackets.traditional.total).toBeGreaterThan(flat.traditional.total);
  });

  it('widens Traditional\u2019s lead well beyond what a flat rate shows', () => {
    const inputs = withBase({
      income: 90000, currentFederalRate: 0.22, currentStateRate: 0,
      retirementFederalRate: 0.22, retirementStateRate: 0,
      capitalGainsRate: 0, contributionPercent: 0.08,
    });
    const flat = project({ ...inputs, retirementTaxMode: 'flat' });
    const brackets = project({ ...inputs, retirementTaxMode: 'brackets' });
    // Current and retirement rates are both 22% here, which a flat model
    // reads as a dead heat. Taxing withdrawals from the brackets reveals the
    // gap a flat rate hides entirely.
    expect(flat.winner).toBe('tie');
    expect(brackets.winner).toBe('traditional');
    expect(brackets.difference).toBeGreaterThan(100000);
  });

  it('still reports a usable break-even rate', () => {
    const r = project(withBase());
    expect(r.breakEvenRetirementRate).toBeGreaterThan(0);
    expect(r.breakEvenRetirementRate).toBeLessThan(1);
  });

  it('reports the projected annual withdrawal in today’s dollars', () => {
    const r = project(withBase({ withdrawalRate: 0.04 }));
    expect(r.traditional.annualWithdrawal)
      .toBeCloseTo(r.real.traditional.preTaxBalance * 0.04, 4);
  });

  it('leaves flat mode behaving exactly as before', () => {
    const r = project(withBase({ retirementTaxMode: 'flat' }));
    expect(r.traditional.retirementRate).toBeCloseTo(0.29, 8);
    expect(r.traditional.afterTax).toBeCloseTo(r.traditional.balance * (1 - 0.29), 6);
  });

  it('handles a zero balance without dividing by zero', () => {
    const r = project(withBase({ contributionPercent: 0, employerMatchRate: 0 }));
    expect(Number.isFinite(r.traditional.effectiveFederalRate)).toBe(true);
    expect(r.traditional.effectiveFederalRate).toBe(0);
  });
});
