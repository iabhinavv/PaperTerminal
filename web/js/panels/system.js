// HELP and SET.

import { el, table, empty, sect, kv, clear, toast, modal, closeModal } from '../util/dom.js';
import { num, money, pct } from '../util/fmt.js';
import { register, live, allDefs } from '../panels.js';
import * as S from '../engine/state.js';
import * as feed from '../market/feed.js';
import { MARKETS, MARKET_ORDER, ALL } from '../market/universe.js';

register({
  code: 'HELP', name: 'HELP — FUNCTION INDEX', group: 'SYSTEM',
  render(panel) {
    const host = el('div');
    panel.body.append(host);

    host.append(el('div', { class: 'empty', html:
      'Type a function code and press <b>GO</b>. Combine a security with a function to load ' +
      'both at once — <b>AAPL OMON</b>, <b>NIFTY OV</b>, <b>BTC GP</b>. Add a panel number to ' +
      'send it somewhere specific: <b>PORT 3</b>.' }));

    const groups = {};
    for (const d of allDefs()) (groups[d.group] = groups[d.group] || []).push(d);
    for (const [group, defs] of Object.entries(groups)) {
      host.append(sect(group));
      host.append(table([
        { label: 'CODE', get: (d) => `<span class="hl">${d.code}</span>` },
        { label: 'FUNCTION', get: (d) => d.name },
        { label: 'TAKES A SECURITY', get: (d) => (d.needsSymbol ? 'yes' : '—'), cls: () => 'dim' },
      ], defs.sort((a, b) => a.code.localeCompare(b.code))));
    }

    host.append(sect('KEYBOARD'));
    host.append(table([
      { label: 'KEY', get: (r) => `<span class="hl">${r.k}</span>` },
      { label: 'DOES', get: (r) => r.d },
    ], [
      { k: 'GO / Return', d: 'Execute the command line' },
      { k: 'Tab', d: 'Accept the highlighted suggestion' },
      { k: '↑ ↓', d: 'Move through suggestions' },
      { k: 'Ctrl + ↑ ↓', d: 'Recall previous commands' },
      { k: 'Esc', d: 'Dismiss the dropdown, then clear the line' },
      { k: 'F1 – F8', d: 'Jump to the function on the blue strip' },
      { k: '1 – 4', d: 'Focus a panel, when the command line is empty' },
    ]));

    host.append(sect('HOW THE DATA WORKS'));
    host.append(el('div', { class: 'empty', html:
      `Crypto refreshes every 15 seconds, equities and indices every 60, FX every 5 minutes. ` +
      `Closed venues poll 20× slower to protect the request budget. Every price on screen ` +
      `carries its age, and the order ticket shows you how stale a quote is <b>before</b> you ` +
      `fill against it.<br><br>` +
      `Options, futures and forwards are <b>model-priced</b>, not vendor-quoted — real spot, ` +
      `real volatility, a fitted skew, and Black-Scholes-Merton or a binomial tree on top. ` +
      `Bonds are synthetic but the maths is not: yields drive clean and dirty price, accrued ` +
      `interest, duration, convexity and DV01.` }));
  },
});

register({
  code: 'SET', name: 'SETTINGS & ACCOUNT DATA', group: 'SYSTEM',
  render(panel) {
    const host = el('div');
    panel.body.append(host);

    const paint = () => {
      const acct = S.get();
      const cfg = acct.config;
      clear(host);

      const field = (label, key, type = 'number', step = 'any', hint = '') => {
        const input = el('input', { class: 'f', type, step, value: String(cfg[key]),
          onchange: (e) => {
            cfg[key] = type === 'checkbox' ? e.target.checked
              : type === 'number' ? Number(e.target.value) : e.target.value;
            S.save(); S.emit('config'); toast(`${label} updated`);
          } });
        if (type === 'checkbox') { input.checked = !!cfg[key]; input.removeAttribute('value'); }
        return [el('span', { class: 'dim', text: label }),
                el('div', {}, input, hint ? el('div', { class: 'dim', style: 'font-size:10px', text: hint }) : null)];
      };

      const select = (label, key, options, hint = '') => {
        const sel = el('select', { class: 'f', onchange: (e) => {
          cfg[key] = e.target.value; S.save(); S.emit('config'); toast(`${label} updated`); } },
          ...options.map((o) => el('option', { value: o }, o)));
        sel.value = cfg[key];
        return [el('span', { class: 'dim', text: label }),
                el('div', {}, sel, hint ? el('div', { class: 'dim', style: 'font-size:10px', text: hint }) : null)];
      };

      const gridStyle = 'display:grid;grid-template-columns:150px 1fr;gap:4px 10px;align-items:start;margin-bottom:6px';

      host.append(sect('CAPITAL'));
      host.append(el('div', { style: gridStyle },
        ...field('Starting cash', 'startingCash', 'number', '100', 'Applies on reset'),
        ...field('Weekly inflow', 'weeklyInflow', 'number', '100', 'Paid every Monday, even while closed'),
        ...field('Commission / option', 'commissionOption', 'number', '0.05', 'Per contract'),
        ...field('Commission / future', 'commissionFutures', 'number', '0.25', 'Per contract')));

      host.append(sect('LEVERAGE'));
      host.append(el('div', { style: gridStyle },
        ...field('Margin enabled', 'marginEnabled', 'checkbox'),
        ...field('Borrowing enabled', 'borrowEnabled', 'checkbox'),
        ...field('Initial margin %', 'initialMarginPct', 'number', '5', 'Reg T is 50%'),
        ...field('Maintenance %', 'maintenanceMarginPct', 'number', '1', 'FINRA floor is 25%'),
        ...field('PDT rule active', 'pdtEnabled', 'checkbox', '', 'Blocks day trades under $25k'),
        ...field('Slippage model', 'slippageEnabled', 'checkbox')));

      host.append(sect('TAX'));
      host.append(el('div', { style: gridStyle },
        ...field('Ordinary rate %', 'taxBracket', 'number', '1', 'Drives short-term capital gains'),
        ...field('Long-term rate %', 'ltcgRate', 'number', '1', '0, 15 or 20 in reality'),
        ...select('Lot method', 'lotMethod', ['FIFO', 'HIFO', 'LIFO'], 'Changes which lot you sell, and the bill'),
        ...select('Filing status', 'filingStatus', ['single', 'married']),
        ...field('Apply 3.8% NIIT', 'niitEnabled', 'checkbox')));

      host.append(sect('YOUR DATA'));
      host.append(el('div', { class: 'empty', html:
        `This account lives in your browser's local storage and nowhere else. No server sees ` +
        `it, there is no login, and nothing is uploaded. Export it to keep it, commit it to ` +
        `your own repository, or throw it away.` }));

      host.append(el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
        el('button', { class: 'btn', onclick: () => {
          const blob = new Blob([S.exportJSON()], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `paperterminal-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(a.href);
          toast('Account exported', 'ok');
        } }, 'EXPORT ACCOUNT'),
        el('button', { class: 'btn', onclick: () => {
          const inp = el('input', { type: 'file', accept: '.json' });
          inp.addEventListener('change', async () => {
            try {
              S.importJSON(await inp.files[0].text());
              toast('Account imported', 'ok');
              paint();
            } catch (err) { toast(`Import failed: ${err.message}`, 'bad'); }
          });
          inp.click();
        } }, 'IMPORT ACCOUNT'),
        el('button', { class: 'btn sell', onclick: () => {
          if (!confirm('Reset the account? Every position, trade and lot is deleted. ' +
                       'Export first if you want to keep it.')) return;
          S.reset();
          toast('Account reset', 'warn');
          paint();
        } }, 'RESET ACCOUNT')));

      host.append(sect('SESSION'));
      host.append(kv([
        ['Account opened', new Date(acct.createdAt).toISOString().slice(0, 10)],
        ['Instruments', String(ALL.length)],
        ['Markets', String(MARKET_ORDER.length)],
        ['Feed status', feed.state.status.toUpperCase()],
        ['Data source', feed.state.source],
        ['Server present', feed.state.serverPresent === null ? 'checking…'
          : feed.state.serverPresent ? 'yes' : 'no — running in static mode'],
        ['Provider key', feed.state.hasKey ? 'Twelve Data key loaded' : 'none — using fallbacks'],
        ['Requests this session', String(feed.state.requestsToday)],
      ]));
    };
    live(panel, paint, 8000);
    panel.onCleanup(S.onChange(paint));
  },
});
