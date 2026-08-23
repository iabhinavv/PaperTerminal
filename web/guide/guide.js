// The guide is a renderer over content.js and glossary.js, plus one search index.

import { FEATURES, RECIPES, FUNCTIONS, ANNOTATIONS } from './content.js';
import { TERMS, CATEGORIES } from './glossary.js';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
};

const slug = (s) => String(s).toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const termId = (t) => 'term-' + slug(t);

// ─────────────────────────────────────────────────────────── glossary

const TERM_BY_NAME = new Map(TERMS.map((t) => [t.term.toLowerCase(), t]));

/** Cross-reference link, but only if the target actually exists. */
function seeLink(name) {
  const hit = TERM_BY_NAME.get(name.toLowerCase());
  if (!hit) return el('span', { text: name });
  return el('a', { href: '#' + termId(hit.term), text: name, onclick: () => setTimeout(flash, 60) });
}

function flash() {
  const t = document.querySelector('.term:target');
  if (!t) return;
  t.animate([{ borderColor: 'var(--amber)' }, { borderColor: 'var(--line)' }],
            { duration: 1400, easing: 'ease-out' });
}

function termCard(t, query = '') {
  const card = el('article', { class: 'term', id: termId(t.term) },
    el('h4', {},
      el('span', { html: hl(t.term, query) }),
      t.where ? el('span', { class: 'where', text: t.where }) : null),
    el('p', { class: 'short', html: hl(t.short, query) }),
    el('p', { class: 'body', html: hl(t.body, query) }));

  if (t.see.length) {
    const see = el('div', { class: 'see' }, 'See also: ');
    t.see.forEach((s, i) => {
      if (i) see.append(', ');
      see.append(seeLink(s));
    });
    card.append(see);
  }
  return card;
}

/** Highlight query matches without letting user input become markup. */
function hl(text, query) {
  const safe = escapeHtml(text);
  const q = query.trim();
  if (q.length < 2) return safe;
  const rx = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
  return safe.replace(rx, '<mark>$1</mark>');
}

let glossState = { cat: 'all', q: '' };

function renderGlossary() {
  const list = $('#gloss-list');
  const q = glossState.q.trim().toLowerCase();
  list.replaceChildren();

  let shown = 0;
  for (const [key, meta] of Object.entries(CATEGORIES)) {
    if (glossState.cat !== 'all' && glossState.cat !== key) continue;
    const hits = TERMS.filter((t) => t.cat === key && matches(t, q));
    if (!hits.length) continue;
    shown += hits.length;
    list.append(el('div', { class: 'gcat' },
      el('h3', { text: meta.name }),
      el('span', { text: `${hits.length} term${hits.length === 1 ? '' : 's'} — ${meta.blurb}` })));
    for (const t of hits) list.append(termCard(t, glossState.q));
  }
  $('#gloss-empty').hidden = shown > 0;
}

const matches = (t, q) => !q
  || t.term.toLowerCase().includes(q)
  || t.short.toLowerCase().includes(q)
  || t.body.toLowerCase().includes(q);

function buildGlossaryControls() {
  const box = $('#cat-filters');
  const chips = [['all', 'All', TERMS.length]];
  for (const [key, meta] of Object.entries(CATEGORIES)) {
    chips.push([key, meta.name, TERMS.filter((t) => t.cat === key).length]);
  }
  for (const [key, name, n] of chips) {
    box.append(el('button', {
      class: 'chip' + (key === 'all' ? ' on' : ''), type: 'button',
      'aria-pressed': key === 'all' ? 'true' : 'false',
      onclick: (e) => {
        glossState.cat = key;
        $$('.chip', box).forEach((c) => {
          c.classList.toggle('on', c === e.currentTarget);
          c.setAttribute('aria-pressed', c === e.currentTarget ? 'true' : 'false');
        });
        renderGlossary();
      },
    }, `${name} ${n}`));
  }
  $('#gq').addEventListener('input', (e) => { glossState.q = e.target.value; renderGlossary(); });
  $('#term-count').textContent = String(TERMS.length);
}

// ─────────────────────────────────────────────────────────── features

function renderFeatures(tag = 'all') {
  const box = $('#feature-list');
  box.replaceChildren();
  for (const f of FEATURES) {
    if (tag !== 'all' && f.tag !== tag) continue;
    const d = el('details', { class: 'feature', id: 'feature-' + f.id },
      el('summary', {},
        el('span', { class: 'f-fn', text: f.fn }),
        el('span', { class: 'f-name' }, f.name,
          el('span', { class: 'f-short', text: f.short })),
        el('span', { class: 'f-tag', text: f.tag })),
      el('div', { class: 'f-body' },
        ...f.body.map((p) => el('p', { html: p })),
        f.points.length ? el('ul', { class: 'f-points' },
          ...f.points.map(([fn, what]) => el('li', {},
            el('code', { text: fn }), el('span', { text: what })))) : null,
        f.terms.length ? termLinks(f.terms) : null));
    box.append(d);
  }
}

function termLinks(names) {
  const wrap = el('div', { class: 'termlinks' }, el('h4', { text: 'Terms used here' }));
  for (const n of names) {
    const hit = TERM_BY_NAME.get(n.toLowerCase());
    if (!hit) continue;
    wrap.append(el('a', { href: '#' + termId(hit.term), text: hit.term,
      onclick: () => { openTermFor(hit); setTimeout(flash, 60); } }));
  }
  return wrap;
}

/** Make sure the glossary filters are not hiding a term we are linking to. */
function openTermFor(t) {
  if (glossState.cat !== 'all' && glossState.cat !== t.cat) {
    glossState.cat = 'all';
    $$('#cat-filters .chip').forEach((c, i) => {
      c.classList.toggle('on', i === 0);
      c.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    });
  }
  if (glossState.q) { glossState.q = ''; $('#gq').value = ''; }
  renderGlossary();
}

// ──────────────────────────────────────────────────────────── recipes

const LEVEL_CLASS = { 'Start here': 'start', Intermediate: 'inter', Advanced: 'adv' };

function renderRecipes(tag = 'all') {
  const box = $('#recipe-list');
  box.replaceChildren();
  for (const r of RECIPES) {
    if (tag !== 'all' && r.tag !== tag) continue;
    box.append(el('details', { class: 'recipe', id: 'recipe-' + r.id },
      el('summary', {},
        el('span', { class: 'r-name', text: r.name }),
        el('span', { class: 'r-level ' + (LEVEL_CLASS[r.level] || ''), text: r.level }),
        el('span', { class: 'f-tag', text: r.tag })),
      el('div', { class: 'r-body' },
        el('p', { class: 'r-intro', text: r.intro }),
        el('ol', { class: 'r-steps' },
          ...r.steps.map(([head, detail]) => el('li', {},
            el('b', { text: head }), el('span', { html: detail })))),
        el('div', { class: 'r-watch' },
          el('strong', { text: 'Where people get hurt' }),
          el('span', { text: r.watch })),
        r.terms.length ? termLinks(r.terms) : null)));
  }
}

function buildTagFilters(id, items, onPick) {
  const box = $(id);
  const tags = ['all', ...new Set(items.map((i) => i.tag))];
  for (const t of tags) {
    box.append(el('button', {
      class: 'chip' + (t === 'all' ? ' on' : ''), type: 'button',
      'aria-pressed': t === 'all' ? 'true' : 'false',
      onclick: (e) => {
        $$('.chip', box).forEach((c) => {
          c.classList.toggle('on', c === e.currentTarget);
          c.setAttribute('aria-pressed', c === e.currentTarget ? 'true' : 'false');
        });
        onPick(t);
      },
    }, t === 'all' ? 'All' : t));
  }
}

// ────────────────────────────────────────────────────────── functions

function renderFunctions() {
  const body = $('#fn-body');
  for (const [code, name, what, sym] of FUNCTIONS) {
    body.append(el('tr', {},
      el('td', { class: 'c', text: code }),
      el('td', { class: 'n', text: name }),
      el('td', { class: 'd', text: what }),
      el('td', { class: sym === 'yes' ? 'y' : 'no', text: sym === 'yes' ? 'yes' : '—' })));
  }
}

// ─────────────────────────────────────────────────────── terminal tour

const R = (label, value, cls = '') =>
  `<div class="t-row"><span>${label}</span><span class="t-val ${cls}">${value}</span></div>`;

function buildReplica() {
  const shell = $('#replica');
  shell.innerHTML = `
    <div class="t-cmd" data-spot="cmd">
      <span class="tb">PAPERTERMINAL</span>
      <span class="ti">AAPL US &lt;Equity&gt; GO &nbsp;·&nbsp; PORT &nbsp;·&nbsp; MARG &nbsp;·&nbsp; OMON</span>
      <span class="tg">GO &lt;RETURN&gt;</span>
    </div>

    <div class="t-fkeys" data-spot="fkeys">
      ${[['F1','DES'],['F2','GP'],['F3','OMON'],['F4','PORT'],
         ['F5','MARG'],['F6','BORR'],['F7','TAX'],['F8','RISK']]
        .map(([k, c]) => `<div class="t-fk"><b>${k}</b>${c}</div>`).join('')}
    </div>

    <div class="t-grid">
      <div class="t-panel" data-spot="panel">
        <div class="t-head"><span>1 WORLD EQUITY INDICES</span><span data-spot="age">20/20 · 3s</span></div>
        <div class="t-body">
          <div class="t-row"><span>SPX</span><span class="t-dim">S&amp;P 500</span><span class="t-val">6,161.18</span><span class="t-down">-0.76%</span></div>
          <div class="t-row"><span>NIFTY</span><span class="t-dim">Nifty 50</span><span class="t-val">25,873.26</span><span class="t-down">-0.31%</span></div>
          <div class="t-row"><span>N225</span><span class="t-dim">Nikkei 225</span><span class="t-val">42,762.77</span><span class="t-down">-0.58%</span></div>
          <div class="t-row"><span>DAX</span><span class="t-dim">DAX 40</span><span class="t-val">23,421.39</span><span class="t-up">+1.14%</span></div>
          <div class="t-row"><span>FTSE</span><span class="t-dim">FTSE 100</span><span class="t-val">8,527.95</span><span class="t-up">+0.42%</span></div>
        </div>
      </div>

      <div class="t-panel">
        <div class="t-head"><span>2 PORTFOLIO</span><span>EQ $4,954.56 · 2 POS</span></div>
        <div class="t-body">
          ${R('Net equity', '$4,954.56')}
          ${R('Cash', '$4,832.71')}
          ${R('Borrowed', '$6,000.00', 't-down')}
          ${R('Unrealised', '-$8.86', 't-down')}
          ${R('Buying power', '$5,741.12')}
        </div>
      </div>

      <div class="t-panel">
        <div class="t-head"><span>3 MARGIN &amp; COST OF CAPITAL</span><span>LEV 1.40x</span></div>
        <div class="t-body">
          ${R('Your rate', '7.55%', 't-cy')}
          ${R('Interest per day', '$1.24', 't-down')}
          ${R('Per month', '$37.23', 't-down')}
          ${R('Book must rise', '+0.536%', 't-cy')}
          ${R('Cushion to call', '+41.3%')}
        </div>
      </div>

      <div class="t-panel">
        <div class="t-head"><span>4 EXCHANGE SESSIONS</span><span data-spot="session">10 MARKETS</span></div>
        <div class="t-body">
          <div class="t-row"><span>US</span><span class="t-dim">NYSE/NASDAQ</span><span class="t-val"><span class="t-tag open">OPEN</span></span></div>
          <div class="t-row"><span>IN</span><span class="t-dim">NSE</span><span class="t-val"><span class="t-tag">CLOSED</span></span></div>
          <div class="t-row"><span>JP</span><span class="t-dim">TSE</span><span class="t-val"><span class="t-tag">CLOSED</span></span></div>
          <div class="t-row"><span>DE</span><span class="t-dim">XETRA</span><span class="t-val"><span class="t-tag open">OPEN</span></span></div>
          <div class="t-row"><span>SG</span><span class="t-dim">SGX</span><span class="t-val"><span class="t-tag">CLOSED</span></span></div>
        </div>
      </div>
    </div>

    <div class="t-status" data-spot="status">
      <span>ACCT <b>$4,954.56</b></span>
      <span>CASH <b>$4,832.71</b></span>
      <span>P&amp;L <b>-$8.86</b></span>
      <span>BUY PWR <b>$5,741.12</b></span>
      <span>MARGIN <b>+42%</b></span>
      <span style="margin-left:auto">FEED <b>LIVE 3s</b></span>
    </div>

    <div class="t-tape" data-spot="tape">
      <span><b>SPX</b> 6,161.18 <span class="t-down">-0.76%</span></span>
      <span><b>BTC</b> 77,308.64 <span class="t-up">+7.63%</span></span>
      <span><b>ETH</b> 2,391.33 <span class="t-up">+5.35%</span></span>
      <span><b>EUR/USD</b> 1.1681 <span class="t-up">+0.08%</span></span>
      <span><b>USD/INR</b> 95.71 <span class="t-down">-0.02%</span></span>
    </div>`;

  placeHotspots(shell);
}

/**
 * Hotspots are positioned from the live geometry of the element they annotate,
 * so they stay correct at any width instead of being pinned to magic numbers.
 */
function placeHotspots(shell) {
  $$('.hot', shell).forEach((h) => h.remove());
  const base = shell.getBoundingClientRect();

  for (const a of ANNOTATIONS) {
    const target = shell.querySelector(`[data-spot="${a.at}"]`);
    if (!target) continue;
    const r = target.getBoundingClientRect();
    const btn = el('button', {
      class: 'hot pulse', type: 'button', text: String(a.n),
      'aria-label': `${a.n}. ${a.title}`,
      // Anchored just inside the leading edge rather than centred, so the
      // marker sits beside the thing it points at instead of on top of it.
      style: `left:${r.left - base.left + 11}px;` +
             `top:${r.top - base.top + Math.min(11, r.height / 2)}px`,
      onclick: () => selectSpot(a),
    });
    shell.append(btn);
  }
}

function selectSpot(a) {
  $$('.hot').forEach((h) => {
    const on = h.textContent === String(a.n);
    h.classList.toggle('on', on);
    h.classList.toggle('pulse', !on);
  });
  $('#tour-note').replaceChildren(
    el('h3', {}, el('span', { class: 'num', text: String(a.n) }), a.title),
    el('p', { html: a.text }));
}

// ───────────────────────────────────────────────────────────── search

let INDEX = [];

function buildIndex() {
  INDEX = [
    ...FEATURES.map((f) => ({
      kind: 'Feature', name: f.name, desc: f.short,
      hay: `${f.name} ${f.short} ${f.body.join(' ')} ${f.fn}`.toLowerCase(),
      href: '#feature-' + f.id, open: 'feature-' + f.id,
    })),
    ...RECIPES.map((r) => ({
      kind: 'How to', name: r.name, desc: r.intro,
      hay: `${r.name} ${r.intro} ${r.steps.map((s) => s.join(' ')).join(' ')} ${r.watch}`.toLowerCase(),
      href: '#recipe-' + r.id, open: 'recipe-' + r.id,
    })),
    ...FUNCTIONS.map(([code, name, what]) => ({
      kind: 'Function', name: `${code} — ${name}`, desc: what,
      hay: `${code} ${name} ${what}`.toLowerCase(), href: '#functions',
    })),
    ...TERMS.map((t) => ({
      kind: 'Term', name: t.term, desc: t.short,
      hay: `${t.term} ${t.short} ${t.body}`.toLowerCase(),
      href: '#' + termId(t.term), term: t,
    })),
  ];
}

const KIND_RANK = { Feature: 0, 'How to': 1, Function: 2, Term: 3 };

function search(q) {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  return INDEX
    .map((item) => {
      const name = item.name.toLowerCase();
      let score;
      if (name === needle) score = 0;
      else if (name.startsWith(needle)) score = 1;
      else if (name.includes(needle)) score = 2;
      else if (item.hay.includes(needle)) score = 4;
      else return null;
      return { item, score: score + KIND_RANK[item.kind] * 0.1 };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name))
    .slice(0, 20)
    .map((r) => r.item);
}

let selIndex = -1;

function renderResults(items, q) {
  const box = $('#results');
  box.replaceChildren();
  selIndex = -1;

  if (!items.length) {
    box.append(el('div', { class: 'res-none', text: `Nothing matches “${q}”.` }));
    box.hidden = false;
    $('#q').setAttribute('aria-expanded', 'true');
    return;
  }

  for (const item of items) {
    box.append(el('a', {
      class: 'res', href: item.href, role: 'option',
      onclick: (e) => { e.preventDefault(); goTo(item); },
    },
      el('div', { class: 'res-top' },
        el('span', { class: 'res-name', html: hl(item.name, q) }),
        el('span', { class: 'res-kind', text: item.kind })),
      el('div', { class: 'res-desc', html: hl(item.desc, q) })));
  }
  box.hidden = false;
  $('#q').setAttribute('aria-expanded', 'true');
}

function goTo(item) {
  closeResults();
  $('#q').value = '';
  if (item.term) openTermFor(item.term);
  if (item.open) {
    const d = document.getElementById(item.open);
    if (d) d.open = true;
  }
  location.hash = item.href;
  setTimeout(flash, 80);
}

function closeResults() {
  $('#results').hidden = true;
  $('#q').setAttribute('aria-expanded', 'false');
  selIndex = -1;
}

function moveSel(delta) {
  const opts = $$('.res');
  if (!opts.length) return;
  opts.forEach((o) => o.classList.remove('sel'));
  selIndex = (selIndex + delta + opts.length) % opts.length;
  opts[selIndex].classList.add('sel');
  opts[selIndex].scrollIntoView({ block: 'nearest' });
}

function wireSearch() {
  const input = $('#q');

  input.addEventListener('input', () => {
    const q = input.value;
    if (q.trim().length < 2) return closeResults();
    renderResults(search(q), q);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
    else if (e.key === 'Enter') {
      const opts = $$('.res');
      if (opts.length) { e.preventDefault(); (opts[selIndex] || opts[0]).click(); }
    } else if (e.key === 'Escape') { closeResults(); input.blur(); }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-shell')) closeResults();
  });

  // "/" focuses search, the way most documentation sites behave.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey) return;
    const t = document.activeElement;
    if (t && t.matches('input, textarea, select')) return;
    e.preventDefault();
    input.focus();
    input.select();
  });
}

// ──────────────────────────────────────────────────── nav highlighting

function wireNav() {
  const links = $$('[data-nav]');
  const sections = links
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  const obs = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = '#' + entry.target.id;
      links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === id));
    }
  }, { rootMargin: '-120px 0px -66% 0px', threshold: 0 });

  sections.forEach((s) => obs.observe(s));
}

// ─────────────────────────────────────────────────────────────── boot

function boot() {
  buildGlossaryControls();
  renderGlossary();
  renderFeatures();
  renderRecipes();
  renderFunctions();
  buildTagFilters('#feature-filters', FEATURES, renderFeatures);
  buildTagFilters('#recipe-filters', RECIPES, renderRecipes);
  buildReplica();
  selectSpot(ANNOTATIONS[0]);
  buildIndex();
  wireSearch();
  wireNav();

  // Hotspots are positioned from live geometry, so they must follow reflow.
  let t;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => placeHotspots($('#replica')), 120);
  });

  // A deep link to a term must survive the category filter.
  if (location.hash.startsWith('#term-')) {
    const hit = TERMS.find((x) => termId(x.term) === location.hash.slice(1));
    if (hit) { openTermFor(hit); setTimeout(() => {
      document.getElementById(location.hash.slice(1))?.scrollIntoView(); flash(); }, 80); }
  }
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
