// Market boards: WEI, CRYP, FXIP, YCRV, W, MOST.
// These are the panels that make the terminal feel alive before you place a trade.

import { el, table, empty, sect, clear } from '../util/dom.js';
import { px, pct, num, abbr, dir, age, money } from '../util/fmt.js';
import { register, live } from '../panels.js';
import * as feed from '../market/feed.js';
import { INDICES, CRYPTO, FX, MARKETS, MARKET_ORDER, lookup, BONDS } from '../market/universe.js';
import { session, sessionFor } from '../market/calendar.js';
import { curvePoints, bondPrice } from '../engine/quant/bonds.js';
import * as S from '../engine/state.js';
import { lineChart } from './chartlib.js';
import { openTicket } from './ticket.js';

const quoteCols = (showMkt = true) => [
  { label: 'SYMBOL', get: (r) => `<span class="sym">${r.inst.sym}</span>` },
  { label: 'NAME', get: (r) => `<span class="dim">${r.inst.name}</span>` },
  showMkt ? { label: 'MKT', get: (r) => r.inst.mkt } : null,
  { label: 'LAST', get: (r) => px(r.q?.price, r.inst.ccy), cls: () => 'hl' },
  { label: 'CHG', get: (r) => (r.q ? num(r.q.change, 2) : '—'), cls: (r) => dir(r.q?.change) },
  { label: '%CHG', get: (r) => pct(r.q?.changePct), cls: (r) => dir(r.q?.changePct) },
  { label: 'CCY', get: (r) => r.inst.ccy },
  { label: 'STATUS', get: (r) => {
      const s = sessionFor(r.inst);
      return `<span class="tag ${s.state === 'open' ? 'open' : s.state === 'pre' || s.state === 'post' ? 'pre' : 'closed'}">${s.label}</span>`;
    } },
  { label: 'AGE', get: (r) => (r.q ? age((Date.now() - r.q.recvAt) / 1000) : '—'),
    cls: (r) => (r.q && Date.now() - r.q.recvAt > 300000 ? 'warn' : 'dim') },
  { label: 'SRC', get: (r) => (r.q?.demo
      ? '<span class="down">DEMO</span>'
      : `<span class="dim">${(r.q?.source || '').split('(')[0] || '—'}</span>`),
    tip: (r) => (r.q?.demo
      ? 'Synthetic price — no provider covered this symbol'
      : 'Live provider that answered for this symbol') },
].filter(Boolean);

function board(panel, instruments, opts = {}) {
  const ids = instruments.map((i) => i.id);
  panel.onCleanup(feed.subscribe(ids));
  const host = el('div');
  panel.body.append(host);

  const paint = () => {
    const rows = instruments.map((inst) => ({ inst, q: feed.quote(inst.id) }));
    if (opts.sort) rows.sort(opts.sort);
    clear(host);
    host.append(table(opts.cols || quoteCols(opts.showMkt !== false), rows, {
      onRow: (r) => openTicket(r.inst.id),
    }));
    const got = rows.filter((r) => r.q).length;
    panel.meta(`${got}/${rows.length} QUOTED · ${feed.state.source}`);
  };
  live(panel, paint, 1200);
  panel.onCleanup(feed.onTick(paint));
}

register({
  code: 'WEI', name: 'WORLD EQUITY INDICES', group: 'BOARD',
  render(panel) {
    panel.body.append(sect('BENCHMARK INDICES · TEN MARKETS'));
    board(panel, INDICES);
    panel.body.append(sect('EXCHANGE SESSIONS'));
    const host = el('div');
    panel.body.append(host);
    live(panel, () => {
      clear(host);
      const rows = MARKET_ORDER.map((code) => {
        const m = MARKETS[code], s = session(code);
        return { code, m, s };
      });
      host.append(table([
        { label: 'MKT', get: (r) => `<span class="sym">${r.code}</span>` },
        { label: 'EXCHANGE', get: (r) => `<span class="dim">${r.m.exchange}</span>` },
        { label: 'LOCAL', get: (r) => r.s.local },
        { label: 'HOURS', get: (r) => r.m.sessions.map((x) => x.join('-')).join(' / ') },
        { label: 'CCY', get: (r) => r.m.ccy },
        { label: 'SETTLE', get: (r) => r.m.settle },
        { label: 'STATE', get: (r) =>
            `<span class="tag ${r.s.state === 'open' ? 'open' : r.s.state === 'pre' ? 'pre' : 'closed'}">${r.s.label}</span>` },
        { label: 'NEXT', get: (r) => (r.s.minutesToChange != null
            ? `${Math.floor(r.s.minutesToChange / 60)}h${String(r.s.minutesToChange % 60).padStart(2, '0')}m` : '—'),
          cls: () => 'dim' },
      ], rows));
    }, 5000);
  },
});

register({
  code: 'CRYP', name: 'CRYPTO MONITOR — TOP 25', group: 'BOARD',
  render(panel) {
    board(panel, CRYPTO, {
      showMkt: false,
      cols: [
        { label: '#', get: (_r, i) => `<span class="dim">${i + 1}</span>` },
        { label: 'SYM', get: (r) => `<span class="sym">${r.inst.sym}</span>` },
        { label: 'NAME', get: (r) => `<span class="dim">${r.inst.name}</span>` },
        { label: 'LAST', get: (r) => px(r.q?.price, 'USD'), cls: () => 'hl' },
        { label: '24H CHG', get: (r) => (r.q ? num(r.q.change, r.q.price < 1 ? 6 : 2) : '—'),
          cls: (r) => dir(r.q?.change) },
        { label: '24H %', get: (r) => pct(r.q?.changePct), cls: (r) => dir(r.q?.changePct) },
        { label: '24H HIGH', get: (r) => px(r.q?.high, 'USD') },
        { label: '24H LOW', get: (r) => px(r.q?.low, 'USD') },
        { label: 'VOL', get: (r) => abbr(r.q?.volume, 1), cls: () => 'dim' },
        { label: '', get: (r) => (r.q?.demo ? '<span class="down">DEMO</span>'
            : r.inst.stable ? '<span class="dim">STABLE</span>' : '') },
      ],
    });
  },
});

register({
  code: 'FXIP', name: 'FX RATES', group: 'BOARD',
  render(panel) {
    board(panel, FX, {
      showMkt: false,
      cols: [
        { label: 'PAIR', get: (r) => `<span class="sym">${r.inst.sym}</span>` },
        { label: 'LAST', get: (r) => px(r.q?.price, r.inst.quote, r.inst.quote === 'JPY' || r.inst.quote === 'KRW' ? 3 : 5),
          cls: () => 'hl' },
        { label: 'CHG', get: (r) => (r.q ? num(r.q.change, 5) : '—'), cls: (r) => dir(r.q?.change) },
        { label: '%CHG', get: (r) => pct(r.q?.changePct), cls: (r) => dir(r.q?.changePct) },
        { label: 'PIPS', get: (r) => (r.q?.change != null ? num(r.q.change / r.inst.pip, 1) : '—'),
          cls: (r) => dir(r.q?.change) },
        { label: 'BASE', get: (r) => r.inst.base },
        { label: 'QUOTE', get: (r) => r.inst.quote },
      ],
    });
    panel.body.append(el('div', { class: 'empty',
      html: 'FX is quoted from the ECB reference set and refreshed every five minutes. ' +
            'Everything you hold in a foreign market is translated at these rates, so currency ' +
            'shows up as its own P&amp;L line in <b>PNL</b>.' }));
  },
});

register({
  code: 'YCRV', name: 'YIELD CURVES & GOVERNMENT BONDS', group: 'BOARD',
  render(panel) {
    const ccys = ['USD', 'INR', 'JPY', 'KRW', 'SGD', 'CNY', 'EUR', 'GBP', 'CAD'];
    panel.body.append(sect('SOVEREIGN CURVES'));
    const chartHost = el('div');
    const picker = el('select', { class: 'f', style: 'width:120px;margin-bottom:4px',
      onchange: () => drawCurve(picker.value) }, ...ccys.map((c) => el('option', { value: c }, c)));
    panel.body.append(picker, chartHost);

    function drawCurve(ccy) {
      clear(chartHost);
      const pts = curvePoints(ccy);
      chartHost.append(lineChart(pts.map((p) => ({ t: Math.log(p.tenor), v: p.yield })),
        { height: 120, color: 'var(--cyan)', area: true }));
      chartHost.append(table([
        { label: 'TENOR', get: (r) => (r.tenor < 1 ? `${r.tenor * 12}M` : `${r.tenor}Y`) },
        { label: 'YIELD %', get: (r) => num(r.yield, 3), cls: () => 'hl' },
      ], pts));
    }
    drawCurve('USD');

    panel.body.append(sect('TRADEABLE GOVERNMENT BONDS'));
    const bondHost = el('div');
    panel.body.append(bondHost);
    live(panel, () => {
      clear(bondHost);
      const rows = BONDS.map((b) => ({ b, p: bondPrice(b.id) })).filter((r) => r.p);
      bondHost.append(table([
        { label: 'BOND', get: (r) => `<span class="sym">${r.b.id}</span>` },
        { label: 'MKT', get: (r) => r.b.mkt },
        { label: 'CPN', get: (r) => num(r.b.coupon, 3) },
        { label: 'MATURITY', get: (r) => r.b.maturity, cls: () => 'dim' },
        { label: 'CLEAN', get: (r) => num(r.p.clean, 3), cls: () => 'hl' },
        { label: 'ACCRUED', get: (r) => num(r.p.accrued, 3), cls: () => 'dim' },
        { label: 'DIRTY', get: (r) => num(r.p.dirty, 3) },
        { label: 'YTM %', get: (r) => num(r.p.ytm, 3), cls: () => 'warn' },
        { label: 'MOD DUR', get: (r) => num(r.p.mod, 2), tip: () => 'Percent price change per 1% yield move' },
        { label: 'CONVEX', get: (r) => num(r.p.convexity, 1) },
        { label: 'DV01', get: (r) => num(r.p.dv01, 4), tip: () => 'Price change per basis point' },
        { label: 'CCY', get: (r) => r.b.ccy },
      ], rows, { onRow: (r) => openTicket(r.b.id) }));
    }, 30000);
  },
});

register({
  code: 'W', name: 'WATCHLIST', group: 'BOARD',
  render(panel) {
    const acct = S.get();
    const instruments = acct.watchlist.map(lookup).filter(Boolean);
    if (!instruments.length) {
      panel.body.append(empty('Watchlist is empty.',
        'Load a security and press <b>+W</b> on its <b>DES</b> page to add it.'));
      return;
    }
    board(panel, instruments);
    panel.body.append(el('div', { style: 'margin-top:6px' },
      el('button', { class: 'btn', onclick: () => {
        const sym = prompt('Add which symbol?');
        const inst = sym && lookup(sym.trim().toUpperCase());
        if (!inst) return;
        if (!acct.watchlist.includes(inst.id)) acct.watchlist.push(inst.id);
        S.save(); panel.redraw();
      } }, 'ADD SYMBOL')));
  },
});

register({
  code: 'MOST', name: 'MOST ACTIVE — BIGGEST MOVERS', group: 'BOARD',
  render(panel) {
    const all = [...INDICES, ...CRYPTO].concat(
      require_equities());
    board(panel, all, {
      sort: (a, b) => Math.abs(b.q?.changePct || 0) - Math.abs(a.q?.changePct || 0),
    });
  },
});

function require_equities() {
  // Only the liquid names - polling the whole universe would blow the request budget.
  return lookupMany(['AAPL.US', 'NVDA.US', 'TSLA.US', 'RELIANCE.IN', 'TCS.IN',
                     '7203.JP', '6758.JP', '005930.KR', 'D05.SG', '600519.CN',
                     'SAP.DE', 'SHEL.UK', 'MC.FR', 'RY.CA']);
}
const lookupMany = (ids) => ids.map(lookup).filter(Boolean);
