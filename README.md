# PaperTerminal

A self-hosted paper trading terminal for ten markets, built to look and work like a
Bloomberg Professional screen — and built mainly to teach the two things paper
trading apps usually hide: **what leverage costs while you hold it**, and **what
tax does to a gain after you take it**.

No accounts. No login. No server-side state. Nothing is uploaded anywhere.

```bash
git clone <your-fork> paperterminal
cd paperterminal
python3 server.py
```

Then open <http://localhost:8317>. That is the whole install — the server is Python
standard library only. No pip, no npm, no build step, no database.

---

## What it covers

| | |
|---|---|
| **Equities** | 10 markets — US, India, Japan, South Korea, Singapore, China, Germany, UK, France, Canada |
| **Indices** | 20 benchmarks incl. S&P 500, Nifty 50, Nikkei 225, KOSPI, Straits Times, SSE Composite, DAX, FTSE, CAC, TSX |
| **Crypto** | Top 25 by market cap |
| **FX** | 15 pairs — majors plus USD/INR, USD/KRW, USD/SGD, USD/CNY |
| **Bonds** | 12 sovereigns with full bond maths — clean/dirty price, accrued, duration, convexity, DV01 |
| **Derivatives** | Options on every underlying, futures, forwards |

Everything books in its native currency and translates to USD at live FX, so
currency risk shows up as its own P&L line rather than hiding inside the return.

## Trading

Direct buy and sell, intraday, limit, stop, stop-limit and trailing stop orders.
Options with full Greeks. Futures with daily variation margin. Forwards that settle
only at maturity. Short selling. Margin. An explicit borrow facility that lets your
balance go negative and stay there.

**Order execution is not free.** Every fill crosses a synthetic spread scaled to the
instrument's liquidity tier, and larger orders pay square-root market impact against
a notional daily volume. The ticket shows you the spread, the slippage, the
commission, and **how old the price you are filling against actually is** before you
commit.

## The parts that are the point

### Cost of capital
The borrow desk is a real loan, not margin. Rates are tiered — the more you owe, the
worse your terms — and the base rate tracks the live short-end yield, so when real
policy rates move, your carry moves. `MARG` tells you the daily interest in dollars,
**how far the book must rise just to break even on carry**, your distance to a margin
call in both percent and σ, and how many days of runway you have before interest
alone finishes the account.

Interest accrues every calendar day, weekends included. Debt does not rest.

### Tax
US federal, modelled per regime because the same $1,000 is taxed three different ways:

- **Equities** — short-term at ordinary rates, long-term at 0/15/20. Wash sale rule applies.
- **Crypto** — property, so the same split, but **no wash sale rule**, because it is not a security.
- **Futures and broad-based index options** — **Section 1256**: 60% long-term / 40% short-term regardless of holding period, plus year-end mark-to-market on positions you never closed.

`TAX` puts all three side by side, shows which of your losses got disallowed by wash
sales, and lets you switch FIFO / HIFO / LIFO and watch the bill move on the same
trades.

### Risk
`RISK` decomposes portfolio volatility into **who is actually carrying it**, using a
correlation model that clusters by market and sector — so holding six correlated
names stops looking like diversification. Options are stressed to second order
(delta plus half gamma squared), which is why a short option book reads as harmless
at −2% and ruinous at −20%.

### Pattern Day Trader
Four day trades in five business days on an account under $25,000 flags you and
restricts opening day trades. On a four-figure starting balance with intraday
ambitions, you will hit this. That is the lesson.

## Money

You start with **$1,000** and receive **$1,000 every Monday**. Both configurable in `SET`.

The weekly deposit, interest accrual, bond coupons and option expiry all run on a
**deterministic clock**: the account records the last day it processed and replays the
gap when you open it. Close the terminal for a month, come back, and you will see
exactly what thirty nights of carry did. Same input always produces the same account.

## Using it

Type a ticker or a function code and press `GO`.

```
AAPL              load a security
AAPL OMON         security + function together
RELIANCE IN <Equity> GO
PORT 3            send a function to panel 3
```

| | | | |
|---|---|---|---|
| `DES` description | `GP` price graph | `GIP` intraday | `OMON` option board |
| `OV` option valuation | `FUT` futures | `FRD` forwards | `PORT` portfolio |
| `MARG` margin & carry | `BORR` borrow desk | `TAX` tax center | `RISK` risk dashboard |
| `PNL` attribution | `BLOT` blotter | `ALRT` stops | `WEI` world indices |
| `CRYP` crypto | `FXIP` FX rates | `YCRV` yield curves | `W` watchlist |
| `MOST` movers | `SET` settings | `HELP` full index | |

`F1`–`F8` map to the blue strip. `1`–`4` focus a panel. `Ctrl+↑/↓` recalls commands.

## Data

Free sources, so there is a delay — usually well under a minute for crypto, up to a
few minutes for equities. Every price on screen carries its age, and goes amber then
red as it goes stale.

| Asset | Primary | Fallback | Refresh |
|---|---|---|---|
| Equities, indices | Twelve Data | Yahoo Finance | 60s |
| Crypto | Binance | CoinGecko | 15s |
| FX | Frankfurter (ECB) | open.er-api | 5 min |
| Bond yields | Yahoo | Twelve Data | 5 min |

Providers are **merged, not raced** — no single free vendor covers all ten exchanges,
so each one is asked for whatever is still outstanding and partial fills are kept.

**It runs with no API key at all.** Crypto and FX are fully live without one. For
equities, get a free key at [twelvedata.com](https://twelvedata.com/pricing) and:

```bash
cp config.example.json config.json   # then paste your key in
```

The free tier is 800 requests/day at 8/min, which is a real budget. The feed only
polls what is on screen or held in an open position, batches symbols per request, and
backs off 20× when a venue is closed.

### Demo mode

If no provider answers — blocked IP, no key, offline — the terminal falls back to
**synthetic prices** so nothing goes blank and every feature stays usable. This is
flagged loudly and unmissably: a `DEMO` badge in the header, hatched panel headers, a
red `SYNTHETIC PRICES` marker on the tape, `DEMO DATA — NOT REAL PRICES` in the status
bar, and a `DEMO` tag on every affected row. Those numbers are a seeded random walk.
They are not quotes.

### Static hosting

Prefer GitHub Pages with no server? `.github/workflows/snapshot.yml` commits a market
snapshot on a cron; the front end detects the missing server and reads it instead.
Crypto and FX stay live client-side. Options, margin, tax and risk all still work —
only equity freshness degrades.

## Options are model-priced

There is no free listed options data outside the US, so PaperTerminal prices **every**
chain the same way for every market rather than leaving eleven of them dead:

- **Black-Scholes-Merton** for European contracts, **160-step Cox-Ross-Rubinstein binomial** for American early exercise
- Volatility from real history — EWMA blended with close-to-close, Parkinson and Garman-Klass — plus a variance risk premium
- A **fitted skew and term structure**, so downside puts carry higher implied vol than upside calls, the way a real board does
- Full Greeks including vanna, volga and charm

Strikes, expiries and quotes are generated, not quoted. Open interest and volume are
decorative. The maths underneath is real.

## Your data

The account lives in your browser's local storage. `SET` exports it as JSON — commit
it to your own repo, diff it, or delete it. `server.py` holds no account state and has
no concept of a user; it proxies market data and nothing else. Read it, it is under
600 lines.

## Layout

```
server.py          data plane — proxy, cache, provider chain
demo_data.py       synthetic fallback prices, clearly flagged
tools/snapshot.py  static-hosting snapshot generator
web/js/engine/     book, matching, margin, interest, tax, settlement, clock
web/js/engine/quant/   black-scholes, binomial, vol surface, bonds, futures, chains
web/js/market/     universe, feed, exchange calendar
web/js/panels/     one file per function group
```

## Not investment advice

A teaching tool. Model-priced derivatives are not real quotes, the tax engine is a
simplified model of US federal rules and ignores state tax and your actual
circumstances, and nothing here is a recommendation. Talk to a professional before
risking real money.
