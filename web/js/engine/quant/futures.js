// Futures and forwards.
//
// Both are priced by cost of carry. The difference that matters for a trader
// is not the formula, it is the plumbing: futures mark to market daily and
// post variation margin, forwards settle once at maturity. So a forward can
// sit quietly against you while a future bleeds your account every night.

import { expiryLadder } from '../../market/calendar.js';
import { lookup } from '../../market/universe.js';

/** F = S · e^((r-q)T). Above spot is contango; below is backwardation. */
export const futurePrice = (S, r, q, T) => S * Math.exp((r - q) * Math.max(T, 0));

/** FX forward by covered interest parity, quoted in points. */
export function fxForward(spot, rBase, rQuote, T) {
  const fwd = spot * Math.exp((rQuote - rBase) * Math.max(T, 0));
  return { fwd, points: (fwd - spot) * 10000, annualisedPct: T > 0 ? (fwd / spot - 1) / T * 100 : 0 };
}

export const basis = (F, S) => ({ abs: F - S, pct: S ? (F / S - 1) * 100 : 0 });

export function carryState(F, S) {
  if (!S || !F) return 'flat';
  const d = (F / S - 1) * 100;
  if (d > 0.05) return 'contango';
  if (d < -0.05) return 'backwardation';
  return 'flat';
}

// Contract sizes big enough to teach leverage, small enough to be reachable
// on a four-figure account. Micro contracts, deliberately.
export const CONTRACTS = {
  SPX:   { mult: 5,    name: 'Micro E-mini S&P 500',  initial: 1400, maint: 1250, tick: 0.25 },
  NDX:   { mult: 2,    name: 'Micro E-mini Nasdaq',   initial: 1900, maint: 1700, tick: 0.25 },
  DJI:   { mult: 0.5,  name: 'Micro E-mini Dow',      initial: 900,  maint: 800,  tick: 1 },
  RUT:   { mult: 5,    name: 'Micro E-mini Russell',  initial: 800,  maint: 700,  tick: 0.1 },
  N225:  { mult: 50,   name: 'Nikkei 225 (Yen) Micro', initial: 1100, maint: 1000, tick: 5 },
  NIFTY: { mult: 10,   name: 'Nifty 50 Micro',        initial: 700,  maint: 620,  tick: 0.05 },
  DAX:   { mult: 1,    name: 'Micro DAX',             initial: 1200, maint: 1080, tick: 1 },
  FTSE:  { mult: 1,    name: 'FTSE 100 Micro',        initial: 600,  maint: 540,  tick: 0.5 },
  KOSPI: { mult: 1,    name: 'KOSPI 200 Micro',       initial: 700,  maint: 630,  tick: 0.05 },
  HSI:   { mult: 1,    name: 'Mini Hang Seng',        initial: 1500, maint: 1350, tick: 1 },
  BTC:   { mult: 0.1,  name: 'Micro Bitcoin',         initial: 1800, maint: 1600, tick: 5 },
  ETH:   { mult: 1,    name: 'Micro Ether',           initial: 900,  maint: 800,  tick: 0.5 },
};

export const contractFor = (underlyingId) => CONTRACTS[underlyingId] || null;

/** Quarterly futures ladder - the March/June/September/December cycle. */
export function futuresLadder(count = 4) {
  const out = [];
  const now = new Date();
  let y = now.getUTCFullYear();
  let m = Math.floor(now.getUTCMonth() / 3) * 3 + 2;   // Mar=2, Jun=5, Sep=8, Dec=11
  while (out.length < count) {
    if (m > 11) { m -= 12; y += 1; }
    const d = new Date(Date.UTC(y, m, 1));
    while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCDate(d.getUTCDate() + 14);                  // third Friday
    if (d > now) out.push(d.toISOString().slice(0, 10));
    m += 3;
  }
  return out;
}

export const forwardLadder = () => expiryLadder(new Date(), 6);

/** Daily variation margin on a futures position - the cash that actually moves. */
export function variationMargin(qty, mult, prevMark, newMark) {
  return qty * mult * (newMark - prevMark);
}

/** Roll cost when a contract expires and you want to stay on. */
export function rollCost(nearPrice, farPrice, qty, mult) {
  return { spread: farPrice - nearPrice, cash: -qty * mult * (farPrice - nearPrice) };
}
