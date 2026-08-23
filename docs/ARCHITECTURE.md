# Architecture

Every file, what it does, and why it exists. Roughly 7,400 lines total.

The one structural decision everything else follows from: **`server.py` is a data
plane only.** It fetches prices and caches them. It has no idea what an account is.
The entire trading engine — positions, margin, interest, tax, derivatives pricing —
runs in the browser. That means the simulation works without the server, stays
inspectable by whoever is trying to learn from it, and can never leak your account
anywhere.

```
                 ┌──────────────┐   free APIs
  browser  ──►   │  server.py   │ ──────────────►  Twelve Data, Yahoo,
  (engine)  ◄──  │  proxy+cache │  ◄──────────────  Binance, CoinGecko, ECB
                 └──────────────┘
       │
       └── localStorage: your account, never transmitted
```

---

## Server side — Python, stdlib only

### `server.py` (591)
The whole backend. Serves `web/` as static files and exposes three endpoints:
`/api/quote`, `/api/history`, `/api/health`.

Its real job is the **provider chain**. No free vendor covers all ten exchanges, so
`resolve()` asks each provider only for the symbols still outstanding and **merges
partial fills**. If Twelve Data knows NASDAQ but not SGX, and Yahoo knows SGX, you
get both. Racing them and taking the first non-empty answer — which is what it did
originally — cached a near-empty board the moment Yahoo returned 1 symbol out of 10.

Also handles: a two-tier cache (memory, then disk, with per-asset-class TTLs), the
Yahoo cookie-and-crumb handshake its JSON endpoints now require, `crypto_base()` to
reconcile `BTC` / `BTC-USD` / `BTC/USD` / `BTCUSDT` into one coin, and gzip.

Falls back to the stale cache before giving up, and to `demo_data` before showing
nothing.

### `demo_data.py` (171)
Synthetic prices for when no provider answers — blocked IP, no key, offline, or on a
plane. Reference levels for ~100 symbols plus a seeded random walk (deterministic per
symbol per time bucket, so it moves but never jumps), shaped by a per-class
volatility so an index doesn't wander like a meme stock.

Every row it emits carries `demo: true`, which the UI turns into a header badge,
hatched panel headers, a red tape marker and per-row tags. **Synthetic prices must
never be mistakable for real ones** — that constraint is the reason this file is
separate and loud rather than a quiet fallback inside the providers.

### `tools/snapshot.py` (97)
Writes `web/data/snapshot.json` from live providers. This is what the GitHub Action
runs so a static deploy still has equities. Exits non-zero without writing if nothing
answers, so a failed cron run can't overwrite a good snapshot with an empty one.

### `config.example.json` (7)
Copy to `config.json` and paste a free Twelve Data key. Gitignored.

---

## Market layer — what exists, when it trades, what it costs

### `web/js/market/universe.js` (306)
The tradeable world as data: 10 markets with exchange hours, currencies, settlement
conventions, tick and lot sizes; ~76 equities; 20 indices; 25 crypto; 15 FX pairs; 12
sovereign bonds; default yield curves per currency.

Every instrument carries **both provider spellings** (`yf` for Yahoo, `td` for Twelve
Data) because no vendor agrees on how to name Toyota. Also holds `lookup()` and the
fuzzy `search()` behind the command line.

### `web/js/market/calendar.js` (164)
Exchange sessions across ten timezones, including the Tokyo, Shanghai and Singapore
lunch breaks and the main fixed holidays. Answers "is this tradeable right now",
which gates order entry and slows polling on closed venues. Also generates the
option expiry ladder (weeklies, then third-Fridays) and counts business days for
settlement and the PDT window.

### `web/js/market/charts.js` (168)
External chart links. PaperTerminal's own charts are daily closes; for anything more
it hands off to TradingView, Yahoo, Investing.com, NSE India, CoinGecko and Binance.

Almost the entire file is symbol mapping, because that is the entire difficulty — no
two vendors spell the same company the same way, and TradingView additionally splits
US listings by venue and will not resolve a wrong prefix. Every mapping was checked
against TradingView's symbol-search API rather than assumed, which caught two real
errors: TOPIX is `TSE:TOPIX`, not `TVC:TPX`, and TradingView does not carry
`BINANCE:TONUSDT`, so TON falls back to `COINBASE:TONUSD`.

Windows open with `noopener`, without which the opened page gets a handle on this one
through `window.opener` and can navigate it elsewhere.

### `web/js/market/feed.js` (262)
The price feed, and the file most shaped by a real constraint: **Twelve Data's free
tier is 800 requests/day at 8/min**. Fifty symbols on a naive 60-second poll burns
the day in under two hours.

So it only polls what's **subscribed** — visible on a panel or held in an open
position — batches symbols into one request per asset class, and backs off 20× when
the venue is shut. Also does FX cross-derivation (providers quote USD-based; this
builds any pair from that), USD translation for the whole book, staleness tracking,
and the static-snapshot fallback when no server is present.

---

## Quant — the maths under the derivatives

### `web/js/engine/quant/blackscholes.js` (160)
Black-Scholes-Merton with a carry yield, returning every Greek in one pass —
including vanna, volga and charm — in **trader units** (vega per vol point, theta per
calendar day) rather than raw derivatives.

Uses the Hart/West rational approximation for the normal CDF, accurate to ~1e-15. The
cheap Abramowitz-Stegun form everyone reaches for is only good to 1e-7, which shows
up as visible error in deep-wing prices. Also implied vol (Newton on vega with a
bisection fallback for the wings where vega collapses), probability ITM, and
probability of *touching* a strike — which is what a stop-loss actually faces.

### `web/js/engine/quant/binomial.js` (84)
Cox-Ross-Rubinstein tree for American exercise, because Black-Scholes structurally
cannot price early exercise. Returns the **early-exercise premium** over the European
value explicitly. Greeks come from the tree's own first two levels plus central
differences, which is slower but correct at the exercise boundary where closed forms
are simply wrong.

### `web/js/engine/quant/vol.js` (166)
Where "model-priced" earns its keep or becomes a toy. Realised vol from real bars via
four estimators — close-to-close, EWMA, Parkinson, Garman-Klass — blended by
efficiency. Then a **variance risk premium** (implied trades above realised most of
the time, which is why selling premium looks free until it isn't), a term structure,
and a **fitted skew** quadratic in standardised log-moneyness.

The skew is the point. A flat surface teaches the wrong lesson; downside puts are
dear for a reason and you should feel that on the board.

### `web/js/engine/quant/chain.js` (142)
Builds an option board for any underlying in any market: exchange-plausible strike
ladders spaced off the actual expected move, per-strike IV from the surface, Greeks,
a synthetic bid/ask (options are *wide*, and pretending otherwise hides most of what
makes retail option trading hard), probability ITM, and max pain.

### `web/js/engine/quant/bonds.js` (109)
Real bond maths on synthetic instruments: price from yield, clean/dirty/accrued,
Macaulay and modified duration, convexity, DV01, and yield-from-price by Newton with
bisection fallback. Plus curve interpolation and a parallel-shift shock.

### `web/js/engine/quant/futures.js` (76)
Cost-of-carry pricing, FX forwards by covered interest parity, contango/backwardation
detection, contract specs (deliberately **micro-sized** so they're reachable on a
four-figure account), variation margin and roll cost.

---

## Engine — the account

### `web/js/engine/state.js` (140)
The account as one serialisable object, plus load/save/export/import. Every movement
of money goes through `cashflow()` so the P&L and tax panels can explain themselves
later.

### `web/js/engine/book.js` (279)
Positions and **tax lots**. Lots matter more than the average price: the lot you
choose to sell decides your tax bill, and switching FIFO to HIFO can move that bill
by more than the trade made. So lots are first-class and the average price is
derived, never stored as truth. Also marks derivatives against live models and
aggregates portfolio Greeks.

### `web/js/engine/matching.js` (319)
Order execution. Synthetic spread by liquidity tier, **square-root market impact**
for size, and — the honest bit — every fill records the age of the tick it filled
against. Handles market orders, plus resting limit / stop / stop-limit / trailing
orders that `sweep()` checks against each new tick. That sweep is what makes a
stop-loss protect anything rather than being decoration.

### `web/js/engine/margin.js` (231)
Reg T initial (50%), FINRA maintenance floor (25%, house 30%), the CBOE naked short
option formula (`20% × underlying − OTM amount`, floored at 10%), futures SPAN-style
requirements, and the **Pattern Day Trader** rule.

Contains the fix that made the borrow desk mean something: **cash capacity and Reg T
buying power are separate numbers.** Borrowing raises cash but not equity, so gating
orders on equity-derived buying power alone made borrowed money unspendable. A
purchase you can pay for outright never needs margin.

### `web/js/engine/interest.js` (135)
The teaching core. Tiered rates over a base that tracks the **live short-end yield**,
so real policy moves change your carry. Daily accrual, monthly sweep, borrow/repay,
and two numbers that make carry visceral: **break-even** (how far the book must rise
just to cover interest) and **runway** (days before interest alone finishes you).

### `web/js/engine/tax.js` (227)
US federal, per regime, because the same $1,000 is taxed three ways:
equities (short/long split, **wash sale applies**), crypto (property, same split, **no
wash sale — it isn't a security**), and Section 1256 futures and index options
(**60/40 regardless of holding period, plus year-end mark-to-market on positions you
never closed**). Plus margin interest as investment interest expense capped at net
investment income, the $3,000 ordinary-income offset with carryforward, optional
NIIT, and a FIFO/HIFO/LIFO comparison on identical trades.

### `web/js/engine/settlement.js` (171)
Expiry, assignment, coupons, redemption. Options don't politely vanish — a short call
finishing one cent ITM gets assigned and leaves you short 100 shares you never chose
to be short. That's modelled, because it's the failure mode that actually hurts
people.

### `web/js/engine/clock.js` (117)
The deterministic clock. Interest, weekly deposits, coupons and expiry must happen
while the tab is closed. Instead of a daemon, the account stores the last day it
processed and **replays the gap** on load, day by day, in a fixed order. Same input
always produces the same account. Shut it for a month, come back, see exactly what
thirty nights of carry did.

### `web/js/analytics/stats.js` (232)
Trade statistics (win rate, expectancy, payoff, profit factor), portfolio stats
(Sharpe, Sortino, Calmar, drawdown), risk decomposition with a correlation model that
clusters by market and sector, VaR/CVaR, and second-order stress tests — delta plus
half gamma squared, which is why a short option book reads harmless at −2% and
ruinous at −20%.

---

## Interface

### `web/index.html` (48) · `web/css/terminal.css` (288)
The shell and the Bloomberg look: black ground, amber primary, cyan labels, the blue
function strip, reverse-video panel headers, monospace, tabular numerals, near-zero
padding. Includes the demo-mode styling that makes synthetic prices impossible to
miss.

### `web/js/panels.js` (131)
Panel manager — the four tiled, independently addressable frames, with focus,
teardown and the `live()` repaint helper. Repaints pause while the tab is hidden and
fire immediately on return, so you never come back to a stale board.

### `web/js/cmdline.js` (175)
The Bloomberg command grammar: `AAPL US <Equity> GO`, `AAPL OMON`, `PORT 3`.
Autocomplete over both functions and securities, command history, and a fallback to
fuzzy symbol search so half a company name still gets you somewhere.

### `web/js/main.js` (230)
Boot order — state, then clock replay, then feed, then panels — plus the F-key strip,
status bar, ticker tape and margin-call watcher.

### Panels
| File | Functions |
|---|---|
| `boards.js` (220) | `WEI` `CRYP` `FXIP` `YCRV` `W` `MOST` |
| `security.js` (222) | `DES` `GP` `GIP` |
| `derivatives.js` (310) | `OMON` `OV` `FUT` `FRD` |
| `account.js` (329) | `PORT` `BLOT` `PNL` `ALRT` |
| `credit.js` (294) | `MARG` `BORR` `TAX` |
| `riskp.js` (113) | `RISK` |
| `system.js` (243) | `HELP` `SET` `CHRT` `GUIDE` |
| `ticket.js` (173) | The order ticket every trade goes through |
| `chartlib.js` (168) | SVG line, payoff, bar and sparkline charts |

`ticket.js` deliberately shows what a broker's ticket hides: the spread you're
crossing, the slippage, **how stale the price is**, the buying-power cost, and the
tax rate that will apply to the gain.

---

## The guide — `web/guide/`

A companion site served alongside the terminal and included in any static deploy. It
is a renderer over two data files, which is deliberate: adding a term or a walkthrough
means editing data, never markup.

### `glossary.js` (1,403)
273 terms across eleven categories. Each carries a one-line summary, a fuller
explanation, cross-references, and — where the term appears on a PaperTerminal screen
— the function that shows it, so a reader can go and look at the live number instead
of only reading about it.

Coverage was guided by three checklists: a stock-market terminology primer, the
Consensys blockchain glossary, and the CBOE options glossary. Every definition is
written from scratch for this application.

### `content.js` (341)
Features, trade walkthroughs, the function reference, and the hotspot copy for the
annotated terminal. Each walkthrough ends with a `watch` field — the mistake that
particular trade most commonly produces — which is the part worth reading twice.

### `guide.js` (542)
Renders all of the above, plus:

- **Search** over four content types at once, ranked by match quality then by kind, so
  an exact term beats a passing mention inside a feature description.
- **The annotated replica** — a CSS recreation of the terminal with numbered markers
  positioned from the live geometry of the elements they point at, recalculated on
  resize. Nothing is pinned to magic pixel coordinates.
- **Deep links that survive filters.** Jumping to a term from a feature, or from a
  URL hash, clears any active category filter first — otherwise the link lands on a
  hidden element and appears broken.

Query highlighting escapes the input before inserting it, so a search string can never
become markup.

### `guide.css` (491)
Keeps the terminal's palette and its monospace vocabulary for codes and numbers, but
gives prose room to breathe. The terminal is dense on purpose; a tutorial should not
be.

### `index.html` (204)
Structure only. Everything else is rendered.

---

## Utilities

### `web/js/util/dom.js` (90) · `web/js/util/fmt.js` (80)
Element building, table construction, modals and toasts; number, currency and
duration formatting. No framework — the point is that a self-hoster can read these
and know exactly what the page does.
