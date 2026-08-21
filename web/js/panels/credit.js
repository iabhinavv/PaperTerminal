// Leverage and the cost of it: MARG, BORR, TAX.
// This is the teaching core of the whole terminal.

import { el, table, empty, sect, kv, clear, toast, modal, closeModal } from '../util/dom.js';
import { px, num, pct, money, dir, age } from '../util/fmt.js';
import { register, live } from '../panels.js';
import * as book from '../engine/book.js';
import * as margin from '../engine/margin.js';
import * as interest from '../engine/interest.js';
import * as taxEngine from '../engine/tax.js';
import * as stats from '../analytics/stats.js';
import * as S from '../engine/state.js';
import { barRow } from './chartlib.js';

register({
  code: 'MARG', name: 'MARGIN & COST OF CAPITAL', group: 'CREDIT',
  render(panel) {
    const host = el('div');
    panel.body.append(host);
    const paint = () => {
      const acct = S.get();
      const st = margin.status();
      const d = interest.dailyCost();
      const be = interest.breakEven(30);
      const risk = stats.portfolioRisk();
      const runway = interest.runway();
      clear(host);

      if (st.call) {
        host.append(el('div', { class: 'empty',
          style: 'color:var(--red);border-left:3px solid var(--red);padding-left:8px;margin-bottom:6px',
          html: `<b>MARGIN CALL — ${money(st.call.shortfall, 'USD')} SHORT.</b><br>` +
                `Equity ${money(st.equity, 'USD')} is below the ${money(st.maintenance, 'USD')} ` +
                `maintenance requirement. A real broker would liquidate without asking.` }));
      }

      host.append(sect('MARGIN'));
      host.append(kv([
        ['Net equity', `<span class="hl">${money(st.equity, 'USD')}</span>`],
        ['Maintenance requirement', money(st.maintenance, 'USD')],
        ['Excess liquidity', `<span class="${st.excess < 0 ? 'down' : 'up'}">${money(st.excess, 'USD')}</span>`],
        ['Cash available', money(st.cashAvailable, 'USD')],
        ['Reg T buying power', money(st.regTBuyingPower, 'USD')],
        ['Total capacity', `<span class="hl">${money(st.buyingPower, 'USD')}</span>`],
        ['Margin used', st.marginUsedPct === Infinity ? '<span class="down">∞</span>'
          : `<span class="${st.marginUsedPct > 70 ? 'down' : st.marginUsedPct > 40 ? 'warn' : ''}">${pct(st.marginUsedPct, 1)}</span>`],
        ['Gross exposure', money(st.grossExposure, 'USD')],
        ['Leverage', st.leverage === Infinity ? '<span class="down">∞</span>'
          : `<span class="${st.leverage > 4 ? 'down' : st.leverage > 2 ? 'warn' : ''}">${num(st.leverage, 2)}x</span>`],
        ['Cushion to call', st.cushionPct != null
          ? `<span class="${st.cushionPct < 10 ? 'down' : st.cushionPct < 25 ? 'warn' : 'up'}">${pct(st.cushionPct, 1)}</span> <span class="dim">adverse move</span>`
          : '—'],
      ]));

      host.append(sect('WHAT THE DEBT COSTS'));
      host.append(kv([
        ['Debit balance', d.debit > 0 ? `<span class="down">${money(d.debit, 'USD')}</span>` : money(0, 'USD')],
        ['Base rate', `${num(interest.baseRate(), 2)}% <span class="dim">live short end</span>`],
        ['Your rate', d.debit > 0 ? `<span class="warn">${num(d.rate, 2)}%</span>` : '—'],
        ['Interest per day', d.perDay > 0 ? `<span class="down">${money(d.perDay, 'USD')}</span>` : money(0, 'USD')],
        ['Per month', d.perDay > 0 ? `<span class="down">${money(d.perDay * 30, 'USD')}</span>` : money(0, 'USD')],
        ['Per year', d.perDay > 0 ? `<span class="down">${money(d.perDay * 365, 'USD')}</span>` : money(0, 'USD')],
        ['Accrued, not yet charged', money(acct.accruedInterest, 'USD')],
        ['Credit on idle cash', d.credit > 0 ? `<span class="up">${money(d.credit, 'USD')}/day</span>` : '—'],
      ]));

      host.append(sect('BREAK-EVEN'));
      host.append(kv([
        ['30 days of carry costs', money(be.cost, 'USD')],
        ['As % of equity', be.pctOfEquity != null ? pct(be.pctOfEquity, 2) : '—'],
        ['Book must rise', be.pctMove != null
          ? `<span class="warn">${pct(be.pctMove, 3)}</span> <span class="dim">just to break even</span>` : '—'],
        ['Runway on interest alone', runway === Infinity ? '<span class="up">no debt</span>'
          : `<span class="${runway < 90 ? 'down' : 'warn'}">${num(runway, 0)} days</span>`],
      ]));

      host.append(sect('IF THE MARKET MOVES AGAINST YOU'));
      const shocks = stats.stressTest([-1, -2, -5, -10, -20, -30]);
      const maxLoss = Math.max(...shocks.map((s) => Math.abs(s.pnl)), 1);
      host.append(table([
        { label: 'MOVE', get: (r) => `${r.shock > 0 ? '+' : ''}${r.shock}%` },
        { label: 'P&L', get: (r) => money(r.pnl, 'USD'), cls: (r) => dir(r.pnl) },
        { label: 'EQUITY AFTER', get: (r) => money(r.equityAfter, 'USD'),
          cls: (r) => (r.equityAfter < 0 ? 'down' : r.equityAfter < st.maintenance ? 'warn' : '') },
        { label: 'CALL?', get: (r) => (r.equityAfter < st.maintenance
            ? '<span class="down">MARGIN CALL</span>'
            : r.equityAfter < st.maintenance * 1.3 ? '<span class="warn">CLOSE</span>' : '—') },
        { label: '', get: (r) => barRow(r.pnl, maxLoss, { signed: true, width: 100 }) },
      ], shocks));
      host.append(el('div', { class: 'empty', html:
        `1σ daily move on this book is ${money(risk.dailyVol, 'USD')}; ` +
        `a 95% one-day VaR is ${money(risk.var95, 'USD')}. See <b>RISK</b> for the full picture.` }));

      host.append(sect('PATTERN DAY TRADER'));
      const pdt = st.pdt;
      host.append(kv([
        ['Day trades in 5 days', `${pdt.count}`],
        ['Before flagging', pdt.remaining === Infinity ? 'disabled'
          : `<span class="${pdt.remaining === 0 ? 'down' : 'warn'}">${pdt.remaining}</span>`],
        ['Status', pdt.restricted ? '<span class="down">RESTRICTED</span>'
          : pdt.flagged ? '<span class="warn">FLAGGED</span>' : '<span class="up">CLEAR</span>'],
        ['Equity floor', money(margin.PDT_EQUITY_FLOOR, 'USD')],
        ['Day-trade buying power', st.dayTradeBP != null ? money(st.dayTradeBP, 'USD')
          : '<span class="dim">needs $25k equity</span>'],
      ]));

      panel.meta(`LEV ${num(st.leverage, 2)}x · ${money(d.perDay, 'USD')}/DAY`);
    };
    live(panel, paint, 2000);
    panel.onCleanup(S.onChange(paint));
  },
});

register({
  code: 'BORR', name: 'BORROW DESK', group: 'CREDIT',
  render(panel) {
    const host = el('div');
    panel.body.append(host);
    const paint = () => {
      const acct = S.get();
      const d = interest.dailyCost();
      const st = margin.status();
      clear(host);

      host.append(el('div', { class: 'empty', html:
        'Borrowing here is a genuine loan, not margin. It is not collateralised and it will ' +
        'not force-liquidate you — your balance is allowed to go <b>negative</b> and stay there, ' +
        'accruing interest, so you can watch what that actually does over time.' }));

      host.append(sect('FACILITY'));
      host.append(kv([
        ['Outstanding', acct.borrowed > 0 ? `<span class="down">${money(acct.borrowed, 'USD')}</span>` : money(0, 'USD')],
        ['Cash balance', `<span class="${acct.cash < 0 ? 'down' : ''}">${money(acct.cash, 'USD')}</span>`],
        ['Total debit', money(d.debit, 'USD')],
        ['Blended rate', d.debit > 0 ? `<span class="warn">${num(d.rate, 2)}%</span>` : '—'],
        ['Daily cost', d.perDay > 0 ? `<span class="down">${money(d.perDay, 'USD')}</span>` : '—'],
        ['Net equity', money(st.equity, 'USD')],
      ]));

      host.append(sect('RATE CARD'));
      host.append(table([
        { label: 'DEBIT BALANCE', get: (t) => (t.upTo === Infinity ? 'Above $250,000'
            : `Up to ${money(t.upTo, 'USD', 0)}`) },
        { label: 'SPREAD', get: (t) => `base + ${num(t.spread, 2)}%` },
        { label: 'ALL-IN', get: (t) => `${num(interest.baseRate() + t.spread, 2)}%`, cls: () => 'hl' },
        { label: '', get: (t) => (d.debit > 0 && interest.tierFor(d.debit) === t
            ? '<span class="warn">YOU ARE HERE</span>' : '') },
      ], interest.TIERS));
      host.append(el('div', { class: 'empty', html:
        `Base rate tracks the live 3-month yield — currently <b>${num(interest.baseRate(), 2)}%</b>. ` +
        `When real policy rates move, your carry moves with them.` }));

      const amt = el('input', { class: 'f', type: 'number', step: '100', value: '1000' });
      host.append(sect('DRAW / REPAY'));
      host.append(el('div', { style: 'display:grid;grid-template-columns:90px 1fr auto auto;gap:6px;align-items:center' },
        el('span', { class: 'dim', text: 'AMOUNT USD' }), amt,
        el('button', { class: 'btn sell', onclick: () => {
          try {
            const v = Number(amt.value);
            const r = interest.borrow(v);
            S.save(); S.emit('borrow');
            toast(`Borrowed ${money(v, 'USD')} at ${num(r.rate, 2)}% — costing ` +
                  `${money(v * r.rate / 100 / 365, 'USD')} a day`, 'warn');
            paint();
          } catch (err) { toast(err.message, 'bad'); }
        } }, 'BORROW'),
        el('button', { class: 'btn buy', onclick: () => {
          try {
            interest.repay(Number(amt.value));
            S.save(); S.emit('repay');
            toast('Repaid', 'ok'); paint();
          } catch (err) { toast(err.message, 'bad'); }
        } }, 'REPAY')));

      host.append(sect('WHAT BORROWING $1,000 COSTS YOU'));
      const probe = 1000;
      const rate = interest.rateFor(d.debit + probe);
      host.append(table([
        { label: 'HELD FOR', get: (r) => r.label },
        { label: 'INTEREST', get: (r) => money(probe * rate / 100 * r.years, 'USD'), cls: () => 'down' },
        { label: 'MOVE NEEDED', get: (r) => pct(rate * r.years, 2), cls: () => 'warn' },
      ], [
        { label: '1 week', years: 7 / 365 }, { label: '1 month', years: 1 / 12 },
        { label: '3 months', years: 0.25 }, { label: '1 year', years: 1 },
        { label: '3 years', years: 3 },
      ]));
      panel.meta(acct.borrowed > 0 ? `OWES ${money(acct.borrowed, 'USD')}` : 'NO DEBT');
    };
    live(panel, paint, 3000);
    panel.onCleanup(S.onChange(paint));
  },
});

register({
  code: 'TAX', name: 'TAX CENTER — US FEDERAL', group: 'CREDIT',
  render(panel) {
    const host = el('div');
    panel.body.append(host);
    const paint = () => {
      const acct = S.get();
      const year = new Date().getFullYear();
      const calc = taxEngine.computeYear(year);
      const compare = taxEngine.lotMethodComparison(year);
      clear(host);

      host.append(sect(`${year} LIABILITY`));
      host.append(kv([
        ['Short-term gains', `<span class="${dir(calc.netShort)}">${money(calc.netShort, 'USD')}</span> <span class="dim">at ${num(calc.rates.ordinary, 0)}%</span>`],
        ['Long-term gains', `<span class="${dir(calc.netLong)}">${money(calc.netLong, 'USD')}</span> <span class="dim">at ${num(calc.rates.ltcg, 0)}%</span>`],
        ['Short-term tax', `<span class="down">${money(calc.shortTax, 'USD')}</span>`],
        ['Long-term tax', `<span class="down">${money(calc.longTax, 'USD')}</span>`],
        calc.niit > 0 ? ['NIIT (3.8%)', `<span class="down">${money(calc.niit, 'USD')}</span>`] : null,
        ['Total tax', `<span class="down" style="font-size:14px">${money(calc.total, 'USD')}</span>`],
        ['Effective rate', pct(calc.effectiveRate, 2)],
        ['Kept after tax', `<span class="up">${money(calc.afterTax, 'USD')}</span>`],
      ].filter(Boolean)));

      host.append(sect('THE SAME GAIN, TAXED THREE WAYS'));
      const preview = taxEngine.afterTaxPreview(1000);
      host.append(table([
        { label: 'IF $1,000 CAME FROM', get: (r) => r.label },
        { label: 'RATE', get: (r) => pct(r.v.rate, 1) },
        { label: 'TAX', get: (r) => money(r.v.tax, 'USD'), cls: () => 'down' },
        { label: 'YOU KEEP', get: (r) => money(r.v.net, 'USD'), cls: () => 'up' },
        { label: 'WHY', get: (r) => `<span class="dim">${r.why}</span>` },
      ], [
        { label: 'Stock held under a year', v: preview.equityShort, why: 'Ordinary income rates' },
        { label: 'Stock held over a year', v: preview.equityLong, why: 'Long-term capital gains' },
        { label: 'Crypto under a year', v: preview.cryptoShort, why: 'Property, but no wash sale rule' },
        { label: 'Crypto over a year', v: preview.cryptoLong, why: 'Long-term treatment applies' },
        { label: 'Futures or index options', v: preview.s1256, why: 'Section 1256 — 60/40 split' },
      ]));

      host.append(sect('SECTION 1256'));
      host.append(kv([
        ['Realised', money(calc.s1256.realised, 'USD')],
        ['Year-end mark-to-market', `<span class="${dir(calc.s1256.mtm)}">${money(calc.s1256.mtm, 'USD')}</span> <span class="dim">on ${calc.s1256.openPositions.length} open</span>`],
        ['Treated as long-term (60%)', money(calc.s1256.long, 'USD')],
        ['Treated as short-term (40%)', money(calc.s1256.short, 'USD')],
      ]));
      host.append(el('div', { class: 'empty', html:
        'Futures and broad-based index options are marked to market at year end whether you ' +
        'closed them or not — you pay tax on a gain you have not taken.' }));

      host.append(sect('WASH SALES'));
      const washed = calc.lots.filter((l) => l.washed);
      host.append(kv([
        ['Disallowed losses', calc.washDisallowed > 0
          ? `<span class="warn">${money(calc.washDisallowed, 'USD')}</span>` : money(0, 'USD')],
        ['Lots affected', String(washed.length)],
        ['Crypto exposure', '<span class="up">exempt — not a security</span>'],
      ]));
      if (washed.length) {
        host.append(table([
          { label: 'POSITION', get: (l) => l.describe },
          { label: 'CLOSED', get: (l) => new Date(l.closedAt).toISOString().slice(0, 10) },
          { label: 'LOSS', get: (l) => money(l.gross, 'USD'), cls: () => 'down' },
          { label: 'DISALLOWED', get: (l) => money(-l.disallowed, 'USD'), cls: () => 'warn' },
        ], washed));
      }

      host.append(sect('LOT METHOD — SAME TRADES, DIFFERENT BILL'));
      host.append(table([
        { label: 'METHOD', get: (r) => r.m + (acct.config.lotMethod === r.m ? '  <span class="warn">ACTIVE</span>' : '') },
        { label: 'TAX DUE', get: (r) => money(r.v, 'USD'), cls: (r) =>
            (r.v === Math.min(...Object.values(compare)) ? 'up' : 'down') },
        { label: 'VS BEST', get: (r) => money(r.v - Math.min(...Object.values(compare)), 'USD'), cls: () => 'dim' },
        { label: '', get: (r) => el('button', { class: 'btn', style: 'padding:0 5px',
            onclick: () => { acct.config.lotMethod = r.m; S.save(); toast(`Lot method set to ${r.m}`); paint(); } },
            'USE') },
      ], Object.entries(compare).map(([m, v]) => ({ m, v }))));

      host.append(sect('DEDUCTIONS & CARRYOVER'));
      host.append(kv([
        ['Margin interest paid', money(calc.interestPaid, 'USD')],
        ['Deductible this year', `${money(calc.interestDeduction, 'USD')} <span class="dim">capped at net investment income</span>`],
        ['Commissions', money(calc.commissions, 'USD')],
        ['Loss against ordinary income', money(calc.deductibleLoss, 'USD') + ' <span class="dim">$3,000 cap</span>'],
        ['Carried to next year', money(calc.carryforward, 'USD')],
      ]));

      host.append(el('div', { style: 'margin-top:8px' },
        el('button', { class: 'btn sell', onclick: () => {
          try { const c = taxEngine.settleYear(year); S.save(); S.emit('tax');
            toast(`Paid ${money(c.total, 'USD')} in tax for ${year}`, 'warn'); paint(); }
          catch (err) { toast(err.message, 'bad'); }
        } }, `PAY ${year} TAX BILL`)));

      panel.meta(`DUE ${money(calc.total, 'USD')}`);
    };
    live(panel, paint, 5000);
    panel.onCleanup(S.onChange(paint));
  },
});
