// The order ticket. Every trade in the platform goes through this dialog, and
// it deliberately shows you the things a broker's ticket hides: the age of the
// price you are filling against, the spread you are crossing, what the position
// will cost in buying power, and the tax rate that will apply to the gain.

import { el, modal, closeModal, toast, kv, sect, table } from '../util/dom.js';
import { px, num, pct, money, age, dir } from '../util/fmt.js';
import { lookup } from '../market/universe.js';
import * as feed from '../market/feed.js';
import * as matching from '../engine/matching.js';
import * as margin from '../engine/margin.js';
import * as book from '../engine/book.js';
import * as interest from '../engine/interest.js';
import * as tax from '../engine/tax.js';
import * as S from '../engine/state.js';
import { sessionFor } from '../market/calendar.js';

export function openTicket(target, presetSide = 'BUY', presetQty = null) {
  let spec;
  try { spec = matching.specFor(target); }
  catch (err) { return toast(err.message, 'bad'); }

  const inst = spec.inst;
  const existing = book.findPosition(book.positionKey(spec));
  const held = existing ? book.netQty(existing) : 0;

  const state = { side: presetSide, qty: presetQty || defaultQty(spec), type: 'MKT',
                  limit: null, stop: null, trailPct: 5 };

  const body = el('div');
  const preview = el('div');

  const qtyInput = el('input', { class: 'f', type: 'number', min: '0', step: 'any',
    value: String(state.qty), oninput: (e) => { state.qty = Number(e.target.value) || 0; paint(); } });
  const typeSel = el('select', { class: 'f', onchange: (e) => { state.type = e.target.value; paint(); } },
    ...['MKT', 'LMT', 'STP', 'STP LMT', 'TRAIL'].map((t) => el('option', { value: t }, t)));
  const limitInput = el('input', { class: 'f', type: 'number', step: 'any', placeholder: 'limit',
    oninput: (e) => { state.limit = Number(e.target.value) || null; paint(); } });
  const stopInput = el('input', { class: 'f', type: 'number', step: 'any', placeholder: 'stop',
    oninput: (e) => { state.stop = Number(e.target.value) || null; paint(); } });
  const trailInput = el('input', { class: 'f', type: 'number', step: '0.5', value: '5',
    oninput: (e) => { state.trailPct = Number(e.target.value) || 5; paint(); } });

  const sideBtns = el('div', { style: 'display:flex;gap:4px' },
    el('button', { class: 'btn buy', onclick: () => { state.side = 'BUY'; paint(); } }, 'BUY'),
    el('button', { class: 'btn sell', onclick: () => { state.side = 'SELL'; paint(); } }, 'SELL'));

  const grid = el('div', { style: 'display:grid;grid-template-columns:70px 1fr 70px 1fr;gap:3px 8px;align-items:center;margin:4px 0' },
    el('span', { class: 'dim', text: 'SIDE' }), sideBtns,
    el('span', { class: 'dim', text: 'QTY' }), qtyInput,
    el('span', { class: 'dim', text: 'TYPE' }), typeSel,
    el('span', { class: 'dim', text: 'LIMIT' }), limitInput,
    el('span', { class: 'dim', text: 'STOP' }), stopInput,
    el('span', { class: 'dim', text: 'TRAIL %' }), trailInput);

  const submit = el('button', { class: 'btn buy', onclick: send }, 'SUBMIT');
  const actions = el('div', { style: 'display:flex;gap:6px;margin-top:8px;justify-content:flex-end' },
    el('button', { class: 'btn', onclick: closeModal }, 'CANCEL'), submit);

  body.append(grid, preview, actions);

  function paint() {
    sideBtns.children[0].style.opacity = state.side === 'BUY' ? '1' : '.45';
    sideBtns.children[1].style.opacity = state.side === 'SELL' ? '1' : '.45';
    typeSel.value = state.type;
    limitInput.disabled = !(state.type === 'LMT' || state.type === 'STP LMT');
    stopInput.disabled = !(state.type === 'STP' || state.type === 'STP LMT');
    trailInput.disabled = state.type !== 'TRAIL';
    submit.className = `btn ${state.side === 'BUY' ? 'buy' : 'sell'}`;
    submit.textContent = state.type === 'MKT' ? `${state.side} AT MARKET` : `PLACE ${state.type}`;

    const q = matching.quoteOrder(spec, state.qty, state.side);
    preview.replaceChildren(renderPreview(spec, state, q, held));
    submit.disabled = !!q.error || !(state.qty > 0);
  }

  function send() {
    try {
      if (state.type === 'MKT') {
        const q = matching.quoteOrder(spec, state.qty, state.side);
        const force = !q.tradeable
          ? confirm(`${inst.name} is ${q.session.label.toLowerCase()}.\n\n` +
                    `Filling now uses the last available price, which may be stale by ` +
                    `${age(q.dataAge)}. Continue anyway?`)
          : false;
        if (!q.tradeable && !force) return;
        const { trade } = matching.marketOrder({ target, qty: state.qty, side: state.side, force });
        toast(`${trade.qty > 0 ? 'BOUGHT' : 'SOLD'} ${Math.abs(trade.qty)} ${book.describe(spec)} ` +
              `at ${px(trade.price, spec.ccy)}`, 'ok');
      } else {
        const o = matching.placeOrder({ target, qty: state.qty, side: state.side, type: state.type,
          limit: state.limit, stop: state.stop, trailPct: state.trailPct });
        toast(`Working order placed — ${o.label}`, 'ok');
      }
      closeModal();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  paint();
  modal(`ORDER TICKET — ${book.describe(spec)}`, body,
        { meta: `${inst.mkt} · ${inst.ccy} · ${sessionFor(inst).label}`, width: '600px' });
}

function defaultQty(spec) {
  if (spec.kind === 'option' || spec.kind === 'future' || spec.kind === 'forward') return 1;
  const p = matching.refPrice(spec);
  if (!p) return 1;
  const usd = feed.toUSD(p, spec.ccy) || p;
  if (spec.cls === 'crypto') return Number((250 / usd).toPrecision(3));
  if (spec.cls === 'fx') return 1000;
  return Math.max(1, Math.floor(500 / usd));
}

function renderPreview(spec, state, q, held) {
  if (q.error) return el('div', { class: 'empty', html: q.error });

  const cfg = S.get().config;
  const mSt = margin.status();
  const req = q.check.requirement || 0;
  const rates = tax.marginalRates();
  const regime = spec.kind === 'future' || spec.kind === 'forward' ? 's1256'
    : spec.cls === 'crypto' ? 'cryptoShort' : 'equityShort';
  const d = interest.dailyCost();

  const wrap = el('div');
  wrap.append(sect('EXECUTION'));
  wrap.append(kv([
    ['Reference mid', px(q.mid, q.ccy)],
    ['Est. fill', `<span class="hl">${px(q.fill, q.ccy)}</span>`],
    ['Spread crossed', `${px(q.half, q.ccy)} <span class="dim">per unit</span>`],
    ['Slippage', q.slip > 0 ? `<span class="warn">${px(q.slip, q.ccy)}</span>` : '<span class="dim">none</span>'],
    ['Commission', money(q.commission, 'USD')],
    ['Notional', `${money(q.grossNative, q.ccy)}${q.ccy !== 'USD' ? ` <span class="dim">= ${money(q.grossUSD, 'USD')}</span>` : ''}`],
    ['Cash impact', `<span class="${dir(q.cashUSD)}">${money(q.cashUSD, 'USD')}</span>`],
    ['Price age', q.dataAge != null
      ? `<span class="${q.dataAge > 300 ? 'warn' : 'dim'}">${age(q.dataAge)} old</span>`
      : '<span class="dim">unknown</span>'],
    ['Venue', `<span class="tag ${q.session.state === 'open' ? 'open' : 'closed'}">${q.session.label}</span>`],
  ]));

  wrap.append(sect('CAPITAL'));
  const after = mSt.buyingPower - req;
  wrap.append(kv([
    ['Position after', `${held} → <span class="hl">${held + q.signed}</span>`],
    ['Initial requirement', money(req, 'USD')],
    ['Buying power', `${money(mSt.buyingPower, 'USD')} → <span class="${after < 0 ? 'down' : ''}">${money(after, 'USD')}</span>`],
    ['Account equity', money(mSt.equity, 'USD')],
    ['Leverage after', mSt.equity > 0
      ? `${num((mSt.grossExposure + Math.abs(q.grossUSD || 0)) / mSt.equity, 2)}x` : '—'],
    d.perDay > 0 ? ['Carry today', `<span class="warn">${money(d.perDay, 'USD')}/day at ${num(d.rate, 2)}%</span>`] : null,
  ].filter(Boolean)));

  wrap.append(sect('IF THIS WORKS'));
  const gain = Math.abs(q.grossUSD || 0) * 0.10;
  wrap.append(kv([
    ['On a 10% move', money(gain, 'USD')],
    ['Tax if closed now', `<span class="down">${money(gain * rates[regime] / 100, 'USD')}</span> <span class="dim">at ${num(rates[regime], 1)}%</span>`],
    ['Kept after tax', `<span class="up">${money(gain * (1 - rates[regime] / 100), 'USD')}</span>`],
    ['Tax regime', regime === 's1256'
      ? '<span class="mag">Section 1256 — 60/40, no holding period</span>'
      : spec.cls === 'crypto'
      ? '<span class="mag">Property — no wash sale rule</span>'
      : '<span class="mag">Security — wash sale applies</span>'],
  ]));

  if (!q.check.ok) {
    wrap.append(el('div', { class: 'empty', style: 'color:var(--red)',
      html: `<b>REJECTED:</b> ${q.check.reason}` }));
  }
  return wrap;
}
