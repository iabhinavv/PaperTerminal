// The command line. Bloomberg grammar, as close as it goes:
//
//   AAPL US <Equity> GO     load a security into the focused panel
//   AAPL OMON               security + function in one line
//   PORT                    a bare function
//   OMON 2                  send the function to panel 2
//
// Anything not recognised falls through to a symbol search, so typing half a
// company name and hitting GO still gets you somewhere.

import { $, el, clear } from './util/dom.js';
import { search, lookup } from './market/universe.js';
import * as P from './panels.js';

const CLASS_WORDS = /<?(EQUITY|INDEX|CRNCY|CURNCY|CMDTY|CORP|GOVT|CRYPTO)>?/i;
const history = [];
let hpos = -1;
let acItems = [];
let acSel = 0;

export function parse(raw) {
  let s = String(raw || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!s) return null;
  s = s.replace(/\s*<GO>\s*$/, '').replace(/\s+GO$/, '').trim();
  if (!s) return null;

  let panelTarget = null;
  const panelMatch = s.match(/\s+([1-4])$/);
  if (panelMatch && !lookup(s)) { panelTarget = Number(panelMatch[1]) - 1; s = s.slice(0, panelMatch.index).trim(); }

  s = s.replace(CLASS_WORDS, ' ').replace(/\s+/g, ' ').trim();

  const tokens = s.split(' ');
  const lastToken = tokens[tokens.length - 1];

  // Trailing token is a function, everything before it is the security.
  if (tokens.length > 1 && P.definition(lastToken)) {
    const symPart = tokens.slice(0, -1).join(' ');
    const inst = lookup(symPart) || lookup(tokens[0]);
    return { fn: lastToken, arg: inst ? inst.id : symPart, panelTarget, instrument: inst };
  }
  if (P.definition(s)) return { fn: s, arg: null, panelTarget };

  const inst = lookup(s) || lookup(tokens[0]);
  if (inst) return { fn: 'DES', arg: inst.id, panelTarget, instrument: inst };

  const hits = search(s, 1);
  if (hits.length) return { fn: 'DES', arg: hits[0].id, panelTarget, instrument: hits[0] };
  return { fn: null, arg: s, panelTarget, unknown: true };
}

export function execute(raw, onUnknown) {
  const cmd = parse(raw);
  if (!cmd) return false;
  if (cmd.fn === null) { onUnknown && onUnknown(cmd.arg); return false; }
  history.unshift(raw.trim());
  if (history.length > 60) history.pop();
  hpos = -1;
  return P.open(cmd.fn, cmd.arg, cmd.panelTarget);
}

function suggestions(text) {
  const q = String(text || '').trim().toUpperCase();
  if (!q) return [];
  const out = [];
  const tokens = q.split(/\s+/);
  const tail = tokens[tokens.length - 1];

  for (const def of P.allDefs()) {
    if (def.code.startsWith(tail) || def.name.toUpperCase().includes(q)) {
      out.push({ kind: 'fn', key: def.code, desc: def.name, tag: def.group,
                 fill: tokens.length > 1 ? `${tokens.slice(0, -1).join(' ')} ${def.code}` : def.code });
    }
  }
  for (const inst of search(tokens[0], 10)) {
    out.push({ kind: 'sec', key: inst.sym, desc: inst.name,
               tag: inst.cls.toUpperCase().slice(0, 6), mkt: inst.mkt, fill: inst.sym });
  }
  out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'fn' ? -1 : 1));
  return out.slice(0, 14);
}

function renderAC(box, items) {
  clear(box);
  if (!items.length) { box.hidden = true; return; }
  let lastKind = null;
  items.forEach((it, i) => {
    if (it.kind !== lastKind) {
      box.append(el('div', { class: 'head',
        text: it.kind === 'fn' ? 'FUNCTIONS' : 'SECURITIES' }));
      lastKind = it.kind;
    }
    box.append(el('div', {
      class: `ac${i === acSel ? ' sel' : ''}`,
      onmousedown: (e) => { e.preventDefault(); choose(i); },
    },
      el('div', { class: 'k', text: it.key }),
      el('div', { class: 'd', text: it.desc }),
      el('div', { class: 't', text: it.tag || '' }),
      el('div', { class: 'm', text: it.mkt || '' })));
  });
  box.hidden = false;
}

function choose(i) {
  const it = acItems[i];
  if (!it) return;
  const input = $('#cmdline');
  input.value = it.fill + ' ';
  hideAC();
  input.focus();
  refreshAC();
}

const hideAC = () => { const b = $('#autocomplete'); b.hidden = true; clear(b); acItems = []; acSel = 0; };

function refreshAC() {
  const input = $('#cmdline');
  acItems = suggestions(input.value);
  acSel = Math.min(acSel, Math.max(0, acItems.length - 1));
  renderAC($('#autocomplete'), acItems);
}

export function mount(onUnknown) {
  const input = $('#cmdline');
  const box = $('#autocomplete');

  input.addEventListener('input', () => { acSel = 0; refreshAC(); });
  input.addEventListener('blur', () => setTimeout(hideAC, 140));
  input.addEventListener('focus', refreshAC);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && acItems.length) {
      e.preventDefault(); acSel = (acSel + 1) % acItems.length; renderAC(box, acItems);
    } else if (e.key === 'ArrowUp' && acItems.length && !e.ctrlKey) {
      e.preventDefault(); acSel = (acSel - 1 + acItems.length) % acItems.length; renderAC(box, acItems);
    } else if (e.key === 'Tab' && acItems.length) {
      e.preventDefault(); choose(acSel);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!box.hidden && acItems[acSel] && acItems[acSel].kind === 'fn'
          && input.value.trim().toUpperCase() !== acItems[acSel].key) {
        choose(acSel);
        return;
      }
      const value = input.value;
      hideAC();
      if (execute(value, onUnknown)) input.value = '';
    } else if (e.key === 'Escape') {
      if (!box.hidden) hideAC(); else input.value = '';
    } else if (e.key === 'ArrowUp' && e.ctrlKey) {
      e.preventDefault();
      if (hpos < history.length - 1) input.value = history[++hpos] || '';
    } else if (e.key === 'ArrowDown' && e.ctrlKey) {
      e.preventDefault();
      if (hpos > 0) input.value = history[--hpos] || ''; else { hpos = -1; input.value = ''; }
    }
  });

  $('#gobtn').addEventListener('click', () => {
    if (execute(input.value, onUnknown)) input.value = '';
    input.focus();
  });

  // Typing anywhere on the page lands in the command line, as it does on a real desk.
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input,select,textarea')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[a-zA-Z0-9]$/.test(e.key)) { input.focus(); }
  });

  input.focus();
}

export const cmdHistory = () => history.slice();
