// Tiny DOM helpers. No framework, no build step - the whole point is that a
// self-hoster can read this file and know exactly what the page does.

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'data') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

/** Build a table from column specs. Keeps every panel's grid identical. */
export function table(cols, rows, opts = {}) {
  const thead = el('thead', {}, el('tr', {}, ...cols.map((c) =>
    el('th', { style: c.w ? `width:${c.w}` : null, title: c.title || null }, c.label))));
  const trs = rows.map((r, i) => {
    const tr = el('tr', { class: r._cls || null, data: r._data || {} },
      ...cols.map((c) => {
        const raw = c.get ? c.get(r, i) : r[c.key];
        const cls = c.cls ? c.cls(r, i) : null;
        const cell = el('td', { class: cls, title: c.tip ? c.tip(r, i) : null });
        if (raw && raw.nodeType) cell.append(raw);
        else cell.innerHTML = raw == null ? '—' : raw;
        return cell;
      }));
    if (opts.onRow) tr.addEventListener('click', () => opts.onRow(r, i, tr));
    if (opts.onRow) tr.style.cursor = 'pointer';
    return tr;
  });
  return el('table', { class: 't' }, thead, el('tbody', {}, ...trs));
}

export const kv = (pairs) => el('dl', { class: 'kv' },
  ...pairs.flatMap(([k, v, cls]) => [
    el('dt', { text: k }),
    v && v.nodeType ? el('dd', { class: cls || null }, v) : el('dd', { class: cls || null, html: v == null ? '—' : String(v) }),
  ]));

export const sect = (label) => el('div', { class: 'sect', text: label });

export function empty(...lines) {
  return el('div', { class: 'empty', html: lines.join('<br>') });
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

let toastTimer = new WeakMap();
export function toast(msg, kind = '') {
  const box = $('#toasts');
  const t = el('div', { class: `toast ${kind}`.trim(), html: msg });
  box.append(t);
  const kill = setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 200); }, 4200);
  toastTimer.set(t, kill);
  while (box.children.length > 6) box.firstChild.remove();
  return t;
}

export function modal(title, body, opts = {}) {
  const box = clear($('#modalbox'));
  box.append(
    el('div', { class: 'panel-head' },
      el('div', { class: 'title', text: title }),
      opts.meta ? el('div', { class: 'meta', text: opts.meta }) : null,
      el('div', { class: 'x', text: 'X', onclick: closeModal })),
    el('div', { class: 'bd' }, body));
  $('#modal').classList.add('on');
  if (opts.width) box.style.minWidth = opts.width;
  const first = box.querySelector('input,select,button');
  if (first) setTimeout(() => first.focus(), 30);
}

export function closeModal() {
  $('#modal').classList.remove('on');
  clear($('#modalbox'));
  const cmd = $('#cmdline');
  if (cmd) cmd.focus();
}
