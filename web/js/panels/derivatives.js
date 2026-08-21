// Derivatives: OMON, OV, OSA, FUT, FRD.

import { el, table, empty, sect, kv, clear, toast } from '../util/dom.js';
import { px, num, pct, money, dir, abbr } from '../util/fmt.js';
import { register, live, open as openPanel } from '../panels.js';
import * as feed from '../market/feed.js';
import { lookup, INDICES, CRYPTO } from '../market/universe.js';
import * as chain from '../engine/quant/chain.js';
import * as vol from '../engine/quant/vol.js';
import { bsm, probTouch, probITM } from '../engine/quant/blackscholes.js';
import * as futures from '../engine/quant/futures.js';
import { carryFor } from '../engine/book.js';
import { daysTo, yrs } from '../util/fmt.js';
import { openTicket } from './ticket.js';
import { payoffChart } from './chartlib.js';

const need = (panel, what) => panel.body.append(empty(
  `No security loaded.`, `Try <b>AAPL ${what}</b> or <b>NIFTY ${what}</b>.`));

register({
  code: 'OMON', name: 'OPTION MONITOR', group: 'DERIV',
  render(panel, id) {
    const inst = lookup(id);
    if (!inst) return need(panel, 'OMON');
    if (inst.cls === 'bond') return panel.body.append(empty('Bonds have no listed options here.'));
    panel.title(`OMON — ${inst.sym}`);
    panel.onCleanup(feed.subscribe([inst.id]));
    vol.warm(inst.id);

    const expiries = chain.expiries(8);
    let selected = expiries[1] || expiries[0];
    const host = el('div');
    panel.body.append(host);

    const paint = () => {
      const c = chain.chainFor(inst.id, selected);
      clear(host);
      if (!c) return void host.append(empty('Waiting for a price on the underlying…'));

      host.append(el('div', { style: 'display:flex;gap:3px;flex-wrap:wrap;margin-bottom:4px' },
        ...expiries.map((e) => {
          const d = Math.max(0, daysTo(e));
          return el('button', { class: 'btn',
            style: e === selected ? 'color:var(--orange);border-color:var(--orange)' : '',
            onclick: () => { selected = e; paint(); } }, `${e.slice(5)} (${Math.round(d)}d)`);
        })));

      const mp = chain.maxPain(c);
      host.append(kv([
        ['Spot', `<span class="hl">${px(c.spot, c.ccy)}</span>`],
        ['Expiry', `${selected} — ${num(c.days, 1)} days`],
        ['ATM implied vol', `${num(c.atmSigma * 100, 1)}%`],
        ['Style', c.style === 'A' ? 'American, physically settled' : 'European, cash settled'],
        ['Risk-free / carry', `${num(c.r * 100, 2)}% / ${num(c.q * 100, 2)}%`],
        ['Expected move (1σ)', `±${px(c.spot * c.atmSigma * Math.sqrt(c.T), c.ccy)} (${pct(c.atmSigma * Math.sqrt(c.T) * 100, 1)})`],
        ['Max pain', mp ? num(mp.strike, 2) : '—'],
      ]));

      host.append(sect('CALLS  ·  STRIKE  ·  PUTS'));
      const rows = c.rows;
      host.append(table([
        { label: 'IV', get: (r) => num(r.call.iv * 100, 1), cls: () => 'dim' },
        { label: 'DELTA', get: (r) => num(r.call.delta, 3) },
        { label: 'THETA', get: (r) => num(r.call.theta, 3), cls: () => 'down' },
        { label: 'BID', get: (r) => num(r.call.bid, 2), cls: () => 'up' },
        { label: 'ASK', get: (r) => num(r.call.ask, 2), cls: () => 'down' },
        { label: 'C', get: (r) => el('button', { class: 'btn buy', style: 'padding:0 4px',
            onclick: (e) => { e.stopPropagation(); trade(inst, r.call, selected, c.style); } }, 'BUY') },
        { label: 'STRIKE', get: (r) => `<span class="${Math.abs(r.strike - c.spot) < (rows[1].strike - rows[0].strike) / 2 ? 'warn' : 'sym'}">${num(r.strike, 2)}</span>`,
          cls: () => 'lbl' },
        { label: 'P', get: (r) => el('button', { class: 'btn buy', style: 'padding:0 4px',
            onclick: (e) => { e.stopPropagation(); trade(inst, r.put, selected, c.style); } }, 'BUY') },
        { label: 'BID ', get: (r) => num(r.put.bid, 2), cls: () => 'up' },
        { label: 'ASK ', get: (r) => num(r.put.ask, 2), cls: () => 'down' },
        { label: 'THETA ', get: (r) => num(r.put.theta, 3), cls: () => 'down' },
        { label: 'DELTA ', get: (r) => num(r.put.delta, 3) },
        { label: 'IV ', get: (r) => num(r.put.iv * 100, 1), cls: () => 'dim' },
      ], rows));

      host.append(el('div', { class: 'empty', html:
        `Every price on this board is <b>model-generated</b> — Black-Scholes-Merton for European ` +
        `contracts and a ${'160'}-step binomial tree for American ones — fed by the real spot ` +
        `above and ${vol.cachedRealised(inst.id) ? 'this name’s own realised volatility' : 'a class volatility estimate'}. ` +
        `The skew is fitted, so downside puts carry a higher implied vol than upside calls, ` +
        `the way a real board does.` }));
      panel.meta(`${selected} · ATM ${num(c.atmSigma * 100, 1)}%`);
    };

    function trade(underlying, leg, expiry, style) {
      openTicket({ kind: 'option', underlyingId: underlying.id, type: leg.type,
                   strike: leg.strike, expiry, style, mult: 100 }, 'BUY', 1);
    }

    live(panel, paint, 4000);
    panel.onCleanup(feed.onTick(() => panel.code === 'OMON' && paint()));
  },
});

register({
  code: 'OV', name: 'OPTION VALUATION', group: 'DERIV',
  render(panel, id) {
    const inst = lookup(id) || lookup('AAPL.US');
    if (!inst) return need(panel, 'OV');
    panel.title(`OV — ${inst.sym}`);
    panel.onCleanup(feed.subscribe([inst.id]));
    vol.warm(inst.id);

    const st = { type: 'C', strike: null, expiry: chain.expiries(6)[2], qty: 1 };
    const host = el('div');
    panel.body.append(host);

    const paint = () => {
      const S0 = feed.price(inst.id);
      clear(host);
      if (S0 == null) return void host.append(empty('Waiting for a price…'));
      if (st.strike == null) st.strike = Math.round(S0 / chain.strikeStep(S0)) * chain.strikeStep(S0);

      const T = yrs(daysTo(st.expiry));
      const { r, q } = carryFor(inst.id);
      const sigma = vol.impliedVolFor(inst.id, st.strike, T, st.type);
      const g = bsm({ type: st.type, S: S0, K: st.strike, T, r, q, sigma });
      const touch = probTouch({ S: S0, K: st.strike, T, sigma, r, q });

      const strikeIn = el('input', { class: 'f', type: 'number', step: 'any', value: String(st.strike),
        oninput: (e) => { st.strike = Number(e.target.value); paint(); } });
      const typeSel = el('select', { class: 'f', onchange: (e) => { st.type = e.target.value; paint(); } },
        el('option', { value: 'C' }, 'CALL'), el('option', { value: 'P' }, 'PUT'));
      typeSel.value = st.type;
      const expSel = el('select', { class: 'f', onchange: (e) => { st.expiry = e.target.value; paint(); } },
        ...chain.expiries(8).map((e) => el('option', { value: e }, `${e} (${Math.round(daysTo(e))}d)`)));
      expSel.value = st.expiry;

      host.append(el('div', { style: 'display:grid;grid-template-columns:70px 1fr 70px 1fr;gap:3px 8px;align-items:center;margin-bottom:6px' },
        el('span', { class: 'dim', text: 'TYPE' }), typeSel,
        el('span', { class: 'dim', text: 'STRIKE' }), strikeIn,
        el('span', { class: 'dim', text: 'EXPIRY' }), expSel,
        el('span', { class: 'dim', text: 'SPOT' }), el('span', { class: 'hl', html: px(S0, inst.ccy) })));

      host.append(sect('VALUATION'));
      host.append(kv([
        ['Theoretical value', `<span class="hl" style="font-size:14px">${num(g.price, 4)}</span>`],
        ['Intrinsic', num(g.intrinsic, 4)],
        ['Time value', `<span class="warn">${num(g.extrinsic, 4)}</span>`],
        ['Implied vol', `${num(sigma * 100, 2)}%`],
        ['Contract cost', money((feed.toUSD(g.price, inst.ccy) || g.price) * 100, 'USD')],
        ['Breakeven at expiry', px(st.type === 'C' ? st.strike + g.price : st.strike - g.price, inst.ccy)],
      ]));

      host.append(sect('GREEKS'));
      host.append(table([
        { label: 'GREEK', get: (r) => r.k, cls: () => 'lbl' },
        { label: 'VALUE', get: (r) => num(r.v, 5), cls: () => 'hl' },
        { label: 'PER CONTRACT', get: (r) => num(r.v * (r.scale || 100), 3) },
        { label: 'MEANS', get: (r) => `<span class="dim">${r.d}</span>` },
      ], [
        { k: 'Delta', v: g.delta, d: 'Price move per 1.00 move in spot' },
        { k: 'Gamma', v: g.gamma, d: 'How fast delta itself changes' },
        { k: 'Vega', v: g.vega, d: 'Price move per 1 point of implied vol' },
        { k: 'Theta', v: g.theta, d: 'Value lost per calendar day' },
        { k: 'Rho', v: g.rho, d: 'Price move per 1% change in rates' },
        { k: 'Vanna', v: g.vanna, d: 'Delta drift as volatility moves' },
        { k: 'Charm', v: g.charm, d: 'Delta decay as time passes' },
      ]));

      host.append(sect('PROBABILITY'));
      host.append(kv([
        ['Finishes in the money', pct(probITM({ type: st.type, S: S0, K: st.strike, T, r, q, sigma }) * 100, 1)],
        ['Touches the strike first', pct(touch * 100, 1)],
        ['Expected 1σ move', `±${px(S0 * sigma * Math.sqrt(T), inst.ccy)}`],
        ['Days to expiry', num(T * 365, 1)],
      ]));

      host.append(sect('PAYOFF AT EXPIRY'));
      const pts = [];
      for (let i = -40; i <= 40; i++) {
        const s = S0 * (1 + i * 0.01);
        const expiryV = (st.type === 'C' ? Math.max(0, s - st.strike) : Math.max(0, st.strike - s)) - g.price;
        const nowV = bsm({ type: st.type, S: s, K: st.strike, T, r, q, sigma }).price - g.price;
        pts.push({ s, expiry: expiryV * 100, now: nowV * 100 });
      }
      host.append(payoffChart(pts, { spot: S0, height: 180 }));
      host.append(el('div', { class: 'empty', html:
        'Solid line is the payoff at expiry; the dashed line is what the position is worth ' +
        '<b>today</b>. The gap between them is time value, and it drains to zero.' }));

      host.append(el('div', { style: 'display:flex;gap:6px;margin-top:6px' },
        el('button', { class: 'btn buy', onclick: () => openTicket({ kind: 'option',
          underlyingId: inst.id, type: st.type, strike: st.strike, expiry: st.expiry,
          style: chain.styleFor(inst), mult: 100 }, 'BUY', 1) }, 'BUY THIS'),
        el('button', { class: 'btn sell', onclick: () => openTicket({ kind: 'option',
          underlyingId: inst.id, type: st.type, strike: st.strike, expiry: st.expiry,
          style: chain.styleFor(inst), mult: 100 }, 'SELL', 1) }, 'SELL THIS'),
        el('button', { class: 'btn', onclick: () => openPanel('OMON', inst.id) }, 'FULL BOARD')));
    };
    live(panel, paint, 5000);
    panel.onCleanup(feed.onTick(() => panel.code === 'OV' && paint()));
  },
});

register({
  code: 'FUT', name: 'FUTURES BOARD', group: 'DERIV',
  render(panel) {
    const underlyings = Object.keys(futures.CONTRACTS)
      .map((k) => lookup(k)).filter(Boolean);
    panel.onCleanup(feed.subscribe(underlyings.map((u) => u.id)));
    const ladder = futures.futuresLadder(4);
    const host = el('div');
    panel.body.append(host);

    const paint = () => {
      clear(host);
      host.append(sect('CONTRACTS — MICRO SIZED, DELIBERATELY'));
      const rows = [];
      for (const u of underlyings) {
        const S0 = feed.price(u.id);
        if (S0 == null) continue;
        const c = futures.contractFor(u.id);
        const { r, q } = carryFor(u.id);
        for (const exp of ladder.slice(0, 2)) {
          const T = yrs(daysTo(exp));
          const F = futures.futurePrice(S0, r, q, T);
          const b = futures.basis(F, S0);
          rows.push({ u, c, exp, S0, F, b, T, state: futures.carryState(F, S0) });
        }
      }
      if (!rows.length) return void host.append(empty('Waiting for index and crypto prices…'));

      host.append(table([
        { label: 'CONTRACT', get: (r) => `<span class="sym">${r.u.sym}</span> <span class="dim">${r.exp.slice(2)}</span>` },
        { label: 'NAME', get: (r) => `<span class="dim">${r.c.name}</span>` },
        { label: 'SPOT', get: (r) => num(r.S0, 2) },
        { label: 'FUTURE', get: (r) => num(r.F, 2), cls: () => 'hl' },
        { label: 'BASIS', get: (r) => num(r.b.abs, 2), cls: (r) => dir(r.b.abs) },
        { label: 'BASIS %', get: (r) => pct(r.b.pct, 3), cls: (r) => dir(r.b.pct) },
        { label: 'CARRY', get: (r) => `<span class="${r.state === 'contango' ? 'warn' : r.state === 'backwardation' ? 'up' : 'dim'}">${r.state.toUpperCase()}</span>` },
        { label: 'MULT', get: (r) => num(r.c.mult, 2) },
        { label: 'NOTIONAL', get: (r) => money(r.F * r.c.mult, 'USD') },
        { label: 'INIT MGN', get: (r) => money(r.c.initial, 'USD'), cls: () => 'warn' },
        { label: 'LEVERAGE', get: (r) => `${num(r.F * r.c.mult / r.c.initial, 1)}x`, cls: () => 'down' },
        { label: '', get: (r) => el('div', { style: 'display:flex;gap:3px;justify-content:flex-end' },
            el('button', { class: 'btn buy', style: 'padding:0 4px', onclick: (e) => { e.stopPropagation();
              openTicket({ kind: 'future', underlyingId: r.u.id, expiry: r.exp, mult: r.c.mult }, 'BUY', 1); } }, 'LONG'),
            el('button', { class: 'btn sell', style: 'padding:0 4px', onclick: (e) => { e.stopPropagation();
              openTicket({ kind: 'future', underlyingId: r.u.id, expiry: r.exp, mult: r.c.mult }, 'SELL', 1); } }, 'SHORT')) },
      ], rows));

      host.append(el('div', { class: 'empty', html:
        'Futures mark to market every day — the leverage column is the reason a small adverse ' +
        'move can wipe the initial margin. Compare with <b>FRD</b>, where nothing settles until maturity.' }));
    };
    live(panel, paint, 5000);
    panel.onCleanup(feed.onTick(paint));
  },
});

register({
  code: 'FRD', name: 'FORWARD PRICER', group: 'DERIV',
  render(panel, id) {
    const inst = lookup(id) || lookup('EURUSD');
    panel.title(`FRD — ${inst.sym}`);
    panel.onCleanup(feed.subscribe([inst.id]));
    const host = el('div');
    panel.body.append(host);

    const paint = () => {
      const S0 = feed.price(inst.id);
      clear(host);
      if (S0 == null) return void host.append(empty('Waiting for a price…'));
      const { r, q } = carryFor(inst.id);

      host.append(sect(`FORWARD CURVE — ${inst.sym}`));
      const rows = futures.forwardLadder().map((exp) => {
        const T = yrs(daysTo(exp));
        const isFx = inst.cls === 'fx';
        const out = isFx ? futures.fxForward(S0, r, q, T)
                         : { fwd: futures.futurePrice(S0, r, q, T), points: 0, annualisedPct: 0 };
        return { exp, T, ...out, basis: futures.basis(out.fwd, S0) };
      });
      host.append(table([
        { label: 'MATURITY', get: (r) => r.exp },
        { label: 'DAYS', get: (r) => num(r.T * 365, 0), cls: () => 'dim' },
        { label: 'SPOT', get: () => num(S0, 5) },
        { label: 'FORWARD', get: (r) => num(r.fwd, 5), cls: () => 'hl' },
        { label: 'POINTS', get: (r) => num(r.basis.abs * (inst.cls === 'fx' ? 10000 : 1), 2),
          cls: (r) => dir(r.basis.abs) },
        { label: 'ANNUALISED', get: (r) => (r.T > 0 ? pct((r.fwd / S0 - 1) / r.T * 100, 3) : '—'),
          cls: (r) => dir(r.fwd - S0) },
        { label: '', get: (r) => el('div', { style: 'display:flex;gap:3px;justify-content:flex-end' },
            el('button', { class: 'btn buy', style: 'padding:0 4px', onclick: () =>
              openTicket({ kind: 'forward', underlyingId: inst.id, expiry: r.exp, mult: 1000 }, 'BUY', 1) }, 'LONG'),
            el('button', { class: 'btn sell', style: 'padding:0 4px', onclick: () =>
              openTicket({ kind: 'forward', underlyingId: inst.id, expiry: r.exp, mult: 1000 }, 'SELL', 1) }, 'SHORT')) },
      ], rows));

      host.append(kv([
        ['Base rate', `${num(r * 100, 3)}%`],
        ['Quote / carry rate', `${num(q * 100, 3)}%`],
        ['Rate differential', `${num((r - q) * 100, 3)}%`],
        ['Shape', futures.carryState(rows[rows.length - 1].fwd, S0).toUpperCase()],
      ]));
      host.append(el('div', { class: 'empty', html:
        'Forwards are priced by covered interest parity: the forward is the spot adjusted for ' +
        'the interest you earn on one currency versus the other. Unlike a future, <b>nothing ' +
        'settles until maturity</b> — no daily variation margin, so a losing forward stays quiet ' +
        'right up until it does not.' }));
    };
    live(panel, paint, 6000);
    panel.onCleanup(feed.onTick(paint));
  },
});
