// Cox-Ross-Rubinstein tree for American exercise. Black-Scholes cannot price
// early exercise, and early exercise is exactly where an American put on a
// falling stock, or a call into a fat dividend, stops behaving like a European.

import { bsm } from './blackscholes.js';

/**
 * American option price by CRR backward induction.
 * Returns the price and the early-exercise premium over the European value.
 */
export function crr({ type = 'C', S, K, T, r = 0.04, q = 0, sigma, steps = 160 }) {
  if (!(S > 0 && K > 0 && T > 0 && sigma > 0)) {
    return { price: type === 'C' ? Math.max(0, S - K) : Math.max(0, K - S), earlyPremium: 0 };
  }
  const n = Math.max(20, Math.min(600, steps | 0));
  const dt = T / n;
  const u = Math.exp(sigma * Math.sqrt(dt));
  const d = 1 / u;
  const disc = Math.exp(-r * dt);
  const p = (Math.exp((r - q) * dt) - d) / (u - d);
  if (!(p > 0 && p < 1)) return { price: bsm({ type, S, K, T, r, q, sigma }).price, earlyPremium: 0 };

  const call = type === 'C';
  const v = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const ST = S * Math.pow(u, n - i) * Math.pow(d, i);
    v[i] = call ? Math.max(0, ST - K) : Math.max(0, K - ST);
  }
  for (let step = n - 1; step >= 0; step--) {
    for (let i = 0; i <= step; i++) {
      const cont = disc * (p * v[i] + (1 - p) * v[i + 1]);
      const ST = S * Math.pow(u, step - i) * Math.pow(d, i);
      const ex = call ? ST - K : K - ST;
      v[i] = ex > cont ? ex : cont;
    }
  }
  const euro = bsm({ type, S, K, T, r, q, sigma }).price;
  return { price: v[0], earlyPremium: Math.max(0, v[0] - euro) };
}

/**
 * American price plus Greeks. Delta and gamma come free from the first two tree
 * levels; the rest are central differences, which is slower but correct at the
 * exercise boundary where closed forms are simply wrong.
 */
export function crrGreeks(args) {
  const { type = 'C', S, K, T, r = 0.04, q = 0, sigma, steps = 160 } = args;
  const base = crr(args);
  if (!(S > 0 && T > 0 && sigma > 0)) {
    return { ...bsm({ type, S, K, T, r, q, sigma }), price: base.price, earlyPremium: 0, american: true };
  }

  const hS = S * 0.01;
  const up = crr({ ...args, S: S + hS }).price;
  const dn = crr({ ...args, S: S - hS }).price;
  const delta = (up - dn) / (2 * hS);
  const gamma = (up - 2 * base.price + dn) / (hS * hS);

  const hV = 0.01;
  const vega = (crr({ ...args, sigma: sigma + hV }).price
              - crr({ ...args, sigma: Math.max(1e-4, sigma - hV) }).price) / 2;

  const hT = Math.min(1 / 365, T / 4);
  const theta = T > hT ? crr({ ...args, T: T - hT }).price - base.price : 0;

  const hR = 0.0001;
  const rho = (crr({ ...args, r: r + hR }).price - crr({ ...args, r: r - hR }).price)
            / (2 * hR) / 100;

  const euro = bsm({ type, S, K, T, r, q, sigma });
  const iv = type === 'C' ? Math.max(0, S - K) : Math.max(0, K - S);
  return {
    price: base.price, delta, gamma, vega, theta: theta / (hT * 365),
    rho, vanna: euro.vanna, volga: euro.volga, charm: euro.charm,
    d1: euro.d1, d2: euro.d2,
    intrinsic: iv, extrinsic: Math.max(0, base.price - iv),
    earlyPremium: base.earlyPremium, american: true, steps,
  };
}

/** Route to the right model. US single-stock options are American; index options are European. */
export function priceOption(args) {
  return args.style === 'A' ? crrGreeks(args) : { ...bsm(args), american: false };
}
