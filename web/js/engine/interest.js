// Borrowing costs.
//
// The lesson this whole platform exists to teach: leverage is a loan, a loan
// has a price, and the price compounds every single night whether the trade is
// working or not. Interest accrues daily, is charged monthly, and the tier
// spread rises as the debt does - so borrowing more costs more per dollar.

import * as S from './state.js';
import * as book from './book.js';
import { curveRate } from './book.js';

/** Spread over the base rate, by size of debit. Bigger hole, worse terms. */
export const TIERS = [
  { upTo: 10000,   spread: 3.5 },
  { upTo: 50000,   spread: 2.5 },
  { upTo: 250000,  spread: 1.5 },
  { upTo: Infinity, spread: 1.0 },
];

/** Base rate tracks the live short end, so real policy moves change your carry. */
export function baseRate() {
  return curveRate('USD', 0.25) * 100;
}

export function tierFor(debit) {
  return TIERS.find((t) => debit <= t.upTo) || TIERS[TIERS.length - 1];
}

/** Blended annual rate on the current debit, in percent. */
export function rateFor(debit) {
  if (debit <= 0) return 0;
  const base = baseRate();
  let remaining = debit, weighted = 0, prev = 0;
  for (const t of TIERS) {
    const slice = Math.min(remaining, t.upTo - prev);
    if (slice <= 0) break;
    weighted += slice * (base + t.spread);
    remaining -= slice;
    prev = t.upTo;
    if (remaining <= 0) break;
  }
  return weighted / debit;
}

/** Credit interest on idle cash - deliberately meagre, as at a real broker. */
export function creditRate() {
  return Math.max(0, baseRate() - 2.0);
}

export function currentDebit() {
  const acct = S.get();
  return Math.max(0, acct.borrowed + Math.max(0, -acct.cash));
}

/** What today costs. This is the number the cost-of-capital panel leads with. */
export function dailyCost() {
  const debit = currentDebit();
  if (debit <= 0) {
    const idle = Math.max(0, S.get().cash);
    return { debit: 0, rate: 0, perDay: 0, credit: idle * (creditRate() / 100) / 365 };
  }
  const rate = rateFor(debit);
  return { debit, rate, perDay: debit * (rate / 100) / 365, credit: 0,
           tier: tierFor(debit), base: baseRate() };
}

/** Accrue one day. Called by the deterministic clock, once per elapsed day. */
export function accrueDay(at = Date.now()) {
  const acct = S.get();
  const d = dailyCost();
  if (d.perDay > 0) {
    acct.accruedInterest += d.perDay;
    return { charged: d.perDay, rate: d.rate, at };
  }
  if (d.credit > 0.005) {
    S.cashflow('interest_credit', d.credit, `Credit interest at ${creditRate().toFixed(2)}%`, { at });
    return { credited: d.credit, at };
  }
  return null;
}

/** Sweep accrued interest into cash. Monthly, like a statement. */
export function chargeAccrued(at = Date.now()) {
  const acct = S.get();
  if (acct.accruedInterest < 0.005) return null;
  const amount = acct.accruedInterest;
  acct.accruedInterest = 0;
  S.cashflow('interest_charge', -amount,
    `Margin and borrow interest for the period`, { at, deductible: true });
  return amount;
}

/** Draw down the borrow facility. Cash goes up, and so does what you owe. */
export function borrow(amount, at = Date.now()) {
  const acct = S.get();
  if (!acct.config.borrowEnabled) throw new Error('Borrowing is disabled in SET.');
  if (!(amount > 0)) throw new Error('Borrow amount must be positive.');
  acct.borrowed += amount;
  S.cashflow('borrow', amount, `Drew ${amount.toFixed(2)} on the borrow facility`, { at });
  return { borrowed: acct.borrowed, rate: rateFor(currentDebit()) };
}

export function repay(amount, at = Date.now()) {
  const acct = S.get();
  const pay = Math.min(amount, acct.borrowed);
  if (!(pay > 0)) throw new Error('Nothing outstanding to repay.');
  if (pay > acct.cash) throw new Error('Not enough cash to repay that much.');
  acct.borrowed -= pay;
  S.cashflow('repay', -pay, `Repaid ${pay.toFixed(2)} of borrowings`, { at });
  return { borrowed: acct.borrowed };
}

/**
 * Break-even: how far the book must move, in percent, just to cover the carry.
 * When this number gets large, the position is being taxed by time itself.
 */
export function breakEven(horizonDays = 30) {
  const d = dailyCost();
  const sum = book.summary();
  const cost = d.perDay * horizonDays;
  return {
    cost, horizonDays,
    pctOfEquity: book.equity() > 0 ? (cost / book.equity()) * 100 : null,
    pctMove: sum.grossExposure > 0 ? (cost / sum.grossExposure) * 100 : null,
  };
}

/** Days of runway before interest alone wipes the account out. */
export function runway() {
  const d = dailyCost();
  const eq = book.equity();
  if (d.perDay <= 0) return Infinity;
  if (eq <= 0) return 0;
  return eq / d.perDay;
}
