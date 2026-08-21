// Panel manager. Four tiled, independently addressable panels - so you can
// watch OMON on one symbol while MARG updates live beside it.

import { $, el, clear } from './util/dom.js';

const registry = new Map();
export const panels = [];
let focused = 0;
let layout = 4;

export function register(def) {
  registry.set(def.code, { group: 'MISC', keep: false, ...def });
}
export const definition = (code) => registry.get(String(code || '').toUpperCase()) || null;
export const allDefs = () => [...registry.values()];

export function init(grid, count = 4) {
  layout = count;
  clear(grid);
  grid.className = `layout-${count}`;
  panels.length = 0;
  for (let i = 0; i < count; i++) {
    const head = el('div', { class: 'panel-head' },
      el('div', { class: 'n', text: String(i + 1) }),
      el('div', { class: 'title', text: 'EMPTY' }),
      el('div', { class: 'meta', text: '' }),
      el('div', { class: 'x', text: 'X', title: 'Clear panel' }));
    const body = el('div', { class: 'panel-body' });
    const node = el('div', { class: 'panel', data: { idx: String(i) } }, head, body);

    const panel = {
      idx: i, node, head, body, code: null, arg: null, ctx: {},
      _cleanup: [], _timers: [],
      title: (t) => { head.querySelector('.title').textContent = t; },
      meta: (t) => { head.querySelector('.meta').textContent = t || ''; },
      onCleanup: (fn) => panel._cleanup.push(fn),
      redraw: () => show(panel, panel.code, panel.arg, true),
    };
    head.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); clearPanel(panel); });
    node.addEventListener('mousedown', () => focus(i));
    panels.push(panel);
    grid.append(node);
  }
  focus(0);
  return panels;
}

export function focus(i) {
  focused = Math.max(0, Math.min(panels.length - 1, i));
  panels.forEach((p, n) => p.node.classList.toggle('focus', n === focused));
}
export const focusedPanel = () => panels[focused];

function teardown(panel) {
  for (const fn of panel._cleanup) { try { fn(); } catch (e) { console.error(e); } }
  panel._cleanup = [];
  for (const t of panel._timers) clearInterval(t);
  panel._timers = [];
}

export function clearPanel(panel) {
  teardown(panel);
  panel.code = panel.arg = null;
  panel.title('EMPTY');
  panel.meta('');
  clear(panel.body);
}

/** Render a function into a panel. Returns false if the mnemonic is unknown. */
export function show(panel, code, arg = null, isRedraw = false) {
  const def = definition(code);
  if (!def) return false;
  if (!isRedraw) teardown(panel); else teardown(panel);
  panel.code = def.code;
  panel.arg = arg;
  panel.title(def.name);
  panel.meta('');
  clear(panel.body);
  try {
    def.render(panel, arg);
  } catch (err) {
    console.error(`[${def.code}]`, err);
    panel.body.append(el('div', { class: 'empty',
      html: `<b>${def.code} failed to render.</b><br>${err.message}<br><br>Details are in the browser console.` }));
  }
  return true;
}

/** Open in the focused panel, or in the first free one if this is a fresh code. */
export function open(code, arg = null, target = null) {
  const def = definition(code);
  if (!def) return false;
  let panel = target != null ? panels[target] : null;
  if (!panel) {
    const already = panels.find((p) => p.code === def.code);
    if (already) panel = already;
  }
  if (!panel) panel = panels.find((p) => !p.code) || focusedPanel();
  focus(panel.idx);
  return show(panel, def.code, arg);
}

export function redrawAll() {
  for (const p of panels) if (p.code) p.redraw();
}

/**
 * Cheap live refresh: panels opt in with a repaint fn instead of a full redraw.
 *
 * Repainting is skipped while the tab is hidden - there is no point burning CPU
 * on a board nobody is looking at - but it fires immediately on the way back,
 * otherwise you return to a terminal showing minute-old numbers.
 */
export function live(panel, fn, ms = 1000) {
  const safe = () => { try { fn(); } catch (e) { console.error(e); } };
  safe();
  const timer = setInterval(() => { if (!document.hidden) safe(); }, ms);
  const onVisible = () => { if (!document.hidden) safe(); };
  document.addEventListener('visibilitychange', onVisible);
  panel._timers.push(timer);
  panel.onCleanup(() => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  });
}

export function setLayout(n, grid, restore = true) {
  const prev = panels.map((p) => ({ code: p.code, arg: p.arg }));
  init(grid, n);
  if (restore) prev.slice(0, n).forEach((s, i) => { if (s.code) show(panels[i], s.code, s.arg); });
}
