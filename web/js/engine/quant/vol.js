// Volatility.
//
// Every option price in PaperTerminal traces back to a number produced here,
// so this is where "model-priced" either earns its keep or becomes a toy.
// Realised vol comes from real bars using three estimators; the surface adds a
// skew and a term structure, because a flat surface teaches the wrong lesson -
// downside puts are dear for a reason and the whole point is to feel that.

import * as feed from '../../market/feed.js';
import { lookup } from '../../market/universe.js';

const ANNUAL = 252;
const cache = new Map();      // instrumentId -> { at, vols }

const logRet = (bars) => {
  const out = [];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i].c > 0 && bars[i - 1].c > 0) out.push(Math.log(bars[i].c / bars[i - 1].c));
  }
  return out;
};

const stdev = (xs) => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** Plain close-to-close realised vol, annualised. */
export function closeToClose(bars, window = 30) {
  const r = logRet(bars).slice(-window);
  return r.length < 5 ? null : stdev(r) * Math.sqrt(ANNUAL);
}

/** RiskMetrics EWMA - reacts to a vol regime change far faster than a flat window. */
export function ewma(bars, lambda = 0.94) {
  const r = logRet(bars);
  if (r.length < 10) return null;
  let v = r.slice(0, 20).reduce((a, b) => a + b * b, 0) / 20;
  for (let i = 20; i < r.length; i++) v = lambda * v + (1 - lambda) * r[i] * r[i];
  return Math.sqrt(v * ANNUAL);
}

/** Parkinson - uses the high-low range, roughly 5x more efficient than close-to-close. */
export function parkinson(bars, window = 30) {
  const b = bars.slice(-window).filter((x) => x.h > 0 && x.l > 0);
  if (b.length < 5) return null;
  const s = b.reduce((a, x) => a + Math.log(x.h / x.l) ** 2, 0) / b.length;
  return Math.sqrt(s / (4 * Math.LN2) * ANNUAL);
}

/** Garman-Klass - adds the open-close leg, the best of the simple OHLC estimators. */
export function garmanKlass(bars, window = 30) {
  const b = bars.slice(-window).filter((x) => x.h > 0 && x.l > 0 && x.o > 0 && x.c > 0);
  if (b.length < 5) return null;
  const s = b.reduce((a, x) =>
    a + 0.5 * Math.log(x.h / x.l) ** 2 - (2 * Math.LN2 - 1) * Math.log(x.c / x.o) ** 2, 0) / b.length;
  return s > 0 ? Math.sqrt(s * ANNUAL) : null;
}

/** Blend the estimators, weighting the efficient ones higher. */
export function realised(bars) {
  if (!bars || bars.length < 20) return null;
  const parts = [
    [closeToClose(bars, 30), 1.0],
    [closeToClose(bars, 90), 0.6],
    [ewma(bars), 1.4],
    [parkinson(bars, 30), 1.0],
    [garmanKlass(bars, 30), 1.2],
  ].filter(([v]) => v != null && isFinite(v) && v > 0);
  if (!parts.length) return null;
  const wsum = parts.reduce((a, [, w]) => a + w, 0);
  return parts.reduce((a, [v, w]) => a + v * w, 0) / wsum;
}

// Fallbacks when no history is reachable, and the per-class shape of the smile.
const CLASS_PROFILE = {
  index:  { base: 0.16, skew: -0.16, smile: 0.06, vrp: 1.10 },
  equity: { base: 0.28, skew: -0.09, smile: 0.09, vrp: 1.08 },
  crypto: { base: 0.60, skew: -0.02, smile: 0.14, vrp: 1.05 },
  fx:     { base: 0.09, skew:  0.00, smile: 0.05, vrp: 1.04 },
  bond:   { base: 0.07, skew: -0.03, smile: 0.03, vrp: 1.03 },
};

const TIER_BUMP = { 1: 1.0, 2: 1.18, 3: 1.45 };

export function profileFor(instrumentId) {
  const inst = lookup(instrumentId);
  const p = CLASS_PROFILE[inst?.cls] || CLASS_PROFILE.equity;
  return { ...p, tier: TIER_BUMP[inst?.tier || 2] || 1.15 };
}

/**
 * At-the-money vol for an instrument. Blends real realised vol with the
 * variance risk premium - implied trades above realised most of the time,
 * which is why selling premium looks free until it isn't.
 */
export function atmVol(instrumentId) {
  const hit = cache.get(instrumentId);
  if (hit && Date.now() - hit.at < 3600000) return hit.vol;

  // Real bars arrive asynchronously via warm(); until they do, fall back to the
  // class profile so an option still prices instead of returning nothing.
  const prof = profileFor(instrumentId);
  const rv = hit ? hit.realised : null;
  const vol = (rv || prof.base * prof.tier) * prof.vrp;
  cache.set(instrumentId, { at: Date.now(), vol, realised: rv });
  return vol;
}

/** Pull real bars and fold them into the cache. Called when a symbol is opened. */
export async function warm(instrumentId) {
  try {
    const bars = await feed.bars(instrumentId, 365);
    const rv = realised(bars);
    const prof = profileFor(instrumentId);
    const vol = (rv || prof.base * prof.tier) * prof.vrp;
    cache.set(instrumentId, { at: Date.now(), vol, realised: rv, bars: bars.length });
    return { vol, realised: rv, bars: bars.length };
  } catch {
    return null;
  }
}

export const cachedRealised = (id) => (cache.get(id) || {}).realised ?? null;

/**
 * Term structure: short-dated vol pulls toward the long anchor.
 * In a calm tape that is contango, and in a shock it inverts - the same shape
 * the real VIX curve shows.
 */
export function termVol(instrumentId, T) {
  const spot = atmVol(instrumentId);
  const anchor = profileFor(instrumentId).base * profileFor(instrumentId).tier;
  const lambda = 2.2;
  const w = Math.exp(-lambda * Math.max(T, 0.003));
  return Math.max(0.02, spot * w + anchor * (1 - w));
}

/**
 * The surface. Quadratic in standardised log-moneyness - a serviceable
 * stand-in for SVI that stays arbitrage-sane over the strikes we list.
 */
export function impliedVolFor(instrumentId, strike, T, _type = 'C') {
  const S0 = feed.price(instrumentId);
  const sigmaAtm = termVol(instrumentId, T);
  if (!S0 || !strike || !(T > 0)) return sigmaAtm;

  const prof = profileFor(instrumentId);
  const k = Math.log(strike / S0) / Math.max(sigmaAtm * Math.sqrt(Math.max(T, 0.01)), 1e-6);
  const shaped = sigmaAtm * (1 + prof.skew * k + prof.smile * k * k);
  return Math.max(0.02, Math.min(4, shaped));
}

/** 25-delta risk reversal, the standard read on how bid the downside is. */
export function riskReversal(instrumentId, T = 0.0833) {
  const S0 = feed.price(instrumentId);
  if (!S0) return null;
  const atm = termVol(instrumentId, T);
  const w = atm * Math.sqrt(T) * 0.6745;
  const put = impliedVolFor(instrumentId, S0 * Math.exp(-w), T, 'P');
  const call = impliedVolFor(instrumentId, S0 * Math.exp(w), T, 'C');
  return { put, call, rr: call - put, atm };
}

export const volFor = atmVol;
