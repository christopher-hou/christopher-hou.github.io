import { describe, it, expect } from 'vitest';
import { project, defaultInputs } from '../assets/js/engine.js';
import { breakEvenSentence, hasEmployerMatch } from '../assets/js/verdict-text.js';

const say = (over = {}) => {
  const inputs = { ...defaultInputs(), ...over };
  return breakEvenSentence(project(inputs), inputs);
};

describe('hasEmployerMatch', () => {
  it('is false when either half of the match is zeroed', () => {
    expect(hasEmployerMatch(project({ ...defaultInputs(), employerMatchRate: 0 }))).toBe(false);
    expect(hasEmployerMatch(project({ ...defaultInputs(), employerMatchLimit: 0 }))).toBe(false);
  });

  it('is false when nothing is contributed, so nothing is matched', () => {
    expect(hasEmployerMatch(project({ ...defaultInputs(), contributionPercent: 0 }))).toBe(false);
  });

  it('is true for the shipped defaults', () => {
    expect(hasEmployerMatch(project(defaultInputs()))).toBe(true);
  });
});

describe('the verdict paragraph never describes a match that is not there', () => {
  // Both sliders reach zero, and "no employer match" is an ordinary situation.
  for (const [label, over] of [
    ['match rate 0', { employerMatchRate: 0 }],
    ['match limit 0', { employerMatchLimit: 0 }],
    ['no contribution to match', { contributionPercent: 0 }],
  ]) {
    it(`says nothing about a match with ${label}`, () => {
      const text = say(over);
      expect(text).not.toMatch(/employer match/i);
      expect(text).not.toMatch(/only pre-tax money they hold/i);
    });
  }

  it('does not quote a Roth rate when the Roth saver holds no pre-tax money', () => {
    // The rate is the state rate applied to a zero balance -- real arithmetic,
    // meaningless as a claim.
    const r = project({ ...defaultInputs(), employerMatchRate: 0 });
    expect(r.roth.preTaxBalance).toBe(0);
    expect(r.roth.retirementRate).toBeGreaterThan(0);
    expect(say({ employerMatchRate: 0 }))
      .not.toContain(`${(r.roth.retirementRate * 100).toFixed(1)}%`);
  });

  it('does describe the match when there is one', () => {
    const text = say();
    expect(text).toMatch(/employer match/i);
    expect(text).toContain(`${(project(defaultInputs()).roth.retirementRate * 100).toFixed(1)}%`);
  });
});

describe('the paragraph matches the mode it is describing', () => {
  it('quotes a threshold in flat mode', () => {
    const text = say({ retirementTaxMode: 'flat' });
    expect(text).toMatch(/wins whenever your combined retirement tax rate comes in below/);
  });

  it('quotes no threshold in brackets mode', () => {
    const text = say({ retirementTaxMode: 'brackets' });
    expect(text).not.toMatch(/comes in below/);
    expect(text).toMatch(/effective/);
  });

  it('explains the unfairness in spend mode instead of either', () => {
    const text = say({ taxSavingsTreatment: 'spend' });
    expect(text).toMatch(/spent rather than invested/);
    expect(text).not.toMatch(/comes in below/);
  });
});

describe('the paragraph stays coherent across the whole input space', () => {
  const scenarios = [];
  for (const employerMatchRate of [0, 1, 2]) {
    for (const retirementTaxMode of ['flat', 'brackets']) {
      for (const taxSavingsTreatment of ['invest', 'gross-up', 'spend']) {
        for (const contributionPercent of [0, 0.1]) {
          scenarios.push({
            employerMatchRate, retirementTaxMode, taxSavingsTreatment, contributionPercent,
          });
        }
      }
    }
  }

  it('never mentions a match that does not exist, in any combination', () => {
    for (const over of scenarios) {
      const inputs = { ...defaultInputs(), ...over };
      const result = project(inputs);
      const text = breakEvenSentence(result, inputs);
      if (!hasEmployerMatch(result)) {
        expect(text, JSON.stringify(over)).not.toMatch(/employer match/i);
      }
    }
  });

  it('always returns non-empty prose with no unresolved placeholders', () => {
    for (const over of scenarios) {
      const inputs = { ...defaultInputs(), ...over };
      const text = breakEvenSentence(project(inputs), inputs);
      expect(text.length, JSON.stringify(over)).toBeGreaterThan(40);
      expect(text, JSON.stringify(over)).not.toMatch(/undefined|NaN|\$?Infinity/);
    }
  });
});
