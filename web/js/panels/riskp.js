// RISK — the portfolio risk dashboard.

import { el, table, empty, sect, kv, clear } from '../util/dom.js';
import { num, pct, money, dir, px } from '../util/fmt.js';
import { register, live } from '../panels.js';
import * as book from '../engine/book.js';
import * as margin from '../engine/margin.js';
import * as stats from '../analytics/stats.js';
import * as S from '../engine/state.js';
import { barRow } from './chartlib.js';

register({
  code: 'RISK', name: 'RISK DASHBOARD', group: 'RISK',
  render(panel) {
    const host = el('div');
    panel.body.append(host);
    const paint = () => {
      const risk = stats.portfolioRisk();
      const p = stats.portfolioStats();
      const st = margin.status();
      const g = book.greeks();
      clear(host);

      host.append(sect('EXPOSURE'));
      host.append(kv([
        ['Net equity', `<span class="hl">${money(risk.equity, 'USD')}</span>`],
        ['Gross exposure', money(risk.gross, 'USD')],
        ['Net exposure', `<span class="${dir(risk.net)}">${money(risk.net, 'USD')}</span>`],
        ['Leverage', st.leverage === Infinity ? '∞' : `${num(st.leverage, 2)}x`],
        ['Delta-equivalent', money(g.deltaUSD, 'USD')],
      ]));

      host.append(sect('VOLATILITY & VALUE AT RISK'));
      host.append(kv([
        ['Portfolio vol (annual)', risk.annualVolPct != null
          ? `${money(risk.annualVol, 'USD')} <span class="dim">${pct(risk.annualVolPct, 1)} of equity</span>` : '—'],
        ['Daily 1σ', money(risk.dailyVol, 'USD')],
        ['95% one-day VaR', `<span class="warn">${money(-risk.var95, 'USD')}</span> <span class="dim">exceeded 1 day in 20</span>`],
        ['99% one-day VaR', `<span class="down">${money(-risk.var99, 'USD')}</span> <span class="dim">1 day in 100</span>`],
        ['Expected shortfall', `<span class="down">${money(-risk.cvar95, 'USD')}</span> <span class="dim">average of the bad days</span>`],
        ['Realised Sharpe', p.sharpe != null ? num(p.sharpe, 2) : '<span class="dim">needs 30 days of curve</span>'],
        ['Max drawdown', `<span class="down">${pct(-p.maxDrawdown * 100)}</span>`],
      ]));

      host.append(sect('PORTFOLIO GREEKS'));
      host.append(kv([
        ['Delta', num(g.delta, 2)],
        ['Gamma', num(g.gamma, 4)],
        ['Vega', `${num(g.vega, 2)} <span class="dim">per vol point</span>`],
        ['Theta', `<span class="${dir(g.theta)}">${num(g.theta, 2)}</span> <span class="dim">per day</span>`],
        ['Rho', num(g.rho, 2)],
      ]));

      host.append(sect('WHERE THE RISK ACTUALLY IS'));
      if (!risk.contributions.length) {
        host.append(empty('No positions to decompose.'));
      } else {
        const maxPct = Math.max(...risk.contributions.map((c) => Math.abs(c.pctOfRisk)), 1);
        host.append(table([
          { label: 'POSITION', get: (r) => `<span class="sym">${r.label}</span>` },
          { label: 'MKT', get: (r) => r.mkt, cls: () => 'dim' },
          { label: 'EXPOSURE', get: (r) => money(r.exposure, 'USD') },
          { label: 'VOL', get: (r) => pct(r.vol * 100, 0) },
          { label: '% OF RISK', get: (r) => pct(r.pctOfRisk, 1),
            cls: (r) => (Math.abs(r.pctOfRisk) > 40 ? 'down' : Math.abs(r.pctOfRisk) > 20 ? 'warn' : '') },
          { label: '', get: (r) => barRow(r.pctOfRisk, maxPct, { signed: true, width: 110 }) },
        ], risk.contributions));
        const top = risk.contributions[0];
        if (top && Math.abs(top.pctOfRisk) > 45) {
          host.append(el('div', { class: 'empty', style: 'color:var(--yellow)', html:
            `<b>Concentration.</b> ${top.label} is carrying ${pct(top.pctOfRisk, 0)} of your ` +
            `portfolio risk. Correlated names cluster — holding six of them is not diversification.` }));
        }
      }

      host.append(sect('STRESS TEST'));
      const shocks = stats.stressTest();
      const maxAbs = Math.max(...shocks.map((s) => Math.abs(s.pnl)), 1);
      host.append(table([
        { label: 'SHOCK', get: (r) => `${r.shock > 0 ? '+' : ''}${r.shock}%` },
        { label: 'P&L', get: (r) => money(r.pnl, 'USD'), cls: (r) => dir(r.pnl) },
        { label: '% EQUITY', get: (r) => (r.pctOfEquity != null ? pct(r.pctOfEquity, 1) : '—'),
          cls: (r) => dir(r.pnl) },
        { label: 'EQUITY AFTER', get: (r) => money(r.equityAfter, 'USD'),
          cls: (r) => (r.equityAfter < 0 ? 'down' : '') },
        { label: '', get: (r) => barRow(r.pnl, maxAbs, { signed: true, width: 110 }) },
      ], shocks));
      host.append(el('div', { class: 'empty', html:
        'Option positions are shocked to <b>second order</b> — delta plus half gamma squared. ' +
        'That is why a short option book looks harmless at −2% and ruinous at −20%: gamma is ' +
        'not linear, and neither is the damage.' }));

      const t = stats.tradeStats();
      if (t.n) {
        host.append(sect('RISK PER TRADE'));
        host.append(kv([
          ['Average trade', `<span class="${dir(t.avgTrade)}">${money(t.avgTrade, 'USD')}</span>`],
          ['Average win', `<span class="up">${money(t.avgWin, 'USD')}</span>`],
          ['Average loss', `<span class="down">${money(-t.avgLoss, 'USD')}</span>`],
          ['Standard deviation', money(t.stdev, 'USD')],
          ['Expectancy', `<span class="${dir(t.expectancy)}">${money(t.expectancy, 'USD')}</span>`],
          ['Worst single trade', `<span class="down">${money(t.worst, 'USD')}</span> <span class="dim">${p.equity > 0 ? pct(t.worst / p.equity * 100, 1) + ' of equity' : ''}</span>`],
          ['Risk of ruin proxy', t.n > 5 && t.expectancy < 0
            ? '<span class="down">negative expectancy — this strategy loses over time</span>'
            : '<span class="up">expectancy positive</span>'],
        ]));
      }
      panel.meta(`VAR95 ${money(-risk.var95, 'USD')}`);
    };
    live(panel, paint, 3000);
    panel.onCleanup(S.onChange(paint));
  },
});
