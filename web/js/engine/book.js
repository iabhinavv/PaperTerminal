// Positions and tax lots.
//
// A position is a bundle of lots. Lots matter more than the average price: the
// lot you choose to sell decides your tax bill, and switching FIFO to HIFO can
// move that bill by more than the trade made. So lots are first class here and
// the average price is derived, never stored as truth.

import * as S from './state.js';
import * as feed from '../market/feed.js';
import { lookup } from '../market/universe.js';
import { priceOption } from './quant/binomial.js';
import { impliedVolFor, volFor } from './quant/vol.js';
import { bondPrice } from './quant/bonds.js';
import { futurePrice } from './quant/futures.js';
import { daysTo, yrs } from '../util/fmt.js';

export const MULT = { option: 100, future: 1, forward: 1 };

/** Contract multiplier: 100 shares per option contract, per-contract for futures. */
export function multiplier(pos) {
  if (pos.kind === 'option') return pos.opt?.mult || 100;
  if (pos.kind === 'future' || pos.kind === 'forward') return pos.fut?.mult || 1;
  return 1;
}

export const isDerivative = (p) => p.kind === 'option' || p.kind === 'future' || p.kind === 'forward';

/** Human-readable contract name, OCC-flavoured for options. */
export function describe(pos) {
  if (pos.kind === 'option') {
    const u = lookup(pos.opt.underlyingId);
    return `${u ? u.sym : pos.opt.underlyingId} ${pos.opt.expiry} ${pos.opt.strike}${pos.opt.type}`;
  }
  if (pos.kind === 'future') {
    const u = lookup(pos.fut.underlyingId);
    return `${u ? u.sym : pos.fut.underlyingId} FUT ${pos.fut.expiry}`;
  }
  if (pos.kind === 'forward') {
    const u = lookup(pos.fut.underlyingId);
    return `${u ? u.sym : pos.fut.underlyingId} FWD ${pos.fut.expiry}`;
  }
  const inst = lookup(pos.instrumentId);
  return inst ? inst.sym : pos.instrumentId;
}

/** Live mark in the instrument's own currency. */
export function mark(pos) {
  if (pos.kind === 'option') {
    const S0 = feed.price(pos.opt.underlyingId);
    if (S0 == null) return pos.lastMark ?? pos.avgPrice ?? 0;
    const T = yrs(daysTo(pos.opt.expiry));
    const sigma = impliedVolFor(pos.opt.underlyingId, pos.opt.strike, T, pos.opt.type);
    const { r, q } = carryFor(pos.opt.underlyingId);
    const out = priceOption({ type: pos.opt.type, style: pos.opt.style || 'A',
                              S: S0, K: pos.opt.strike, T, r, q, sigma });
    pos.lastMark = out.price;
    pos.lastGreeks = out;
    return out.price;
  }
  if (pos.kind === 'future' || pos.kind === 'forward') {
    const S0 = feed.price(pos.fut.underlyingId);
    if (S0 == null) return pos.lastMark ?? pos.avgPrice ?? 0;
    const T = yrs(daysTo(pos.fut.expiry));
    const { r, q } = carryFor(pos.fut.underlyingId);
    const p = futurePrice(S0, r, q, T);
    pos.lastMark = p;
    return p;
  }
  if (pos.kind === 'bond') {
    const p = bondPrice(pos.instrumentId);
    if (p != null) { pos.lastMark = p.clean; return p.clean; }
    return pos.lastMark ?? pos.avgPrice ?? 0;
  }
  const p = feed.price(pos.instrumentId);
  if (p != null) pos.lastMark = p;
  return p ?? pos.lastMark ?? pos.avgPrice ?? 0;
}

/** Risk-free rate and carry yield for an underlying, both as decimals. */
export function carryFor(instrumentId) {
  const inst = lookup(instrumentId);
  const ccy = inst ? inst.ccy : 'USD';
  const r = curveRate(ccy, 1);
  // Dividend yield stand-ins: index ~1.5%, single stock ~1%, crypto 0, FX = foreign rate.
  let q = 0;
  if (inst) {
    if (inst.cls === 'index') q = 0.015;
    else if (inst.cls === 'equity') q = 0.012;
    else if (inst.cls === 'fx') q = curveRate(inst.quote, 1);
  }
  return { r, q, ccy };
}

let CURVE = null;
export const setCurve = (c) => { CURVE = c; };
export function curveRate(ccy, tenor = 1) {
  const src = (CURVE && CURVE[ccy]) || null;
  if (!src) return 0.04;
  const tenors = Object.keys(src).map(Number).sort((a, b) => a - b);
  let lo = tenors[0], hi = tenors[tenors.length - 1];
  for (const t of tenors) { if (t <= tenor) lo = t; if (t >= tenor) { hi = t; break; } }
  if (lo === hi) return src[lo] / 100;
  const w = (tenor - lo) / (hi - lo);
  return (src[lo] * (1 - w) + src[hi] * w) / 100;
}

export const avgPrice = (pos) => {
  const tot = pos.lots.reduce((a, l) => a + Math.abs(l.qty), 0);
  if (!tot) return 0;
  return pos.lots.reduce((a, l) => a + Math.abs(l.qty) * l.price, 0) / tot;
};

export const netQty = (pos) => pos.lots.reduce((a, l) => a + l.qty, 0);

/** Notional exposure in the instrument's currency. */
export const notional = (pos) => Math.abs(netQty(pos)) * mark(pos) * multiplier(pos);

/** Unrealised P&L, native currency and USD. */
export function unrealised(pos) {
  const qty = netQty(pos);
  const m = mark(pos);
  const mult = multiplier(pos);
  const native = pos.lots.reduce((a, l) => a + l.qty * (m - l.price) * mult, 0);
  return { native, usd: feed.toUSD(native, pos.ccy) ?? native, mark: m, qty };
}

export function findPosition(key) {
  return S.get().positions.find((p) => p.key === key) || null;
}

export function positionKey(spec) {
  if (spec.kind === 'option') {
    return `${spec.opt.underlyingId}|O|${spec.opt.expiry}|${spec.opt.strike}|${spec.opt.type}`;
  }
  if (spec.kind === 'future' || spec.kind === 'forward') {
    return `${spec.fut.underlyingId}|${spec.kind === 'future' ? 'F' : 'W'}|${spec.fut.expiry}`;
  }
  return spec.instrumentId;
}

/** Order the lots according to the account's chosen method. */
export function orderLots(lots, method) {
  const l = lots.slice();
  if (method === 'HIFO') return l.sort((a, b) => b.price - a.price);
  if (method === 'LIFO') return l.sort((a, b) => b.at - a.at);
  return l.sort((a, b) => a.at - b.at);   // FIFO
}

/**
 * Apply a fill. Adds to the position, or closes lots against it and books the
 * realised gain with its holding period - which is what the tax engine reads.
 */
export function applyFill(spec, qty, price, fees = 0, at = Date.now()) {
  const acct = S.get();
  const key = positionKey(spec);
  let pos = findPosition(key);

  if (!pos) {
    pos = {
      id: S.nextId('p'), key,
      instrumentId: spec.instrumentId, kind: spec.kind, cls: spec.cls,
      mkt: spec.mkt, ccy: spec.ccy,
      opt: spec.opt || null, fut: spec.fut || null,
      lots: [], realised: 0, fees: 0, openedAt: at,
    };
    acct.positions.push(pos);
  }

  const existing = netQty(pos);
  const closing = existing !== 0 && Math.sign(qty) !== Math.sign(existing);
  const closedLots = [];
  let remaining = qty;

  if (closing) {
    const toClose = Math.min(Math.abs(qty), Math.abs(existing));
    let left = toClose;
    const ordered = orderLots(pos.lots, acct.config.lotMethod);
    for (const lot of ordered) {
      if (left <= 1e-12) break;
      const take = Math.min(Math.abs(lot.qty), left);
      const sign = Math.sign(lot.qty);
      const mult = multiplier(pos);
      const gross = sign * take * (price - lot.price) * mult;
      const heldDays = (at - lot.at) / 86400000;

      closedLots.push({
        id: S.nextId('cl'), key, kind: pos.kind, cls: pos.cls, ccy: pos.ccy,
        instrumentId: pos.instrumentId, describe: describe(pos),
        qty: take, openPrice: lot.price, closePrice: price,
        openedAt: lot.at, closedAt: at, heldDays,
        longTerm: heldDays > 365,
        gross, grossUSD: feed.toUSD(gross, pos.ccy) ?? gross,
        section1256: pos.kind === 'future' || pos.kind === 'forward'
                  || (pos.kind === 'option' && lookup(pos.opt?.underlyingId)?.cls === 'index'),
        mult,
      });

      lot.qty = sign * (Math.abs(lot.qty) - take);
      left -= take;
      pos.realised += gross;
    }
    pos.lots = pos.lots.filter((l) => Math.abs(l.qty) > 1e-12);
    // Anything beyond the closed size flips the position to the other side.
    remaining = Math.abs(qty) > toClose ? Math.sign(qty) * (Math.abs(qty) - toClose) : 0;
  }

  if (Math.abs(remaining) > 1e-12) {
    pos.lots.push({ id: S.nextId('l'), qty: remaining, price, at, fees: 0 });
  }

  pos.fees += fees;
  if (closedLots.length) acct.closedLots.push(...closedLots);
  if (!pos.lots.length) {
    acct.positions.splice(acct.positions.indexOf(pos), 1);
  }
  return { position: pos.lots.length ? pos : null, closedLots };
}

/** Portfolio-wide roll-up, everything in USD. */
export function summary() {
  const acct = S.get();
  let longMV = 0, shortMV = 0, unreal = 0, optLongMV = 0, optShortMV = 0;
  const rows = [];

  for (const pos of acct.positions) {
    const u = unrealised(pos);
    const mult = multiplier(pos);
    const mvNative = u.qty * u.mark * mult;
    const mvUSD = feed.toUSD(mvNative, pos.ccy) ?? 0;
    if (pos.kind === 'option') { if (mvUSD >= 0) optLongMV += mvUSD; else optShortMV += -mvUSD; }
    else if (mvUSD >= 0) longMV += mvUSD; else shortMV += -mvUSD;
    unreal += u.usd || 0;
    rows.push({ pos, ...u, mvNative, mvUSD, mult });
  }

  const realisedUSD = acct.closedLots.reduce((a, l) => a + (l.grossUSD || 0), 0);
  return {
    rows, longMV, shortMV, optLongMV, optShortMV,
    grossExposure: longMV + shortMV + optLongMV + optShortMV,
    netExposure: longMV - shortMV,
    unrealised: unreal, realised: realisedUSD,
    positionsMV: longMV - shortMV + optLongMV - optShortMV,
  };
}

/** Net account equity: cash, minus what you owe, plus what you hold. */
export function equity() {
  const acct = S.get();
  const s = summary();
  return acct.cash - acct.borrowed - acct.accruedInterest + s.positionsMV;
}

/** Aggregate Greeks, delta expressed in USD of underlying exposure. */
export function greeks() {
  const acct = S.get();
  const out = { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0, deltaUSD: 0 };
  for (const pos of acct.positions) {
    const qty = netQty(pos);
    const mult = multiplier(pos);
    if (pos.kind === 'option') {
      mark(pos);
      const g = pos.lastGreeks;
      if (!g) continue;
      const S0 = feed.price(pos.opt.underlyingId) || 0;
      const scale = qty * mult;
      out.delta += g.delta * scale;
      out.gamma += g.gamma * scale;
      out.vega  += g.vega  * scale;
      out.theta += g.theta * scale;
      out.rho   += g.rho   * scale;
      out.deltaUSD += (feed.toUSD(g.delta * scale * S0, pos.ccy) ?? 0);
    } else if (pos.kind !== 'bond') {
      const m = mark(pos);
      out.delta += qty * mult;
      out.deltaUSD += (feed.toUSD(qty * m * mult, pos.ccy) ?? 0);
    }
  }
  return out;
}
