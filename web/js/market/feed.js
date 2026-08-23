// The price feed.
//
// Twelve Data's free tier is 800 requests/day at 8/min. That is a real budget,
// not a footnote: 50 symbols on a naive 60s poll burns the day in under two
// hours. So this layer only polls what is SUBSCRIBED - visible on a panel or
// held in an open position - batches symbols into one request per asset class,
// and backs off hard when the venue is shut.

import { lookup, CRYPTO, FX } from './universe.js';
import { sessionFor } from './calendar.js';

// Relative, not absolute. On GitHub Pages the app lives under a subpath
// (/reponame/), where a leading slash would escape the project entirely.
const API = new URL('api', document.baseURI).href;

const quotes = new Map();      // instrument id -> normalised quote
const subs = new Map();        // instrument id -> subscriber count
const listeners = new Set();
const history = new Map();     // instrument id -> bars

export const state = {
  status: 'init',              // init | live | degraded | offline | static | demo
  lastPoll: 0, lastOk: 0, source: '—', errors: 0,
  requestsToday: 0, budgetDay: new Date().toDateString(),
  serverPresent: null,
};

// Poll cadence by asset class when the venue is open. Closed venues get 20x.
const BASE_INTERVAL = { crypto: 15000, fx: 300000, equity: 60000, index: 60000, bond: 300000 };
const CLOSED_MULTIPLIER = 20;

export const onTick = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (ids) => { for (const fn of listeners) { try { fn(ids); } catch (e) { console.error(e); } } };

export function subscribe(ids) {
  const list = [].concat(ids).filter(Boolean);
  for (const id of list) subs.set(id, (subs.get(id) || 0) + 1);
  if (state.serverPresent === false) pollDirect(list); else poll(list);
  return () => { for (const id of list) {
    const n = (subs.get(id) || 1) - 1;
    if (n <= 0) subs.delete(id); else subs.set(id, n);
  } };
}

export const quote = (id) => quotes.get(id) || null;
export const price = (id) => { const q = quotes.get(id); return q && typeof q.price === 'number' ? q.price : null; };
export const allQuotes = () => quotes;

/** Spot in USD. Everything books in native currency and converts here. */
export function toUSD(amount, ccy) {
  if (!isFinite(amount)) return null;
  if (!ccy || ccy === 'USD') return amount;
  const r = fxRate('USD', ccy);
  return r ? amount / r : null;
}

export function fxRate(base, quoteCcy) {
  if (base === quoteCcy) return 1;
  const direct = quotes.get(base + quoteCcy);
  if (direct && direct.price) return direct.price;
  const inverse = quotes.get(quoteCcy + base);
  if (inverse && inverse.price) return 1 / inverse.price;
  const bu = quotes.get('USD' + base), qu = quotes.get('USD' + quoteCcy);
  if (bu && qu && bu.price && qu.price) return qu.price / bu.price;
  if (base === 'USD' && qu && qu.price) return qu.price;
  if (quoteCcy === 'USD' && bu && bu.price) return 1 / bu.price;
  return null;
}

function groupByClass(ids) {
  const g = new Map();
  for (const id of ids) {
    const inst = lookup(id);
    if (!inst) continue;
    const cls = inst.cls === 'bond' ? 'yield' : inst.cls;
    if (!g.has(cls)) g.set(cls, []);
    g.get(cls).push(inst);
  }
  return g;
}

async function fetchClass(cls, instruments) {
  // FX comes back as a whole table in one call, so never send symbol lists.
  // Crypto goes by bare ticker; the server maps it onto each venue's pair naming.
  const symbols = cls === 'fx' ? []
    : cls === 'crypto' ? instruments.map((i) => i.sym)
    : instruments.map((i) => i.yf || i.td || i.sym);
  const qs = new URLSearchParams({ class: cls });
  if (symbols.length) qs.set('symbols', symbols.join(','));

  const res = await fetch(`${API}/quote?${qs}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`feed ${cls}: HTTP ${res.status}`);
  const data = await res.json();
  state.requestsToday++;

  const touched = [];
  for (const inst of instruments) {
    const row = data.rows[inst.sym] || data.rows[inst.yf] || data.rows[inst.td]
             || data.rows[inst.id] || (cls === 'fx' ? fxRow(data.rows, inst) : null);
    if (!row || row.price == null) continue;
    const prev = quotes.get(inst.id);
    quotes.set(inst.id, {
      ...row, id: inst.id, ccy: inst.ccy, cls: inst.cls,
      demo: !!row.demo, recvAt: Date.now(),
      lastPrice: prev ? prev.price : row.price,
      tickDir: prev && prev.price != null
        ? Math.sign(row.price - prev.price) : 0,
    });
    touched.push(inst.id);
  }
  return { touched, source: data.source, degraded: data.degraded };
}

/** FX arrives USD-based; derive any cross the universe asks for. */
function fxRow(rows, inst) {
  const get = (c) => (c === 'USD' ? 1 : (rows['USD' + c] || {}).price);
  const b = get(inst.base), q = get(inst.quote);
  if (!b || !q) return null;
  const rate = q / b;
  return { symbol: inst.id, price: rate, prevClose: rate, change: 0, changePct: 0,
           ts: Math.floor(Date.now() / 1000), currency: inst.quote };
}

let inflight = false;

export async function poll(only = null) {
  if (inflight) return;
  inflight = true;
  const ids = only || [...subs.keys()];
  if (!ids.length) { inflight = false; return; }

  const groups = groupByClass(ids);
  const touched = [];
  let sources = new Set(), degraded = false, failed = 0;

  await Promise.all([...groups].map(async ([cls, list]) => {
    try {
      const r = await fetchClass(cls, list);
      touched.push(...r.touched);
      if (r.source) sources.add(r.source);
      if (r.degraded) degraded = true;
    } catch (err) {
      failed++;
      console.warn('[feed]', cls, err.message);
    }
  }));

  state.lastPoll = Date.now();
  if (touched.length) { state.lastOk = Date.now(); state.errors = 0; }
  else state.errors++;
  state.source = [...sources].join('+') || state.source;
  state.demo = anyDemo();
  state.status = failed && !touched.length ? 'offline'
    : state.demo ? 'demo' : degraded ? 'degraded' : 'live';
  inflight = false;
  if (touched.length) emit(touched);
}

/** Daily bars, cached hard - this is what the vol estimators chew on. */
export async function bars(id, days = 365) {
  if (history.has(id)) return history.get(id);
  const inst = lookup(id);
  if (!inst) return [];
  try {
    const cls = inst.cls === 'crypto' ? 'crypto' : 'equity';
    const sym = inst.cls === 'crypto' ? inst.sym : (inst.yf || inst.sym);
    const res = await fetch(`${API}/history?symbol=${encodeURIComponent(sym)}&class=${cls}&days=${days}`);
    const data = await res.json();
    const out = data.bars || [];
    history.set(id, out);
    return out;
  } catch {
    history.set(id, []);
    return [];
  }
}

// ---------------------------------------------------------------- static mode
//
// Binance, CoinGecko and the ECB all send `Access-Control-Allow-Origin: *`, so
// with no server present the browser can still talk to them directly. Equities
// cannot work this way - Yahoo sends no CORS headers at all - which is why they
// fall back to the committed snapshot instead.

const DIRECT = {
  async crypto(instruments) {
    const touchedStable = [];
    for (const inst of instruments.filter((i) => i.sym === 'USDT')) {
      // There is no USDTUSDT pair. Tether is the quote asset here, so it is 1.00
      // by construction rather than by quote.
      quotes.set(inst.id, {
        id: inst.id, symbol: 'USDT', price: 1, prevClose: 1, change: 0, changePct: 0,
        ccy: 'USD', cls: 'crypto', currency: 'USD', source: 'peg',
        ts: Math.floor(Date.now() / 1000), recvAt: Date.now(), demo: false, tickDir: 0,
      });
      touchedStable.push(inst.id);
    }
    const pairs = instruments.filter((i) => i.sym !== 'USDT').map((i) => `"${i.sym}USDT"`);
    if (!pairs.length) return touchedStable;
    const res = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=[${encodeURIComponent(pairs.join(','))}]`);
    if (!res.ok) throw new Error(`binance ${res.status}`);
    const data = await res.json();
    const touched = touchedStable;
    for (const row of data) {
      const sym = row.symbol.replace(/USDT$/, '');
      const inst = instruments.find((i) => i.sym === sym);
      if (!inst) continue;
      const price = Number(row.lastPrice), prev = Number(row.openPrice);
      const before = quotes.get(inst.id);
      quotes.set(inst.id, {
        id: inst.id, symbol: sym, price, prevClose: prev,
        change: price - prev, changePct: prev ? (price / prev - 1) * 100 : 0,
        high: Number(row.highPrice), low: Number(row.lowPrice),
        volume: Number(row.quoteVolume), bid: Number(row.bidPrice), ask: Number(row.askPrice),
        ccy: 'USD', cls: 'crypto', currency: 'USD', source: 'binance-direct',
        ts: Math.floor(Date.now() / 1000), recvAt: Date.now(), demo: false,
        lastPrice: before ? before.price : price,
        tickDir: before ? Math.sign(price - before.price) : 0,
      });
      touched.push(inst.id);
    }
    return touched;
  },

  async fx(instruments) {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD');
    if (!res.ok) throw new Error(`frankfurter ${res.status}`);
    const { rates } = await res.json();
    const get = (c) => (c === 'USD' ? 1 : rates[c]);
    const touched = [];
    for (const inst of instruments) {
      const b = get(inst.base), q = get(inst.quote);
      if (!b || !q) continue;
      const price = q / b;
      const before = quotes.get(inst.id);
      quotes.set(inst.id, {
        id: inst.id, symbol: inst.id, price, prevClose: price, change: 0, changePct: 0,
        ccy: inst.ccy, cls: 'fx', currency: inst.quote, source: 'frankfurter-direct',
        ts: Math.floor(Date.now() / 1000), recvAt: Date.now(), demo: false,
        lastPrice: before ? before.price : price, tickDir: 0,
      });
      touched.push(inst.id);
    }
    return touched;
  },
};

/** Poll the CORS-open providers straight from the browser. Static mode only. */
export async function pollDirect(only = null) {
  const ids = only || [...subs.keys()];
  const groups = groupByClass(ids);
  const touched = [];
  for (const cls of ['crypto', 'fx']) {
    const list = groups.get(cls);
    if (!list || !list.length) continue;
    try {
      touched.push(...await DIRECT[cls](list));
    } catch (err) {
      console.warn('[feed:direct]', cls, err.message);
    }
  }
  if (touched.length) {
    state.lastOk = Date.now();
    state.demo = anyDemo();
    state.status = state.demo ? 'demo' : 'static';
    emit(touched);
  }
  return touched;
}

/** Adaptive scheduler: fast where it matters, slow where the tape is dark. */
let timer = null;
export function start() {
  detectServer();
  const tick = () => {
    const now = Date.now();
    const due = [];
    for (const id of subs.keys()) {
      const inst = lookup(id);
      if (!inst) continue;
      const cls = inst.cls === 'bond' ? 'index' : inst.cls;
      const base = BASE_INTERVAL[cls] || 60000;
      const open = sessionFor(inst).state === 'open';
      const interval = open ? base : base * CLOSED_MULTIPLIER;
      const q = quotes.get(id);
      if (!q || now - q.recvAt >= interval) due.push(id);
    }
    if (due.length) {
      if (state.serverPresent === false) pollDirect(due);
      else poll(due);
    }
    timer = setTimeout(tick, 5000);
  };
  tick();
}

export function stop() { clearTimeout(timer); timer = null; }

async function detectServer() {
  let ok = false;
  try {
    // A static host answers /api/health with 404 rather than throwing, so a
    // try/catch alone is not enough to tell "no server" from "no network".
    const res = await fetch(`${API}/health`, { cache: 'no-store' });
    ok = res.ok;
    if (ok) {
      const h = await res.json();
      state.hasKey = h.twelvedata_key;
    }
  } catch {
    ok = false;
  }
  state.serverPresent = ok;
  if (!ok) {
    state.status = 'static';
    await loadSnapshot();
    await pollDirect();     // crypto and FX do not need the proxy
  }
}

/** No server? Fall back to the committed snapshot so the terminal still runs. */
async function loadSnapshot() {
  try {
    const res = await fetch(new URL('data/snapshot.json', document.baseURI), { cache: 'no-store' });
    if (!res.ok) return;
    const snap = await res.json();
    // Snapshot rows are keyed by provider symbol; map them onto instrument ids.
    const { ALL } = await import('./universe.js');
    const byProviderSym = new Map();
    for (const inst of ALL) {
      for (const key of [inst.yf, inst.td, inst.sym, inst.id]) {
        if (key && !byProviderSym.has(key)) byProviderSym.set(key, inst);
      }
    }
    for (const [key, row] of Object.entries(snap.rows || {})) {
      const inst = byProviderSym.get(key);
      if (!inst) continue;
      // Per-row flags are authoritative: a snapshot can legitimately mix real
      // and synthetic rows, so the file-level flag must not tar the real ones.
      // Fall back to it only for older snapshots that predate per-row flags.
      const perRow = snap.real != null ? !!row.demo : !!(row.demo || snap.demo);
      quotes.set(inst.id, {
        ...row, id: inst.id, ccy: inst.ccy, cls: inst.cls,
        demo: perRow, snapshot: true, recvAt: Date.now(),
      });
    }
    state.source = `snapshot ${snap.asOf || ''}`.trim();
    state.demo = anyDemo();
    state.status = state.demo ? 'demo' : 'static';
    emit([...quotes.keys()]);
  } catch { /* nothing to fall back to */ }
}

/** Oldest subscribed quote, in seconds - drives the staleness light. */
/** True if any price currently on screen is synthetic rather than a real quote. */
export function anyDemo() {
  for (const id of subs.keys()) {
    const q = quotes.get(id);
    if (q && q.demo) return true;
  }
  return false;
}

/** Which subscribed instruments are showing synthetic prices. */
export function demoSymbols() {
  const out = [];
  for (const id of subs.keys()) {
    const q = quotes.get(id);
    if (q && q.demo) out.push(id);
  }
  return out;
}

export function worstAge() {
  let worst = 0;
  const now = Date.now();
  for (const id of subs.keys()) {
    const q = quotes.get(id);
    if (!q) continue;
    worst = Math.max(worst, (now - q.recvAt) / 1000);
  }
  return worst;
}

export const CRYPTO_IDS = CRYPTO.map((c) => c.id);
export const FX_IDS = FX.map((f) => f.id);
