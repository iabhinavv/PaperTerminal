// Black-Scholes-Merton with a continuous dividend/carry yield, plus the Greeks
// the option monitor actually shows. Rates and vols are decimals: 0.045, 0.32.

const SQRT2PI = Math.sqrt(2 * Math.PI);

/** Standard normal PDF. */
export const npdf = (x) => Math.exp(-0.5 * x * x) / SQRT2PI;

/**
 * Standard normal CDF, Hart 1968 rational approximation as given by West (2005).
 * Double precision to ~1e-15 - the cheap Abramowitz-Stegun form is only good to
 * 1e-7, which shows up as visible error in deep-wing option prices.
 */
export function ncdf(x) {
  const z = Math.abs(x);
  let c = 0;
  if (z <= 37) {
    const e = Math.exp(-z * z / 2);
    if (z < 7.07106781186547) {
      let b = 3.52624965998911e-2 * z + 0.700383064443688;
      b = b * z + 6.37396220353165;
      b = b * z + 33.912866078383;
      b = b * z + 112.079291497871;
      b = b * z + 221.213596169931;
      b = b * z + 220.206867912376;
      let d = 8.83883476483184e-2 * z + 1.75566716318264;
      d = d * z + 16.064177579207;
      d = d * z + 86.7807322029461;
      d = d * z + 296.564248779674;
      d = d * z + 637.333633378831;
      d = d * z + 793.826512519948;
      d = d * z + 440.413735824752;
      c = e * b / d;
    } else {
      let b = z + 0.65;
      b = z + 4 / b; b = z + 3 / b; b = z + 2 / b; b = z + 1 / b;
      c = e / (b * 2.506628274631);
    }
  }
  return x > 0 ? 1 - c : c;
}

function guard(S, K, T, sigma) {
  return S > 0 && K > 0 && T > 0 && sigma > 0 && isFinite(S) && isFinite(K);
}

/** Intrinsic value - what the contract is worth at expiry, or if inputs degenerate. */
export function intrinsic(type, S, K) {
  return type === 'C' ? Math.max(0, S - K) : Math.max(0, K - S);
}

/**
 * Price a European option and return every Greek in one pass.
 *
 * Greeks are returned in trader units, not raw derivatives:
 *   vega  - price change per 1 volatility POINT (1% vol move)
 *   theta - price change per CALENDAR DAY
 *   rho   - price change per 1 rate POINT (1% rate move)
 * Delta and gamma stay in raw per-unit-of-spot terms.
 */
export function bsm({ type = 'C', S, K, T, r = 0.04, q = 0, sigma }) {
  if (!guard(S, K, T, sigma)) {
    const iv = intrinsic(type, S, K);
    const dl = type === 'C' ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
    return { price: iv, delta: dl, gamma: 0, vega: 0, theta: 0, rho: 0,
             vanna: 0, volga: 0, charm: 0, d1: 0, d2: 0, intrinsic: iv, extrinsic: 0 };
  }

  const vt = sigma * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / vt;
  const d2 = d1 - vt;
  const dfR = Math.exp(-r * T);
  const dfQ = Math.exp(-q * T);
  const nd1 = npdf(d1);
  const call = type === 'C';
  const Nd1 = ncdf(call ? d1 : -d1);
  const Nd2 = ncdf(call ? d2 : -d2);
  const sgn = call ? 1 : -1;

  const price = sgn * (S * dfQ * Nd1 - K * dfR * Nd2);
  const delta = sgn * dfQ * Nd1;
  const gamma = (dfQ * nd1) / (S * vt);
  const vega = S * dfQ * nd1 * Math.sqrt(T);
  const thetaY =
    -(S * dfQ * nd1 * sigma) / (2 * Math.sqrt(T))
    - sgn * r * K * dfR * Nd2
    + sgn * q * S * dfQ * Nd1;
  const rho = sgn * K * T * dfR * Nd2;
  const vanna = -dfQ * nd1 * (d2 / sigma);
  const volga = vega * (d1 * d2) / sigma;
  const charm = -dfQ * (nd1 * (2 * (r - q) * T - d2 * vt) / (2 * T * vt) - sgn * q * Nd1);
  const iv = intrinsic(type, S, K);

  return {
    price, delta, gamma,
    vega: vega / 100,          // per vol point
    theta: thetaY / 365,       // per calendar day
    rho: rho / 100,            // per rate point
    vanna: vanna / 100, volga: volga / 10000, charm: charm / 365,
    d1, d2, intrinsic: iv, extrinsic: Math.max(0, price - iv),
  };
}

/** Forward price implied by carry. */
export const forward = (S, r, q, T) => S * Math.exp((r - q) * T);

/**
 * Implied volatility from a market price. Newton-Raphson on vega, with a
 * bisection fallback for the deep wings where vega collapses and Newton
 * diverges.
 */
export function impliedVol({ type = 'C', S, K, T, r = 0.04, q = 0, price }) {
  const iv = intrinsic(type, S, K);
  if (!(price > iv) || T <= 0 || S <= 0 || K <= 0) return null;

  let sigma = Math.min(3, Math.max(0.05,
    Math.sqrt(2 * Math.PI / T) * (price / S)));   // Brenner-Subrahmanyam seed

  for (let i = 0; i < 40; i++) {
    const o = bsm({ type, S, K, T, r, q, sigma });
    const diff = o.price - price;
    if (Math.abs(diff) < 1e-8) return sigma;
    const vega = o.vega * 100;
    if (!isFinite(vega) || vega < 1e-8) break;
    const step = diff / vega;
    const next = sigma - Math.max(-0.5, Math.min(0.5, step));
    if (next <= 0.0005 || next > 8) break;
    sigma = next;
  }

  let lo = 0.0005, hi = 8;
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2;
    if (bsm({ type, S, K, T, r, q, sigma: mid }).price > price) hi = mid;
    else lo = mid;
    if (hi - lo < 1e-9) break;
  }
  const out = (lo + hi) / 2;
  return out > 0.001 && out < 7.99 ? out : null;
}

/** Probability the option finishes in the money, under the risk-neutral measure. */
export function probITM({ type = 'C', S, K, T, r = 0.04, q = 0, sigma }) {
  if (!guard(S, K, T, sigma)) return intrinsic(type, S, K) > 0 ? 1 : 0;
  const d2 = (Math.log(S / K) + (r - q - 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  return type === 'C' ? ncdf(d2) : ncdf(-d2);
}

/** Probability spot ever touches the strike before expiry - what stops really face. */
export function probTouch({ S, K, T, sigma, r = 0.04, q = 0 }) {
  if (!guard(S, K, T, sigma)) return 0;
  const mu = r - q - 0.5 * sigma * sigma;
  const b = Math.log(K / S);
  const vt = sigma * Math.sqrt(T);
  const up = b > 0;
  const p = ncdf((-Math.abs(b) + (up ? mu : -mu) * T) / vt)
    + Math.exp(2 * (up ? mu : -mu) * b / (sigma * sigma))
      * ncdf((-Math.abs(b) - (up ? mu : -mu) * T) / vt);
  return Math.max(0, Math.min(1, p));
}
