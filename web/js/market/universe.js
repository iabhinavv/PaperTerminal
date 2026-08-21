// The tradeable world. Ten markets, your six first.
//
// Every instrument carries both provider spellings because no free vendor
// covers all ten exchanges under one convention: `td` is Twelve Data,
// `yf` is Yahoo. The feed layer picks whichever provider answered.

export const MARKETS = {
  US: {
    name: 'United States', flagCode: 'US', ccy: 'USD', tz: 'America/New_York',
    exchange: 'NYSE/NASDAQ', mic: 'XNYS', tdEx: 'NASDAQ', yfSuffix: '',
    sessions: [['09:30', '16:00']], preOpen: '04:00', postClose: '20:00',
    settle: 'T+1', lotSize: 1, tickSize: 0.01,
  },
  IN: {
    name: 'India', flagCode: 'IN', ccy: 'INR', tz: 'Asia/Kolkata',
    exchange: 'NSE', mic: 'XNSE', tdEx: 'NSE', yfSuffix: '.NS',
    sessions: [['09:15', '15:30']], preOpen: '09:00', postClose: '16:00',
    settle: 'T+1', lotSize: 1, tickSize: 0.05,
  },
  JP: {
    name: 'Japan', flagCode: 'JP', ccy: 'JPY', tz: 'Asia/Tokyo',
    exchange: 'TSE', mic: 'XTKS', tdEx: 'TSE', yfSuffix: '.T',
    sessions: [['09:00', '11:30'], ['12:30', '15:30']],
    settle: 'T+2', lotSize: 100, tickSize: 0.5,
  },
  KR: {
    name: 'South Korea', flagCode: 'KR', ccy: 'KRW', tz: 'Asia/Seoul',
    exchange: 'KRX', mic: 'XKRX', tdEx: 'KRX', yfSuffix: '.KS',
    sessions: [['09:00', '15:30']], settle: 'T+2', lotSize: 1, tickSize: 1,
  },
  SG: {
    name: 'Singapore', flagCode: 'SG', ccy: 'SGD', tz: 'Asia/Singapore',
    exchange: 'SGX', mic: 'XSES', tdEx: 'SGX', yfSuffix: '.SI',
    sessions: [['09:00', '12:00'], ['13:00', '17:00']],
    settle: 'T+2', lotSize: 100, tickSize: 0.001,
  },
  CN: {
    name: 'China', flagCode: 'CN', ccy: 'CNY', tz: 'Asia/Shanghai',
    exchange: 'SSE/SZSE', mic: 'XSHG', tdEx: 'SSE', yfSuffix: '.SS',
    sessions: [['09:30', '11:30'], ['13:00', '15:00']],
    settle: 'T+0', lotSize: 100, tickSize: 0.01,
  },
  DE: {
    name: 'Germany', flagCode: 'DE', ccy: 'EUR', tz: 'Europe/Berlin',
    exchange: 'XETRA', mic: 'XETR', tdEx: 'XETR', yfSuffix: '.DE',
    sessions: [['09:00', '17:30']], settle: 'T+2', lotSize: 1, tickSize: 0.001,
  },
  UK: {
    name: 'United Kingdom', flagCode: 'GB', ccy: 'GBP', tz: 'Europe/London',
    exchange: 'LSE', mic: 'XLON', tdEx: 'LSE', yfSuffix: '.L',
    sessions: [['08:00', '16:30']], settle: 'T+2', lotSize: 1, tickSize: 0.01,
  },
  FR: {
    name: 'France', flagCode: 'FR', ccy: 'EUR', tz: 'Europe/Paris',
    exchange: 'Euronext', mic: 'XPAR', tdEx: 'Euronext', yfSuffix: '.PA',
    sessions: [['09:00', '17:30']], settle: 'T+2', lotSize: 1, tickSize: 0.001,
  },
  CA: {
    name: 'Canada', flagCode: 'CA', ccy: 'CAD', tz: 'America/Toronto',
    exchange: 'TSX', mic: 'XTSE', tdEx: 'TSX', yfSuffix: '.TO',
    sessions: [['09:30', '16:00']], settle: 'T+1', lotSize: 1, tickSize: 0.01,
  },
};

export const MARKET_ORDER = ['US', 'IN', 'JP', 'KR', 'SG', 'CN', 'DE', 'UK', 'FR', 'CA'];

// tier drives the synthetic spread and slippage model: 1 = mega-cap liquid.
const eq = (mkt, sym, name, sector, tier, yf, td) => ({
  id: `${sym}.${mkt}`, cls: 'equity', mkt, sym, name, sector, tier,
  yf: yf || sym + MARKETS[mkt].yfSuffix,
  td: td || (mkt === 'US' ? sym : `${sym}:${MARKETS[mkt].tdEx}`),
  ccy: MARKETS[mkt].ccy,
});

export const EQUITIES = [
  // United States
  eq('US', 'AAPL', 'Apple Inc', 'Technology', 1),
  eq('US', 'MSFT', 'Microsoft Corp', 'Technology', 1),
  eq('US', 'NVDA', 'NVIDIA Corp', 'Semiconductors', 1),
  eq('US', 'AMZN', 'Amazon.com Inc', 'Consumer Disc', 1),
  eq('US', 'GOOGL', 'Alphabet Inc A', 'Technology', 1),
  eq('US', 'META', 'Meta Platforms', 'Technology', 1),
  eq('US', 'TSLA', 'Tesla Inc', 'Automobiles', 1),
  eq('US', 'BRK.B', 'Berkshire Hathaway B', 'Financials', 1, 'BRK-B', 'BRK.B'),
  eq('US', 'JPM', 'JPMorgan Chase', 'Financials', 1),
  eq('US', 'V', 'Visa Inc A', 'Financials', 1),
  eq('US', 'XOM', 'Exxon Mobil', 'Energy', 1),
  eq('US', 'JNJ', 'Johnson & Johnson', 'Health Care', 1),
  eq('US', 'WMT', 'Walmart Inc', 'Cons Staples', 1),
  eq('US', 'AMD', 'Advanced Micro Devices', 'Semiconductors', 2),
  eq('US', 'COIN', 'Coinbase Global', 'Financials', 2),
  eq('US', 'GME', 'GameStop Corp', 'Consumer Disc', 3),

  // India
  eq('IN', 'RELIANCE', 'Reliance Industries', 'Energy', 1),
  eq('IN', 'TCS', 'Tata Consultancy Svcs', 'Technology', 1),
  eq('IN', 'HDFCBANK', 'HDFC Bank', 'Financials', 1),
  eq('IN', 'INFY', 'Infosys Ltd', 'Technology', 1),
  eq('IN', 'ICICIBANK', 'ICICI Bank', 'Financials', 1),
  eq('IN', 'BHARTIARTL', 'Bharti Airtel', 'Telecom', 1),
  eq('IN', 'SBIN', 'State Bank of India', 'Financials', 2),
  eq('IN', 'ITC', 'ITC Ltd', 'Cons Staples', 2),
  eq('IN', 'TATAMOTORS', 'Tata Motors', 'Automobiles', 2),
  eq('IN', 'ADANIENT', 'Adani Enterprises', 'Industrials', 3),

  // Japan
  eq('JP', '7203', 'Toyota Motor Corp', 'Automobiles', 1),
  eq('JP', '6758', 'Sony Group Corp', 'Technology', 1),
  eq('JP', '8306', 'Mitsubishi UFJ Fin', 'Financials', 1),
  eq('JP', '6861', 'Keyence Corp', 'Industrials', 1),
  eq('JP', '9984', 'SoftBank Group', 'Technology', 2),
  eq('JP', '6098', 'Recruit Holdings', 'Industrials', 2),
  eq('JP', '7974', 'Nintendo Co', 'Consumer Disc', 2),
  eq('JP', '8035', 'Tokyo Electron', 'Semiconductors', 2),

  // South Korea
  eq('KR', '005930', 'Samsung Electronics', 'Technology', 1),
  eq('KR', '000660', 'SK Hynix', 'Semiconductors', 1),
  eq('KR', '005380', 'Hyundai Motor', 'Automobiles', 2),
  eq('KR', '051910', 'LG Chem', 'Materials', 2),
  eq('KR', '035420', 'NAVER Corp', 'Technology', 2),
  eq('KR', '207940', 'Samsung Biologics', 'Health Care', 2),

  // Singapore
  eq('SG', 'D05', 'DBS Group Holdings', 'Financials', 1),
  eq('SG', 'O39', 'OCBC Bank', 'Financials', 1),
  eq('SG', 'U11', 'United Overseas Bank', 'Financials', 2),
  eq('SG', 'Z74', 'Singtel', 'Telecom', 2),
  eq('SG', 'C6L', 'Singapore Airlines', 'Industrials', 3),
  eq('SG', 'F34', 'Wilmar International', 'Cons Staples', 3),

  // China
  eq('CN', '600519', 'Kweichow Moutai', 'Cons Staples', 1),
  eq('CN', '601398', 'ICBC', 'Financials', 1),
  eq('CN', '601857', 'PetroChina', 'Energy', 2),
  eq('CN', '600036', 'China Merchants Bank', 'Financials', 2),
  eq('CN', '000858', 'Wuliangye Yibin', 'Cons Staples', 2, '000858.SZ', '000858:SZSE'),
  eq('CN', '300750', 'CATL', 'Industrials', 2, '300750.SZ', '300750:SZSE'),

  // Germany
  eq('DE', 'SAP', 'SAP SE', 'Technology', 1),
  eq('DE', 'SIE', 'Siemens AG', 'Industrials', 1),
  eq('DE', 'ALV', 'Allianz SE', 'Financials', 1),
  eq('DE', 'MBG', 'Mercedes-Benz Group', 'Automobiles', 2),
  eq('DE', 'BMW', 'BMW AG', 'Automobiles', 2),
  eq('DE', 'BAS', 'BASF SE', 'Materials', 2),

  // United Kingdom
  eq('UK', 'SHEL', 'Shell plc', 'Energy', 1),
  eq('UK', 'AZN', 'AstraZeneca plc', 'Health Care', 1),
  eq('UK', 'HSBA', 'HSBC Holdings', 'Financials', 1),
  eq('UK', 'ULVR', 'Unilever plc', 'Cons Staples', 1),
  eq('UK', 'BP', 'BP plc', 'Energy', 2),
  eq('UK', 'BARC', 'Barclays plc', 'Financials', 2),

  // France
  eq('FR', 'MC', 'LVMH', 'Consumer Disc', 1),
  eq('FR', 'OR', 'L’Oreal SA', 'Cons Staples', 1),
  eq('FR', 'TTE', 'TotalEnergies SE', 'Energy', 1),
  eq('FR', 'SAN', 'Sanofi SA', 'Health Care', 2),
  eq('FR', 'AIR', 'Airbus SE', 'Industrials', 2),
  eq('FR', 'BNP', 'BNP Paribas', 'Financials', 2),

  // Canada
  eq('CA', 'RY', 'Royal Bank of Canada', 'Financials', 1),
  eq('CA', 'TD', 'Toronto-Dominion Bank', 'Financials', 1),
  eq('CA', 'ENB', 'Enbridge Inc', 'Energy', 1),
  eq('CA', 'CNR', 'Canadian National Rail', 'Industrials', 2),
  eq('CA', 'SHOP', 'Shopify Inc', 'Technology', 2),
  eq('CA', 'CNQ', 'Canadian Natural Res', 'Energy', 2),
];

const ix = (mkt, sym, name, yf, mult = 50) => ({
  id: sym, cls: 'index', mkt, sym, name, yf, td: yf, mult,
  ccy: MARKETS[mkt].ccy, tier: 1,
});

export const INDICES = [
  ix('US', 'SPX', 'S&P 500', '^GSPC', 50),
  ix('US', 'NDX', 'Nasdaq 100', '^NDX', 20),
  ix('US', 'DJI', 'Dow Jones Industrial', '^DJI', 5),
  ix('US', 'RUT', 'Russell 2000', '^RUT', 50),
  ix('US', 'VIX', 'CBOE Volatility Index', '^VIX', 1000),
  ix('IN', 'NIFTY', 'Nifty 50', '^NSEI', 50),
  ix('IN', 'BANKNIFTY', 'Nifty Bank', '^NSEBANK', 15),
  ix('IN', 'SENSEX', 'BSE Sensex', '^BSESN', 10),
  ix('JP', 'N225', 'Nikkei 225', '^N225', 1000),
  ix('JP', 'TOPIX', 'TOPIX', '^TOPX', 10000),
  ix('KR', 'KOSPI', 'KOSPI Composite', '^KS11', 250000),
  ix('KR', 'KOSDAQ', 'KOSDAQ Composite', '^KQ11', 10000),
  ix('SG', 'STI', 'Straits Times Index', '^STI', 10),
  ix('CN', 'SSEC', 'SSE Composite', '000001.SS', 300),
  ix('CN', 'SZCOMP', 'Shenzhen Component', '399001.SZ', 300),
  ix('CN', 'HSI', 'Hang Seng Index', '^HSI', 50),
  ix('DE', 'DAX', 'DAX 40', '^GDAXI', 25),
  ix('UK', 'FTSE', 'FTSE 100', '^FTSE', 10),
  ix('FR', 'CAC', 'CAC 40', '^FCHI', 10),
  ix('CA', 'TSX', 'S&P/TSX Composite', '^GSPTSE', 20),
];

// Sovereign yields drive the discount curve, bond pricing and the borrow base rate.
export const YIELDS = [
  { id: 'US3M', cls: 'yield', mkt: 'US', ccy: 'USD', tenor: 0.25, name: 'US 3-Month Bill', yf: '^IRX' },
  { id: 'US5Y', cls: 'yield', mkt: 'US', ccy: 'USD', tenor: 5, name: 'US 5-Year Note', yf: '^FVX' },
  { id: 'US10Y', cls: 'yield', mkt: 'US', ccy: 'USD', tenor: 10, name: 'US 10-Year Note', yf: '^TNX' },
  { id: 'US30Y', cls: 'yield', mkt: 'US', ccy: 'USD', tenor: 30, name: 'US 30-Year Bond', yf: '^TYX' },
];

// Fallback curve, in percent, when no live yield is reachable. Also the
// per-currency risk-free input to Black-Scholes when that market has no feed.
export const CURVE_DEFAULT = {
  USD: { 0.25: 4.05, 1: 3.95, 2: 3.85, 5: 3.90, 10: 4.15, 30: 4.55 },
  INR: { 0.25: 6.35, 1: 6.45, 2: 6.55, 5: 6.75, 10: 6.95, 30: 7.15 },
  JPY: { 0.25: 0.45, 1: 0.60, 2: 0.75, 5: 0.95, 10: 1.35, 30: 2.30 },
  KRW: { 0.25: 2.85, 1: 2.90, 2: 2.95, 5: 3.05, 10: 3.20, 30: 3.35 },
  SGD: { 0.25: 2.75, 1: 2.70, 2: 2.65, 5: 2.70, 10: 2.85, 30: 3.00 },
  CNY: { 0.25: 1.45, 1: 1.50, 2: 1.55, 5: 1.70, 10: 1.85, 30: 2.15 },
  EUR: { 0.25: 2.15, 1: 2.10, 2: 2.15, 5: 2.35, 10: 2.65, 30: 3.05 },
  GBP: { 0.25: 4.15, 1: 4.00, 2: 3.95, 5: 4.05, 10: 4.45, 30: 5.05 },
  CAD: { 0.25: 2.85, 1: 2.80, 2: 2.85, 5: 3.00, 10: 3.30, 30: 3.60 },
};

// Sovereign bonds are synthetic: real yield in, full bond maths out.
export const BONDS = [
  { id: 'T 4.25 2035', cls: 'bond', mkt: 'US', ccy: 'USD', name: 'US Treasury 4.25% 2035', coupon: 4.25, maturity: '2035-11-15', freq: 2, par: 100, curveKey: 10 },
  { id: 'T 4.75 2055', cls: 'bond', mkt: 'US', ccy: 'USD', name: 'US Treasury 4.75% 2055', coupon: 4.75, maturity: '2055-08-15', freq: 2, par: 100, curveKey: 30 },
  { id: 'T 3.875 2030', cls: 'bond', mkt: 'US', ccy: 'USD', name: 'US Treasury 3.875% 2030', coupon: 3.875, maturity: '2030-09-30', freq: 2, par: 100, curveKey: 5 },
  { id: 'GOI 7.10 2034', cls: 'bond', mkt: 'IN', ccy: 'INR', name: 'India GSec 7.10% 2034', coupon: 7.10, maturity: '2034-04-08', freq: 2, par: 100, curveKey: 10 },
  { id: 'JGB 1.30 2035', cls: 'bond', mkt: 'JP', ccy: 'JPY', name: 'Japan JGB 1.30% 2035', coupon: 1.30, maturity: '2035-06-20', freq: 2, par: 100, curveKey: 10 },
  { id: 'KTB 3.00 2034', cls: 'bond', mkt: 'KR', ccy: 'KRW', name: 'Korea Treasury 3.00% 2034', coupon: 3.00, maturity: '2034-12-10', freq: 2, par: 100, curveKey: 10 },
  { id: 'SGS 2.875 2034', cls: 'bond', mkt: 'SG', ccy: 'SGD', name: 'Singapore SGS 2.875% 2034', coupon: 2.875, maturity: '2034-09-01', freq: 2, par: 100, curveKey: 10 },
  { id: 'CGB 1.80 2035', cls: 'bond', mkt: 'CN', ccy: 'CNY', name: 'China CGB 1.80% 2035', coupon: 1.80, maturity: '2035-05-15', freq: 2, par: 100, curveKey: 10 },
  { id: 'DBR 2.60 2035', cls: 'bond', mkt: 'DE', ccy: 'EUR', name: 'German Bund 2.60% 2035', coupon: 2.60, maturity: '2035-02-15', freq: 1, par: 100, curveKey: 10 },
  { id: 'UKT 4.375 2035', cls: 'bond', mkt: 'UK', ccy: 'GBP', name: 'UK Gilt 4.375% 2035', coupon: 4.375, maturity: '2035-01-31', freq: 2, par: 100, curveKey: 10 },
  { id: 'OAT 3.20 2035', cls: 'bond', mkt: 'FR', ccy: 'EUR', name: 'France OAT 3.20% 2035', coupon: 3.20, maturity: '2035-05-25', freq: 1, par: 100, curveKey: 10 },
  { id: 'CAN 3.25 2035', cls: 'bond', mkt: 'CA', ccy: 'CAD', name: 'Canada Bond 3.25% 2035', coupon: 3.25, maturity: '2035-06-01', freq: 2, par: 100, curveKey: 10 },
];

export const CRYPTO = [
  ['BTC', 'Bitcoin', 1], ['ETH', 'Ethereum', 1], ['USDT', 'Tether', 1],
  ['XRP', 'XRP', 1], ['BNB', 'BNB', 1], ['SOL', 'Solana', 1],
  ['USDC', 'USD Coin', 1], ['DOGE', 'Dogecoin', 2], ['ADA', 'Cardano', 2],
  ['TRX', 'TRON', 2], ['AVAX', 'Avalanche', 2], ['LINK', 'Chainlink', 2],
  ['TON', 'Toncoin', 2], ['SHIB', 'Shiba Inu', 3], ['DOT', 'Polkadot', 2],
  ['SUI', 'Sui', 3], ['XLM', 'Stellar', 2], ['BCH', 'Bitcoin Cash', 2],
  ['HBAR', 'Hedera', 3], ['LTC', 'Litecoin', 2], ['PEPE', 'Pepe', 3],
  ['UNI', 'Uniswap', 2], ['NEAR', 'NEAR Protocol', 3], ['APT', 'Aptos', 3],
  ['ICP', 'Internet Computer', 3],
].map(([sym, name, tier]) => ({
  id: sym, cls: 'crypto', mkt: 'CRYPTO', sym, name, tier, ccy: 'USD',
  yf: `${sym}-USD`, td: `${sym}/USD`,
  stable: sym === 'USDT' || sym === 'USDC',
}));

const fx = (base, quote, tier) => ({
  id: base + quote, cls: 'fx', mkt: 'FX', sym: `${base}/${quote}`,
  name: `${base}/${quote}`, base, quote, tier, ccy: quote,
  yf: `${base}${quote}=X`, td: `${base}/${quote}`,
  pip: quote === 'JPY' || quote === 'KRW' ? 0.01 : 0.0001,
});

export const FX = [
  fx('EUR', 'USD', 1), fx('USD', 'JPY', 1), fx('GBP', 'USD', 1),
  fx('USD', 'CHF', 1), fx('AUD', 'USD', 1), fx('USD', 'CAD', 1),
  fx('NZD', 'USD', 2), fx('USD', 'INR', 1), fx('USD', 'KRW', 2),
  fx('USD', 'SGD', 1), fx('USD', 'CNY', 1), fx('EUR', 'GBP', 2),
  fx('EUR', 'JPY', 2), fx('GBP', 'JPY', 2), fx('EUR', 'INR', 3),
];

export const ALL = [...EQUITIES, ...INDICES, ...CRYPTO, ...FX, ...BONDS];

const BY_ID = new Map(ALL.map((i) => [i.id, i]));
const BY_SYM = new Map();
for (const i of ALL) {
  if (!BY_SYM.has(i.sym)) BY_SYM.set(i.sym, i);
  BY_SYM.set(`${i.sym} ${i.mkt}`, i);
}

export function lookup(query) {
  if (!query) return null;
  const q = String(query).trim().toUpperCase();
  return BY_ID.get(q) || BY_SYM.get(q) || BY_SYM.get(q.replace(/\s+/g, ' ')) || null;
}

export function search(query, limit = 12) {
  const q = String(query || '').trim().toUpperCase();
  if (!q) return [];
  const hits = [];
  for (const i of ALL) {
    const sym = i.sym.toUpperCase();
    const name = i.name.toUpperCase();
    let score = -1;
    if (sym === q) score = 0;
    else if (sym.startsWith(q)) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (sym.includes(q)) score = 3;
    else if (name.includes(q)) score = 4;
    if (score >= 0) hits.push([score, i]);
  }
  hits.sort((a, b) => a[0] - b[0] || a[1].sym.localeCompare(b[1].sym));
  return hits.slice(0, limit).map((h) => h[1]);
}

export function instrumentsFor(cls) {
  return ALL.filter((i) => i.cls === cls);
}
