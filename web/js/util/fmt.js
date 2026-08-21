// Terminal formatting. Numbers are right-aligned and fixed-width everywhere,
// so every helper returns a string with a stable decimal count.

const CCY_SYM = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹',
                  KRW: '₩', SGD: 'S$', CNY: 'CN¥', CAD: 'C$', CHF: 'CHF ',
                  AUD: 'A$', NZD: 'NZ$' };

// Currencies with no minor unit - showing 158.76 yen per share is just noise.
const ZERO_DP = new Set(['JPY', 'KRW']);

export const isNum = (v) => typeof v === 'number' && isFinite(v);

export function num(v, dp = 2) {
  if (!isNum(v)) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function px(v, ccy = 'USD', dp) {
  if (!isNum(v)) return '—';
  if (dp === undefined) {
    if (ZERO_DP.has(ccy)) dp = Math.abs(v) >= 1000 ? 0 : 1;
    else if (Math.abs(v) >= 1000) dp = 2;
    else if (Math.abs(v) >= 1) dp = 2;
    else if (Math.abs(v) >= 0.01) dp = 4;
    else dp = 8;
  }
  return num(v, dp);
}

export function money(v, ccy = 'USD', dp) {
  if (!isNum(v)) return '—';
  const d = dp !== undefined ? dp : (ZERO_DP.has(ccy) ? 0 : 2);
  const sign = v < 0 ? '-' : '';
  return sign + (CCY_SYM[ccy] || ccy + ' ') + num(Math.abs(v), d);
}

/** Compact magnitude for tape and market-cap columns. */
export function abbr(v, dp = 2) {
  if (!isNum(v)) return '—';
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e12) return `${s}${num(a / 1e12, dp)}T`;
  if (a >= 1e9)  return `${s}${num(a / 1e9, dp)}B`;
  if (a >= 1e6)  return `${s}${num(a / 1e6, dp)}M`;
  if (a >= 1e3)  return `${s}${num(a / 1e3, dp)}K`;
  return s + num(a, dp);
}

export const pct = (v, dp = 2) => (isNum(v) ? `${v >= 0 ? '+' : ''}${num(v, dp)}%` : '—');
export const signed = (v, dp = 2) => (isNum(v) ? `${v >= 0 ? '+' : ''}${num(v, dp)}` : '—');

/** Semantic colour class for a delta. Zero is grey, not green. */
export const dir = (v) => (!isNum(v) || v === 0 ? 'flat' : v > 0 ? 'up' : 'down');

export function age(seconds) {
  if (!isNum(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${String(Math.round(seconds % 60)).padStart(2, '0')}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}m`;
  return `${Math.floor(seconds / 86400)}d`;
}

export const clock = (d = new Date()) => d.toTimeString().slice(0, 8);
export const dstamp = (d = new Date()) => d.toISOString().slice(0, 10);

export function dtstamp(ts) {
  const d = typeof ts === 'number' ? new Date(ts) : new Date(String(ts));
  if (isNaN(d)) return '—';
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 8)}`;
}

/** Trading-day count, ignoring holidays - good enough for expiry ladders. */
export function daysTo(dateStr) {
  const then = new Date(dateStr + (dateStr.length === 10 ? 'T16:00:00Z' : ''));
  return (then - Date.now()) / 86400000;
}

export const yrs = (days) => Math.max(0, days) / 365;
export const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
