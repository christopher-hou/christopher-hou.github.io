# Roth vs Traditional 401(k) Calculator — Plan

## 1. Goal

A single-page calculator that answers one question: **should my next 401(k)
dollar go to Roth or Traditional?** Modeled on the
[AARP calculator](https://www.aarp.org/money/retirement/roth-vs-traditional-401k-calculator/)
but with state taxes, inflation, wage growth, bracket estimation, and
contributions expressed as a percent of income.

## 2. Constraints that drive the stack

The deploy target is <https://github.com/christopher-hou/christopher-hou.github.io>,
which serves **plain static HTML/CSS/JS with no build step** (no bundler, no
CI). Anything requiring compilation would force a build pipeline into a repo
that deliberately has none.

The calculator now lives inside that repository, tests and all, so the repo
does contain a `package.json` — scoped to `roth-calculator/` and used only to
run vitest locally. It is never installed or executed by Pages, which simply
serves files. The no-build-step rule still binds the *shipped* code: what is in
`assets/` is exactly what the browser loads.

**Therefore: no build step.** Ship hand-written ES modules that the browser
loads directly via `<script type="module">`.

| Concern | Choice | Why |
|---|---|---|
| Language | Vanilla ES2020 modules + JSDoc types | Runs as-authored in the browser *and* under Node for tests. TypeScript would need a compile step. |
| Types | JSDoc + `// @ts-check` | Editor-level type safety with zero build. |
| Tests | Vitest | Imports the same `.js` files the browser loads. Dev-only; never loaded by the page. |
| Charts | Hand-rolled inline SVG | No Chart.js/D3 download; full control over flat styling. |
| Styling | One plain CSS file, CSS custom properties | No preprocessor. |
| Deps shipped to the browser | **Zero** | Page works offline, from `file://`-adjacent paths, and in any subdirectory. |

All asset paths are **relative**, so the page works at the repo root, at
`/pages/`, or in a project-Pages subpath without reconfiguration.

## 3. File layout

```
roth-calculator/
├── PLAN.md
├── README.md
├── package.json          # dev-only (vitest); not deployed
├── index.html            # the whole UI
├── assets/
│   ├── css/calculator.css
│   └── js/
│       ├── tax-data.js   # 2026 brackets, LTCG thresholds, deferral limits
│       ├── tax.js        # bracket math: marginal + effective rate estimators
│       ├── engine.js     # the projection — pure functions, no DOM
│       ├── format.js     # currency / percent formatting
│       ├── chart.js      # SVG bar + line charts
│       └── app.js        # DOM wiring, URL state, estimator buttons
└── test/
    ├── tax.test.js
    ├── engine.test.js
    └── format.test.js
```

`engine.js`, `tax.js` and `format.js` contain **no DOM references at all** —
that boundary is what makes the math testable in Node.

## 4. Inputs

### Kept from AARP
| Input | Control | Range | Default |
|---|---|---|---|
| Current age | slider + number | 18–70 | 30 |
| Age at retirement | slider + number | 45–75 | 65 |
| Current income | slider + number | $0–$500k | $50,000 |
| Hypothetical rate of return | slider + number | 0–12% | 7% |
| Pay frequency | select | weekly / biweekly / semimonthly / monthly | Monthly |

### Changed per request
| Input | Change |
|---|---|
| Current annual contribution | Now **percent of income** (0–50%, default 10%), not a flat dollar amount. Resolved dollar amount shown live beneath the slider. |
| Current contribution type | **Removed.** The calculator's output *is* the recommendation. |

### Added per request
| Input | Control | Notes |
|---|---|---|
| Current **federal** tax rate | slider + number + **Estimate** button | Estimator derives the marginal rate from income using real 2026 single-filer brackets. |
| Current **state** tax rate | slider + number, 0–14% | Flat entry; states vary too much to model. |
| Retirement **federal** tax rate | slider + number + **Estimate** button | Estimator uses projected retirement income (below). |
| Retirement **state** tax rate | slider + number, 0–14% | Separate field — many people retire to a different state. |
| Inflation rate | slider + number, 0–8%, default 2.5% | Drives today's-dollars view and indexes the deferral cap. |
| Average wage growth / year | slider + number, 0–10%, default 3% | Grows income, and therefore contributions, each year. |

### Assumptions (collapsible section)
- **Invest the Traditional tax savings** — on by default. See §5.
- **Cap contributions at the IRS elective deferral limit** — on by default.
  2026: $24,500, +$8,000 catch-up at 50+, $11,250 super catch-up at 60–63;
  indexed forward by the inflation input.
- **Long-term capital gains rate** on the side account — auto-derived from
  income (0/15/20%), manually overridable.
- **Show results in** nominal dollars / today's dollars — toggle.

## 5. The financial model (the part that must be right)

### Apples-to-apples problem
Contributing $X to a Roth costs $X of take-home pay. Contributing $X
pre-tax to a Traditional costs only $X·(1−t_now), because the deduction
hands back $X·t_now. Comparing the two at equal $X is **not** a fair
comparison — the Traditional scenario left money on the table.

**Fix:** in the Traditional scenario, the tax savings $X·t_now is swept into
a **taxable side account** each pay period. Both scenarios then cost the
same take-home pay, and the comparison is honest. This is why AARP's
Traditional bar is taller than its Roth bar.

A toggle can turn the side account off, which models "I spend the tax
savings." That case is labeled explicitly, because it makes Roth win
essentially always — which is the true answer to that question.

### Projection
For each year `y` in `0 .. retirementAge − currentAge − 1`:

```
income_y       = income · (1 + wageGrowth)^y
desired_y      = income_y · contributionPercent
limit_y        = deferralLimit(age_y) · (1 + inflation)^y
contribution_y = capEnabled ? min(desired_y, limit_y) : desired_y
```

Contributions land each pay period, and the balance compounds per period at
the geometric periodic rate — so a stated 7% annual return really returns 7%
a year, regardless of pay frequency:

```
periodRate = (1 + annualReturn)^(1/periodsPerYear) − 1
balance    = balance · (1 + periodRate) + contribution_y / periodsPerYear
```

Combined marginal rates are additive: `t = federal + state`.

### At retirement

```
t_now = fedNow + stateNow
t_ret = fedRet + stateRet

FV                 = balance from the projection   (identical for both accounts)

rothAfterTax       = FV
tradAfterTax       = FV · (1 − t_ret)
sideAfterTax       = sideBalance − (sideBalance − sideBasis) · (ltcgRate + stateRet)
tradTotal          = tradAfterTax + (investSavings ? sideAfterTax : 0)
```

Today's dollars: divide any nominal figure by `(1 + inflation)^n`.

### Break-even retirement tax rate
Because the two account balances are equal by construction, setting
`rothAfterTax = tradTotal` solves in closed form:

```
FV·(1 − t) + S = FV   →   t_breakeven = S / FV
```

With no capital-gains drag this reduces to `t_breakeven = t_now` — the
classic result that the accounts tie when your retirement rate equals your
current rate. Tax drag on the side account pushes the break-even slightly
below `t_now`, favoring Roth. **This identity is a unit test**; it is a
strong correctness check on the whole projection.

The UI surfaces it as the headline insight: *"Traditional wins if your
retirement rate lands below X%."*

### Employer match (added after first review)

The match is **always pre-tax**, even for a Roth saver, so it is modeled as a
separate traditional sub-account on *both* sides:

```
matchCeiling = matchLimitPercent x income
match        = min(actualContribution, matchCeiling) x matchRate
```

It is driven off the *actual* deferral, so an IRS-capped contribution trims
the match too.

**It does change the verdict**, and the reason is worth stating. Under a single
flat retirement rate the match is algebraically identical on both sides and
cancels out exactly. Under progressive brackets it does not: the Roth saver's
only pre-tax money *is* the match, so their withdrawal is small and fills the
low brackets, while the Traditional saver has already consumed those brackets
with their own balance. The two end up at genuinely different effective rates,
and the gap narrows as the match grows:

```
match   0%  ->  gap $138,050
match 100%  ->  gap  $97,490   (the shipped default)
match 200%  ->  gap  $54,246
```

Tests assert both halves: that the match moves the gap in `brackets` mode, and
that it cancels in `flat` mode. It is drawn on both bars so a reader can see
where it sits. Under gross-up it can also differ between sides, since deferring
more can capture more match.

### Retirement tax from brackets (added after first review)

Asking for a single marginal rate systematically overstates retirement tax,
because withdrawals fill the standard deduction and the low brackets first.
The default mode therefore computes the incremental effective rate:

```
effectiveRate = [tax(otherIncome + withdrawal) - tax(otherIncome)] / withdrawal
```

This is the tax the withdrawal actually causes. Other income consumes the low
brackets first, so the withdrawal correctly stacks on top of it. Computed in
today's dollars, since brackets are inflation-indexed.

The Traditional retiree withdraws more than the Roth retiree (whose only
pre-tax money is the match), so Traditional earns a higher effective rate —
an asymmetry a flat rate cannot represent. A flat mode remains for comparison,
labeled in the UI as overstating the tax.

With per-scenario rates the break-even is still closed-form, solved on the
employee's own pre-tax balance with match and side account held fixed:

```
t = 1 - (rothTotal - tradMatchAfterTax - sideAfterTax) / tradBalance
```

### Bracket estimators
2026 single-filer federal brackets and the $16,100 standard deduction are
hard-coded in `tax-data.js` with a source comment.

- **Current rate:** `taxable = max(0, income − preTaxContribution − stdDeduction)`,
  then the containing bracket's rate.
- **Retirement rate:** computed in **today's dollars** (brackets are
  inflation-indexed, so real terms is the correct frame) from a 4%
  withdrawal of the projected real balance, plus optional Social Security.
  Fires only on button click, not live — otherwise the rate would feed back
  into the projection that produced it.

### Stated limitations (surfaced in the UI, not buried)
Marginal ≠ effective rate on withdrawals; state income-tax deductibility and
SALT interaction ignored; employer match ignored (it is pre-tax either way
and so does not affect the choice); no RMDs, IRMAA, or Social Security
taxation-torpedo modeling; single filer only.

## 6. UI design

Clean and flat. **No gradients, no shadows beyond a 1px border, no
animation past a 120ms hover.**

- **Layout:** two columns on desktop — inputs left (~380px), results right,
  results sticky. Single stacked column under 900px.
- **Verdict card** at the top of the results: one sentence naming the winner
  and the dollar difference, with the break-even rate beneath it. This is
  the answer; everything else is supporting evidence.
- **Controls:** each input is a label + number box + range slider on one row,
  mirroring AARP's layout, with min/max endpoints labeled under the track.
  Every field has a `?` toggle revealing one sentence of plain-language help.
- **Charts:** grouped bar chart ("At Retirement" / "After Taxes") matching
  AARP, with the Traditional after-tax bar stacked to show the side account's
  share. Plus a balance-over-time line chart.
- **Help:** each input's `?` opens a small floating popover with an explicit
  close button, rather than expanding text inline and shifting every control
  below it. One opens at a time; it closes on X, Escape, an outside click or
  a second click, returns focus to the `?`, flips above the trigger when
  there is no room below, and clamps to the viewport with its caret still
  pointing at the trigger. The help text also stays permanently in the
  accessibility tree via `aria-describedby`, so a screen reader never has to
  open the popover to hear it.
- **Stacked bars are labeled per segment** (above a 16px height threshold).
  Without this, a reader watching a total change cannot tell *which* part
  moved — and the two most common surprises both hinge on that: raising your
  current tax rate grows only the side-account band, and other retirement
  income moves only the after-tax group. The screen-reader table carries the
  same per-segment breakdown.
- **Type:** system font stack. Tabular numerals for all figures so digits
  align in columns.
- **Color:** near-white `#fcfcfd` page, white cards, `#e4e4e7` borders,
  `#18181b` text. Traditional `#c2410c`, Roth `#1e3a5f` — the AARP pairing,
  distinguishable in grayscale and for red-green color blindness. Full dark
  mode via `prefers-color-scheme` and a manual toggle.
- **Accessibility:** real `<label for>` on every control, visible focus
  rings, charts carry `<title>`/`aria-label` plus a screen-reader data table,
  ≥4.5:1 contrast throughout.
- **State in the URL:** inputs serialize to the query string so a scenario
  can be bookmarked or shared.

## 6b. Motion

Motion is limited to what communicates change; nothing decorative.

- **Theme cross-fade**: 220ms on background, text and border colors. Enabled
  by a `.theme-ready` class added after the first two animation frames, so the
  initial paint does not animate its own colors in from nothing.
- **Chart transitions**: charts are redrawn from scratch on every input, so
  they animate by tweening the underlying *numbers* over 320ms (ease-out
  cubic) and redrawing each frame, rather than by CSS transitions on nodes
  that no longer exist. The axis maximum is tweened alongside the bar values;
  snapping it instead makes every bar visibly dip before growing whenever the
  scale increases.
- **Series color lives in CSS**, keyed by a `seg-*` class rather than an
  inline `fill`. A theme change therefore recolors the *existing* chart nodes
  and cross-fades them, with no redraw at all.
- **Verdict flip**: a brief dim, and only when the winner actually changes —
  flashing on every slider tick would be noise.
- All of it is disabled under `prefers-reduced-motion: reduce`.

## 7. Build order (TDD)

1. `format.js` + tests — formatting primitives.
2. `tax-data.js` + `tax.js` + tests — bracket boundaries, marginal rates,
   deferral limits with catch-ups.
3. `engine.js` + tests — start with the degenerate cases (zero return, zero
   growth, one year), then the break-even identity, then wage growth,
   inflation, and the deferral cap.
4. `index.html` + `calculator.css` + `app.js` — UI against the settled engine.
5. `chart.js` — rendering last, verified in a browser.
6. README + the Pages PR.

Each step: failing test → implementation → green, adding regression tests for
every edge case found along the way.

## 8. Definition of done

- [ ] All inputs from §4 present and wired
- [ ] `Current contribution type` absent; contribution is a % of income
- [ ] Break-even identity test passes
- [ ] `npm test` green; engine modules have no DOM references
- [ ] Page works from `file://` and from a subdirectory, zero network requests
- [ ] Keyboard navigable; passes a dark-mode pass
- [ ] README with local-dev + Pages deploy instructions
- [ ] PR opened against `christopher-hou.github.io`
