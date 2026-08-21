// The deterministic clock.
//
// Interest, the weekly deposit, bond coupons and option expiry all have to
// happen whether or not the tab is open. Rather than run a daemon, the account
// stores the last timestamp it processed and REPLAYS the gap on load, one day
// at a time, in a fixed order.
//
// Two consequences worth knowing. Same input always produces the same account,
// so nothing drifts. And you can shut the terminal for a month, come back, and
// see exactly what thirty nights of carry did to your equity - which is the
// entire point of the borrow feature.

import * as S from './state.js';
import * as interest from './interest.js';
import * as settlement from './settlement.js';
import * as book from './book.js';

const DAY = 86400000;

const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Replay every whole day between lastTick and now. Returns what happened. */
export function catchUp(now = Date.now()) {
  const acct = S.get();
  const events = [];
  let cursor = startOfDay(acct.lastTick || now);
  const today = startOfDay(now);

  // A cold account, or a clock that went backwards. Don't invent history.
  if (!acct.lastTick || cursor > today) {
    acct.lastTick = now;
    S.save();
    return { days: 0, events };
  }

  let days = 0;
  const MAX_REPLAY = 1200;   // ~3 years, enough for any realistic gap

  while (cursor < today && days < MAX_REPLAY) {
    cursor += DAY;
    days++;
    const at = cursor;
    const d = new Date(at);

    // 1. Interest accrues every calendar day, weekends included. Debt does not rest.
    const acc = interest.accrueDay(at);
    if (acc?.charged) events.push({ at, kind: 'interest', amount: acc.charged, rate: acc.rate });
    if (acc?.credited) events.push({ at, kind: 'credit', amount: acc.credited });

    // 2. Sweep accrued interest into cash on the first of the month.
    if (d.getDate() === 1) {
      const charged = interest.chargeAccrued(at);
      if (charged) events.push({ at, kind: 'interest_charge', amount: charged });
    }

    // 3. Weekly deposit.
    if (d.getDay() === (acct.config.inflowDay ?? 1)) {
      const amount = acct.config.weeklyInflow || 0;
      if (amount > 0) {
        S.cashflow('deposit', amount, 'Weekly cash inflow', { at });
        acct.lastInflow = at;
        events.push({ at, kind: 'deposit', amount });
      }
    }

    // 4. Coupons on any bonds held.
    for (const ev of settlement.couponsDue(at)) {
      S.cashflow('coupon', ev.amountUSD, `Coupon on ${ev.name}`, { at });
      events.push({ at, kind: 'coupon', amount: ev.amountUSD, name: ev.name });
    }

    // 5. Expiry and assignment.
    for (const ev of settlement.expireOn(at)) events.push(ev);

    // 6. Record the equity curve once a day, for the drawdown and Sharpe stats.
    const eq = book.equity();
    acct.stats.equityCurve.push({ at, equity: eq });
    if (acct.stats.equityCurve.length > 2000) acct.stats.equityCurve.splice(0, 500);
    if (eq > acct.stats.peakEquity) acct.stats.peakEquity = eq;
    const dd = acct.stats.peakEquity > 0 ? (acct.stats.peakEquity - eq) / acct.stats.peakEquity : 0;
    if (dd > acct.stats.maxDrawdown) acct.stats.maxDrawdown = dd;
  }

  acct.lastTick = now;
  S.save();
  if (events.length) S.emit('clock');
  return { days, events };
}

/** A readable summary of a catch-up, for the toast on load. */
export function summarise(result) {
  if (!result.days) return null;
  const by = {};
  for (const e of result.events) {
    by[e.kind] = by[e.kind] || { n: 0, amount: 0 };
    by[e.kind].n++;
    by[e.kind].amount += e.amount || 0;
  }
  const bits = [];
  if (by.deposit) bits.push(`${by.deposit.n} weekly deposit${by.deposit.n > 1 ? 's' : ''} totalling $${by.deposit.amount.toFixed(0)}`);
  if (by.interest) bits.push(`$${by.interest.amount.toFixed(2)} interest accrued`);
  if (by.interest_charge) bits.push(`$${by.interest_charge.amount.toFixed(2)} swept from cash`);
  if (by.coupon) bits.push(`$${by.coupon.amount.toFixed(2)} in coupons`);
  if (by.expiry) bits.push(`${by.expiry.n} contract${by.expiry.n > 1 ? 's' : ''} expired`);
  if (by.assignment) bits.push(`${by.assignment.n} assignment${by.assignment.n > 1 ? 's' : ''}`);
  if (!bits.length) return `${result.days} day${result.days > 1 ? 's' : ''} replayed, nothing to settle.`;
  return `${result.days} day${result.days > 1 ? 's' : ''} replayed: ${bits.join(', ')}.`;
}

/** Live tick: sweep working orders and refresh marks. No day-level side effects. */
export function tick() {
  const acct = S.get();
  const now = Date.now();
  if (startOfDay(now) > startOfDay(acct.lastTick)) return catchUp(now);
  acct.lastTick = now;
  return null;
}
