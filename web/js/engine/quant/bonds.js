// Sovereign bond maths. The bonds are synthetic instruments, but the pricing
// is not: real yield in, clean and dirty price, accrued interest, Macaulay and
// modified duration, convexity, and the DV01 out.

import { BONDS, CURVE_DEFAULT } from '../../market/universe.js';
import * as feed from '../../market/feed.js';

let liveCurve = null;
export function setLiveCurve(curve) { liveCurve = curve; }

export function curveFor(ccy) {
  const base = { ...(CURVE_DEFAULT[ccy] || CURVE_DEFAULT.USD) };
  if (liveCurve && liveCurve[ccy]) Object.assign(base, liveCurve[ccy]);
  return base;
}

export function yieldFor(ccy, tenor) {
  const c = curveFor(ccy);
  const ts = Object.keys(c).map(Number).sort((a, b) => a - b);
  let lo = ts[0], hi = ts[ts.length - 1];
  for (const t of ts) { if (t <= tenor) lo = t; if (t >= tenor) { hi = t; break; } }
  if (lo === hi) return c[lo];
  return c[lo] + (c[hi] - c[lo]) * ((tenor - lo) / (hi - lo));
}

export const yearsToMaturity = (maturity) =>
  Math.max(0, (new Date(maturity + 'T00:00:00Z') - Date.now()) / (365.25 * 86400000));

/**
 * Price a fixed-coupon bullet bond off a yield.
 * Returns clean, dirty, accrued, duration, convexity and DV01 in one pass.
 */
export function priceFromYield({ coupon, maturity, freq = 2, par = 100, ytm }) {
  const T = yearsToMaturity(maturity);
  if (T <= 0) return { clean: par, dirty: par, accrued: 0, ytm, duration: 0, mod: 0, convexity: 0, dv01: 0, T: 0 };

  const y = ytm / 100 / freq;
  const c = (coupon / 100) * par / freq;
  const nExact = T * freq;
  const n = Math.max(1, Math.ceil(nExact));
  const frac = n - nExact;            // slice of a period already elapsed

  let pv = 0, wsum = 0, csum = 0;
  for (let i = 1; i <= n; i++) {
    const t = i - frac;
    if (t <= 0) continue;
    const cf = c + (i === n ? par : 0);
    const df = Math.pow(1 + y, -t);
    pv += cf * df;
    wsum += t * cf * df;
    csum += t * (t + 1) * cf * df;
  }

  const accrued = c * frac;
  const dirty = pv;
  const clean = dirty - accrued;
  const macaulay = (wsum / pv) / freq;
  const mod = macaulay / (1 + y);
  const convexity = (csum / pv) / (freq * freq * Math.pow(1 + y, 2));
  return { clean, dirty, accrued, ytm, duration: macaulay, mod, convexity,
           dv01: mod * dirty / 10000, T, freq, coupon, par };
}

/** Solve yield from a price - Newton on the price function. */
export function yieldFromPrice(spec, targetClean) {
  let y = spec.coupon || 4;
  for (let i = 0; i < 60; i++) {
    const p = priceFromYield({ ...spec, ytm: y });
    const diff = p.clean - targetClean;
    if (Math.abs(diff) < 1e-8) return y;
    const slope = -p.mod * p.dirty / 100;
    if (!isFinite(slope) || Math.abs(slope) < 1e-10) break;
    y = y - diff / slope;
    if (!isFinite(y) || y < -5 || y > 60) break;
  }
  let lo = -5, hi = 60;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (priceFromYield({ ...spec, ytm: mid }).clean > targetClean) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export const bondSpec = (id) => BONDS.find((b) => b.id === id) || null;

/** Live price for a listed sovereign bond, marked off the current curve. */
export function bondPrice(id) {
  const spec = bondSpec(id);
  if (!spec) return null;
  const T = yearsToMaturity(spec.maturity);
  const ytm = yieldFor(spec.ccy, T || spec.curveKey);
  return { ...priceFromYield({ ...spec, ytm }), id, spec, ccy: spec.ccy };
}

/** What a parallel shift does - the intuition pump for duration risk. */
export function shockBond(id, bpShift) {
  const spec = bondSpec(id);
  if (!spec) return null;
  const base = bondPrice(id);
  const shocked = priceFromYield({ ...spec, ytm: base.ytm + bpShift / 100 });
  return { base, shocked, pnl: shocked.clean - base.clean,
           pnlPct: (shocked.clean / base.clean - 1) * 100 };
}

/** The whole curve, ready for YCRV to draw. */
export function curvePoints(ccy) {
  const c = curveFor(ccy);
  return Object.keys(c).map(Number).sort((a, b) => a - b).map((t) => ({ tenor: t, yield: c[t] }));
}
