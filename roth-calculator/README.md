# Roth vs Traditional 401(k) Calculator

A single-page calculator that answers one question: **should your next 401(k)
dollar go to Roth or Traditional?**

Modeled on the [AARP calculator](https://www.aarp.org/money/retirement/roth-vs-traditional-401k-calculator/),
with the additions it lacks — state tax rates for both now and in retirement,
inflation, wage growth, bracket estimation from the real 2026 tax tables, and
contributions expressed as a percent of income rather than a flat dollar
amount.

**No build step, no dependencies, no network requests.** It is plain HTML, CSS
and ES modules — drop the folder on any static host and it works.

## Quick start

Serve the site root so paths match production:

```bash
cd ~/Documents/personal/christopher-hou.github.io && python3 -m http.server 8000
```

Then open <http://localhost:8000/roth-calculator/>.

A web server is required because the app uses ES modules, which browsers will
not load over `file://`. Any static server works (`npx serve`, `php -S`, etc.).

## Running the tests

```bash
cd ~/Documents/personal/christopher-hou.github.io/roth-calculator && npm test
```

(`npm install` once first.)

251 tests covering the projection math, the 2026 bracket tables, employer
match, year-by-year bracket-derived rates, take-home pay, URL state, and the
chart scaling. `npm run test:watch` reruns on change.

Vitest is a **dev-only** dependency. Nothing in `node_modules` ships to the
browser, and the deployed site has no `package.json` at all.

## What it models

### Inputs

**Paycheck**: current age, retirement age, gross income, annual wage growth,
contribution as a percent of income, employer match (rate and the pay
percentage it stops at), pay frequency, expected rate of return.

**Taxes**: federal and state rates today, state rate in retirement, and an
inflation rate. Federal tax on withdrawals is either derived from the brackets
(default) or entered as a flat rate — see below. The **Estimate** button
derives your current federal rate from the actual 2026 single-filer brackets.

**Assumptions**: how the Traditional tax savings are handled (see below), the
capital gains rate on a taxable side account, and whether to cap contributions
at the IRS elective deferral limit.

There is deliberately **no "contribution type" input**. Determining the
contribution type is the calculator's job.

### The fairness problem, and how it is handled

Contributing $10,000 to a Roth costs $10,000 of take-home pay. Contributing
$10,000 pre-tax costs only $7,600 at a 24% rate, because the deduction hands
back $2,400. Comparing the two at the same $10,000 is not a fair comparison —
the Traditional scenario left $2,400 unaccounted for.

Three ways to close that gap, selectable in the UI:

| Option | What it models |
|---|---|
| **Invest the refund** (default) | Same contribution percent either way; the Traditional tax savings go into a taxable brokerage account whose gains are taxed at retirement. |
| **Contribute more pre-tax** | Raise the Traditional contribution to `1/(1 − rate)` so both cost identical take-home pay. This is AARP's method, and reproduces its figures. |
| **Spend the refund** | Same percent either way, savings spent. Roth then wins at almost any rate — which is the honest answer to that question, since Roth is simply the more expensive option. |

### Employer match

The match is **always pre-tax**, even when your own contributions are Roth, so
it is modeled as a separate traditional sub-account on *both* sides. Two
consequences:

1. **It cannot change which option wins.** It is the same amount, taxed the
   same way, on both sides, so it cancels out of the difference entirely. A
   test asserts exactly this. It is stacked onto both bars in the chart so you
   can see it cancel rather than having to take it on faith.
2. **It gives a Roth saver taxable retirement income anyway.** That matters
   once tax is computed from brackets, because the match fills the standard
   deduction and the low brackets on the Roth side too.

The match follows your *actual* deferral, so if the IRS cap trims your
contribution the match is trimmed with it. Under the gross-up treatment the
Traditional side defers more, which can capture more match if you were
previously contributing below the match ceiling — a real advantage the tool
accounts for.

### Retirement tax: brackets, not a guessed marginal rate

A marginal rate is the wrong tool for taxing withdrawals. Your withdrawals
fill the standard deduction first, then the 10% bracket, then the 12%, and so
on — so the rate you actually pay is well below the top rate you reach.
Asking a user for one marginal rate systematically overstates retirement tax,
which biases the whole comparison toward Roth.

The default mode computes the real thing:

```
effectiveRate = [tax(otherIncome + withdrawal) - tax(otherIncome)] / withdrawal
```

That is the tax the withdrawal actually *causes*, which also handles other
income correctly: a pension or Social Security consumes the low brackets
first, so the 401(k) withdrawal stacks on top of it. Because brackets are
inflation-indexed, this is computed in today's dollars against today's
brackets.

Two inputs feed it: the share of your balance you draw each year (4% by
default) and any other taxable retirement income. The Traditional retiree
withdraws far more than the Roth retiree, so the model gives Traditional a
*higher* effective rate than Roth — an asymmetry a single flat rate cannot
express at all.

A flat-rate mode is still available for comparison, and the UI says plainly
that it overstates the tax.

### Your current tax rate is derived, not typed

The single biggest source of nonsense in a calculator like this is a tax rate
the user's income cannot support. Type 50% on a $50,000 salary and the tool
will value your deduction at 50%, sweeping money into the side account that
tax never refunded — so a higher rate looks like it makes you wealthier.

So the current rate is **worked out from your income by default**, exactly as
retirement tax is. It values the deduction at what the brackets actually
refund on the slice you shelter:

```
deductionRate = [tax(wages) - tax(wages - deferral)] / deferral
```

It is recomputed **every year**, from that year's income and that year's
actual contribution. Freezing year one's rate is a real trap: a $60,000
salary growing 4% a year reaches $227,659 by retirement, where the deduction
is worth 27.4% rather than the 12% it was worth on day one. Using the year-one
rate for a whole career understated the tax saving by tens of thousands of
dollars and quietly biased the verdict toward Roth. Valuing it on the actual
contribution matters too: when the IRS cap trims a deferral, the smaller slice
is worth a different rate than the one originally requested.

That is not a marginal rate, and the difference matters: a deferral straddling
a bracket boundary is worth a blend of the two rates, and one reaching below
the standard deduction is worth nothing at all.

With the rate derived, there is no knob that inflates the Traditional stack on
its own — a test asserts the side-account balance is identical whether you
type 0% or 50%. The rate moves only when your income moves, and then take-home
pay moves with it, which is coherent.

A flat-rate override remains for anyone who knows their situation better than
the brackets do. If the entered rate outruns what the income supports, the
tool names the gap and points at the **Estimate** button.

### What the comparison does *not* measure

The chart prices only the **incremental** cost of contributing: given that you
are putting X% away, which wrapper wins? It never prices your baseline tax
bill. One consequence is genuinely misleading if left unsaid:

> Raising your current tax rate makes the Traditional stack grow, and nothing
> on the chart gets worse.

That reads as *more tax, more money*, which is false. Your current tax rate
does not appear in the Roth calculation at all, so the Roth bar is frozen by
construction; only Traditional moves, because a bigger deduction means a
bigger refund to invest. Both of your options got worse in absolute terms —
the chart just never drew the tax bill that caused it.

The paycheck panel therefore shows **income tax paid** and **take-home pay
left to live on**, computed from the real brackets. Raise a tax rate and you
can watch take-home fall while the retirement stack rises. Both are true; only
one of them is about the Roth-versus-Traditional decision.

That row doubles as a correctness check. When your entered marginal rate is
honest, take-home pay comes out **identical** in both columns — that equality
*is* the fair comparison. When it is not honest, the columns diverge, and the
tool says so: at $100,000 the 2026 brackets refund about $1,100 on a $5,000
contribution, so claiming a 50% rate would sweep $2,500 into the side account,
$1,400 of which tax never gives back. The UI names that figure and points you
at the **Estimate** button.

### The headline number

Because both accounts are driven from the same contribution, the retirement
tax rate at which they tie has a closed form:

```
breakEvenRate = sideAccountAfterTax / traditionalBalance
```

With no capital gains drag this reduces to *break even when your retirement
rate equals your current rate* — the classic result. Tax drag on a taxable
side account pushes it slightly lower, favoring Roth. The UI leads with this:
*"Traditional wins whenever your combined retirement tax rate comes in below
X%."* That single number is more actionable than any balance projection,
because it is the only thing you actually have to forecast.

This identity is asserted in the test suite, which makes it a strong
correctness check on the entire projection.

### What it does not model

Retirement tax is computed from one representative year of withdrawals and
then applied to the whole balance; a real drawdown varies year to year. State
tax is a single flat rate, with no bracketing and no SALT interaction. Other
retirement income is treated as fully taxable, whereas Social Security is only
0–85% taxable depending on total income. Since SECURE 2.0 some plans offer a
Roth employer match; the model assumes the standard pre-tax match. No RMDs,
IRMAA surcharges, saver's credit, or sequence-of-returns risk. Returns are
assumed steady. Single filer only.

This is an educational projection, not financial advice.

## File structure

```
christopher-hou.github.io/roth-calculator/
├── index.html              # the entire UI
├── assets/
│   ├── css/calculator.css
│   └── js/
│       ├── tax-data.js     # 2026 brackets, LTCG thresholds, deferral limits
│       ├── tax.js          # bracket math and rate estimators
│       ├── engine.js       # the projection (pure, no DOM)
│       ├── format.js       # currency and percent formatting
│       ├── chart.js        # hand-rolled SVG charts
│       ├── fields.js       # input definitions
│       ├── state.js        # URL serialization
│       └── app.js          # DOM wiring
├── test/                   # vitest suites (not served)
├── PLAN.md                 # design rationale
└── package.json            # dev-only
```

`engine.js`, `tax.js`, `fields.js`, `state.js` and `format.js` contain no
browser globals — a test asserts this. That boundary is what keeps the math
testable in Node and reviewable without a browser.

## Deployment

This folder lives inside the `christopher-hou.github.io` repository, so it
deploys with the rest of the site: push to `master` and GitHub Pages serves it
at <https://christopher-hou.github.io/roth-calculator/>.

There is no build step. The files in `assets/` are exactly what the browser
loads, and every path is relative, so the folder works at a domain root, in a
project subpath, or in any subdirectory without configuration.

`test/`, `package.json` and `node_modules/` sit alongside the app but are never
served as part of it — GitHub Pages only ever hands out the files a page
actually requests, and nothing in `index.html` references them. `node_modules/`
is gitignored.

The calculator is linked from the projects grid in `pages/projects.html`, with
its card styling in `assets/css/main.css` (`.project-item.rothcalculator`) and
its thumbnail at `assets/images/roth-calculator.svg`.

### Running it locally

Serve the **site root**, not this folder, so paths match production:

```bash
cd ~/Documents/personal/christopher-hou.github.io && python3 -m http.server 8000
```

Then open <http://localhost:8000/roth-calculator/>.

A web server is required because the app uses ES modules, which browsers will
not load over `file://`.

## Maintenance: updating for a new tax year

All tax constants live in one file, [`assets/js/tax-data.js`](assets/js/tax-data.js).
Each January the IRS publishes new figures in a revenue procedure. Update:

- `FEDERAL_BRACKETS_2026` — the seven bracket boundaries
- `STANDARD_DEDUCTION_2026`
- `LTCG_BRACKETS_2026`
- `DEFERRAL_LIMIT_2026`, `CATCH_UP_50`, `CATCH_UP_60_63`
- `TAX_YEAR`

Then update the matching assertions in `test/tax.test.js`, which pin the
published values on purpose so a typo in the table fails the build rather than
silently producing wrong advice.

Current figures are 2026 single-filer values from IRS Rev. Proc. 2025-32:
$16,100 standard deduction, $24,500 elective deferral limit, $8,000 catch-up
at 50+, $11,250 super catch-up at 60–63.

## Sharing a scenario

Inputs are serialized to the query string as you change them, so any scenario
can be bookmarked or sent to someone. Values still at their defaults are
omitted to keep links short.
