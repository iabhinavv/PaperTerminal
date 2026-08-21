// Trade and portfolio statistics.
//
// The numbers that tell you whether an edge exists: win rate is the one people
// look at and the one that matters least. Expectancy, average risk per trade and
// the drawdown are what decide whether an account survives.

import * as S from '../engine/state.js';
import * as book from '../engine/book.js';
import * as feed from '../market/feed.js';
import { atmVol, cachedRealised } from '../engine/quant/vol.js';
import { lookup } from '../market/universe.js';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** Per-trade statistics, computed from realised lots. */
export function tradeStats() {
  const acct = S.get();
  const lots = acct.closedLots;
  if (!lots.length) {
    return { n: 0, wins: 0, losses: 0, winRate: null, avgWin: 0, avgLoss: 0,
             expectancy: 0, profitFactor: null, best: null, worst: null,
             avgHoldDays: 0, totalRealised: 0, payoff: null, avgTrade: 0 };
  }

  const pnls = lots.map((l) => l.grossUSD ?? l.gross);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const winRate = pnls.length ? wins.length / pnls.length : 0;

  return {
    n: pnls.length, wins: wins.length, losses: losses.length, winRate,
    avgWin, avgLoss, avgTrade: mean(pnls),
    // Expectancy: what one more trade is worth on average, given this edge.
    expectancy: winRate * avgWin - (1 - winRate) * avgLoss,
    payoff: avgLoss > 0 ? avgWin / avgLoss : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    best: Math.max(...pnls), worst: Math.min(...pnls),
    grossWin, grossLoss, totalRealised: grossWin - grossLoss,
    avgHoldDays: mean(lots.map((l) => l.heldDays)),
    stdev: sd(pnls),
    byClass: groupBy(lots, (l) => l.cls),
    byRegime: groupBy(lots, (l) => (l.section1256 ? '1256' : l.cls === 'crypto' ? 'crypto' : l.longTerm ? 'long-term' : 'short-term')),
  };
}

function groupBy(lots, keyFn) {
  const out = {};
  for (const l of lots) {
    const k = keyFn(l) || 'other';
    out[k] = out[k] || { n: 0, pnl: 0, wins: 0 };
    out[k].n++;
    const p = l.grossUSD ?? l.gross;
    out[k].pnl += p;
    if (p > 0) out[k].wins++;
  }
  for (const v of Object.values(out)) v.winRate = v.n ? v.wins / v.n : 0;
  return out;
}

/** Daily returns off the recorded equity curve. */
export function returns() {
  const curve = S.get().stats.equityCurve;
  const out = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].equity, now = curve[i].equity;
    if (prev > 0 && isFinite(now)) out.push(now / prev - 1);
  }
  return out;
}

/** Portfolio risk. Sharpe and Sortino need ~30 days of curve before they mean much. */
export function portfolioStats() {
  const acct = S.get();
  const r = returns();
  const eq = book.equity();
  const curve = acct.stats.equityCurve;

  const dailyVol = sd(r);
  const annVol = dailyVol * Math.sqrt(252);
  const avgDaily = mean(r);
  const rf = 0.04 / 252;
  const downside = r.filter((x) => x < 0);
  const downVol = sd(downside) * Math.sqrt(252);

  let peak = -Infinity, maxDD = 0, ddStart = null, worstFrom = null, worstTo = null;
  for (const p of curve) {
    if (p.equity > peak) { peak = p.equity; ddStart = p.at; }
    const dd = peak > 0 ? (peak - p.equity) / peak : 0;
    if (dd > maxDD) { maxDD = dd; worstFrom = ddStart; worstTo = p.at; }
  }

  const deposits = acct.cashflows.filter((c) => c.kind === 'deposit')
    .reduce((a, c) => a + c.amount, 0) + (acct.config.startingCash || 0);
  const netContributed = deposits;

  return {
    equity: eq, deposits: netContributed,
    totalReturn: netContributed > 0 ? (eq - netContributed) / netContributed : 0,
    dailyVol, annVol,
    sharpe: dailyVol > 0 ? (avgDaily - rf) / dailyVol * Math.sqrt(252) : null,
    sortino: downVol > 0 ? (avgDaily * 252 - 0.04) / downVol : null,
    maxDrawdown: Math.max(maxDD, acct.stats.maxDrawdown || 0),
    ddFrom: worstFrom, ddTo: worstTo,
    currentDD: acct.stats.peakEquity > 0 ? (acct.stats.peakEquity - eq) / acct.stats.peakEquity : 0,
    peak: acct.stats.peakEquity,
    samples: r.length,
    calmar: maxDD > 0 && netContributed > 0 ? ((eq - netContributed) / netContributed) / maxDD : null,
  };
}

/**
 * Portfolio volatility from position weights and each name's own vol.
 * Correlation is approximated: same market and same asset class cluster
 * together, which is crude but catches the "I own ten tech stocks and thought
 * I was diversified" case that matters most.
 */
export function portfolioRisk() {
  const acct = S.get();
  const sum = book.summary();
  const eq = book.equity();
  const legs = [];

  for (const row of sum.rows) {
    const pos = row.pos;
    const id = pos.kind === 'option' || pos.kind === 'future' || pos.kind === 'forward'
      ? (pos.opt?.underlyingId || pos.fut?.underlyingId) : pos.instrumentId;
    const inst = lookup(id);
    if (!inst) continue;
    let exposure = row.mvUSD;
    if (pos.kind === 'option') {
      book.mark(pos);
      const g = pos.lastGreeks;
      const S0 = feed.price(id) || 0;
      exposure = feed.toUSD((g?.delta || 0) * row.qty * row.mult * S0, pos.ccy) ?? 0;
    }
    legs.push({ id, inst, exposure, vol: atmVol(id), cls: inst.cls, mkt: inst.mkt,
                sector: inst.sector || inst.cls, label: book.describe(pos) });
  }

  const corr = (a, b) => {
    if (a.id === b.id) return 1;
    if (a.cls === 'crypto' && b.cls === 'crypto') return 0.82;
    if (a.cls === 'fx' && b.cls === 'fx') return 0.45;
    if (a.sector && a.sector === b.sector && a.mkt === b.mkt) return 0.72;
    if (a.mkt === b.mkt && a.cls === b.cls) return 0.58;
    if (a.cls === b.cls) return 0.40;
    return 0.18;
  };

  let variance = 0;
  for (const a of legs) for (const b of legs) {
    variance += a.exposure * b.exposure * a.vol * b.vol * corr(a, b);
  }
  const portVol = Math.sqrt(Math.max(0, variance));
  const dailyVol = portVol / Math.sqrt(252);

  // Marginal contribution: whose position is actually driving the risk.
  const contributions = legs.map((leg) => {
    let cov = 0;
    for (const other of legs) cov += other.exposure * other.vol * corr(leg, other);
    const mctr = leg.vol * cov;
    return { ...leg, contribution: portVol > 0 ? mctr / portVol : 0,
             pctOfRisk: variance > 0 ? (leg.exposure * mctr) / variance * 100 : 0 };
  }).sort((a, b) => Math.abs(b.pctOfRisk) - Math.abs(a.pctOfRisk));

  return {
    legs, contributions,
    annualVol: portVol, annualVolPct: eq > 0 ? (portVol / eq) * 100 : null,
    dailyVol, dailyVolPct: eq > 0 ? (dailyVol / eq) * 100 : null,
    var95: 1.645 * dailyVol, var99: 2.326 * dailyVol,
    // Expected shortfall: the average loss on the days that breach VaR.
    cvar95: 2.063 * dailyVol,
    equity: eq, gross: sum.grossExposure, net: sum.netExposure,
  };
}

/** What a given move in everything does to equity - the stress row on RISK. */
export function stressTest(shocks = [-20, -10, -5, -2, 2, 5, 10, 20]) {
  const acct = S.get();
  const eq = book.equity();
  const risk = portfolioRisk();
  const beta = risk.legs.reduce((a, l) => a + l.exposure, 0);

  return shocks.map((pct) => {
    let pnl = 0;
    for (const row of book.summary().rows) {
      const pos = row.pos;
      if (pos.kind === 'option') {
        book.mark(pos);
        const g = pos.lastGreeks;
        if (!g) continue;
        const id = pos.opt.underlyingId;
        const S0 = feed.price(id) || 0;
        const dS = S0 * (pct / 100);
        // Second order: delta plus half gamma squared. Gamma is why short
        // options look fine at -2% and are ruinous at -20%.
        const change = (g.delta * dS + 0.5 * g.gamma * dS * dS) * row.qty * row.mult;
        pnl += feed.toUSD(change, pos.ccy) ?? 0;
      } else if (pos.kind !== 'bond') {
        pnl += row.mvUSD * (pct / 100);
      }
    }
    return { shock: pct, pnl, equityAfter: eq + pnl,
             pctOfEquity: eq > 0 ? (pnl / eq) * 100 : null };
  });
}

/** Realised vs implied for a name - is premium cheap or dear right now? */
export function volComparison(instrumentId) {
  const realised = cachedRealised(instrumentId);
  const implied = atmVol(instrumentId);
  return { realised, implied,
           premium: realised ? (implied / realised - 1) * 100 : null,
           spread: realised ? implied - realised : null };
}

/** Equity curve resampled for the chart. */
export function equityCurve(maxPoints = 260) {
  const curve = S.get().stats.equityCurve;
  if (curve.length <= maxPoints) return curve;
  const step = Math.ceil(curve.length / maxPoints);
  return curve.filter((_, i) => i % step === 0 || i === curve.length - 1);
}
