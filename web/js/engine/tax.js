// US federal tax, applied per instrument class - because the same $1,000 gain
// is taxed three different ways depending on what produced it, and that
// asymmetry is invisible until you put the three side by side.
//
//   Equities   - short-term at ordinary rates, long-term at 0/15/20.
//                Wash sale rule applies.
//   Crypto     - property, so the same short/long split as equities, but
//                NO wash sale rule, because it is not a security. You can
//                harvest a loss and buy straight back in.
//   Futures and broad-based index options - Section 1256: 60% long-term and
//                40% short-term regardless of holding period, plus mark-to-
//                market on everything still open at year end.

import * as S from './state.js';
import * as feed from '../market/feed.js';
import * as book from './book.js';
import { lookup } from '../market/universe.js';

export const LTCG_BRACKETS = [
  { upTo: 49450, rate: 0 },
  { upTo: 545500, rate: 15 },
  { upTo: Infinity, rate: 20 },
];

export const NIIT_RATE = 3.8;
export const NIIT_THRESHOLD = { single: 200000, married: 250000 };
export const WASH_WINDOW_DAYS = 30;
export const CAPITAL_LOSS_CAP = 3000;   // annual offset against ordinary income

export const isSecurity = (cls) => cls === 'equity' || cls === 'index' || cls === 'bond';

/** Which of the three regimes does this closed lot fall under? */
export function regimeFor(lot) {
  if (lot.section1256) return '1256';
  if (lot.cls === 'crypto') return 'crypto';
  return 'capital';
}

export function ratesFor(config) {
  const ordinary = config.taxBracket ?? 24;
  const ltcg = config.ltcgRate ?? LTCG_BRACKETS.find((b) => b.rate >= 15).rate;
  return { ordinary, ltcg };
}

/**
 * Wash sales.
 *
 * A loss is disallowed if a substantially identical position was bought within
 * 30 days either side of the sale. The loss is not lost - it is added to the
 * basis of the replacement - but it does not shelter this year's gains, which
 * is the part that surprises people every April.
 *
 * Applies to securities and their options. Never to crypto.
 */
export function washSaleAdjust(lots) {
  const acct = S.get();
  const trades = acct.trades;
  const out = [];

  for (const lot of lots) {
    const gain = lot.grossUSD ?? lot.gross;
    if (gain >= 0 || lot.cls === 'crypto' || !isSecurity(lot.cls) && lot.kind !== 'option') {
      out.push({ ...lot, washed: false, disallowed: 0, allowed: gain });
      continue;
    }
    if (lot.section1256) { out.push({ ...lot, washed: false, disallowed: 0, allowed: gain }); continue; }

    const windowMs = WASH_WINDOW_DAYS * 86400000;
    const replacement = trades.find((t) =>
      t.key === lot.key && t.qty > 0 &&
      Math.abs(t.at - lot.closedAt) <= windowMs && t.at !== lot.closedAt);

    if (replacement) {
      out.push({ ...lot, washed: true, disallowed: Math.abs(gain), allowed: 0,
                 washedInto: replacement.id, washedAt: replacement.at });
    } else {
      out.push({ ...lot, washed: false, disallowed: 0, allowed: gain });
    }
  }
  return out;
}

/** Every open Section 1256 contract is deemed sold at year end, gain taxed now. */
export function markToMarket1256(asOf = new Date()) {
  const acct = S.get();
  const out = [];
  for (const pos of acct.positions) {
    const is1256 = pos.kind === 'future' || pos.kind === 'forward'
      || (pos.kind === 'option' && lookup(pos.opt?.underlyingId)?.cls === 'index');
    if (!is1256) continue;
    const u = book.unrealised(pos);
    if (!u.usd) continue;
    out.push({ key: pos.key, describe: book.describe(pos), gainUSD: u.usd,
               mark: u.mark, qty: u.qty, asOf: asOf.toISOString().slice(0, 10) });
  }
  return out;
}

/** Full tax computation for one calendar year. */
export function computeYear(year = new Date().getFullYear()) {
  const acct = S.get();
  const cfg = acct.config;
  const { ordinary, ltcg } = ratesFor(cfg);

  const inYear = (ts) => new Date(ts).getFullYear() === year;
  const closed = acct.closedLots.filter((l) => inYear(l.closedAt));
  const adjusted = washSaleAdjust(closed);

  const bucket = {
    equityShort: 0, equityLong: 0,
    cryptoShort: 0, cryptoLong: 0,
    s1256: 0, disallowed: 0,
  };

  for (const lot of adjusted) {
    const g = lot.allowed;
    const regime = regimeFor(lot);
    bucket.disallowed += lot.disallowed || 0;
    if (regime === '1256') bucket.s1256 += g;
    else if (regime === 'crypto') { if (lot.longTerm) bucket.cryptoLong += g; else bucket.cryptoShort += g; }
    else if (lot.longTerm) bucket.equityLong += g;
    else bucket.equityShort += g;
  }

  // Year-end mark on open 1256 positions, only for the current year.
  const mtm = year === new Date().getFullYear() ? markToMarket1256() : [];
  const mtmGain = mtm.reduce((a, m) => a + m.gainUSD, 0);
  const s1256Total = bucket.s1256 + mtmGain;
  const s1256Long = s1256Total * 0.60;
  const s1256Short = s1256Total * 0.40;

  const shortTotal = bucket.equityShort + bucket.cryptoShort + s1256Short;
  const longTotal = bucket.equityLong + bucket.cryptoLong + s1256Long;

  // Losses offset gains within, then across, character; $3,000 against ordinary income.
  let netShort = shortTotal, netLong = longTotal;
  if (netShort < 0 && netLong > 0) { const use = Math.min(-netShort, netLong); netLong -= use; netShort += use; }
  else if (netLong < 0 && netShort > 0) { const use = Math.min(-netLong, netShort); netShort -= use; netLong += use; }

  const netCapital = netShort + netLong;
  const deductibleLoss = netCapital < 0 ? Math.min(CAPITAL_LOSS_CAP, -netCapital) : 0;
  const carryforward = netCapital < 0 ? -netCapital - deductibleLoss : 0;

  const interestPaid = acct.cashflows
    .filter((c) => c.kind === 'interest_charge' && inYear(c.at))
    .reduce((a, c) => a + Math.abs(c.amount), 0);
  const investmentIncome = Math.max(0, netShort) + acct.cashflows
    .filter((c) => (c.kind === 'interest_credit' || c.kind === 'coupon') && inYear(c.at))
    .reduce((a, c) => a + c.amount, 0);
  const interestDeduction = Math.min(interestPaid, investmentIncome);

  const shortTaxable = Math.max(0, netShort) - interestDeduction;
  const shortTax = Math.max(0, shortTaxable) * (ordinary / 100);
  const longTax = Math.max(0, netLong) * (ltcg / 100);

  const niitBase = Math.max(0, netCapital);
  const niit = cfg.niitEnabled ? niitBase * (NIIT_RATE / 100) : 0;

  const commissions = acct.cashflows
    .filter((c) => c.kind === 'commission' && inYear(c.at))
    .reduce((a, c) => a + Math.abs(c.amount), 0);

  const total = shortTax + longTax + niit;
  const grossGain = shortTotal + longTotal;

  return {
    year, rates: { ordinary, ltcg, niit: cfg.niitEnabled ? NIIT_RATE : 0 },
    buckets: bucket,
    s1256: { realised: bucket.s1256, mtm: mtmGain, total: s1256Total,
             long: s1256Long, short: s1256Short, openPositions: mtm },
    netShort, netLong, netCapital, deductibleLoss, carryforward,
    washDisallowed: bucket.disallowed,
    interestPaid, interestDeduction, investmentIncome,
    commissions,
    shortTax, longTax, niit, total,
    effectiveRate: grossGain > 0 ? (total / grossGain) * 100 : 0,
    afterTax: grossGain - total,
    lots: adjusted,
  };
}

/**
 * What switching lot method would do to this year's bill.
 * The single sharpest lesson in the tax panel: same trades, different number.
 */
export function lotMethodComparison(year = new Date().getFullYear()) {
  const acct = S.get();
  const original = acct.config.lotMethod;
  const out = {};
  for (const method of ['FIFO', 'HIFO', 'LIFO']) {
    acct.config.lotMethod = method;
    out[method] = computeYear(year).total;
  }
  acct.config.lotMethod = original;
  return out;
}

/** Marginal tax on the next dollar, by regime - drives the pre-trade preview. */
export function marginalRates() {
  const { ordinary, ltcg } = ratesFor(S.get().config);
  const niit = S.get().config.niitEnabled ? NIIT_RATE : 0;
  return {
    equityShort: ordinary + niit,
    equityLong: ltcg + niit,
    cryptoShort: ordinary + niit,
    cryptoLong: ltcg + niit,
    s1256: 0.6 * ltcg + 0.4 * ordinary + niit,
  };
}

/** After-tax value of a hypothetical gain, by how it would be earned. */
export function afterTaxPreview(gainUSD) {
  const r = marginalRates();
  return Object.fromEntries(Object.entries(r).map(([k, rate]) =>
    [k, { rate, tax: gainUSD * (rate / 100), net: gainUSD * (1 - rate / 100) }]));
}

/** Charge the year's bill. Deliberately manual - you feel it leave the account. */
export function settleYear(year) {
  const acct = S.get();
  const calc = computeYear(year);
  if (acct.taxYears[year]?.settled) throw new Error(`${year} is already settled.`);
  if (calc.total <= 0) throw new Error(`No tax due for ${year}.`);
  S.cashflow('tax', -calc.total, `Federal tax on ${year} trading`, { year });
  acct.taxYears[year] = { settled: true, at: Date.now(), amount: calc.total, detail: calc };
  return calc;
}
