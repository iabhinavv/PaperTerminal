// The account. One plain object, serialisable to JSON, owned entirely by the
// browser. No server ever sees it. Export it, commit it to your own repo,
// diff it, or delete it - it is yours.

const KEY = 'paperterminal.v1';
const VERSION = 1;

export const CONFIG_DEFAULTS = {
  startingCash: 1000,
  weeklyInflow: 1000,
  inflowDay: 1,                 // 1 = Monday
  baseCurrency: 'USD',
  lotMethod: 'FIFO',            // FIFO | HIFO | SPECID
  taxBracket: 24,               // ordinary income rate, drives STCG
  ltcgRate: 15,
  filingStatus: 'single',
  niitEnabled: false,
  marginEnabled: true,
  borrowEnabled: true,
  initialMarginPct: 50,         // Reg T
  maintenanceMarginPct: 30,     // house rate, above the 25% FINRA floor
  pdtEnabled: true,
  commissionEquity: 0,
  commissionOption: 0.65,       // per contract, the US retail standard
  commissionFutures: 2.25,
  slippageEnabled: true,
};

function freshAccount(cfg = CONFIG_DEFAULTS) {
  const now = Date.now();
  return {
    version: VERSION,
    createdAt: now,
    config: { ...CONFIG_DEFAULTS, ...cfg },
    cash: cfg.startingCash ?? CONFIG_DEFAULTS.startingCash,
    borrowed: 0,               // explicit loan principal, separate from margin debit
    accruedInterest: 0,        // charged but not yet swept from cash
    positions: [],             // open positions, each with its own tax lots
    closedLots: [],            // realised, feeds the tax engine
    orders: [],                // working orders: limit, stop, stop-limit, trailing
    trades: [],                // the blotter, append-only
    cashflows: [],             // deposits, interest, commissions, taxes, coupons
    alerts: [],
    watchlist: ['AAPL.US', 'NVDA.US', 'RELIANCE.IN', '7203.JP', '005930.KR',
                'D05.SG', '600519.CN', 'BTC', 'ETH', 'EURUSD'],
    dayTrades: [],             // timestamps, for the PDT counter
    marginCalls: [],
    taxYears: {},
    lastTick: now,             // deterministic clock cursor
    lastInflow: null,
    stats: { peakEquity: cfg.startingCash ?? 1000, maxDrawdown: 0, equityCurve: [] },
    flags: { pdtFlagged: false, liquidated: 0, everNegative: false },
  };
}

let account = null;
const listeners = new Set();

export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function emit(reason = '') {
  for (const fn of listeners) { try { fn(account, reason); } catch (e) { console.error(e); } }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === VERSION) {
        account = { ...freshAccount(), ...parsed,
                    config: { ...CONFIG_DEFAULTS, ...(parsed.config || {}) } };
        return account;
      }
    }
  } catch (err) {
    console.warn('[state] could not read saved account:', err.message);
  }
  account = freshAccount();
  save();
  return account;
}

export const get = () => account || load();

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(account));
    } catch (err) {
      console.warn('[state] save failed - storage may be blocked on file://', err.message);
    }
  }, 250);
}

/** Mutate + persist + notify, in one place so nothing can drift. */
export function update(fn, reason = '') {
  const result = fn(account);
  save();
  emit(reason);
  return result;
}

export function reset(cfg) {
  account = freshAccount({ ...(account && account.config), ...cfg });
  save();
  emit('reset');
  return account;
}

export function exportJSON() {
  return JSON.stringify({ ...account, exportedAt: new Date().toISOString() }, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('not an account file');
  if (parsed.version !== VERSION) throw new Error(`account version ${parsed.version} — expected ${VERSION}`);
  account = { ...freshAccount(), ...parsed,
              config: { ...CONFIG_DEFAULTS, ...(parsed.config || {}) } };
  save();
  emit('import');
  return account;
}

let seq = 0;
export const nextId = (prefix = 'x') =>
  `${prefix}${Date.now().toString(36)}${(seq++).toString(36).padStart(2, '0')}`;

/** Every movement of money is recorded, so the tax and interest panels can explain themselves. */
export function cashflow(kind, amount, note, meta = {}) {
  account.cashflows.push({
    id: nextId('cf'), at: Date.now(), kind, amount, note, ...meta,
  });
  account.cash += amount;
  if (account.cash < 0) account.flags.everNegative = true;
  if (account.cashflows.length > 4000) account.cashflows.splice(0, 1000);
  return account.cash;
}
