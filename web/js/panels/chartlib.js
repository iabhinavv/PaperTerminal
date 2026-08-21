// Minimal SVG charting. No library - a few hundred bytes of path maths beats
// pulling a charting dependency into an app that must run offline from a file.

const NS = 'http://www.w3.org/2000/svg';
const mk = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  return n;
};

export function lineChart(series, opts = {}) {
  const w = opts.width || 600, h = opts.height || 160;
  const pad = { t: 6, r: 46, b: 16, l: 4 };
  const svg = mk('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`,
                          preserveAspectRatio: 'none', height: h });
  const pts = (series || []).filter((p) => isFinite(p.v));
  if (pts.length < 2) {
    svg.append(mk('text', { x: w / 2, y: h / 2, class: 'axis', 'text-anchor': 'middle' }));
    svg.lastChild.textContent = 'NO DATA';
    return svg;
  }

  const xs = pts.map((p) => p.t), ys = pts.map((p) => p.v);
  let lo = opts.min != null ? opts.min : Math.min(...ys);
  let hi = opts.max != null ? opts.max : Math.max(...ys);
  if (lo === hi) { lo -= 1; hi += 1; }
  const padY = (hi - lo) * 0.08;
  lo -= padY; hi += padY;

  const X = (t) => pad.l + ((t - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (w - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);

  for (let i = 0; i <= 4; i++) {
    const v = lo + (hi - lo) * (i / 4);
    const y = Y(v);
    svg.append(mk('line', { x1: pad.l, y1: y, x2: w - pad.r, y2: y, class: 'grid' }));
    const label = mk('text', { x: w - pad.r + 4, y: y + 3, class: 'axis' });
    label.textContent = fmtTick(v);
    svg.append(label);
  }

  if (opts.baseline != null && opts.baseline > lo && opts.baseline < hi) {
    svg.append(mk('line', { x1: pad.l, y1: Y(opts.baseline), x2: w - pad.r,
                            y2: Y(opts.baseline), class: 'zero' }));
  }

  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(2)},${Y(p.v).toFixed(2)}`).join('');
  if (opts.area) {
    const base = Y(Math.max(lo, opts.baseline ?? lo));
    svg.append(mk('path', { d: `${d}L${X(xs[xs.length - 1])},${base}L${X(xs[0])},${base}Z`, class: 'area' }));
  }
  const up = opts.color || (pts[pts.length - 1].v >= pts[0].v ? 'var(--green)' : 'var(--red)');
  svg.append(mk('path', { d, class: 'ln', style: `stroke:${up}` }));

  if (opts.overlay) {
    const od = opts.overlay.filter((p) => isFinite(p.v))
      .map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(2)},${Y(p.v).toFixed(2)}`).join('');
    svg.append(mk('path', { d: od, class: 'ln2' }));
  }

  const last = pts[pts.length - 1];
  svg.append(mk('circle', { cx: X(last.t), cy: Y(last.v), r: 2, fill: up }));
  return svg;
}

/** Horizontal bar row - used by RISK contributions and stress tests. */
export function barRow(value, max, opts = {}) {
  const w = opts.width || 120, h = opts.height || 9;
  const svg = mk('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, height: h, width: w });
  const mid = w / 2;
  const scale = max > 0 ? (Math.abs(value) / max) * (opts.signed ? mid : w) : 0;
  const color = value >= 0 ? 'var(--green)' : 'var(--red)';
  if (opts.signed) {
    svg.append(mk('line', { x1: mid, y1: 0, x2: mid, y2: h, class: 'grid' }));
    svg.append(mk('rect', { x: value >= 0 ? mid : mid - scale, y: 1,
                            width: Math.max(1, scale), height: h - 2, fill: color }));
  } else {
    svg.append(mk('rect', { x: 0, y: 1, width: Math.max(1, scale), height: h - 2,
                            fill: opts.color || color }));
  }
  return svg;
}

/** Payoff diagram for an option strategy at expiry, plus the live mark curve. */
export function payoffChart(points, opts = {}) {
  const w = opts.width || 600, h = opts.height || 190;
  const pad = { t: 8, r: 52, b: 18, l: 4 };
  const svg = mk('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, height: h,
                          preserveAspectRatio: 'none' });
  if (!points.length) return svg;

  const xs = points.map((p) => p.s);
  const allY = points.flatMap((p) => [p.expiry, p.now].filter((v) => isFinite(v)));
  let lo = Math.min(...allY), hi = Math.max(...allY);
  if (lo === hi) { lo -= 1; hi += 1; }
  const padY = (hi - lo) * 0.1; lo -= padY; hi += padY;

  const X = (s) => pad.l + ((s - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (w - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);

  for (let i = 0; i <= 4; i++) {
    const v = lo + (hi - lo) * (i / 4), y = Y(v);
    svg.append(mk('line', { x1: pad.l, y1: y, x2: w - pad.r, y2: y, class: 'grid' }));
    const t = mk('text', { x: w - pad.r + 4, y: y + 3, class: 'axis' });
    t.textContent = fmtTick(v);
    svg.append(t);
  }
  if (lo < 0 && hi > 0) {
    svg.append(mk('line', { x1: pad.l, y1: Y(0), x2: w - pad.r, y2: Y(0),
                            stroke: 'var(--border-hi)', 'stroke-width': 1 }));
  }
  if (opts.spot != null) {
    const x = X(opts.spot);
    svg.append(mk('line', { x1: x, y1: pad.t, x2: x, y2: h - pad.b,
                            stroke: 'var(--cyan-dim)', 'stroke-dasharray': '2 2' }));
  }

  // Profit region green, loss region red - readable at a glance.
  const seg = [];
  let cur = null;
  for (const p of points) {
    const sign = p.expiry >= 0;
    if (!cur || cur.sign !== sign) { cur = { sign, pts: [] }; seg.push(cur); }
    cur.pts.push(p);
  }
  for (const s of seg) {
    if (s.pts.length < 2) continue;
    const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.s).toFixed(1)},${Y(p.expiry).toFixed(1)}`).join('');
    const base = Y(0);
    svg.append(mk('path', {
      d: `${d}L${X(s.pts[s.pts.length - 1].s)},${base}L${X(s.pts[0].s)},${base}Z`,
      fill: s.sign ? 'rgba(36,209,126,.14)' : 'rgba(255,77,77,.14)' }));
    svg.append(mk('path', { d, fill: 'none', 'stroke-width': 1.4,
                            stroke: s.sign ? 'var(--green)' : 'var(--red)' }));
  }

  const nowPts = points.filter((p) => isFinite(p.now));
  if (nowPts.length > 1) {
    const d = nowPts.map((p, i) => `${i ? 'L' : 'M'}${X(p.s).toFixed(1)},${Y(p.now).toFixed(1)}`).join('');
    svg.append(mk('path', { d, class: 'ln2' }));
  }
  return svg;
}

function fmtTick(v) {
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(0) + 'K';
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

/** Sparkline for a table cell. */
export function spark(values, opts = {}) {
  const w = opts.width || 60, h = opts.height || 14;
  const svg = mk('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, width: w, height: h });
  const vs = (values || []).filter(isFinite);
  if (vs.length < 2) return svg;
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const X = (i) => (i / (vs.length - 1)) * w;
  const Y = (v) => h - 1 - ((v - lo) / (hi - lo || 1)) * (h - 2);
  const d = vs.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  svg.append(mk('path', { d, fill: 'none', 'stroke-width': 1,
    stroke: vs[vs.length - 1] >= vs[0] ? 'var(--green)' : 'var(--red)' }));
  return svg;
}
