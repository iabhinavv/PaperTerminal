// Account pages: PORT, BLOT, PNL, ALRT.

import { el, table, empty, sect, kv, clear, toast, modal, closeModal } from '../util/dom.js';
import { px, num, pct, money, dir, age, dtstamp, abbr } from '../util/fmt.js';
import { register, live, open as openPanel } from '../panels.js';
import * as feed from '../market/feed.js';
import * as book from '../engine/book.js';
import * as margin from '../engine/margin.js';
import * as matching from '../engine/matching.js';
import * as settlement from '../engine/settlement.js';
import * as stats from '../analytics/stats.js';
import * as S from '../engine/state.js';
import { lookup } from '../market/universe.js';
import { openTicket } from './ticket.js';
import { lineChart, barRow } from './chartlib.js';

register({
  code: 'PORT', name: 'PORTFOLIO', group: 'ACCOUNT',
  render(panel) {
    const host = el('div');
    panel.body.append(host);

    const paint = () => {
      const acct = S.get();
      const sum = book.summary();
      const st = margin.status();
      const ids = new Set();
      for (const r of sum.rows) {
        ids.add(r.pos.opt?.underlyingId || r.pos.fut?.underlyingId || r.pos.instrumentId);
      }
      feed.subscribe([...ids]);

      clear(host);
      host.append(sect('ACCOUNT'));
      host.append(kv([
        ['Net equity', `<span class="hl" style="font-size:14px">${money(st.equity, 'USD')}</span>`],
        ['Cash', `<span class="${acct.cash < 0 ? 'down' : ''}">${money(acct.cash, 'USD')}</span>`],
        ['Borrowed', acct.borrowed > 0 ? `<span class="down">${money(acct.borrowed, 'USD')}</span>` : money(0, 'USD')],
        ['Accrued interest', acct.accruedInterest > 0 ? `<span class="warn">${money(-acct.accruedInterest, 'USD')}</span>` : money(0, 'USD')],
        ['Positions market value', money(sum.positionsMV, 'USD')],
        ['Unrealised P&L', `<span class="${dir(sum.unrealised)}">${money(sum.unrealised, 'USD')}</span>`],
        ['Realised P&L', `<span class="${dir(sum.realised)}">${money(sum.realised, 'USD')}</span>`],
        ['Buying power', money(st.buyingPower, 'USD')],
        ['Gross exposure', `${money(st.grossExposure, 'USD')} <span class="dim">${num(st.leverage, 2)}x</span>`],
      ]));

      if (st.call) {
        host.append(el('div', { class: 'empty', style: 'color:var(--red);border-left:3px solid var(--red);padding-left:8px',
          html: `<b>MARGIN CALL.</b> Maintenance requirement exceeds equity by ` +
                `${money(st.call.shortfall, 'USD')}. Deposit, close positions, or the book ` +
                `gets liquidated largest-first. See <b>MARG</b>.` }));
      }
      if (st.pdt.restricted) {
        host.append(el('div', { class: 'empty', style: 'color:var(--yellow)',
          html: `<b>PDT RESTRICTED.</b> ${st.pdt.count} day trades in five business days on ` +
                `an account under $25,000. Opening day trades are blocked; closing is allowed.` }));
      }

      const expiring = settlement.upcoming(14);
      if (expiring.length) {
        host.append(sect('EXPIRING WITHIN 14 DAYS'));
        host.append(table([
          { label: 'CONTRACT', get: (r) => `<span class="sym">${r.label}</span>` },
          { label: 'EXPIRY', get: (r) => r.expiry },
          { label: 'DAYS', get: (r) => num(r.days, 1), cls: (r) => (r.days < 3 ? 'down' : 'warn') },
          { label: 'QTY', get: (r) => num(book.netQty(r.pos), 2) },
        ], expiring));
      }

      host.append(sect(`POSITIONS (${sum.rows.length})`));
      if (!sum.rows.length) {
        host.append(empty('No open positions.',
          'Load a security with <b>DES</b> and hit <b>BUY</b>, or press <b>GO</b> on any board row.'));
      } else {
        host.append(table([
          { label: 'POSITION', get: (r) => `<span class="sym">${book.describe(r.pos)}</span>` },
          { label: 'CLS', get: (r) => r.pos.kind.slice(0, 4).toUpperCase(), cls: () => 'dim' },
          { label: 'MKT', get: (r) => r.pos.mkt, cls: () => 'dim' },
          { label: 'QTY', get: (r) => num(r.qty, 4), cls: (r) => (r.qty < 0 ? 'down' : '') },
          { label: 'AVG', get: (r) => px(book.avgPrice(r.pos), r.pos.ccy) },
          { label: 'MARK', get: (r) => px(r.mark, r.pos.ccy), cls: () => 'hl' },
          { label: 'MV USD', get: (r) => money(r.mvUSD, 'USD') },
          { label: 'UNREAL', get: (r) => money(r.usd, 'USD'), cls: (r) => dir(r.usd) },
          { label: '%', get: (r) => {
              const cost = Math.abs(book.avgPrice(r.pos) * r.qty * r.mult);
              return cost ? pct((r.native / cost) * 100) : '—';
            }, cls: (r) => dir(r.usd) },
          { label: 'LOTS', get: (r) => String(r.pos.lots.length), cls: () => 'dim' },
          { label: '', get: (r) => {
              const b = el('div', { style: 'display:flex;gap:3px;justify-content:flex-end' },
                el('button', { class: 'btn', style: 'padding:0 5px',
                  onclick: (e) => { e.stopPropagation(); closePosition(r.pos); } }, 'CLOSE'),
                el('button', { class: 'btn', style: 'padding:0 5px',
                  onclick: (e) => { e.stopPropagation(); stopDialog(r.pos); } }, 'STOP'));
              return b;
            } },
        ], sum.rows, { onRow: (r) => openPanel('DES', r.pos.opt?.underlyingId || r.pos.instrumentId) }));
      }

      const working = acct.orders.filter((o) => o.status === 'WORKING');
      host.append(sect(`WORKING ORDERS (${working.length})`));
      if (!working.length) host.append(empty('No resting orders.'));
      else host.append(table([
        { label: 'ORDER', get: (o) => `<span class="sym">${o.label}</span>` },
        { label: 'TYPE', get: (o) => o.type },
        { label: 'STOP', get: (o) => (o.stop != null ? num(o.stop, 4) : '—') },
        { label: 'LIMIT', get: (o) => (o.limit != null ? num(o.limit, 4) : '—') },
        { label: 'PLACED', get: (o) => dtstamp(o.at), cls: () => 'dim' },
        { label: '', get: (o) => el('button', { class: 'btn', style: 'padding:0 5px',
            onclick: () => { matching.cancelOrder(o.id); toast('Order cancelled'); paint(); } }, 'CANCEL') },
      ], working));

      panel.meta(`EQ ${money(st.equity, 'USD')} · ${sum.rows.length} POS`);
    };

    live(panel, paint, 1500);
    panel.onCleanup(S.onChange(paint));
    panel.onCleanup(feed.onTick(paint));
  },
});

function closePosition(pos) {
  const qty = book.netQty(pos);
  const target = pos.kind === 'option'
    ? { kind: 'option', underlyingId: pos.opt.underlyingId, type: pos.opt.type,
        strike: pos.opt.strike, expiry: pos.opt.expiry, style: pos.opt.style }
    : (pos.kind === 'future' || pos.kind === 'forward')
    ? { kind: pos.kind, underlyingId: pos.fut.underlyingId, expiry: pos.fut.expiry, mult: pos.fut.mult }
    : pos.instrumentId;
  openTicket(target, qty > 0 ? 'SELL' : 'BUY', Math.abs(qty));
}

function stopDialog(pos) {
  const body = el('div');
  const pctInput = el('input', { class: 'f', type: 'number', value: '8', step: '0.5' });
  const kindSel = el('select', { class: 'f' },
    el('option', { value: 'STP' }, 'Stop (fixed)'),
    el('option', { value: 'TRAIL' }, 'Trailing stop'));
  body.append(
    el('div', { class: 'empty', html:
      `Protective stop on <b>${book.describe(pos)}</b>. A fixed stop sits at a set price; ` +
      `a trailing stop follows the mark up and locks in gains. Both become market orders ` +
      `when hit, so they cross the spread.` }),
    el('div', { style: 'display:grid;grid-template-columns:80px 1fr;gap:4px 8px;align-items:center' },
      el('span', { class: 'dim', text: 'DISTANCE %' }), pctInput,
      el('span', { class: 'dim', text: 'TYPE' }), kindSel),
    el('div', { style: 'display:flex;gap:6px;margin-top:8px;justify-content:flex-end' },
      el('button', { class: 'btn', onclick: closeModal }, 'CANCEL'),
      el('button', { class: 'btn buy', onclick: () => {
        try {
          const o = matching.attachStop(pos.key, Number(pctInput.value), kindSel.value);
          toast(`Stop placed — ${o.label}`, 'ok');
          closeModal();
        } catch (err) { toast(err.message, 'bad'); }
      } }, 'PLACE STOP')));
  modal('ATTACH STOP LOSS', body);
}

register({
  code: 'BLOT', name: 'BLOTTER — TRADE HISTORY', group: 'ACCOUNT',
  render(panel) {
    const host = el('div');
    panel.body.append(host);
    const paint = () => {
      const acct = S.get();
      clear(host);
      const t = stats.tradeStats();
      host.append(sect('EXECUTION SUMMARY'));
      host.append(kv([
        ['Trades', String(acct.trades.length)],
        ['Closed lots', String(acct.closedLots.length)],
        ['Realised', `<span class="${dir(t.totalRealised)}">${money(t.totalRealised, 'USD')}</span>`],
        ['Commissions', money(acct.cashflows.filter((c) => c.kind === 'commission')
          .reduce((a, c) => a + Math.abs(c.amount), 0), 'USD')],
        ['Day trades (5d)', `${margin.pdtStatus().count} / 3 <span class="dim">before PDT flag</span>`],
      ]));

      host.append(sect('TRADES'));
      if (!acct.trades.length) return void host.append(empty('No trades yet.'));
      host.append(table([
        { label: 'TIME', get: (t) => dtstamp(t.at), cls: () => 'dim' },
        { label: 'INSTRUMENT', get: (t) => `<span class="sym">${t.opt
            ? `${lookup(t.instrumentId)?.sym} ${t.opt.expiry} ${t.opt.strike}${t.opt.type}`
            : t.fut ? `${lookup(t.instrumentId)?.sym} ${t.fut.expiry}`
            : lookup(t.instrumentId)?.sym || t.instrumentId}</span>` },
        { label: 'SIDE', get: (t) => (t.qty > 0 ? 'BUY' : 'SELL'), cls: (t) => (t.qty > 0 ? 'up' : 'down') },
        { label: 'QTY', get: (t) => num(Math.abs(t.qty), 4) },
        { label: 'PRICE', get: (t) => px(t.price, t.ccy) },
        { label: 'MID', get: (t) => px(t.mid, t.ccy), cls: () => 'dim' },
        { label: 'SLIP', get: (t) => (t.slip ? px(t.slip, t.ccy) : '—'), cls: () => 'dim' },
        { label: 'TYPE', get: (t) => t.orderType, cls: () => 'dim' },
        { label: 'REALISED', get: (t) => (t.closing ? money(t.realisedUSD, 'USD') : '—'),
          cls: (t) => dir(t.realisedUSD) },
        { label: 'AGE', get: (t) => (t.dataAge != null ? age(t.dataAge) : '—'), cls: () => 'dim' },
        { label: 'DT', get: (t) => (t.dayTrade ? '<span class="warn">YES</span>' : '') },
      ], acct.trades.slice(0, 300)));
    };
    live(panel, paint, 4000);
    panel.onCleanup(S.onChange(paint));
  },
});

register({
  code: 'PNL', name: 'PROFIT & LOSS ATTRIBUTION', group: 'ACCOUNT',
  render(panel) {
    const host = el('div');
    panel.body.append(host);
    const paint = () => {
      const acct = S.get();
      const sum = book.summary();
      const t = stats.tradeStats();
      const p = stats.portfolioStats();
      clear(host);

      host.append(sect('EQUITY CURVE'));
      const curve = stats.equityCurve();
      if (curve.length > 1) {
        host.append(lineChart(curve.map((c) => ({ t: c.at, v: c.equity })),
          { height: 150, area: true, baseline: acct.config.startingCash }));
      } else {
        host.append(empty('The equity curve records one point per day.',
          'Come back tomorrow, or leave the terminal closed for a while — the clock ' +
          'replays every day you were away.'));
      }

      host.append(sect('RETURN'));
      host.append(kv([
        ['Net equity', money(p.equity, 'USD')],
        ['Total contributed', money(p.deposits, 'USD')],
        ['Total return', `<span class="${dir(p.totalReturn)}">${pct(p.totalReturn * 100)}</span>`],
        ['Peak equity', money(p.peak, 'USD')],
        ['Current drawdown', `<span class="${p.currentDD > 0.1 ? 'down' : 'dim'}">${pct(-p.currentDD * 100)}</span>`],
        ['Max drawdown', `<span class="down">${pct(-p.maxDrawdown * 100)}</span>`],
        ['Annualised vol', p.annVol ? pct(p.annVol * 100) : '<span class="dim">needs 30 days</span>'],
        ['Sharpe', p.sharpe != null ? num(p.sharpe, 2) : '<span class="dim">needs 30 days</span>'],
        ['Sortino', p.sortino != null ? num(p.sortino, 2) : '<span class="dim">needs 30 days</span>'],
        ['Calmar', p.calmar != null ? num(p.calmar, 2) : '—'],
      ]));

      host.append(sect('WHERE THE MONEY WENT'));
      const flows = {};
      for (const c of acct.cashflows) flows[c.kind] = (flows[c.kind] || 0) + c.amount;
      const flowRows = Object.entries(flows).map(([kind, amount]) => ({ kind, amount }))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      const maxFlow = Math.max(...flowRows.map((f) => Math.abs(f.amount)), 1);
      host.append(table([
        { label: 'FLOW', get: (r) => ({
            trade: 'Trades', deposit: 'Weekly deposits', commission: 'Commissions',
            interest_charge: 'Interest charged', interest_credit: 'Interest earned',
            borrow: 'Borrowed', repay: 'Repaid', tax: 'Tax paid', coupon: 'Bond coupons',
            settlement: 'Option settlement', assignment: 'Assignment', redemption: 'Redemptions',
          }[r.kind] || r.kind) },
        { label: 'AMOUNT', get: (r) => money(r.amount, 'USD'), cls: (r) => dir(r.amount) },
        { label: '', get: (r) => barRow(r.amount, maxFlow, { signed: true, width: 110 }) },
      ], flowRows));

      host.append(sect('TRADE STATISTICS'));
      host.append(kv([
        ['Closed trades', String(t.n)],
        ['Win rate', t.winRate != null ? pct(t.winRate * 100, 1) : '—'],
        ['Average trade', `<span class="${dir(t.avgTrade)}">${money(t.avgTrade, 'USD')}</span>`],
        ['Average win', `<span class="up">${money(t.avgWin, 'USD')}</span>`],
        ['Average loss', `<span class="down">${money(-t.avgLoss, 'USD')}</span>`],
        ['Payoff ratio', t.payoff != null ? num(t.payoff, 2) : '—'],
        ['Expectancy', `<span class="${dir(t.expectancy)}">${money(t.expectancy, 'USD')}</span> <span class="dim">per trade</span>`],
        ['Profit factor', t.profitFactor != null ? num(t.profitFactor, 2) : '—'],
        ['Best / worst', `<span class="up">${money(t.best, 'USD')}</span> / <span class="down">${money(t.worst, 'USD')}</span>`],
        ['Average hold', t.avgHoldDays ? `${num(t.avgHoldDays, 1)} days` : '—'],
      ]));

      if (t.n) {
        host.append(sect('BY ASSET CLASS'));
        host.append(table([
          { label: 'CLASS', get: (r) => r.k.toUpperCase() },
          { label: 'TRADES', get: (r) => String(r.v.n) },
          { label: 'WIN RATE', get: (r) => pct(r.v.winRate * 100, 0) },
          { label: 'P&L', get: (r) => money(r.v.pnl, 'USD'), cls: (r) => dir(r.v.pnl) },
        ], Object.entries(t.byClass).map(([k, v]) => ({ k, v }))));
      }
    };
    live(panel, paint, 4000);
    panel.onCleanup(S.onChange(paint));
  },
});

register({
  code: 'ALRT', name: 'ALERTS & STOPS', group: 'ACCOUNT',
  render(panel) {
    const host = el('div');
    panel.body.append(host);
    const paint = () => {
      const acct = S.get();
      clear(host);
      host.append(sect('RESTING ORDERS'));
      const working = acct.orders.filter((o) => o.status === 'WORKING');
      if (!working.length) host.append(empty('Nothing resting.',
        'Attach a stop from <b>PORT</b>, or place a limit from any order ticket.'));
      else host.append(table([
        { label: 'ORDER', get: (o) => `<span class="sym">${o.label}</span>` },
        { label: 'TYPE', get: (o) => o.type },
        { label: 'TRIGGER', get: (o) => num(o.stop ?? o.limit, 4), cls: () => 'hl' },
        { label: 'MARK', get: (o) => {
            try { return num(matching.refPrice(matching.specFor(o.target)), 4); } catch { return '—'; } } },
        { label: 'DISTANCE', get: (o) => {
            try {
              const p = matching.refPrice(matching.specFor(o.target));
              const trig = o.stop ?? o.limit;
              return p && trig ? pct((trig / p - 1) * 100) : '—';
            } catch { return '—'; } }, cls: () => 'warn' },
        { label: '', get: (o) => el('button', { class: 'btn', style: 'padding:0 5px',
            onclick: () => { matching.cancelOrder(o.id); paint(); } }, 'CANCEL') },
      ], working));

      host.append(sect('ORDER HISTORY'));
      const done = acct.orders.filter((o) => o.status !== 'WORKING').slice(0, 60);
      if (!done.length) host.append(empty('No completed orders.'));
      else host.append(table([
        { label: 'ORDER', get: (o) => o.label },
        { label: 'STATUS', get: (o) => o.status,
          cls: (o) => (o.status === 'FILLED' ? 'up' : o.status === 'REJECTED' ? 'down' : 'dim') },
        { label: 'FILL', get: (o) => (o.fillPrice != null ? num(o.fillPrice, 4) : '—') },
        { label: 'WHEN', get: (o) => dtstamp(o.filledAt || o.closedAt || o.at), cls: () => 'dim' },
        { label: 'NOTE', get: (o) => o.reason || '', cls: () => 'dim' },
      ], done));
    };
    live(panel, paint, 3000);
    panel.onCleanup(S.onChange(paint));
  },
});
