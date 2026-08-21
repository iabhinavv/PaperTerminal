// Exchange hours across ten timezones. Something is nearly always open, and
// knowing which venue is live is the difference between a fill and a resting
// order that sits until Tokyo wakes up.

import { MARKETS, MARKET_ORDER } from './universe.js';

const FMT = new Map();
function parts(tz, when) {
  let f = FMT.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour12: false, weekday: 'short',
      hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit',
    });
    FMT.set(tz, f);
  }
  const out = {};
  for (const p of f.formatToParts(when)) out[p.type] = p.value;
  return out;
}

const mins = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Fixed-date holidays common to most of these venues, plus the big local ones.
// A full exchange calendar is a moving target; this covers the days that would
// otherwise let you "trade" into a closed tape.
const HOLIDAYS = {
  US: ['01-01', '07-04', '12-25'],
  IN: ['01-26', '08-15', '10-02', '12-25'],
  JP: ['01-01', '01-02', '01-03', '02-11', '04-29', '05-03', '05-04', '05-05', '12-31'],
  KR: ['01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25'],
  SG: ['01-01', '05-01', '08-09', '12-25'],
  CN: ['01-01', '05-01', '10-01', '10-02', '10-03'],
  DE: ['01-01', '05-01', '10-03', '12-24', '12-25', '12-26', '12-31'],
  UK: ['01-01', '12-25', '12-26'],
  FR: ['01-01', '05-01', '07-14', '12-25'],
  CA: ['01-01', '07-01', '12-25', '12-26'],
};

/**
 * Session state for one market.
 * @returns {{state:'open'|'pre'|'post'|'closed'|'lunch'|'holiday'|'weekend',
 *            local:string, minutesToChange:number|null, label:string}}
 */
export function session(mktCode, when = new Date()) {
  const mkt = MARKETS[mktCode];
  if (!mkt) return { state: 'open', local: '', minutesToChange: null, label: '24H' };

  const p = parts(mkt.tz, when);
  const local = `${p.hour}:${p.minute}`;
  const now = mins(local);
  const dow = p.weekday;

  if (dow === 'Sat' || dow === 'Sun') {
    return { state: 'weekend', local, minutesToChange: null, label: 'WEEKEND' };
  }
  if ((HOLIDAYS[mktCode] || []).includes(`${p.month}-${p.day}`)) {
    return { state: 'holiday', local, minutesToChange: null, label: 'HOLIDAY' };
  }

  const open = mins(mkt.sessions[0][0]);
  const close = mins(mkt.sessions[mkt.sessions.length - 1][1]);

  for (const [s, e] of mkt.sessions) {
    if (now >= mins(s) && now < mins(e)) {
      return { state: 'open', local, minutesToChange: mins(e) - now, label: 'OPEN' };
    }
  }
  if (mkt.sessions.length > 1 && now >= mins(mkt.sessions[0][1]) && now < mins(mkt.sessions[1][0])) {
    return { state: 'lunch', local, minutesToChange: mins(mkt.sessions[1][0]) - now, label: 'LUNCH' };
  }
  if (mkt.preOpen && now >= mins(mkt.preOpen) && now < open) {
    return { state: 'pre', local, minutesToChange: open - now, label: 'PRE' };
  }
  if (mkt.postClose && now >= close && now < mins(mkt.postClose)) {
    return { state: 'post', local, minutesToChange: mins(mkt.postClose) - now, label: 'POST' };
  }
  return { state: 'closed', local, minutesToChange: now < open ? open - now : null, label: 'CLOSED' };
}

/** Crypto never closes; FX is closed only over the weekend. */
export function sessionFor(instrument, when = new Date()) {
  if (!instrument) return session('US', when);
  if (instrument.cls === 'crypto') return { state: 'open', local: '', minutesToChange: null, label: '24/7' };
  if (instrument.cls === 'fx') {
    const d = when.getUTCDay();
    const h = when.getUTCHours();
    const closed = (d === 6) || (d === 0 && h < 21) || (d === 5 && h >= 21);
    return { state: closed ? 'closed' : 'open', local: '', minutesToChange: null,
             label: closed ? 'CLOSED' : '24/5' };
  }
  return session(instrument.mkt, when);
}

export const isTradeable = (instrument, when) => {
  const s = sessionFor(instrument, when);
  return s.state === 'open' || s.state === 'pre' || s.state === 'post';
};

export function allSessions(when = new Date()) {
  return MARKET_ORDER.map((code) => ({ code, ...session(code, when) }));
}

/** Business days between two dates - drives settlement and the PDT window. */
export function businessDaysBetween(a, b) {
  let d = new Date(Math.min(a, b)), end = new Date(Math.max(a, b)), n = 0;
  d.setHours(0, 0, 0, 0); end.setHours(0, 0, 0, 0);
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

export function addBusinessDays(date, n) {
  const d = new Date(date);
  let left = n;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d;
}

/** Third Friday of a month - the standard listed-option expiry. */
export function thirdFriday(year, month) {
  const d = new Date(Date.UTC(year, month, 1));
  let count = 0;
  while (true) {
    if (d.getUTCDay() === 5 && ++count === 3) return new Date(d);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/** Standard expiry ladder: weeklies out a month, then monthlies, then quarterlies. */
export function expiryLadder(from = new Date(), count = 8) {
  const out = [];
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  for (let i = 0; i < 5; i++) {
    const w = new Date(d);
    w.setUTCDate(w.getUTCDate() + ((5 - w.getUTCDay() + 7) % 7 || 7));
    w.setUTCDate(w.getUTCDate() + i * 7);
    out.push(w);
  }
  let y = from.getUTCFullYear(), m = from.getUTCMonth();
  for (let i = 0; i < 10; i++) {
    const tf = thirdFriday(y, m);
    if (tf > from) out.push(tf);
    m++; if (m > 11) { m = 0; y++; }
  }
  const seen = new Set();
  return out
    .filter((x) => x > from)
    .sort((a, b) => a - b)
    .filter((x) => { const k = x.toISOString().slice(0, 10); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, count)
    .map((x) => x.toISOString().slice(0, 10));
}
