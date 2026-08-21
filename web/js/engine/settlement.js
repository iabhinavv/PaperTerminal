// Expiry, assignment and coupons.
//
// Options do not politely disappear. A short call that finishes one cent in the
// money gets assigned, and you wake up short 100 shares you never chose to be
// short. That is modelled here, because it is the failure mode that actually
// hurts people.

import * as S from './state.js';
import * as book from './book.js';
import * as feed from '../market/feed.js';
import { lookup } from '../market/universe.js';
import { bondSpec, bondPrice } from './quant/bonds.js';
import { styleFor } from './quant/chain.js';

const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/** Coupons falling due on a given day, for bonds actually held. */
export function couponsDue(at) {
  const acct = S.get();
  const out = [];
  const d = new Date(at);

  for (const pos of acct.positions) {
    if (pos.kind !== 'bond') continue;
    const spec = bondSpec(pos.instrumentId);
    if (!spec) continue;
    const mat = new Date(spec.maturity + 'T00:00:00Z');
    const monthsBetween = 12 / (spec.freq || 2);
    // Coupon dates walk back from maturity in whole periods.
    const monthDiff = (mat.getUTCFullYear() - d.getUTCFullYear()) * 12 + (mat.getUTCMonth() - d.getUTCMonth());
    if (monthDiff < 0 || monthDiff % monthsBetween !== 0) continue;
    if (d.getUTCDate() !== mat.getUTCDate()) continue;

    const qty = book.netQty(pos);
    const amountNative = qty * (spec.par * spec.coupon / 100) / spec.freq;
    out.push({ name: spec.name, amountNative,
               amountUSD: feed.toUSD(amountNative, spec.ccy) ?? amountNative });
  }
  return out;
}

/** Is this option in the money at expiry? One cent is enough. */
const finishesITM = (opt, spot) =>
  opt.type === 'C' ? spot > opt.strike + 1e-9 : spot < opt.strike - 1e-9;

/**
 * Settle everything expiring on this day.
 * Cash-settled index options pay the difference; American stock options
 * assign into the underlying, which can leave you short stock on margin.
 */
export function expireOn(at) {
  const acct = S.get();
  const events = [];

  for (const pos of acct.positions.slice()) {
    if (pos.kind === 'option') {
      if (!sameDay(pos.opt.expiry + 'T16:00:00Z', at)) continue;
      const u = lookup(pos.opt.underlyingId);
      const spot = feed.price(pos.opt.underlyingId);
      const qty = book.netQty(pos);
      const mult = pos.opt.mult || 100;

      if (spot == null) continue;

      if (!finishesITM(pos.opt, spot)) {
        book.applyFill(specOf(pos), -qty, 0, 0, at);
        events.push({ at, kind: 'expiry', worthless: true, label: book.describe(pos),
                      qty, note: `Expired worthless, ${pos.opt.strike}${pos.opt.type} vs ${spot.toFixed(2)}` });
        continue;
      }

      const cashSettled = u && (u.cls === 'index' || u.cls === 'fx');
      const intrinsic = pos.opt.type === 'C' ? spot - pos.opt.strike : pos.opt.strike - spot;

      if (cashSettled) {
        const payoffNative = qty * intrinsic * mult;
        const usd = feed.toUSD(payoffNative, pos.ccy) ?? payoffNative;
        book.applyFill(specOf(pos), -qty, intrinsic, 0, at);
        S.cashflow('settlement', usd, `Cash settlement of ${book.describe(pos)}`, { at });
        events.push({ at, kind: 'expiry', label: book.describe(pos), qty,
                      amount: usd, note: `Cash settled at ${intrinsic.toFixed(2)} intrinsic` });
      } else {
        // Physical: the option converts into stock at the strike.
        const shares = qty * mult * (pos.opt.type === 'C' ? 1 : -1);
        book.applyFill(specOf(pos), -qty, intrinsic, 0, at);
        const stockSpec = { instrumentId: u.id, kind: 'equity', cls: u.cls,
                            mkt: u.mkt, ccy: u.ccy };
        book.applyFill(stockSpec, shares, pos.opt.strike, 0, at);
        const cashNative = -shares * pos.opt.strike;
        S.cashflow('assignment', feed.toUSD(cashNative, pos.ccy) ?? cashNative,
          `${qty > 0 ? 'Exercised' : 'Assigned'} ${book.describe(pos)}`, { at });
        events.push({ at, kind: 'assignment', label: book.describe(pos), qty,
                      shares, strike: pos.opt.strike,
                      note: `${qty > 0 ? 'Exercised into' : 'Assigned'} ${Math.abs(shares)} shares at ${pos.opt.strike}` });
      }
      continue;
    }

    if (pos.kind === 'future' || pos.kind === 'forward') {
      if (!sameDay(pos.fut.expiry + 'T16:00:00Z', at)) continue;
      const spot = feed.price(pos.fut.underlyingId);
      if (spot == null) continue;
      const qty = book.netQty(pos);
      book.applyFill(specOf(pos), -qty, spot, 0, at);
      events.push({ at, kind: 'expiry', label: book.describe(pos), qty,
                    note: `${pos.kind === 'future' ? 'Future' : 'Forward'} settled at ${spot.toFixed(2)}` });
      continue;
    }

    if (pos.kind === 'bond') {
      const spec = bondSpec(pos.instrumentId);
      if (!spec || !sameDay(spec.maturity + 'T00:00:00Z', at)) continue;
      const qty = book.netQty(pos);
      book.applyFill(specOf(pos), -qty, spec.par, 0, at);
      const redemption = qty * spec.par;
      S.cashflow('redemption', feed.toUSD(redemption, spec.ccy) ?? redemption,
        `${spec.name} redeemed at par`, { at });
      events.push({ at, kind: 'redemption', label: spec.name, qty, note: 'Redeemed at par' });
    }
  }
  return events;
}

/** Rebuild a fill spec from an existing position. */
function specOf(pos) {
  return { instrumentId: pos.instrumentId, kind: pos.kind, cls: pos.cls,
           mkt: pos.mkt, ccy: pos.ccy, opt: pos.opt, fut: pos.fut };
}

/** Everything expiring inside the next N days - the warning list on PORT. */
export function upcoming(days = 14) {
  const acct = S.get();
  const horizon = Date.now() + days * 86400000;
  const out = [];
  for (const pos of acct.positions) {
    const expiry = pos.opt?.expiry || pos.fut?.expiry
      || (pos.kind === 'bond' ? bondSpec(pos.instrumentId)?.maturity : null);
    if (!expiry) continue;
    const when = new Date(expiry + 'T16:00:00Z').getTime();
    if (when <= horizon) {
      out.push({ pos, expiry, when, days: (when - Date.now()) / 86400000,
                 label: book.describe(pos) });
    }
  }
  return out.sort((a, b) => a.when - b.when);
}

/** Manual early exercise on an American long option. */
export function exercise(positionKey) {
  const pos = book.findPosition(positionKey);
  if (!pos || pos.kind !== 'option') throw new Error('Not an option position.');
  const qty = book.netQty(pos);
  if (qty <= 0) throw new Error('You can only exercise a long option. Short options get assigned to you.');
  const u = lookup(pos.opt.underlyingId);
  if (styleFor(u) !== 'A') throw new Error('European options cannot be exercised before expiry.');
  const spot = feed.price(pos.opt.underlyingId);
  if (spot == null) throw new Error('No underlying price available.');
  const evs = [];
  const mult = pos.opt.mult || 100;
  const shares = qty * mult * (pos.opt.type === 'C' ? 1 : -1);
  const intrinsic = pos.opt.type === 'C' ? spot - pos.opt.strike : pos.opt.strike - spot;
  book.applyFill(specOf(pos), -qty, Math.max(0, intrinsic), 0, Date.now());
  book.applyFill({ instrumentId: u.id, kind: 'equity', cls: u.cls, mkt: u.mkt, ccy: u.ccy },
    shares, pos.opt.strike, 0, Date.now());
  const cashNative = -shares * pos.opt.strike;
  S.cashflow('assignment', feed.toUSD(cashNative, pos.ccy) ?? cashNative,
    `Exercised ${book.describe(pos)}`, {});
  S.save(); S.emit('exercise');
  evs.push({ kind: 'exercise', shares, strike: pos.opt.strike });
  return evs;
}
