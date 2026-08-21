// Reg T margin, the FINRA maintenance floor, and the Pattern Day Trader rule.
//
// On a four-figure account with intraday ambitions, PDT is not a footnote -
// four day trades in five business days and the account is restricted. That is
// the single most common way a small live account gets stuck, so it is modelled
// rather than waved away.

import * as S from './state.js';
import * as book from './book.js';
import * as feed from '../market/feed.js';
import { lookup } from '../market/universe.js';
import { contractFor } from './quant/futures.js';
import { businessDaysBetween } from '../market/calendar.js';

export const PDT_EQUITY_FLOOR = 25000;
export const FINRA_MAINTENANCE = 0.25;

/** Initial margin requirement for one prospective fill, in USD. */
export function initialRequirement(spec, qty, price) {
  const cfg = S.get().config;
  const mult = spec.kind === 'option' ? (spec.opt?.mult || 100)
             : spec.kind === 'future' ? (spec.fut?.mult || 1) : 1;
  const notionalNative = Math.abs(qty) * price * mult;
  const notionalUSD = feed.toUSD(notionalNative, spec.ccy) ?? notionalNative;

  if (spec.kind === 'future' || spec.kind === 'forward') {
    const c = contractFor(spec.fut?.underlyingId);
    return Math.abs(qty) * (c ? c.initial : Math.max(500, notionalUSD * 0.1));
  }

  if (spec.kind === 'option') {
    // Long options are paid for in full - never marginable.
    if (qty > 0) return notionalUSD;
    // Naked short: the CBOE formula, 20% of underlying less out-of-the-money amount,
    // floored at 10% of underlying. This is why one short put can eat a whole account.
    const U = feed.price(spec.opt.underlyingId) || 0;
    const K = spec.opt.strike;
    const otm = spec.opt.type === 'C' ? Math.max(0, K - U) : Math.max(0, U - K);
    const underlyingNotional = U * Math.abs(qty) * mult;
    const req = Math.max(
      0.20 * underlyingNotional - otm * Math.abs(qty) * mult,
      0.10 * underlyingNotional);
    return (feed.toUSD(req + notionalNative, spec.ccy) ?? req) ;
  }

  if (spec.cls === 'crypto') return notionalUSD * 0.5;    // no Reg T; house rule
  if (spec.kind === 'bond') return notionalUSD * 0.10;
  if (spec.cls === 'fx') return notionalUSD * 0.03;       // ~33x, retail major cap

  if (!cfg.marginEnabled) return notionalUSD;
  return notionalUSD * (cfg.initialMarginPct / 100);
}

/** Maintenance requirement across all open positions, in USD. */
export function maintenanceRequirement() {
  const acct = S.get();
  const cfg = acct.config;
  let req = 0;

  for (const pos of acct.positions) {
    const qty = book.netQty(pos);
    if (!qty) continue;
    const mult = book.multiplier(pos);
    const m = book.mark(pos);
    const notionalUSD = Math.abs(feed.toUSD(qty * m * mult, pos.ccy) ?? 0);

    if (pos.kind === 'future' || pos.kind === 'forward') {
      const c = contractFor(pos.fut?.underlyingId);
      req += Math.abs(qty) * (c ? c.maint : Math.max(400, notionalUSD * 0.08));
    } else if (pos.kind === 'option') {
      if (qty < 0) {
        const U = feed.price(pos.opt.underlyingId) || 0;
        const otm = pos.opt.type === 'C' ? Math.max(0, pos.opt.strike - U) : Math.max(0, U - pos.opt.strike);
        const un = U * Math.abs(qty) * mult;
        const raw = Math.max(0.20 * un - otm * Math.abs(qty) * mult, 0.10 * un) + Math.abs(qty) * m * mult;
        req += Math.abs(feed.toUSD(raw, pos.ccy) ?? raw);
      }
    } else if (pos.cls === 'crypto') {
      req += notionalUSD * 0.30;
    } else if (pos.kind === 'bond') {
      req += notionalUSD * 0.07;
    } else if (pos.cls === 'fx') {
      req += notionalUSD * 0.02;
    } else {
      // Short stock carries a heavier floor than long stock, as it should.
      req += notionalUSD * (qty < 0 ? Math.max(0.30, cfg.maintenanceMarginPct / 100)
                                    : cfg.maintenanceMarginPct / 100);
    }
  }
  return req;
}

/** The full margin picture, which MARG renders more or less verbatim. */
export function status() {
  const acct = S.get();
  const cfg = acct.config;
  const sum = book.summary();
  const eq = book.equity();
  const maint = maintenanceRequirement();
  const excess = eq - maint;

  const debit = Math.max(0, acct.borrowed + Math.max(0, -acct.cash));
  const leverage = eq > 0 ? sum.grossExposure / eq : (sum.grossExposure > 0 ? Infinity : 0);

  const pdt = pdtStatus();
  const dayTradeBP = pdt.flagged && eq >= PDT_EQUITY_FLOOR ? Math.max(0, excess) * 4 : null;

  const initialRate = cfg.marginEnabled ? cfg.initialMarginPct / 100 : 1;

  // Two separate capacities, and conflating them is what made the borrow desk
  // useless in the first place:
  //
  //   cashAvailable - money actually sitting in the account. Always spendable,
  //                   including money drawn from the borrow facility. Reg T has
  //                   nothing to say about a cash purchase.
  //   regTBuyingPower - how far the BROKER will extend you against equity.
  //
  // Total capacity is the greater of the two, because a purchase you can pay
  // for outright never needs margin.
  const cashAvailable = Math.max(0, acct.cash);
  const regTBuyingPower = cfg.marginEnabled ? Math.max(0, excess) / initialRate : 0;
  const buyingPower = Math.max(cashAvailable, regTBuyingPower);

  return {
    equity: eq, cash: acct.cash, borrowed: acct.borrowed,
    cashAvailable, regTBuyingPower,
    accruedInterest: acct.accruedInterest, debit,
    maintenance: maint, excess, buyingPower, dayTradeBP,
    grossExposure: sum.grossExposure, netExposure: sum.netExposure, leverage,
    marginUsedPct: eq > 0 ? (maint / eq) * 100 : (maint > 0 ? Infinity : 0),
    call: excess < 0 ? { shortfall: -excess, since: acct.marginCalls.at(-1)?.at || Date.now() } : null,
    pdt,
    // How far spot has to fall, on the whole book, before maintenance bites.
    cushionPct: sum.grossExposure > 0 ? (excess / sum.grossExposure) * 100 : null,
  };
}

/** Can this order be afforded? Returns a reason string when it cannot. */
export function checkOrder(spec, qty, price) {
  const acct = S.get();
  const st = status();
  const req = initialRequirement(spec, qty, price);
  const closing = isClosing(spec, qty);

  if (closing) return { ok: true, requirement: 0, closing: true };

  // Paying cash always works, whatever Reg T thinks - that is what makes money
  // drawn from BORR actually deployable rather than decorative.
  const payableInCash = req <= st.cashAvailable;

  if (!payableInCash) {
    if (!acct.config.marginEnabled) {
      return { ok: false, requirement: req, reason:
        `Needs ${fmtUSD(req)} but cash is ${fmtUSD(acct.cash)}. Margin is off in SET — ` +
        `turn it on, or raise cash on the borrow desk with BORR.` };
    }
    if (req > st.regTBuyingPower) {
      return { ok: false, requirement: req, reason:
        `Needs ${fmtUSD(req)}. You have ${fmtUSD(st.cashAvailable)} in cash and ` +
        `${fmtUSD(st.regTBuyingPower)} of Reg T buying power. BORR raises cash, at a price.` };
    }
  }
  if (st.pdt.restricted && isDayTrade(spec)) {
    return { ok: false, requirement: req, reason:
      `Pattern Day Trader restriction: ${st.pdt.count} day trades in the last 5 business days ` +
      `on an account under ${fmtUSD(PDT_EQUITY_FLOOR)}. Closing trades are still allowed.` };
  }
  return { ok: true, requirement: req, closing: false };
}

const fmtUSD = (v) => '$' + (v ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

export function isClosing(spec, qty) {
  const pos = book.findPosition(book.positionKey(spec));
  if (!pos) return false;
  const net = book.netQty(pos);
  return net !== 0 && Math.sign(qty) !== Math.sign(net);
}

const isDayTrade = (spec) => spec.cls !== 'crypto' && spec.cls !== 'fx';

/** Round-trips in the same instrument on the same session day. */
export function recordDayTrade(spec, qty, at = Date.now()) {
  const acct = S.get();
  if (!isDayTrade(spec) || !isClosing(spec, qty)) return false;
  const key = book.positionKey(spec);
  const day = new Date(at).toDateString();
  const openedToday = acct.trades.some((t) =>
    t.key === key && new Date(t.at).toDateString() === day && !t.closing);
  if (!openedToday) return false;
  acct.dayTrades.push({ at, key });
  return true;
}

export function pdtStatus() {
  const acct = S.get();
  if (!acct.config.pdtEnabled) {
    return { count: 0, flagged: false, restricted: false, remaining: Infinity, window: [] };
  }
  const now = Date.now();
  const window = acct.dayTrades.filter((d) => businessDaysBetween(new Date(d.at), new Date(now)) < 5);
  acct.dayTrades = window;
  const count = window.length;
  const eq = book.equity();
  const flagged = count >= 4 || acct.flags.pdtFlagged;
  if (count >= 4) acct.flags.pdtFlagged = true;
  return {
    count, flagged, window,
    restricted: flagged && eq < PDT_EQUITY_FLOOR,
    remaining: Math.max(0, 3 - count),
    equityFloor: PDT_EQUITY_FLOOR, equity: eq,
  };
}

/**
 * Force-liquidate into a maintenance breach.
 * Largest requirement first - the fastest route back over the line, and the
 * same brutal order a real broker uses.
 */
export function liquidationCandidates() {
  const acct = S.get();
  return acct.positions
    .map((pos) => {
      const qty = book.netQty(pos);
      const mult = book.multiplier(pos);
      const mv = Math.abs(feed.toUSD(qty * book.mark(pos) * mult, pos.ccy) ?? 0);
      return { pos, qty, mv, label: book.describe(pos) };
    })
    .filter((c) => c.qty !== 0)
    .sort((a, b) => b.mv - a.mv);
}
