// Order execution.
//
// Prices here are delayed by up to a few minutes. Rather than hide that, every
// fill records the age of the tick it filled against, and the ticket shows it
// before you commit. A synthetic spread and size-based slippage sit on top,
// because "I would have got the last price" is the most expensive assumption in
// paper trading.

import * as S from './state.js';
import * as book from './book.js';
import * as margin from './margin.js';
import * as feed from '../market/feed.js';
import { lookup } from '../market/universe.js';
import { isTradeable, sessionFor } from '../market/calendar.js';
import { priceContract } from './quant/chain.js';
import { futurePrice, contractFor } from './quant/futures.js';
import { bondPrice } from './quant/bonds.js';
import { carryFor } from './book.js';
import { daysTo, yrs } from '../util/fmt.js';

/** Half-spread as a fraction of price, by liquidity tier and asset class. */
const SPREAD_BPS = {
  equity: { 1: 1, 2: 4, 3: 12 },
  index:  { 1: 1, 2: 2, 3: 4 },
  crypto: { 1: 2, 2: 8, 3: 25 },
  fx:     { 1: 0.5, 2: 1.5, 3: 4 },
  bond:   { 1: 2, 2: 5, 3: 10 },
};

export function spreadFor(inst, price) {
  const table = SPREAD_BPS[inst.cls] || SPREAD_BPS.equity;
  const bps = table[inst.tier || 2] || 5;
  const s = sessionFor(inst);
  const widen = s.state === 'pre' || s.state === 'post' ? 3.5 : s.state === 'open' ? 1 : 2.5;
  return price * (bps / 10000) * widen;
}

/**
 * Slippage. Small orders cross the spread; large ones walk the book.
 * Modelled as a square-root impact against a notional daily volume.
 */
export function slippage(inst, price, qty) {
  if (!S.get().config.slippageEnabled) return 0;
  const notional = Math.abs(qty) * price;
  const adv = { 1: 5e8, 2: 4e7, 3: 3e6 }[inst.tier || 2] || 4e7;
  const participation = notional / adv;
  if (participation < 1e-5) return 0;
  return price * 0.35 * Math.sqrt(participation);
}

/** Build the tradeable spec for any instrument or derivative leg. */
export function specFor(target) {
  if (typeof target === 'string') {
    const inst = lookup(target);
    if (!inst) throw new Error(`Unknown instrument: ${target}`);
    return { instrumentId: inst.id, kind: inst.cls === 'bond' ? 'bond' : inst.cls,
             cls: inst.cls, mkt: inst.mkt, ccy: inst.ccy, inst };
  }
  if (target.kind === 'option') {
    const u = lookup(target.underlyingId);
    if (!u) throw new Error(`Unknown underlying: ${target.underlyingId}`);
    return {
      instrumentId: u.id, kind: 'option', cls: u.cls, mkt: u.mkt, ccy: u.ccy, inst: u,
      opt: { underlyingId: u.id, type: target.type, strike: target.strike,
             expiry: target.expiry, style: target.style || 'A', mult: target.mult || 100 },
    };
  }
  if (target.kind === 'future' || target.kind === 'forward') {
    const u = lookup(target.underlyingId);
    if (!u) throw new Error(`Unknown underlying: ${target.underlyingId}`);
    const c = contractFor(u.id);
    return {
      instrumentId: u.id, kind: target.kind, cls: u.cls, mkt: u.mkt, ccy: u.ccy, inst: u,
      fut: { underlyingId: u.id, expiry: target.expiry, mult: target.mult || (c ? c.mult : 1) },
    };
  }
  throw new Error('Unrecognised order target');
}

/** Reference mid for any spec, in native currency. */
export function refPrice(spec) {
  if (spec.kind === 'option') {
    const p = priceContract({ ...spec.opt });
    return p ? p.price : null;
  }
  if (spec.kind === 'future' || spec.kind === 'forward') {
    const S0 = feed.price(spec.fut.underlyingId);
    if (S0 == null) return null;
    const { r, q } = carryFor(spec.fut.underlyingId);
    return futurePrice(S0, r, q, yrs(daysTo(spec.fut.expiry)));
  }
  if (spec.kind === 'bond') {
    const b = bondPrice(spec.instrumentId);
    return b ? b.clean : null;
  }
  return feed.price(spec.instrumentId);
}

/** Full pre-trade quote, exactly what the ticket displays. */
export function quoteOrder(spec, qty, side) {
  const mid = refPrice(spec);
  if (mid == null) return { error: 'No price available for this instrument yet.' };

  const inst = spec.inst;
  const signed = side === 'BUY' ? Math.abs(qty) : -Math.abs(qty);
  const mult = spec.kind === 'option' ? (spec.opt.mult || 100)
             : (spec.kind === 'future' || spec.kind === 'forward') ? (spec.fut.mult || 1) : 1;

  let half, slip;
  if (spec.kind === 'option') {
    const p = priceContract({ ...spec.opt });
    half = p ? p.spread / 2 : mid * 0.03;
    slip = 0;
  } else {
    half = spreadFor(inst, mid) / 2;
    slip = slippage(inst, mid, qty);
  }

  const dir = signed > 0 ? 1 : -1;
  const fill = Math.max(0, mid + dir * (half + slip));
  const grossNative = Math.abs(signed) * fill * mult;
  const commission = commissionFor(spec, Math.abs(qty));
  const cashNative = -signed * fill * mult;                 // buy = cash out
  const q = feed.quote(spec.instrumentId);

  return {
    mid, fill, half, slip, mult, signed, commission,
    grossNative, grossUSD: feed.toUSD(grossNative, spec.ccy),
    cashNative, cashUSD: feed.toUSD(cashNative, spec.ccy),
    ccy: spec.ccy,
    dataAge: q ? (Date.now() - q.recvAt) / 1000 : null,
    quoteTs: q ? q.ts : null,
    session: sessionFor(inst),
    tradeable: isTradeable(inst),
    check: margin.checkOrder(spec, signed, fill),
  };
}

export function commissionFor(spec, qty) {
  const cfg = S.get().config;
  if (spec.kind === 'option') return qty * cfg.commissionOption;
  if (spec.kind === 'future' || spec.kind === 'forward') return qty * cfg.commissionFutures;
  return cfg.commissionEquity;
}

/**
 * Send a market order. Returns the trade record, or throws with a reason a
 * human can act on.
 */
export function marketOrder({ target, qty, side, force = false }) {
  const spec = specFor(target);
  const q = quoteOrder(spec, qty, side);
  if (q.error) throw new Error(q.error);
  if (!q.tradeable && !force) {
    throw new Error(`${spec.inst.name} is ${q.session.label.toLowerCase()}. ` +
      `Use a limit order to rest it until the open.`);
  }
  if (!q.check.ok && !force) throw new Error(q.check.reason);

  return commit(spec, q.signed, q.fill, q.commission, q, 'MKT');
}

/** The one place a fill actually happens - every path funnels through here. */
export function commit(spec, signedQty, fillPrice, commission, quoteInfo, orderType) {
  const acct = S.get();
  const at = Date.now();
  const closing = margin.isClosing(spec, signedQty);
  const mult = quoteInfo?.mult ?? 1;

  const isDay = margin.recordDayTrade(spec, signedQty, at);
  const { closedLots } = book.applyFill(spec, signedQty, fillPrice, commission, at);

  const cashNative = -signedQty * fillPrice * mult;
  const cashUSD = feed.toUSD(cashNative, spec.ccy) ?? cashNative;
  S.cashflow('trade', cashUSD, `${signedQty > 0 ? 'Bought' : 'Sold'} ${Math.abs(signedQty)} ${book.describe(spec)}`, { at });
  if (commission > 0) S.cashflow('commission', -commission, 'Commission', { at });

  const trade = {
    id: S.nextId('t'), at, key: book.positionKey(spec),
    instrumentId: spec.instrumentId, kind: spec.kind, cls: spec.cls, ccy: spec.ccy,
    opt: spec.opt || null, fut: spec.fut || null,
    qty: signedQty, price: fillPrice, mult, commission,
    orderType, closing, dayTrade: isDay,
    mid: quoteInfo?.mid, slip: quoteInfo?.slip, half: quoteInfo?.half,
    dataAge: quoteInfo?.dataAge,
    cashUSD, realisedUSD: closedLots.reduce((a, l) => a + (l.grossUSD || 0), 0),
    closedLotIds: closedLots.map((l) => l.id),
  };
  acct.trades.unshift(trade);
  if (acct.trades.length > 3000) acct.trades.length = 3000;

  S.save();
  S.emit('trade');
  return { trade, closedLots };
}

// ------------------------------------------------------------ working orders

export const ORDER_TYPES = ['LMT', 'STP', 'STP LMT', 'TRAIL'];

export function placeOrder({ target, qty, side, type, limit, stop, trailPct, tif = 'GTC' }) {
  const spec = specFor(target);
  const acct = S.get();
  const signed = side === 'BUY' ? Math.abs(qty) : -Math.abs(qty);
  const order = {
    id: S.nextId('o'), at: Date.now(), status: 'WORKING',
    key: book.positionKey(spec),
    target: typeof target === 'string' ? target : { ...target },
    instrumentId: spec.instrumentId, kind: spec.kind, cls: spec.cls, ccy: spec.ccy,
    qty: signed, side, type, limit: limit ?? null, stop: stop ?? null,
    trailPct: trailPct ?? null, tif,
    peak: null, label: describeOrder(spec, signed, type, limit, stop, trailPct),
  };
  acct.orders.unshift(order);
  S.save();
  S.emit('order');
  return order;
}

function describeOrder(spec, qty, type, limit, stop, trailPct) {
  const name = spec.opt
    ? `${spec.inst.sym} ${spec.opt.expiry} ${spec.opt.strike}${spec.opt.type}`
    : spec.fut ? `${spec.inst.sym} ${spec.kind === 'future' ? 'FUT' : 'FWD'} ${spec.fut.expiry}`
    : spec.inst.sym;
  const side = qty > 0 ? 'BUY' : 'SELL';
  const at = type === 'LMT' ? `@ ${limit}` : type === 'TRAIL' ? `trail ${trailPct}%`
           : type === 'STP LMT' ? `stop ${stop} lmt ${limit}` : `stop ${stop}`;
  return `${side} ${Math.abs(qty)} ${name} ${at}`;
}

export function cancelOrder(id) {
  const acct = S.get();
  const o = acct.orders.find((x) => x.id === id);
  if (!o || o.status !== 'WORKING') return false;
  o.status = 'CANCELLED';
  o.closedAt = Date.now();
  S.save(); S.emit('order');
  return true;
}

/**
 * Check working orders against the latest tick. Called on every feed update -
 * this is what makes a stop-loss actually protect anything.
 */
export function sweep() {
  const acct = S.get();
  const fills = [];

  for (const o of acct.orders) {
    if (o.status !== 'WORKING') continue;
    let spec;
    try { spec = specFor(o.target); } catch { continue; }
    const px = refPrice(spec);
    if (px == null) continue;

    const buy = o.qty > 0;
    let trigger = false;
    let fillAt = px;

    if (o.type === 'LMT') {
      trigger = buy ? px <= o.limit : px >= o.limit;
      fillAt = o.limit;
    } else if (o.type === 'STP') {
      trigger = buy ? px >= o.stop : px <= o.stop;
    } else if (o.type === 'STP LMT') {
      if (buy ? px >= o.stop : px <= o.stop) {
        trigger = buy ? px <= o.limit : px >= o.limit;
        fillAt = o.limit;
      }
    } else if (o.type === 'TRAIL') {
      o.peak = o.peak == null ? px : (buy ? Math.min(o.peak, px) : Math.max(o.peak, px));
      const dist = o.peak * (o.trailPct / 100);
      const level = buy ? o.peak + dist : o.peak - dist;
      o.stop = level;
      trigger = buy ? px >= level : px <= level;
    }

    if (!trigger) continue;

    const q = quoteOrder(spec, Math.abs(o.qty), buy ? 'BUY' : 'SELL');
    if (q.error) continue;
    // Stops become market orders and take the spread; limits get their price.
    const price = (o.type === 'LMT' || o.type === 'STP LMT') ? fillAt : q.fill;
    if (!q.check.ok && !margin.isClosing(spec, o.qty)) {
      o.status = 'REJECTED';
      o.reason = q.check.reason;
      o.closedAt = Date.now();
      continue;
    }
    const res = commit(spec, o.qty, price, q.commission, q, o.type);
    o.status = 'FILLED';
    o.filledAt = Date.now();
    o.fillPrice = price;
    o.tradeId = res.trade.id;
    fills.push({ order: o, ...res });
  }

  if (fills.length) { S.save(); S.emit('fills'); }
  return fills;
}

/** Attach a protective stop to an open position, sized off the current mark. */
export function attachStop(positionKey, pct, kind = 'STP') {
  const pos = book.findPosition(positionKey);
  if (!pos) throw new Error('No such position.');
  const qty = book.netQty(pos);
  const m = book.mark(pos);
  const long = qty > 0;
  const stop = long ? m * (1 - pct / 100) : m * (1 + pct / 100);
  const target = pos.kind === 'option'
    ? { kind: 'option', underlyingId: pos.opt.underlyingId, type: pos.opt.type,
        strike: pos.opt.strike, expiry: pos.opt.expiry, style: pos.opt.style }
    : (pos.kind === 'future' || pos.kind === 'forward')
    ? { kind: pos.kind, underlyingId: pos.fut.underlyingId, expiry: pos.fut.expiry, mult: pos.fut.mult }
    : pos.instrumentId;
  return placeOrder({ target, qty: Math.abs(qty), side: long ? 'SELL' : 'BUY',
                      type: kind, stop: Number(stop.toFixed(6)),
                      trailPct: kind === 'TRAIL' ? pct : null });
}
