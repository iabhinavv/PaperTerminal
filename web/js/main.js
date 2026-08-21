// PaperTerminal boot.
//
// Order matters: state first, then the deterministic clock replays whatever
// happened while you were away, then the feed starts and the panels mount.

import { $, el, clear, toast } from './util/dom.js';
import { money, num, pct, clock, age, dir } from './util/fmt.js';
import * as P from './panels.js';
import * as cmd from './cmdline.js';
import * as S from './engine/state.js';
import * as feed from './market/feed.js';
import * as book from './engine/book.js';
import * as margin from './engine/margin.js';
import * as matching from './engine/matching.js';
import * as clockEngine from './engine/clock.js';
import { setCurve } from './engine/book.js';
import { CURVE_DEFAULT, INDICES, CRYPTO, FX, lookup } from './market/universe.js';
import { allSessions } from './market/calendar.js';

// Panels self-register on import.
import './panels/boards.js';
import './panels/security.js';
import './panels/derivatives.js';
import './panels/account.js';
import './panels/credit.js';
import './panels/riskp.js';
import './panels/system.js';

const FKEYS = [
  ['F1', 'DES'], ['F2', 'GP'], ['F3', 'OMON'], ['F4', 'PORT'],
  ['F5', 'MARG'], ['F6', 'BORR'], ['F7', 'TAX'], ['F8', 'RISK'],
];

const TAPE_IDS = [
  'SPX', 'NIFTY', 'N225', 'KOSPI', 'STI', 'SSEC', 'DAX', 'FTSE', 'CAC', 'TSX',
  'BTC', 'ETH', 'SOL', 'XRP', 'EURUSD', 'USDJPY', 'USDINR', 'GBPUSD',
];

function boot() {
  setCurve(CURVE_DEFAULT);
  S.load();

  const replay = clockEngine.catchUp();
  const grid = $('#grid');
  P.init(grid, 4);
  mountFKeys();
  cmd.mount((text) => toast(`No function or security matches "${text}". Try <b>HELP</b>.`, 'bad'));

  feed.start();
  feed.subscribe(TAPE_IDS);

  // Working orders are checked against every new tick - this is what makes a
  // stop-loss mean something rather than being decoration.
  feed.onTick(() => {
    try {
      const fills = matching.sweep();
      for (const f of fills) {
        toast(`${f.order.type} FILLED — ${f.order.label} at ${num(f.order.fillPrice, 4)}`, 'ok');
      }
    } catch (err) { console.error('[sweep]', err); }
    checkMarginCall();
  });

  P.open('WEI', null, 0);
  P.open('PORT', null, 1);
  P.open('CRYP', null, 2);
  P.open('MARG', null, 3);
  P.focus(0);

  startStatusBar();
  startTape();

  const summary = clockEngine.summarise(replay);
  if (summary) setTimeout(() => toast(summary, 'warn'), 600);
  if (S.get().trades.length === 0) setTimeout(welcome, 900);

  // Tell the user plainly if they are looking at synthetic prices.
  setTimeout(() => {
    if (feed.state.status !== 'demo') return;
    toast('<b>DEMO DATA.</b> No provider answered, so prices on every board are ' +
          '<b>synthetic</b> — a seeded walk around plausible levels, not real quotes. ' +
          'Every feature works; nothing you see is a real market. Add a free Twelve Data ' +
          'key to <b>config.json</b> for live data. See <b>HELP</b>.', 'bad');
  }, 2500);
}

function mountFKeys() {
  const bar = $('#fkeys');
  clear(bar);
  for (const [key, code] of FKEYS) {
    const def = P.definition(code);
    bar.append(el('div', { class: 'fk', title: def ? def.name : code,
      onclick: () => runFKey(code) },
      el('b', { text: key }), code));
  }
  document.addEventListener('keydown', (e) => {
    const hit = FKEYS.find(([k]) => k === e.key);
    if (!hit) return;
    e.preventDefault();
    runFKey(hit[1]);
  });
}

function runFKey(code) {
  const def = P.definition(code);
  if (!def) return;
  // Security-scoped functions inherit whatever the focused panel is showing.
  const focused = P.focusedPanel();
  const arg = focused && focused.arg ? focused.arg : null;
  P.open(code, arg);
}

function checkMarginCall() {
  const st = margin.status();
  const acct = S.get();
  if (st.call) {
    const last = acct.marginCalls[acct.marginCalls.length - 1];
    if (!last || Date.now() - last.at > 300000) {
      acct.marginCalls.push({ at: Date.now(), shortfall: st.call.shortfall });
      S.save();
      toast(`<b>MARGIN CALL.</b> Short ${money(st.call.shortfall, 'USD')} against maintenance. ` +
            `Open <b>MARG</b>.`, 'bad');
    }
  }
}

function startStatusBar() {
  const set = (id, text, cls) => {
    const n = $(id);
    if (!n) return;
    n.textContent = text;
    if (cls !== undefined) n.className = cls;
  };

  const paint = () => {
    const acct = S.get();
    const st = margin.status();
    const sum = book.summary();
    const total = sum.unrealised + sum.realised;

    set('#st-equity', money(st.equity, 'USD'));
    set('#st-cash', money(acct.cash, 'USD'), acct.cash < 0 ? 'down' : '');
    set('#st-pnl', money(total, 'USD'), dir(total));
    set('#st-bp', money(st.buyingPower, 'USD'));
    set('#st-margin', st.marginUsedPct === Infinity ? '∞' : pct(st.marginUsedPct, 0),
        st.marginUsedPct > 70 ? 'down' : st.marginUsedPct > 40 ? 'warn' : '');
    set('#st-clock', clock());

    const worst = feed.worstAge();
    const status = feed.state.status;
    const label = status === 'offline' ? 'OFFLINE'
      : status === 'demo' ? 'DEMO DATA — NOT REAL PRICES'
      : status === 'static' ? 'SNAPSHOT'
      : status === 'degraded' ? `DEGRADED ${age(worst)}`
      : `LIVE ${age(worst)}`;
    set('#st-feed', label,
        status === 'demo' ? 'dead'
        : status === 'live' && worst < 300 ? 'live'
        : status === 'offline' ? 'dead' : 'stale');

    document.body.classList.toggle('demo-mode', status === 'demo');

    const sess = $('#sessions');
    clear(sess);
    for (const s of allSessions()) {
      sess.append(el('span', {
        class: `mk ${s.state === 'open' ? 'open' : s.state === 'pre' || s.state === 'post' ? 'pre' : ''}`,
        title: `${s.code} — ${s.label} (local ${s.local})`, text: s.code }));
    }
  };

  paint();
  setInterval(paint, 1000);
  S.onChange(paint);
}

function startTape() {
  const track = $('#tapetrack');
  const paint = () => {
    clear(track);
    const items = TAPE_IDS.map(lookup).filter(Boolean);
    for (const inst of items) {
      const q = feed.quote(inst.id);
      if (!q) continue;
      track.append(el('span', { class: 'it' },
        el('b', { text: inst.sym }), ' ',
        el('span', { html: num(q.price, q.price < 10 ? 4 : 2) }), ' ',
        el('span', { class: dir(q.changePct), html: pct(q.changePct) })));
    }
    // Duplicate the run so the marquee has no visible seam.
    const first = track.innerHTML;
    track.innerHTML = first + first;
  };
  paint();
  setInterval(paint, 15000);
  feed.onTick(paint);
}

function welcome() {
  const acct = S.get();
  toast(`<b>PaperTerminal.</b> You start with ${money(acct.config.startingCash, 'USD')} and ` +
        `receive ${money(acct.config.weeklyInflow, 'USD')} every Monday.<br>` +
        `Type <b>HELP</b> for the function index, or a ticker like <b>AAPL</b> to begin.`, 'ok');
}

// Panel focus by number, when the command line is empty.
document.addEventListener('keydown', (e) => {
  if (!/^[1-4]$/.test(e.key)) return;
  const input = $('#cmdline');
  if (input && input.value.trim() !== '') return;
  if (document.activeElement && document.activeElement.matches('input,select,textarea')
      && document.activeElement !== input) return;
  P.focus(Number(e.key) - 1);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('#modal').classList.remove('on');
});
$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') $('#modal').classList.remove('on');
});

window.addEventListener('error', (e) => {
  console.error('[paperterminal]', e.error || e.message);
});

// Expose the engine for anyone who wants to poke at it from the console.
window.PT = { S, feed, book, margin, matching, P, clockEngine };

boot();
