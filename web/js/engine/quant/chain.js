// The option chain.
//
// No free vendor gives listed chains outside the US, so PaperTerminal builds
// every chain the same way for every market: real spot, real realised vol, a
// fitted skew, and a strike ladder spaced off the actual move size. That makes
// India, Korea and Singapore options behave consistently with US ones instead
// of half the board being dead.

import { expiryLadder } from '../../market/calendar.js';
import { lookup } from '../../market/universe.js';
import * as feed from '../../market/feed.js';
import { impliedVolFor, termVol } from './vol.js';
import { priceOption } from './binomial.js';
import { probITM } from './blackscholes.js';
import { curveRate, carryFor } from '../book.js';
import { daysTo, yrs } from '../../util/fmt.js';

/** Round a strike to something an exchange would actually list. */
export function strikeStep(spot) {
  if (spot >= 20000) return 500;
  if (spot >= 5000) return 100;
  if (spot >= 1000) return 25;
  if (spot >= 500) return 10;
  if (spot >= 100) return 5;
  if (spot >= 25) return 1;
  if (spot >= 5) return 0.5;
  if (spot >= 1) return 0.1;
  return 0.01;
}

/** Index options are European and cash-settled; single stock is American. */
export const styleFor = (inst) => (inst && (inst.cls === 'index' || inst.cls === 'fx') ? 'E' : 'A');

export function strikes(spot, T, sigma, width = 8) {
  const step = strikeStep(spot);
  const atm = Math.round(spot / step) * step;
  const move = Math.max(spot * sigma * Math.sqrt(Math.max(T, 0.02)), step);
  const span = Math.max(width, Math.ceil((move * 2.2) / step));
  const out = [];
  for (let i = -span; i <= span; i++) {
    const k = atm + i * step;
    if (k > 0) out.push(Number(k.toFixed(6)));
  }
  return out;
}

export const expiries = (count = 8) => expiryLadder(new Date(), count);

/**
 * Build one side of the board for a single expiry.
 * Every row carries its own IV, Greeks, a synthetic bid/ask and probability ITM.
 */
export function chainFor(underlyingId, expiry, opts = {}) {
  const inst = lookup(underlyingId);
  const S0 = feed.price(underlyingId);
  if (!inst || S0 == null) return null;

  const T = yrs(daysTo(expiry));
  const { r, q } = carryFor(underlyingId);
  const style = styleFor(inst);
  const atmSigma = termVol(underlyingId, T);
  const ks = opts.strikes || strikes(S0, T, atmSigma, opts.width || 8);

  const rows = ks.map((K) => {
    const out = { strike: K, dist: (K / S0 - 1) * 100 };
    for (const type of ['C', 'P']) {
      const sigma = impliedVolFor(underlyingId, K, T, type);
      const g = priceOption({ type, style, S: S0, K, T, r, q, sigma });
      const spread = quoteSpread(g.price, inst.tier || 2, T);
      out[type === 'C' ? 'call' : 'put'] = {
        type, strike: K, expiry, style, iv: sigma,
        mid: g.price, bid: Math.max(0, g.price - spread / 2), ask: g.price + spread / 2,
        delta: g.delta, gamma: g.gamma, vega: g.vega, theta: g.theta, rho: g.rho,
        intrinsic: g.intrinsic, extrinsic: g.extrinsic,
        earlyPremium: g.earlyPremium || 0,
        itm: probITM({ type, S: S0, K, T, r, q, sigma }),
        oi: syntheticOI(K, S0, T), volume: syntheticVolume(K, S0, T),
      };
    }
    return out;
  });

  const atmIdx = rows.reduce((best, row, i) =>
    Math.abs(row.strike - S0) < Math.abs(rows[best].strike - S0) ? i : best, 0);

  return { underlyingId, inst, spot: S0, expiry, T, days: Math.max(0, daysTo(expiry)),
           r, q, style, atmSigma, rows, atmIdx, ccy: inst.ccy };
}

/**
 * Synthetic bid/ask. Options are wide - much wider than the underlying - and
 * pretending otherwise hides most of what makes retail option trading hard.
 */
export function quoteSpread(mid, tier = 2, T = 0.1) {
  const floor = { 1: 0.02, 2: 0.05, 3: 0.10 }[tier] || 0.05;
  const rel = { 1: 0.012, 2: 0.03, 3: 0.06 }[tier] || 0.03;
  const shortDated = T < 0.02 ? 1.6 : T < 0.08 ? 1.25 : 1;
  return Math.max(floor, mid * rel) * shortDated;
}

// Open interest and volume are decoration, but they cluster at round strikes
// near the money the way real boards do, so the shape reads correctly.
function syntheticOI(K, S0, T) {
  const m = Math.abs(Math.log(K / S0));
  const round = K % (strikeStep(S0) * 5) === 0 ? 2.4 : 1;
  return Math.round(Math.exp(-m * 14) * 9000 * round * (0.4 + Math.min(T, 1)) + 12);
}
function syntheticVolume(K, S0, T) {
  const m = Math.abs(Math.log(K / S0));
  return Math.round(Math.exp(-m * 20) * 2400 * (T < 0.05 ? 1.8 : 1) + 3);
}

/** One contract, priced on demand - what the order ticket and positions use. */
export function priceContract({ underlyingId, type, strike, expiry, style }) {
  const inst = lookup(underlyingId);
  const S0 = feed.price(underlyingId);
  if (S0 == null) return null;
  const T = yrs(daysTo(expiry));
  const { r, q } = carryFor(underlyingId);
  const sigma = impliedVolFor(underlyingId, strike, T, type);
  const st = style || styleFor(inst);
  const g = priceOption({ type, style: st, S: S0, K: strike, T, r, q, sigma });
  const spread = quoteSpread(g.price, inst?.tier || 2, T);
  return { ...g, iv: sigma, spot: S0, T, r, q, style: st,
           bid: Math.max(0, g.price - spread / 2), ask: g.price + spread / 2, spread,
           itm: probITM({ type, S: S0, K: strike, T, r, q, sigma }) };
}

/** Max pain - the strike where the most open interest expires worthless. */
export function maxPain(chain) {
  if (!chain) return null;
  let best = null;
  for (const probe of chain.rows) {
    let pain = 0;
    for (const row of chain.rows) {
      pain += Math.max(0, probe.strike - row.strike) * row.call.oi;
      pain += Math.max(0, row.strike - probe.strike) * row.put.oi;
    }
    if (!best || pain < best.pain) best = { strike: probe.strike, pain };
  }
  return best;
}
