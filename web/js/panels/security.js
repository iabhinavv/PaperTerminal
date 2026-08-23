// Security-level pages: DES, GP, GIP.

import { el, table, empty, sect, kv, clear, toast } from '../util/dom.js';
import { px, num, pct, abbr, dir, age, money } from '../util/fmt.js';
import { register, live } from '../panels.js';
import * as feed from '../market/feed.js';
import { lookup, MARKETS } from '../market/universe.js';
import { sessionFor } from '../market/calendar.js';
import * as vol from '../engine/quant/vol.js';
import * as book from '../engine/book.js';
import * as S from '../engine/state.js';
import { lineChart } from './chartlib.js';
import { chartLinks, openChart, primaryChart } from '../market/charts.js';
import { openTicket } from './ticket.js';

const needSymbol = (panel) => panel.body.append(empty(
  'No security loaded.',
  'Type a ticker and press <b>GO</b> — for example <b>AAPL</b>, <b>RELIANCE</b>, <b>7203</b>, <b>BTC</b>.'));

register({
  code: 'DES', name: 'SECURITY DESCRIPTION', group: 'SECURITY',
  render(panel, id) {
    const inst = lookup(id);
    if (!inst) return needSymbol(panel);
    panel.title(`DES — ${inst.sym}`);
    panel.onCleanup(feed.subscribe([inst.id]));
    vol.warm(inst.id).then(() => panel.code === 'DES' && paint());

    const host = el('div');
    panel.body.append(host);

    function paint() {
      const q = feed.quote(inst.id);
      const s = sessionFor(inst);
      const mkt = MARKETS[inst.mkt];
      const rv = vol.cachedRealised(inst.id);
      const iv = vol.atmVol(inst.id);
      const rr = vol.riskReversal(inst.id);
      const pos = book.findPosition(inst.id);

      clear(host);
      host.append(el('div', { style: 'display:flex;align-items:baseline;gap:12px;margin-bottom:2px' },
        el('span', { style: 'font-size:22px;color:var(--amber)', text: inst.sym }),
        el('span', { style: 'font-size:22px;color:var(--white)', html: px(q?.price, inst.ccy) }),
        el('span', { class: dir(q?.changePct), style: 'font-size:14px',
          html: `${num(q?.change, 2)}  ${pct(q?.changePct)}` }),
        el('span', { class: `tag ${s.state === 'open' ? 'open' : 'closed'}`, text: s.label })));
      host.append(el('div', { class: 'dim', style: 'margin-bottom:6px', text: inst.name }));

      host.append(sect('IDENTIFICATION'));
      host.append(kv([
        ['Market', `${mkt ? mkt.name : inst.mkt} <span class="dim">${mkt ? mkt.exchange : ''}</span>`],
        ['Asset class', inst.cls.toUpperCase()],
        ['Sector', inst.sector || '—'],
        ['Currency', inst.ccy],
        ['Liquidity tier', `${inst.tier} <span class="dim">${['', 'mega-cap', 'liquid', 'thin'][inst.tier] || ''}</span>`],
        mkt ? ['Settlement', mkt.settle] : null,
        mkt ? ['Local hours', mkt.sessions.map((x) => x.join('–')).join(' / ')] : null,
      ].filter(Boolean)));

      host.append(sect('SESSION'));
      host.append(kv([
        ['Open', px(q?.open, inst.ccy)],
        ['High', px(q?.high, inst.ccy)],
        ['Low', px(q?.low, inst.ccy)],
        ['Prev close', px(q?.prevClose, inst.ccy)],
        ['Volume', abbr(q?.volume, 1)],
        q?.marketCap ? ['Market cap', abbr(q.marketCap, 2)] : null,
        ['Quote age', q ? `<span class="${Date.now() - q.recvAt > 300000 ? 'warn' : 'dim'}">${age((Date.now() - q.recvAt) / 1000)}</span>` : '—'],
        ['Source', `<span class="dim">${q?.source || feed.state.source}</span>`],
      ].filter(Boolean)));

      host.append(sect('VOLATILITY'));
      host.append(kv([
        ['Realised (blended)', rv ? `${num(rv * 100, 1)}%` : '<span class="dim">loading history…</span>'],
        ['Implied ATM', `<span class="hl">${num(iv * 100, 1)}%</span>`],
        ['Variance premium', rv ? `<span class="${iv > rv ? 'warn' : 'up'}">${pct((iv / rv - 1) * 100, 1)}</span>` : '—'],
        ['1-day move (1σ)', q?.price ? `±${px(q.price * iv / Math.sqrt(252), inst.ccy)}` : '—'],
        ['25d risk reversal', rr ? `${num((rr.rr) * 100, 2)} pts <span class="dim">${rr.rr < 0 ? 'puts bid' : 'calls bid'}</span>` : '—'],
      ]));

      if (pos) {
        const u = book.unrealised(pos);
        host.append(sect('YOUR POSITION'));
        host.append(kv([
          ['Quantity', num(u.qty, 4)],
          ['Average price', px(book.avgPrice(pos), inst.ccy)],
          ['Mark', px(u.mark, inst.ccy)],
          ['Unrealised', `<span class="${dir(u.usd)}">${money(u.usd, 'USD')}</span>`],
          ['Lots', String(pos.lots.length)],
        ]));
      }

      const links = chartLinks(inst);
      if (links.length) {
        host.append(sect('EXTERNAL CHARTS'));
        host.append(table([
          { label: 'PLATFORM', get: (l) => `<span class="sym">${l.name}</span>` },
          { label: 'WHAT IT GIVES YOU', get: (l) => `<span class="dim">${l.note}</span>` },
          { label: '', get: (l) => el('button', { class: 'btn', style: 'padding:0 5px',
              onclick: (e) => { e.stopPropagation(); openChart(inst, l.id); } }, 'OPEN') },
        ], links, { onRow: (l) => openChart(inst, l.id) }));
      }

      const acct = S.get();
      const watched = acct.watchlist.includes(inst.id);
      host.append(el('div', { style: 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap' },
        primaryChart(inst)
          ? el('button', { class: 'btn chart', title: `Opens ${primaryChart(inst).name} in a new window`,
              onclick: () => openChart(inst) }, 'VIEW CHART') : null,
        el('button', { class: 'btn buy', onclick: () => openTicket(inst.id, 'BUY') }, 'BUY'),
        el('button', { class: 'btn sell', onclick: () => openTicket(inst.id, 'SELL') }, 'SELL'),
        el('button', { class: 'btn', onclick: () => { acct.watchlist = watched
            ? acct.watchlist.filter((x) => x !== inst.id) : [...acct.watchlist, inst.id];
          S.save(); toast(watched ? 'Removed from watchlist' : 'Added to watchlist'); paint(); } },
          watched ? 'REMOVE FROM W' : 'ADD TO W'),
        inst.cls !== 'bond' && inst.cls !== 'fx'
          ? el('button', { class: 'btn', onclick: () => import('../panels.js')
              .then((P) => P.open('OMON', inst.id)) }, 'OPTIONS — OMON') : null,
        el('button', { class: 'btn', onclick: () => import('../panels.js')
            .then((P) => P.open('GP', inst.id)) }, 'CHART — GP')));
    }

    live(panel, paint, 2000);
    panel.onCleanup(feed.onTick(() => panel.code === 'DES' && paint()));
  },
});

register({
  code: 'GP', name: 'PRICE GRAPH', group: 'SECURITY',
  render(panel, id) {
    const inst = lookup(id);
    if (!inst) return needSymbol(panel);
    panel.title(`GP — ${inst.sym}`);
    panel.onCleanup(feed.subscribe([inst.id]));

    const host = el('div');
    panel.body.append(host);
    host.append(empty('Loading history…'));

    let ranges = [30, 90, 180, 365];
    let selected = 180;

    feed.bars(inst.id, 365).then((bars) => {
      const draw = () => {
        clear(host);
        const q = feed.quote(inst.id);
        const slice = bars.slice(-selected);
        if (!slice.length) {
          host.append(empty('No history available for this symbol.',
            'The provider may not cover this exchange, or the request budget is spent.'));
          return;
        }
        host.append(el('div', { style: 'display:flex;gap:4px;margin-bottom:4px;align-items:center' },
          ...ranges.map((r) => el('button', {
            class: 'btn', style: r === selected ? 'color:var(--orange);border-color:var(--orange)' : '',
            onclick: () => { selected = r; draw(); } }, `${r}D`)),
          el('span', { style: 'flex:1' }),
          primaryChart(inst)
            ? el('button', { class: 'btn chart', title: `Opens ${primaryChart(inst).name} in a new window`,
                onclick: () => openChart(inst) }, 'VIEW CHART') : null));

        const series = slice.map((b) => ({ t: b.t, v: b.c }));
        if (q?.price) series.push({ t: Date.now() / 1000, v: q.price });
        host.append(lineChart(series, { height: 190, area: true,
          baseline: slice[0].c }));

        const first = slice[0].c, last = q?.price ?? slice[slice.length - 1].c;
        const rets = [];
        for (let i = 1; i < slice.length; i++) rets.push(Math.log(slice[i].c / slice[i - 1].c));
        const hi = Math.max(...slice.map((b) => b.h || b.c));
        const lo = Math.min(...slice.map((b) => b.l || b.c));

        host.append(sect(`${selected} DAY STATISTICS`));
        host.append(kv([
          ['Period return', `<span class="${dir(last - first)}">${pct((last / first - 1) * 100)}</span>`],
          ['Period high', px(hi, inst.ccy)],
          ['Period low', px(lo, inst.ccy)],
          ['Range', `${pct((hi / lo - 1) * 100)}`],
          ['Realised vol', `${num((vol.closeToClose(slice, selected) || 0) * 100, 1)}%`],
          ['Best day', `<span class="up">${pct(Math.max(...rets) * 100)}</span>`],
          ['Worst day', `<span class="down">${pct(Math.min(...rets) * 100)}</span>`],
          ['Bars', String(slice.length)],
        ]));
      };
      draw();
      panel.onCleanup(feed.onTick(() => panel.code === 'GP' && draw()));
    });
  },
});

register({
  code: 'GIP', name: 'INTRADAY GRAPH', group: 'SECURITY',
  render(panel, id) {
    const inst = lookup(id);
    if (!inst) return needSymbol(panel);
    panel.title(`GIP — ${inst.sym}`);
    panel.onCleanup(feed.subscribe([inst.id]));
    const host = el('div');
    panel.body.append(host);

    // Intraday is built from ticks observed while the terminal is open - the
    // free feeds do not hand out minute bars, so the chart fills in as you watch.
    const ticks = [];
    const paint = () => {
      const q = feed.quote(inst.id);
      if (q?.price != null) {
        const lastTick = ticks[ticks.length - 1];
        if (!lastTick || lastTick.v !== q.price) ticks.push({ t: Date.now() / 1000, v: q.price });
      }
      clear(host);
      if (ticks.length < 2) {
        host.append(empty('Building the intraday series from live ticks.',
          'Free feeds do not provide minute bars, so <b>GIP</b> plots what the terminal ' +
          'has actually seen since you opened it. Leave it running.'));
        return;
      }
      host.append(lineChart(ticks, { height: 200, area: true, baseline: ticks[0].v }));
      host.append(kv([
        ['Ticks observed', String(ticks.length)],
        ['Session move', pct((ticks[ticks.length - 1].v / ticks[0].v - 1) * 100)],
        ['Watching since', new Date(ticks[0].t * 1000).toTimeString().slice(0, 8)],
      ]));
    };
    live(panel, paint, 3000);
    panel.onCleanup(feed.onTick(paint));
  },
});
