// External chart links.
//
// PaperTerminal draws its own charts from daily bars, which is enough to judge a
// trend but not enough to actually read a market — no candles, no intraday
// depth, no indicators, no drawing tools. Rather than half-build a charting
// package, every security links out to the platforms people already use.
//
// Each provider spells symbols differently, which is the entire content of this
// file. TradingView wants EXCHANGE:TICKER, Yahoo wants a dotted suffix,
// Investing.com wants a search query, and none of them agree on Toyota.

import { MARKETS } from './universe.js';

// TradingView splits US listings by venue and will not resolve a wrong prefix.
const NYSE_LISTED = new Set([
  'BRK.B', 'JPM', 'V', 'XOM', 'JNJ', 'WMT', 'GME', 'COIN',
]);

const TV_EXCHANGE = {
  US: (sym) => (NYSE_LISTED.has(sym) ? 'NYSE' : 'NASDAQ'),
  IN: () => 'NSE',
  JP: () => 'TSE',
  KR: () => 'KRX',
  SG: () => 'SGX',
  CN: (sym) => (sym.startsWith('60') || sym.startsWith('68') ? 'SSE' : 'SZSE'),
  DE: () => 'XETR',
  UK: () => 'LSE',
  FR: () => 'EURONEXT',
  CA: () => 'TSX',
};

// Indices and FX live under TradingView's own feed namespaces, not an exchange.
const TV_INDEX = {
  SPX: 'SP:SPX', NDX: 'NASDAQ:NDX', DJI: 'DJ:DJI', RUT: 'TVC:RUT', VIX: 'TVC:VIX',
  NIFTY: 'NSE:NIFTY', BANKNIFTY: 'NSE:BANKNIFTY', SENSEX: 'BSE:SENSEX',
  N225: 'TVC:NI225', TOPIX: 'TSE:TOPIX', KOSPI: 'TVC:KOSPI', KOSDAQ: 'KRX:KOSDAQ',
  STI: 'TVC:STI', SSEC: 'SSE:000001', SZCOMP: 'SZSE:399001', HSI: 'TVC:HSI',
  DAX: 'XETR:DAX', FTSE: 'TVC:UKX', CAC: 'EURONEXT:PX1', TSX: 'TSX:TSX',
};

// Coins whose Binance pair TradingView does not carry. Verified against their
// symbol-search API rather than assumed - every other coin in the top 25 does
// resolve as BINANCE:<SYM>USDT.
const TV_CRYPTO = {
  TON: 'COINBASE:TONUSD',
};

/** TradingView symbol for any instrument, or null if it has no listed equivalent. */
export function tvSymbol(inst) {
  if (!inst) return null;
  switch (inst.cls) {
    case 'index':
      return TV_INDEX[inst.id] || null;
    case 'crypto':
      if (TV_CRYPTO[inst.sym]) return TV_CRYPTO[inst.sym];
      return inst.stable ? `CRYPTOCAP:${inst.sym}` : `BINANCE:${inst.sym}USDT`;
    case 'fx':
      return `FX_IDC:${inst.base}${inst.quote}`;
    case 'equity': {
      const ex = TV_EXCHANGE[inst.mkt];
      return ex ? `${ex(inst.sym)}:${inst.sym.replace('.', '')}` : null;
    }
    default:
      return null;   // synthetic bonds have no listed chart
  }
}

const enc = encodeURIComponent;

/**
 * Every external chart available for an instrument, best first.
 * Returns [{ id, name, url, note }].
 */
export function chartLinks(inst) {
  if (!inst) return [];
  const out = [];
  const tv = tvSymbol(inst);

  if (tv) {
    out.push({
      id: 'tradingview', name: 'TradingView',
      url: `https://www.tradingview.com/chart/?symbol=${enc(tv)}`,
      note: 'Full charting — candles, indicators, drawing tools. No account needed to look.',
    });
  }

  if (inst.cls === 'crypto') {
    out.push({
      id: 'coingecko', name: 'CoinGecko',
      url: `https://www.coingecko.com/en/coins/${enc(inst.name.toLowerCase().replace(/\s+/g, '-'))}`,
      note: 'Market cap, supply, exchange listings and on-chain context.',
    });
    if (!inst.stable) {
      out.push({
        id: 'binance', name: 'Binance',
        url: `https://www.binance.com/en/trade/${enc(inst.sym)}_USDT`,
        note: 'The live order book PaperTerminal prices this coin from.',
      });
    }
  } else if (inst.cls === 'fx') {
    out.push({
      id: 'investing', name: 'Investing.com',
      url: `https://www.investing.com/currencies/${enc(`${inst.base}-${inst.quote}`.toLowerCase())}`,
      note: 'Rate history plus the macro calendar that moves it.',
    });
    out.push({
      id: 'xe', name: 'XE',
      url: `https://www.xe.com/currencycharts/?from=${enc(inst.base)}&to=${enc(inst.quote)}`,
      note: 'Clean long-horizon rate history.',
    });
  } else if (inst.cls === 'bond') {
    out.push({
      id: 'investing-bond', name: 'Investing.com — Bonds',
      url: `https://www.investing.com/rates-bonds/${enc(bondSlug(inst))}`,
      note: 'The live yield this synthetic bond is priced from.',
    });
    return out;
  }

  if (inst.yf && inst.cls !== 'bond') {
    out.push({
      id: 'yahoo', name: 'Yahoo Finance',
      url: `https://finance.yahoo.com/quote/${enc(inst.yf)}`,
      note: 'Fundamentals, filings, earnings dates and news.',
    });
  }

  if (inst.cls === 'equity') {
    if (inst.mkt === 'IN') {
      out.push({
        id: 'nse', name: 'NSE India',
        url: `https://www.nseindia.com/get-quotes/equity?symbol=${enc(inst.sym)}`,
        note: 'The exchange itself — delivery volumes and corporate actions.',
      });
    }
    out.push({
      id: 'investing-eq', name: 'Investing.com',
      url: `https://www.investing.com/search/?q=${enc(inst.name)}`,
      note: 'Broadest international coverage when other sources are thin.',
    });
  }

  return out;
}

function bondSlug(inst) {
  const map = {
    US: 'u.s.-10-year-bond-yield', IN: 'india-10-year-bond-yield',
    JP: 'japan-10-year-bond-yield', KR: 'south-korea-10-year-bond-yield',
    SG: 'singapore-10-year-bond-yield', CN: 'china-10-year-bond-yield',
    DE: 'germany-10-year-bond-yield', UK: 'uk-10-year-bond-yield',
    FR: 'france-10-year-bond-yield', CA: 'canada-10-year-bond-yield',
  };
  return map[inst.mkt] || 'u.s.-10-year-bond-yield';
}

/** The one to open when the user just wants "the chart". */
export const primaryChart = (inst) => chartLinks(inst)[0] || null;

/**
 * Open a chart in a new window.
 *
 * noopener/noreferrer matter here: without them the opened page gets a handle on
 * this one via window.opener and could navigate it somewhere else.
 */
export function openChart(inst, providerId = null) {
  const links = chartLinks(inst);
  if (!links.length) return null;
  const link = providerId ? links.find((l) => l.id === providerId) || links[0] : links[0];
  window.open(link.url, `chart_${inst.id}`, 'noopener,noreferrer,width=1280,height=820');
  return link;
}
