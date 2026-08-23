// The guidebook's term bank.
//
// Coverage is drawn from three checklists — a stock-market terminology primer,
// the Consensys blockchain glossary, and the CBOE options glossary — but every
// definition here is written from scratch for this app. Where a term shows up
// on a PaperTerminal screen, `where` names the function so you can go look at
// the live number instead of only reading about it.

export const CATEGORIES = {
  basics:   { name: 'Market basics',        blurb: 'The vocabulary on every quote screen.' },
  equity:   { name: 'Stocks & fundamentals', blurb: 'What a share is, and how companies get measured.' },
  orders:   { name: 'Orders & execution',   blurb: 'How an instruction becomes a fill, and what it costs.' },
  options:  { name: 'Options',              blurb: 'Contracts, Greeks, volatility, and what they actually mean.' },
  futures:  { name: 'Futures & forwards',   blurb: 'Agreeing a price today for a trade that happens later.' },
  bonds:    { name: 'Bonds & rates',        blurb: 'Lending money, and the arithmetic of interest.' },
  fx:       { name: 'Foreign exchange',     blurb: 'Currencies, and why they leak into every foreign position.' },
  crypto:   { name: 'Crypto & blockchain',  blurb: 'The machinery under digital assets.' },
  margin:   { name: 'Margin & leverage',    blurb: 'Trading with money that is not yours.' },
  tax:      { name: 'Tax',                  blurb: 'What the gain costs you after you take it.' },
  risk:     { name: 'Risk & performance',   blurb: 'Measuring what you are exposed to, and how you did.' },
};

const T = (term, cat, short, body, opts = {}) =>
  ({ term, cat, short, body, see: opts.see || [], where: opts.where || null, also: opts.also || null });

export const TERMS = [

  // ─────────────────────────────────────────────────────── market basics
  T('Stock price', 'basics',
    'What one share last traded at.',
    'Not what the company is worth, and not what anyone thinks it should be worth — only the price at which the most recent buyer and seller agreed. It updates whenever a trade prints, which on a liquid name is many times a second.',
    { where: 'DES', see: ['Bid', 'Ask', 'Market capitalisation'] }),

  T('Ticker symbol', 'basics',
    'The short code that identifies a security on an exchange.',
    'Short, exchange-specific, and not unique across the world. Toyota is 7203 in Tokyo, TM in New York. This is why PaperTerminal stores several names for every instrument — Yahoo, Twelve Data and TradingView all spell the same company differently.',
    { where: 'CHRT', see: ['Exchange'] }),

  T('Bid', 'basics',
    'The highest price a buyer is currently willing to pay.',
    'If you sell right now at market, this is roughly what you get. There is always a bid and an ask, and the bid is always the lower of the two.',
    { where: 'DES', see: ['Ask', 'Spread', 'Market order'] }),

  T('Ask', 'basics',
    'The lowest price a seller is currently willing to accept.',
    'Also called the offer. If you buy right now at market, this is roughly what you pay.',
    { where: 'DES', see: ['Bid', 'Spread'] }),

  T('Spread', 'basics',
    'The gap between the bid and the ask.',
    'The cost of immediacy. Buy at the ask and sell instantly at the bid and you lose the spread without the price moving at all — which is why round-tripping a wide instrument is expensive even when you are right. Liquid mega-caps trade a penny wide; thin stocks and most options are far wider.',
    { where: 'DES', see: ['Bid', 'Ask', 'Slippage', 'Liquidity'] }),

  T('Mid', 'basics',
    'The midpoint between bid and ask.',
    'The fairest single number for "the price" when you are marking a position rather than trading one. PaperTerminal marks your book at mid and charges you the spread when you actually trade.',
    { see: ['Spread', 'Mark to market'] }),

  T('Volume', 'basics',
    'How many shares or contracts changed hands.',
    'Usually quoted for the current session. High volume means a move had participation behind it; a big move on thin volume is easier to reverse.',
    { where: 'DES', see: ['Average volume', 'Liquidity'] }),

  T('Average volume', 'basics',
    'Typical daily volume over a recent window.',
    'The yardstick that makes today\'s volume mean something, and the basis for judging whether your own order is large enough to move the price.',
    { see: ['Volume', 'Slippage', 'Liquidity'] }),

  T('Liquidity', 'basics',
    'How easily you can trade size without moving the price.',
    'Liquid instruments have tight spreads, deep books and heavy volume. PaperTerminal assigns every instrument a liquidity tier, which drives both the spread you cross and how much your own order size costs you.',
    { see: ['Spread', 'Slippage', 'Market impact'] }),

  T('Previous close', 'basics',
    'The last price of the prior session.',
    'The reference point for today\'s change. Note that an overnight gap means the first trade of the day can be far from it.',
    { where: 'DES', see: ['Open', 'Gap', 'Percentage change'] }),

  T('Open', 'basics',
    'The first traded price of the session.',
    'Often set by an opening auction rather than continuous trading, which is why it can differ sharply from the previous close.',
    { where: 'DES', see: ['Previous close', 'Gap'] }),

  T('Gap', 'basics',
    'A jump between one session\'s close and the next session\'s open.',
    'News does not wait for the exchange to open. A gap is why a stop-loss is not a guarantee: if the price gaps straight through your stop, you are filled on the other side of it, not at it.',
    { see: ['Stop-loss order', 'Slippage'] }),

  T('High / Low', 'basics',
    'The extremes traded during a period.',
    'The session range. A wide range on ordinary volume signals disagreement about value.',
    { where: 'DES', see: ['Range', '52-week high and low'] }),

  T('52-week high and low', 'basics',
    'The highest and lowest price over the past year.',
    'A quick sense of where the current price sits in its recent history. Widely watched, which sometimes makes those levels behave as though they matter.',
    { see: ['High / Low', 'Range'] }),

  T('Range', 'basics',
    'The distance between the high and the low.',
    'Expressed absolutely or as a percentage. A useful proxy for volatility that needs no maths, and the input to the Parkinson and Garman-Klass volatility estimators.',
    { see: ['Volatility', 'Realised volatility'] }),

  T('Percentage change', 'basics',
    'Today\'s move relative to the previous close.',
    'Comparable across instruments in a way that an absolute move is not — one dollar means something very different on a five-dollar stock than on a five-hundred-dollar one.',
    { where: 'WEI', see: ['Basis point', 'Previous close'] }),

  T('Basis point', 'basics',
    'One hundredth of a percentage point. 0.01%.',
    'The unit of choice wherever precision matters and percentages are small — interest rates, bond yields, fees. A move from 4.00% to 4.25% is twenty-five basis points. One hundred basis points is one percent.',
    { where: 'YCRV', see: ['DV01', 'Yield'] }),

  T('Market capitalisation', 'basics',
    'Share price multiplied by shares outstanding.',
    'What the market says the equity is worth in total. It ignores debt and cash, which is why enterprise value is the better number when comparing companies with different balance sheets.',
    { where: 'DES', see: ['Enterprise value', 'Shares outstanding'] }),

  T('Exchange', 'basics',
    'The venue where buyers and sellers are matched.',
    'Each has its own hours, currency, settlement convention, tick size and lot size. PaperTerminal models ten of them, which is why something is nearly always open somewhere.',
    { where: 'WEI', see: ['Trading session', 'Settlement'] }),

  T('Trading session', 'basics',
    'The hours during which an exchange matches orders.',
    'Not a single block everywhere — Tokyo, Shanghai and Singapore all break for lunch. Outside the session you can still see a price, but it is the last one printed, not a live one.',
    { where: 'WEI', see: ['Exchange', 'Stale price'] }),

  T('Stale price', 'basics',
    'A quote that has stopped updating.',
    'Either the venue is closed or the feed has fallen behind. PaperTerminal stamps every price with its age and turns the field amber then red as it ages, because filling against a price you believe is live when it is twenty minutes old is a genuinely expensive mistake.',
    { where: 'DES', see: ['Trading session', 'Mark to market'] }),

  T('Watchlist', 'basics',
    'A saved set of instruments you want to keep an eye on.',
    'In PaperTerminal the watchlist also has a practical function: the feed only polls what is on screen or held, so what you watch is what stays fresh.',
    { where: 'W' }),

  T('Tick size', 'basics',
    'The smallest price increment an instrument can move.',
    'A US stock ticks in cents; an Indian one in five paise. It sets the floor on how tight a spread can possibly be.',
    { see: ['Spread', 'Lot size'] }),

  T('Lot size', 'basics',
    'The minimum tradeable quantity, or the multiple you must trade in.',
    'One share in the US, but a hundred in Tokyo and Singapore. It is why a single Japanese position can be far larger than it looks from the share price.',
    { see: ['Tick size', 'Contract multiplier'] }),

  T('Settlement', 'basics',
    'When ownership and cash actually change hands after a trade.',
    'T+1 means one business day after the trade. The trade is binding immediately; only the paperwork lags. Conventions differ by market, which PaperTerminal records per exchange.',
    { where: 'DES', see: ['Trading session'] }),

  T('Index', 'basics',
    'A number tracking a basket of securities.',
    'The S&P 500, Nifty 50 and Nikkei 225 are all weighted baskets that summarise a market in one figure. You cannot buy an index directly — you buy a fund, a future, or an option on it.',
    { where: 'WEI', see: ['ETF', 'Futures contract'] }),

  T('ETF', 'basics',
    'A fund that trades on an exchange like a share.',
    'Exchange-traded fund. It holds a basket — an index, a sector, bonds, a commodity — and trades all day at a price that tracks the value of what it holds. The usual way to buy an index without touching derivatives.',
    { see: ['Index', 'Net asset value'] }),

  T('Types of charts', 'basics',
    'Line, candlestick, bar and others — different views of the same prices.',
    'A line chart plots closes only. A candlestick shows open, high, low and close for each period, so you can see the range and which way it resolved. PaperTerminal draws lines from daily closes; VIEW CHART opens TradingView for candles and indicators.',
    { where: 'CHRT', see: ['Time frame', 'Open', 'High / Low'] }),

  T('Time frame', 'basics',
    'The period each point or candle on a chart covers.',
    'A one-minute chart and a one-month chart of the same stock can tell opposite stories. Match the time frame to how long you intend to hold.',
    { where: 'GP', see: ['Types of charts'] }),

  // ─────────────────────────────────────────────── stocks & fundamentals
  T('Stocks', 'equity',
    'Units of ownership in a company.',
    'Own a share and you own a slice of the business — its assets, its earnings, and usually a vote. You are last in line if it fails: creditors and preferred holders get paid first, and common shareholders get whatever is left, which is often nothing.',
    { see: ['Common stock', 'Preferred stock', 'Equity'] }),

  T('Common stock', 'equity',
    'Ordinary shares, with votes and no guaranteed dividend.',
    'The usual thing people mean by "stock". You vote on company matters, you receive dividends if and when the board declares them, and you rank behind every creditor and preferred holder in a liquidation.',
    { see: ['Preferred stock', 'Dividend'] }),

  T('Preferred stock', 'equity',
    'Shares with a fixed dividend and priority over common, but usually no vote.',
    'A hybrid — it behaves partly like a bond, because the dividend is set, and partly like equity. Preferred holders get paid before common holders and after creditors.',
    { see: ['Common stock', 'Dividend'] }),

  T('Shares outstanding', 'equity',
    'The total number of shares currently held by all investors.',
    'The multiplier that turns a share price into a market capitalisation. It changes when a company issues new shares, which dilutes existing holders, or buys them back, which concentrates them.',
    { see: ['Market capitalisation', 'Share buyback', 'Dilution'] }),

  T('Dilution', 'equity',
    'Your ownership percentage shrinking because more shares now exist.',
    'The same number of shares, a smaller slice of the company. Happens through new issuance, employee stock grants, or conversion of convertible debt. Diluted EPS is the version that assumes all of it has happened.',
    { see: ['Shares outstanding', 'Earnings per share'] }),

  T('Share buyback', 'equity',
    'A company purchasing its own shares from the market.',
    'Reduces shares outstanding, so each remaining share represents a bigger slice and EPS rises even if profits do not. A way of returning cash to shareholders that is taxed differently from a dividend.',
    { see: ['Dilution', 'Dividend', 'Earnings per share'] }),

  T('Dividend', 'equity',
    'Cash paid out to shareholders from company profits.',
    'Declared by the board, usually quarterly or annually. Not a right — dividends can be cut, and cuts are typically punished hard by the market.',
    { see: ['Dividend yield', 'Ex-dividend date', 'Payout ratio'] }),

  T('Dividend yield', 'equity',
    'Annual dividend as a percentage of the share price.',
    'Directly comparable to a bond yield, which is why income investors watch it. A very high yield is often a warning rather than a bargain: it usually means the price has collapsed and the market expects the dividend to be cut.',
    { see: ['Dividend', 'Payout ratio'] }),

  T('Ex-dividend date', 'equity',
    'The first day a buyer does not receive the upcoming dividend.',
    'Buy on or after it and the seller keeps the payment. The share price typically drops by roughly the dividend amount that morning, so there is no free money in buying just before it.',
    { see: ['Dividend', 'Dividend yield'] }),

  T('Payout ratio', 'equity',
    'The share of earnings paid out as dividends.',
    'Above 100% means the company is paying out more than it earns, funded from cash reserves or borrowing. Sustainable only briefly.',
    { see: ['Dividend', 'Net income'] }),

  T('Earnings per share', 'equity',
    'Net income divided by shares outstanding.',
    'Profit attributable to each share. Basic EPS uses current shares; diluted EPS assumes every option, warrant and convertible has been exercised, and is the more conservative figure.',
    { see: ['Net income', 'Price-to-earnings ratio', 'Dilution'] }),

  T('Earnings date', 'equity',
    'When a company reports its results.',
    'A scheduled volatility event. Implied volatility in options usually rises into it and collapses immediately after — which is why buying options just before earnings can lose money even when the direction is right.',
    { see: ['Implied volatility', 'Volatility crush'] }),

  T('Price-to-earnings ratio', 'equity',
    'Share price divided by earnings per share.',
    'How many years of current earnings you are paying for. Trailing P/E uses the last twelve months of actual earnings; forward P/E uses analyst estimates of the next twelve, and is therefore a forecast wearing the costume of a fact.',
    { see: ['Earnings per share', 'PEG ratio', 'Price-to-book ratio'] }),

  T('PEG ratio', 'equity',
    'P/E divided by the earnings growth rate.',
    'An attempt to make P/E fair to fast-growing companies, which always look expensive on P/E alone. Around 1 is conventionally regarded as reasonable, though the growth estimate does all the work and is the least reliable input.',
    { see: ['Price-to-earnings ratio'] }),

  T('Price-to-sales ratio', 'equity',
    'Market cap divided by annual revenue.',
    'Useful precisely where P/E is useless — companies with no earnings yet. Revenue is harder to manipulate than profit, but it also says nothing about whether the business can ever make money.',
    { see: ['Price-to-earnings ratio', 'Revenue'] }),

  T('Price-to-book ratio', 'equity',
    'Market cap divided by shareholders\' equity.',
    'Price against accounting net worth. Below 1 means the market values the company at less than its stated book value. Meaningful for banks, close to meaningless for software companies whose real assets are not on the balance sheet.',
    { see: ['Equity', 'Total assets', 'Intangible assets'] }),

  T('Enterprise value', 'equity',
    'Market cap plus total debt minus cash.',
    'What it would actually cost to buy the whole company, because an acquirer inherits the debt and gets the cash. The reason two companies with identical market caps can be worth very different amounts.',
    { see: ['Market capitalisation', 'EBITDA'] }),

  T('EBITDA', 'equity',
    'Earnings before interest, tax, depreciation and amortisation.',
    'A rough proxy for operating cash generation, stripped of financing and accounting choices so companies can be compared. Its weakness is the same as its strength: depreciation is a real cost of a business that owns machinery, and ignoring it flatters capital-heavy firms.',
    { see: ['Enterprise value', 'Operating margin', 'Depreciation and amortisation'] }),

  T('Revenue', 'equity',
    'Total money brought in from sales, before any costs.',
    'The top line. Every other profit figure is revenue minus something.',
    { see: ['Net income', 'Profit margin', 'Price-to-sales ratio'] }),

  T('Net income', 'equity',
    'What is left after every cost, expense, interest payment and tax.',
    'The bottom line. Divided by shares outstanding it becomes earnings per share.',
    { see: ['Revenue', 'Earnings per share', 'Profit margin'] }),

  T('Profit margin', 'equity',
    'Net income as a percentage of revenue.',
    'How many cents of each revenue dollar survive to the bottom line. Varies enormously by industry — a supermarket running at 2% can be perfectly healthy, a software company at 2% is not.',
    { see: ['Net income', 'Operating margin'] }),

  T('Operating margin', 'equity',
    'Operating income as a percentage of revenue.',
    'Profitability of the core business before interest and tax. A cleaner read on operations than net margin, which is muddied by financing and one-offs.',
    { see: ['Profit margin', 'EBITDA'] }),

  T('Return on equity', 'equity',
    'Net income divided by shareholders\' equity.',
    'How much profit management generates from the money shareholders have in the business. High ROE can reflect genuine quality or simply heavy borrowing, so it should always be read alongside leverage.',
    { see: ['Return on assets', 'Equity', 'Leverage'] }),

  T('Return on assets', 'equity',
    'Net income divided by total assets.',
    'Profit per dollar of assets, regardless of how those assets were financed. Unlike ROE it cannot be flattered by debt.',
    { see: ['Return on equity', 'Total assets'] }),

  T('Depreciation and amortisation', 'equity',
    'Spreading the cost of an asset across the years it is used.',
    'Depreciation applies to physical assets, amortisation to intangible ones. Both are non-cash charges — the money left long ago — which is why they get added back in EBITDA and in cash flow statements.',
    { see: ['EBITDA', 'Cash flow from operations'] }),

  T('Balance sheet', 'equity',
    'A snapshot of what a company owns, owes and is worth on one date.',
    'Assets equal liabilities plus equity, always. If it does not balance, something is wrong.',
    { see: ['Total assets', 'Liabilities', 'Equity'] }),

  T('Total assets', 'equity',
    'Everything the company owns.',
    'Cash, receivables, inventory, property, and intangibles like patents and goodwill. Current assets are the ones expected to convert to cash within a year.',
    { see: ['Balance sheet', 'Intangible assets', 'Liabilities'] }),

  T('Intangible assets', 'equity',
    'Assets with no physical form.',
    'Patents, trademarks, software, brand value and goodwill from acquisitions. Real, valuable, and much harder to value reliably than a factory — which is why price-to-book behaves oddly for companies dominated by them.',
    { see: ['Total assets', 'Price-to-book ratio'] }),

  T('Liabilities', 'equity',
    'Everything the company owes.',
    'Current liabilities fall due within a year — accounts payable, short-term debt. Long-term liabilities are everything beyond that. Current assets against current liabilities is the crude test of whether a company can pay its near-term bills.',
    { see: ['Balance sheet', 'Total assets', 'Equity'] }),

  T('Equity', 'equity',
    'Assets minus liabilities. What shareholders own outright.',
    'Also called book value or shareholders\' equity. In a trading account the same word means something related but distinct: your positions plus cash, minus what you owe.',
    { where: 'PORT', see: ['Balance sheet', 'Net liquidation value', 'Retained earnings'] }),

  T('Retained earnings', 'equity',
    'Cumulative profits kept in the business rather than paid out.',
    'The running total of every year\'s profit minus every dividend since the company began. Negative retained earnings — an accumulated deficit — means lifetime losses exceed lifetime profits.',
    { see: ['Equity', 'Dividend', 'Net income'] }),

  T('Cash flow from operations', 'equity',
    'Cash actually generated by running the business.',
    'Often the most honest number in a report. Profit involves judgement about when to recognise revenue and costs; cash arriving in the bank involves less. Persistent profit without operating cash flow is a warning.',
    { see: ['Net income', 'Depreciation and amortisation', 'Free cash flow'] }),

  T('Free cash flow', 'equity',
    'Operating cash flow minus capital spending.',
    'What is genuinely left over to pay dividends, buy back shares, or repay debt after keeping the business running.',
    { see: ['Cash flow from operations'] }),

  T('Moving average', 'equity',
    'The average price over a trailing window, recalculated each day.',
    'Smooths noise to show trend. The 50-day and 200-day are the most watched; price crossing from one side to the other of them is a signal that many people act on, which gives the levels some self-fulfilling force.',
    { see: ['Time frame', 'Types of charts'] }),

  T('Analyst rating', 'equity',
    'A published buy, hold or sell opinion from a research analyst.',
    'Worth knowing about mainly because other people trade on it. Ratings cluster heavily towards buy, and price targets are revised to follow the price at least as often as the price follows them.',
    { see: ['Price target'] }),

  T('Price target', 'equity',
    'An analyst\'s estimate of where a stock should trade within a year.',
    'A forecast with a number attached. Treat the reasoning as the useful part and the number as decoration.',
    { see: ['Analyst rating'] }),

  T('Insider ownership', 'equity',
    'The share of a company held by its own executives and directors.',
    'High insider ownership is usually read as alignment — management loses what shareholders lose. Insider selling is noisier as a signal, since people sell for reasons that have nothing to do with the company.',
    { see: ['Institutional ownership'] }),

  T('Institutional ownership', 'equity',
    'The share held by funds, pensions and other large investors.',
    'High institutional ownership means more research coverage and usually more liquidity, but it also means crowded positioning that can unwind together.',
    { see: ['Insider ownership', 'Liquidity'] }),

  T('Fiscal year', 'equity',
    'The twelve-month period a company uses for accounting.',
    'Frequently not the calendar year. Apple\'s ends in September. It matters when comparing companies — "2026 earnings" may cover different months for each.',
    { see: ['Earnings date'] }),

  // ──────────────────────────────────────────────── orders & execution
  T('Market order', 'orders',
    'Buy or sell immediately at whatever price is available.',
    'You get certainty of execution and no certainty of price. On a liquid name that is a fine trade. On a thin one, or in a fast market, or when the venue is closed and you are filling against a stale print, it can be brutal.',
    { where: 'TRAD', see: ['Limit order', 'Slippage', 'Spread'] }),

  T('Limit order', 'orders',
    'Buy or sell only at a specified price or better.',
    'The mirror image of a market order: certainty of price, no certainty of execution. Your order rests until the market comes to you, and if it never does, nothing happens.',
    { where: 'TRAD', see: ['Market order', 'Working order'] }),

  T('Stop-loss order', 'orders',
    'An order that becomes a market order once the price crosses a trigger.',
    'The standard tool for capping a loss. Two things people get wrong: it is not a guaranteed price — once triggered it becomes a market order and fills wherever the market is, which in a gap can be far below your stop — and it does nothing while the market is closed.',
    { where: 'ALRT', see: ['Stop-limit order', 'Trailing stop', 'Gap'] }),

  T('Stop-limit order', 'orders',
    'A stop that becomes a limit order rather than a market order.',
    'Protects you from a terrible fill, at the cost of possibly no fill at all. In exactly the fast collapse you most wanted protection from, the price can blow straight through your limit and leave you holding the position.',
    { where: 'ALRT', see: ['Stop-loss order', 'Limit order'] }),

  T('Trailing stop', 'orders',
    'A stop that follows the price up and never moves back down.',
    'Set eight percent below and it ratchets upward as the position gains, locking in profit while leaving room to run. The trade-off is that ordinary volatility can stop you out of a position that then keeps going.',
    { where: 'ALRT', see: ['Stop-loss order', 'Volatility'] }),

  T('Working order', 'orders',
    'An order that has been placed but not yet filled.',
    'It sits waiting for its trigger condition. PaperTerminal checks every working order against each new tick, which is what makes a stop actually protect something rather than being decorative.',
    { where: 'ALRT', see: ['Limit order', 'Stop-loss order'] }),

  T('Fill', 'orders',
    'The execution of an order — the price and quantity you actually got.',
    'Distinct from the price you saw when you clicked. The gap between the two is spread plus slippage, and PaperTerminal records both on every trade in the blotter.',
    { where: 'BLOT', see: ['Slippage', 'Spread', 'Partial fill'] }),

  T('Partial fill', 'orders',
    'Only part of your order executed.',
    'Common with large orders in thin instruments — there simply was not enough on the other side at your price.',
    { see: ['Fill', 'Liquidity'] }),

  T('Slippage', 'orders',
    'The difference between the price you expected and the price you got.',
    'Comes from the spread you cross plus the impact of your own size. It is a real, recurring cost that backtests routinely ignore and live accounts never can.',
    { where: 'BLOT', see: ['Market impact', 'Spread', 'Fill'] }),

  T('Market impact', 'orders',
    'The price movement your own order causes.',
    'Buy enough and you exhaust the offers at the current price and start lifting higher ones. Impact scales roughly with the square root of order size relative to typical volume, which is the model PaperTerminal uses.',
    { see: ['Slippage', 'Liquidity', 'Average volume'] }),

  T('Commission', 'orders',
    'The broker\'s fee for executing a trade.',
    'Often zero on US stocks now, but rarely zero on options and futures, where it is charged per contract. Small per trade, large per year if you trade often.',
    { where: 'BLOT', see: ['Slippage'] }),

  T('Long', 'orders',
    'Owning something, and profiting if it rises.',
    'The ordinary direction. Your maximum loss is what you paid, because the price cannot go below zero.',
    { where: 'PORT', see: ['Short selling'] }),

  T('Short selling', 'orders',
    'Selling something you do not own, hoping to buy it back cheaper.',
    'You borrow the shares, sell them, and must eventually return them. Profit if the price falls. The asymmetry is the point: your maximum gain is capped at 100% because the price can only fall to zero, while your loss is unbounded because there is no ceiling on how high a price can go.',
    { where: 'PORT', see: ['Long', 'Short squeeze', 'Maintenance margin'] }),

  T('Short squeeze', 'orders',
    'A rally driven by short sellers being forced to buy back.',
    'Rising prices create losses for shorts, margin calls force them to close, closing means buying, buying pushes the price higher, which squeezes the remaining shorts. Self-reinforcing while it lasts.',
    { see: ['Short selling', 'Margin call'] }),

  T('Day trade', 'orders',
    'Opening and closing the same position within one session.',
    'In a US margin account, four day trades in five business days on an account under $25,000 triggers the pattern day trader rule and restricts you.',
    { where: 'MARG', see: ['Pattern day trader'] }),

  T('Intraday', 'orders',
    'Within a single trading day.',
    'Intraday trading avoids overnight gap risk entirely — but pays spread and commission far more often, and runs into the pattern day trader rule on small accounts.',
    { see: ['Day trade', 'Gap'] }),

  T('Position', 'orders',
    'A holding in a particular instrument.',
    'Defined by quantity, direction and average price. In PaperTerminal a position is made of tax lots rather than a single average, because which lot you sell changes what you owe.',
    { where: 'PORT', see: ['Tax lot', 'Average price'] }),

  T('Average price', 'orders',
    'The weighted average of what you paid across all your buys.',
    'Convenient for judging whether you are up or down, but it is a summary, not the truth. The underlying lots are the truth, and they are what the tax calculation uses.',
    { where: 'PORT', see: ['Tax lot', 'Position'] }),

  T('Mark to market', 'orders',
    'Revaluing a position at the current market price.',
    'What turns a paper position into a number on your equity line. Futures mark to market daily with cash actually moving; stocks mark to market only on your screen until you sell.',
    { where: 'PORT', see: ['Unrealised profit and loss', 'Variation margin'] }),

  T('Unrealised profit and loss', 'orders',
    'Gain or loss on positions you still hold.',
    'It moves every tick and it is not yours until you close. Untaxed, and entirely reversible.',
    { where: 'PORT', see: ['Realised profit and loss', 'Mark to market'] }),

  T('Realised profit and loss', 'orders',
    'Gain or loss locked in by closing a position.',
    'Permanent, and the moment it becomes a taxable event.',
    { where: 'PNL', see: ['Unrealised profit and loss', 'Capital gain'] }),

  // ──────────────────────────────────────────────────────────── options
  T('Option', 'options',
    'A contract giving the right, but not the obligation, to trade at a set price.',
    'Calls give the right to buy, puts the right to sell. The buyer pays a premium for that right; the seller receives the premium and takes on the obligation. That asymmetry — right versus obligation — drives every difference in risk between the two sides.',
    { where: 'OMON', see: ['Call option', 'Put option', 'Premium', 'Strike price'] }),

  T('Call option', 'options',
    'The right to buy the underlying at the strike price.',
    'Profits when the underlying rises. Buying one costs a premium and risks only that premium. Selling one without owning the stock — a naked call — has theoretically unlimited loss, because there is no ceiling on the price you may be forced to deliver at.',
    { where: 'OMON', see: ['Put option', 'Covered call', 'Naked option'] }),

  T('Put option', 'options',
    'The right to sell the underlying at the strike price.',
    'Profits when the underlying falls. Buying puts is the standard way to hedge a long portfolio. Selling puts obliges you to buy the stock at the strike if it falls, which is why it is often described as getting paid to place a limit order you cannot cancel.',
    { where: 'OMON', see: ['Call option', 'Protective put', 'Naked option'] }),

  T('Strike price', 'options',
    'The price at which the option can be exercised.',
    'Fixed when the contract is created. The relationship between strike and current price determines whether the option is in, at, or out of the money.',
    { where: 'OMON', see: ['In the money', 'Out of the money', 'Moneyness'] }),

  T('Premium', 'options',
    'The price of the option itself.',
    'What the buyer pays and the seller receives. It splits into intrinsic value — what the option is worth if exercised now — and time value, which is everything else and decays to zero at expiry.',
    { where: 'OV', see: ['Intrinsic value', 'Time value', 'Theta'] }),

  T('Expiration', 'options',
    'The date the contract ceases to exist.',
    'After it, an in-the-money option settles and an out-of-the-money one is worthless. Every day between now and then, time value drains — slowly at first, then quickly in the final weeks.',
    { where: 'OMON', see: ['Theta', 'Time value', 'Assignment'] }),

  T('Moneyness', 'options',
    'Where the strike sits relative to the current price.',
    'In the money, at the money, or out of the money. It is the single most useful descriptor of an option, because it determines how much of the premium is real value and how much is hope.',
    { where: 'OMON', see: ['In the money', 'Out of the money', 'At the money'] }),

  T('In the money', 'options',
    'An option with intrinsic value.',
    'A call whose strike is below the price, or a put whose strike is above it. Exercising it now would be worth something.',
    { see: ['Out of the money', 'Intrinsic value'] }),

  T('Out of the money', 'options',
    'An option with no intrinsic value — only time value.',
    'Cheap, and cheap for a reason. It is a pure bet that the price moves far enough, fast enough. Most out-of-the-money options expire worthless, which is the whole business model of option selling.',
    { see: ['In the money', 'Time value', 'Theta'] }),

  T('At the money', 'options',
    'Strike roughly equal to the current price.',
    'Where time value and gamma are at their maximum, and where the option is most sensitive to everything.',
    { see: ['Moneyness', 'Gamma', 'Time value'] }),

  T('Intrinsic value', 'options',
    'What the option would be worth if exercised right now.',
    'Never negative — you would simply not exercise. Everything in the premium above intrinsic value is time value.',
    { where: 'OV', see: ['Time value', 'Premium'] }),

  T('Time value', 'options',
    'Premium above intrinsic value — what you pay for the chance of further movement.',
    'Also called extrinsic value. It is the entire premium of an out-of-the-money option, and it is guaranteed to be zero at expiry. Buying options means fighting this decay; selling them means collecting it.',
    { where: 'OV', see: ['Theta', 'Intrinsic value'] }),

  T('Delta', 'options',
    'How much the option price moves per one unit move in the underlying.',
    'A 0.60 delta call gains roughly 60 cents if the stock gains a dollar. Calls run 0 to 1, puts 0 to −1. It doubles as a rough probability of finishing in the money, and as the hedge ratio — how many shares the option currently behaves like.',
    { where: 'OMON', see: ['Gamma', 'Delta hedging', 'The Greeks'] }),

  T('Gamma', 'options',
    'How fast delta itself changes.',
    'The second derivative, and the reason option risk is not linear. A short option position that looks harmless at a 2% move can be catastrophic at 20%, because gamma made the delta grow against you the whole way down.',
    { where: 'OMON', see: ['Delta', 'The Greeks', 'Stress test'] }),

  T('Theta', 'options',
    'Value lost per day purely from time passing.',
    'Negative for buyers, positive for sellers. It accelerates as expiry nears, which is why holding a long out-of-the-money option through its final weeks is such a reliable way to lose money slowly.',
    { where: 'OMON', see: ['Time value', 'Expiration'] }),

  T('Vega', 'options',
    'Price change per one point move in implied volatility.',
    'Not actually a Greek letter, which everyone notices and nobody fixes. Long options are always long vega: rising volatility helps you even if the price does not move. Falling volatility hurts you even if you were right about direction.',
    { where: 'OMON', see: ['Implied volatility', 'Volatility crush'] }),

  T('Rho', 'options',
    'Sensitivity to interest rates.',
    'The Greek nobody watches, because rates move slowly. It matters for long-dated options, where the discounting of the strike has time to make a real difference.',
    { where: 'OV', see: ['The Greeks', 'Risk-free rate'] }),

  T('The Greeks', 'options',
    'The sensitivities of an option price to each thing that can change.',
    'Delta to price, gamma to delta, theta to time, vega to volatility, rho to rates. Together they tell you what you are actually exposed to — which is rarely just "the stock goes up".',
    { where: 'OMON', see: ['Delta', 'Gamma', 'Theta', 'Vega', 'Rho'] }),

  T('Vanna', 'options',
    'How delta changes as volatility moves.',
    'A second-order Greek. Matters when volatility and price move together, which is exactly what happens in a sell-off.',
    { where: 'OMON', see: ['Delta', 'Vega', 'The Greeks'] }),

  T('Charm', 'options',
    'How delta changes purely from the passage of time.',
    'Also called delta decay. A hedge that was correct on Friday can be wrong on Monday without the price having moved at all.',
    { where: 'OMON', see: ['Delta', 'Theta'] }),

  T('Implied volatility', 'options',
    'The volatility the market price of an option implies.',
    'Run an option pricing model backwards: instead of putting volatility in to get a price, put the price in to get volatility. It is the market\'s forecast of future movement, and it is the only input in the model that is not directly observable.',
    { where: 'OMON', see: ['Realised volatility', 'Volatility smile', 'Vega'] }),

  T('Realised volatility', 'options',
    'How much the price actually moved, measured from history.',
    'Backward-looking, and calculable exactly. PaperTerminal blends four estimators — close-to-close, EWMA, Parkinson and Garman-Klass — because each throws away different information.',
    { where: 'DES', see: ['Implied volatility', 'Volatility'] }),

  T('Volatility risk premium', 'options',
    'The tendency of implied volatility to exceed what subsequently happens.',
    'Option sellers are being paid to carry risk, so on average they collect a little more than the eventual movement justifies. It is a real edge and it is also how people blow up: the average is comfortable, the tail is not.',
    { where: 'DES', see: ['Implied volatility', 'Realised volatility'] }),

  T('Volatility smile', 'options',
    'Implied volatility varying across strikes rather than being flat.',
    'Black-Scholes assumes one volatility for all strikes. Reality disagrees. Plotting implied volatility against strike gives a curve, because the market prices extreme moves as more likely than a normal distribution says.',
    { where: 'OMON', see: ['Volatility skew', 'Implied volatility'] }),

  T('Volatility skew', 'options',
    'Downside puts carrying higher implied volatility than upside calls.',
    'The characteristic shape in equity indices. Crashes are faster and more correlated than rallies, and everyone wants downside protection at once, so it costs more. PaperTerminal fits this skew rather than pricing a flat surface, because a flat surface teaches the wrong lesson.',
    { where: 'OMON', see: ['Volatility smile', 'Risk reversal'] }),

  T('Risk reversal', 'options',
    'The implied volatility difference between an out-of-the-money call and put.',
    'A single number summarising the skew. Negative means puts are bid — the market is paying up for protection.',
    { where: 'DES', see: ['Volatility skew'] }),

  T('Volatility crush', 'options',
    'Implied volatility collapsing after a known event passes.',
    'Options get expensive ahead of earnings because the outcome is uncertain. Once it is known, that uncertainty disappears and the premium with it — so a long option can lose money on an earnings move that went the right way but not far enough.',
    { see: ['Implied volatility', 'Earnings date', 'Vega'] }),

  T('Black-Scholes model', 'options',
    'The standard closed-form formula for pricing European options.',
    'Takes spot, strike, time, rates, dividend yield and volatility, and returns a price. Its assumptions are all somewhat false — constant volatility, no jumps, frictionless trading — and it remains the common language of the options market anyway. PaperTerminal uses the Merton extension, which handles dividends.',
    { where: 'OV', see: ['Binomial model', 'Implied volatility', 'European option'] }),

  T('Binomial model', 'options',
    'Pricing by stepping through a tree of possible future prices.',
    'Slower than a closed formula but able to handle early exercise, which Black-Scholes structurally cannot. PaperTerminal uses a 160-step Cox-Ross-Rubinstein tree for American options.',
    { where: 'OV', see: ['American option', 'Black-Scholes model'] }),

  T('European option', 'options',
    'Exercisable only at expiry.',
    'Simpler, and cheaper than the American equivalent because the holder has fewer rights. Index options are typically European and cash-settled.',
    { where: 'OMON', see: ['American option', 'Cash settlement'] }),

  T('American option', 'options',
    'Exercisable at any time up to expiry.',
    'Worth at least as much as the European equivalent, since extra rights cannot be worth less than nothing. The difference is the early exercise premium. Single-stock options are typically American.',
    { where: 'OMON', see: ['European option', 'Binomial model', 'Assignment'] }),

  T('Assignment', 'options',
    'Being required to fulfil an option you sold.',
    'The holder exercises; you must deliver. Sell a call and get assigned and you are suddenly short 100 shares per contract, whether you wanted to be or not. This is the failure mode that actually hurts people, and PaperTerminal models it.',
    { where: 'PORT', see: ['Exercise', 'Naked option', 'American option'] }),

  T('Exercise', 'options',
    'Using your right to buy or sell at the strike.',
    'The buyer\'s decision. In-the-money options are usually exercised automatically at expiry, which surprises people who assumed an expiring option simply disappears.',
    { see: ['Assignment', 'Expiration'] }),

  T('Contract multiplier', 'options',
    'How many units of the underlying one contract controls.',
    'Standard equity options are 100 shares. A premium quoted at 2.50 therefore costs 250. Forgetting the multiplier is the most common way to accidentally take a position ten or a hundred times bigger than intended.',
    { where: 'OMON', see: ['Lot size', 'Notional value'] }),

  T('Naked option', 'options',
    'A short option with no offsetting position.',
    'You have taken on an obligation without holding anything that covers it. Margin requirements are large and the loss is theoretically unlimited on a naked call. The single fastest way to destroy a small account.',
    { where: 'MARG', see: ['Covered call', 'Assignment', 'Maintenance margin'] }),

  T('Covered call', 'options',
    'Selling a call against stock you already own.',
    'You collect premium; in exchange you cap your upside at the strike, because if the stock runs past it your shares get called away. Income in exchange for surrendering the tail.',
    { see: ['Call option', 'Naked option', 'Assignment'] }),

  T('Protective put', 'options',
    'Buying a put against stock you own.',
    'Insurance. It costs premium every time, most of which expires worthless, and it caps your loss below the strike. Whether that trade is worth it is the same question as any insurance policy.',
    { see: ['Put option', 'Hedge'] }),

  T('Open interest', 'options',
    'The number of contracts currently outstanding.',
    'Unlike volume, which counts today\'s trades, open interest counts positions that still exist. In PaperTerminal it is decorative — the chains are model-generated, so there is no real open interest to report.',
    { where: 'OMON', see: ['Volume'] }),

  T('Max pain', 'options',
    'The strike at which the largest total value of options expires worthless.',
    'Folk theory says price gravitates there into expiry. The evidence is thin, but enough people watch it that it appears on most option boards, including this one.',
    { where: 'OMON', see: ['Open interest', 'Expiration'] }),

  T('Delta hedging', 'options',
    'Offsetting an option\'s directional exposure with the underlying.',
    'Sell a 0.40 delta call on 100 shares and buy 40 shares, and you are momentarily neutral to small moves. Momentarily, because gamma keeps changing the delta, so the hedge must be continually rebalanced.',
    { see: ['Delta', 'Gamma', 'Hedge'] }),

  T('Hedge', 'options',
    'A position taken to offset risk in another position.',
    'Hedging reduces both loss and gain. A perfectly hedged book makes nothing, which is why the real question is never whether to hedge but how much.',
    { see: ['Protective put', 'Delta hedging'] }),

  T('Payoff diagram', 'options',
    'A chart of profit and loss against the underlying price at expiry.',
    'The clearest way to see what a strategy actually does. PaperTerminal draws the expiry payoff as a solid line and today\'s value as a dashed one — the gap between them is time value waiting to decay.',
    { where: 'OV', see: ['Time value', 'Break-even'] }),

  T('Break-even', 'options',
    'The underlying price at which a position makes exactly nothing.',
    'For a long call it is strike plus premium — the stock must clear the strike and then pay you back what you spent before you see a cent.',
    { where: 'OV', see: ['Payoff diagram', 'Premium'] }),

  // ────────────────────────────────────────────── futures & forwards
  T('Futures contract', 'futures',
    'A standardised agreement to trade at a set price on a future date.',
    'Exchange-traded, cleared, and marked to market every day with cash actually moving between accounts. You post a small initial margin against a much larger notional, which is where the leverage comes from.',
    { where: 'FUT', see: ['Forward contract', 'Initial margin', 'Variation margin', 'Notional value'] }),

  T('Forward contract', 'futures',
    'A private agreement to trade at a set price on a future date.',
    'Economically similar to a future, structurally very different: not standardised, not exchange-traded, and crucially not marked to market. Nothing settles until maturity, so a losing forward stays completely quiet right up until it does not.',
    { where: 'FRD', see: ['Futures contract', 'Counterparty risk'] }),

  T('Notional value', 'futures',
    'The full value of the underlying a contract controls.',
    'The number that matters for risk, as opposed to the margin you posted, which is the number that matters for cash. A contract requiring $1,200 of margin might control $60,000 of index — that ratio is your real leverage.',
    { where: 'FUT', see: ['Initial margin', 'Leverage', 'Contract multiplier'] }),

  T('Initial margin', 'futures',
    'The deposit required to open a futures position.',
    'A good-faith performance bond, not a down payment — you are not buying anything yet. Typically a few percent of notional, which is precisely why futures are so heavily leveraged.',
    { where: 'FUT', see: ['Maintenance margin', 'Variation margin', 'Notional value'] }),

  T('Variation margin', 'futures',
    'Daily cash settlement of gains and losses on a futures position.',
    'Every day your position is marked and the difference moves in or out of your account in real cash. This is the mechanism that makes futures losses bite immediately rather than accumulating quietly.',
    { where: 'FUT', see: ['Mark to market', 'Initial margin'] }),

  T('Cost of carry', 'futures',
    'The net cost of holding the underlying until delivery.',
    'Financing cost minus any income the asset produces, plus storage where relevant. It is what makes a fair forward price differ from spot, and it is the entire pricing model for futures and forwards.',
    { where: 'FUT', see: ['Contango', 'Backwardation', 'Basis'] }),

  T('Basis', 'futures',
    'The difference between the futures price and the spot price.',
    'It converges to zero at expiry, necessarily — at delivery the future is the spot. Everything between now and then is carry.',
    { where: 'FUT', see: ['Cost of carry', 'Contango', 'Convergence'] }),

  T('Contango', 'futures',
    'Futures priced above spot.',
    'The normal state when carrying an asset costs money. It means a long position loses a little each time it rolls to the next contract, which is why holding commodity futures for the long term erodes.',
    { where: 'FUT', see: ['Backwardation', 'Roll', 'Cost of carry'] }),

  T('Backwardation', 'futures',
    'Futures priced below spot.',
    'Usually signals scarcity — people will pay a premium to have the asset now rather than later. A long position gains a little on each roll.',
    { where: 'FUT', see: ['Contango', 'Roll'] }),

  T('Roll', 'futures',
    'Closing an expiring contract and opening the next one.',
    'Necessary to maintain exposure beyond one contract\'s life, and never free — you pay the spread twice and the basis difference between the two contracts.',
    { where: 'FUT', see: ['Contango', 'Backwardation', 'Expiration'] }),

  T('Convergence', 'futures',
    'Futures and spot prices meeting at expiry.',
    'Guaranteed by arbitrage. If they did not converge, you could buy one and sell the other for riskless profit.',
    { see: ['Basis', 'Arbitrage'] }),

  T('Cash settlement', 'futures',
    'Settling by paying the difference rather than delivering the asset.',
    'How index futures and index options work — nobody wants to deliver 500 different stocks. The loser pays the winner the cash difference.',
    { see: ['Physical delivery', 'European option'] }),

  T('Physical delivery', 'futures',
    'Settling by actually handing over the underlying.',
    'How single-stock options normally work, and why assignment leaves you holding shares rather than a cash adjustment.',
    { see: ['Cash settlement', 'Assignment'] }),

  T('Covered interest parity', 'futures',
    'The rule linking spot rates, forward rates and interest rates.',
    'The forward exchange rate must equal spot adjusted for the interest rate difference between the two currencies, otherwise you could borrow in one, lend in the other, hedge the currency, and pocket a riskless profit. It is how PaperTerminal prices FX forwards.',
    { where: 'FRD', see: ['Forward contract', 'Arbitrage', 'Interest rate differential'] }),

  T('Counterparty risk', 'futures',
    'The risk the other side of your trade fails to pay.',
    'Largely eliminated on exchanges by the clearing house, which stands between every buyer and seller. It is the main structural reason to prefer a future to a forward.',
    { see: ['Forward contract', 'Futures contract'] }),

  T('Arbitrage', 'futures',
    'Riskless profit from a price inconsistency.',
    'Buying and selling equivalent things at different prices simultaneously. Genuine arbitrage is rare and short-lived, but the possibility of it is what forces prices into consistency — and what makes derivative pricing models work at all.',
    { see: ['Convergence', 'Covered interest parity'] }),

  // ──────────────────────────────────────────────────── bonds & rates
  T('Bond', 'bonds',
    'A loan you can trade.',
    'You lend the issuer money; they pay periodic interest and return the principal at maturity. Government bonds from stable issuers are the reference point for "risk-free" in every pricing model in finance.',
    { where: 'YCRV', see: ['Coupon', 'Face value', 'Yield to maturity'] }),

  T('Coupon', 'bonds',
    'The fixed interest a bond pays, as a percentage of face value.',
    'Set at issue and unchanged for the bond\'s life. A 4% coupon on 100 face pays 4 a year, whatever the bond currently trades at.',
    { where: 'YCRV', see: ['Bond', 'Yield to maturity', 'Face value'] }),

  T('Face value', 'bonds',
    'The amount repaid at maturity. Also called par.',
    'Usually 100 or 1,000. Bond prices are quoted as a percentage of it, so a price of 98.5 means 98.5% of face.',
    { see: ['Bond', 'Coupon', 'Discount and premium'] }),

  T('Yield to maturity', 'bonds',
    'The total annualised return if you hold to maturity and reinvest coupons.',
    'The number that makes bonds comparable. It moves inversely to price, always: if you pay more for the same fixed stream of payments, your return is lower.',
    { where: 'YCRV', see: ['Coupon', 'Bond', 'Duration'] }),

  T('Discount and premium', 'bonds',
    'Trading below or above face value.',
    'A bond trades at a discount when its coupon is below current market yields, and at a premium when above. The market adjusts the price until the yield matches what comparable bonds offer.',
    { see: ['Face value', 'Yield to maturity'] }),

  T('Accrued interest', 'bonds',
    'Coupon earned since the last payment but not yet paid out.',
    'Buy a bond mid-period and you owe the seller the interest they earned while holding it. Clean price excludes it, dirty price includes it, and the dirty price is what actually leaves your account.',
    { where: 'YCRV', see: ['Clean and dirty price', 'Coupon'] }),

  T('Clean and dirty price', 'bonds',
    'Quoted price versus the price you actually pay.',
    'Clean is quoted because it does not sawtooth up and down between coupon dates. Dirty is clean plus accrued interest, and it is what settles.',
    { where: 'YCRV', see: ['Accrued interest'] }),

  T('Duration', 'bonds',
    'How much a bond\'s price moves for a change in yield.',
    'Modified duration of 7 means roughly a 7% price fall if yields rise one percentage point. Longer maturities and lower coupons mean higher duration, which is why long bonds are far more volatile than short ones despite both being "safe".',
    { where: 'YCRV', see: ['Convexity', 'DV01', 'Yield to maturity'] }),

  T('Convexity', 'bonds',
    'The curvature in the price-yield relationship.',
    'Duration is a straight-line approximation and it understates gains when yields fall and overstates losses when they rise. Convexity is that correction, and it works in the bondholder\'s favour.',
    { where: 'YCRV', see: ['Duration'] }),

  T('DV01', 'bonds',
    'The price change from a one basis point move in yield.',
    'Dollar value of an 01. The practical unit for hedging a bond book — it tells you directly how much money one basis point costs you.',
    { where: 'YCRV', see: ['Basis point', 'Duration'] }),

  T('Yield curve', 'bonds',
    'Yields plotted against maturity for one issuer.',
    'Normally upward sloping, because lending for longer deserves more compensation. When it inverts — short yields above long — it has historically preceded recessions, which is why it is watched so closely.',
    { where: 'YCRV', see: ['Yield to maturity', 'Inverted yield curve'] }),

  T('Inverted yield curve', 'bonds',
    'Short-term yields above long-term yields.',
    'Implies the market expects rates to fall, which usually means it expects economic weakness. A reliable historical recession signal with a highly unreliable lead time.',
    { where: 'YCRV', see: ['Yield curve'] }),

  T('Risk-free rate', 'bonds',
    'The return on lending with no meaningful default risk.',
    'Proxied by short-dated government bills. It is an input to every option pricing model, and the benchmark every risky return is measured against. PaperTerminal takes it from the live short end of the curve.',
    { where: 'YCRV', see: ['Yield curve', 'Black-Scholes model', 'Sharpe ratio'] }),

  T('Credit risk', 'bonds',
    'The risk the borrower does not pay.',
    'What separates a corporate bond from a government one, and the reason the corporate yields more. The extra yield is the credit spread.',
    { see: ['Bond', 'Counterparty risk'] }),

  // ─────────────────────────────────────────────────── foreign exchange
  T('Currency pair', 'fx',
    'The two currencies being exchanged, quoted as one price.',
    'EUR/USD at 1.09 means one euro buys 1.09 dollars. The first is the base, the second the quote. Every FX position is simultaneously long one currency and short the other — there is no way to hold just one side.',
    { where: 'FXIP', see: ['Base currency', 'Pip'] }),

  T('Base currency', 'fx',
    'The first currency in a pair — the one being priced.',
    'In USD/INR, the dollar is the base and the rupee the quote. The rate tells you how many rupees one dollar buys.',
    { where: 'FXIP', see: ['Currency pair'] }),

  T('Pip', 'fx',
    'The smallest conventional increment in an exchange rate.',
    'The fourth decimal for most pairs, the second for yen pairs. The standard unit for describing FX moves and spreads.',
    { where: 'FXIP', see: ['Currency pair', 'Tick size'] }),

  T('Currency risk', 'fx',
    'Exposure to exchange rate moves through a foreign holding.',
    'Buy a Japanese stock and you own two bets: the stock, and the yen. The stock can rise while your return in dollars falls. PaperTerminal books every position in its native currency and translates at live rates, so this shows up as its own line rather than hiding inside the return.',
    { where: 'PNL', see: ['Currency pair', 'Translation'] }),

  T('Translation', 'fx',
    'Converting a foreign-currency value into your home currency.',
    'How a portfolio spanning ten markets gets summed into one number. The rate used matters, and a portfolio can move purely because the rate did.',
    { where: 'PORT', see: ['Currency risk'] }),

  T('Interest rate differential', 'fx',
    'The gap between two currencies\' interest rates.',
    'It drives forward FX pricing entirely, and it is the basis of the carry trade — borrowing in a low-rate currency to invest in a high-rate one, which works until the exchange rate moves and erases years of accumulated interest in a week.',
    { where: 'FRD', see: ['Covered interest parity', 'Carry trade'] }),

  T('Carry trade', 'fx',
    'Borrowing cheap currency to invest in an expensive one.',
    'Collects the interest differential. Profitable for long stretches and then violently unprofitable, because the currencies that pay high interest tend to be the ones that eventually fall.',
    { see: ['Interest rate differential', 'Cost of carry'] }),

  // ────────────────────────────────────────────── margin & leverage
  T('Margin', 'margin',
    'Borrowing from your broker against the value of your account.',
    'It lets you control more than your cash allows. It also means a loss is taken against a smaller base — leverage magnifies both directions, and only one of them can end the account.',
    { where: 'MARG', see: ['Leverage', 'Initial margin', 'Maintenance margin', 'Margin call'] }),

  T('Leverage', 'margin',
    'Controlling more exposure than your capital.',
    'Expressed as a ratio: $10,000 of exposure on $2,000 of equity is 5x. At 5x, a 20% adverse move wipes you out entirely. The arithmetic is unforgiving and it is the single most common reason small accounts go to zero.',
    { where: 'MARG', see: ['Margin', 'Notional value', 'Margin call'] }),

  T('Regulation T', 'margin',
    'The US rule setting initial margin at 50% for stocks.',
    'You must put up half the purchase price; the broker may lend the rest. It caps initial stock leverage at 2x — a limit that exists precisely because people left to themselves would take more.',
    { where: 'MARG', see: ['Initial margin', 'Maintenance margin'] }),

  T('Maintenance margin', 'margin',
    'The minimum equity you must keep against open positions.',
    'FINRA sets a 25% floor for stocks; most brokers require 30% or more. Fall below and you get a margin call. Short positions and naked options carry far higher requirements.',
    { where: 'MARG', see: ['Margin call', 'Initial margin', 'Excess liquidity'] }),

  T('Margin call', 'margin',
    'A demand to deposit more money or close positions.',
    'Triggered when equity falls below maintenance. Meet it or the broker liquidates for you, at whatever price is available, usually at the worst possible moment. They are not obliged to wait for your instructions.',
    { where: 'MARG', see: ['Maintenance margin', 'Forced liquidation'] }),

  T('Forced liquidation', 'margin',
    'The broker closing your positions without asking.',
    'What happens when a margin call is not met. You have no say in what gets sold or at what price, and it happens in exactly the disorderly market that caused the call.',
    { where: 'MARG', see: ['Margin call', 'Maintenance margin'] }),

  T('Buying power', 'margin',
    'How much you can still deploy.',
    'PaperTerminal splits this deliberately into two numbers, because conflating them hides something important. Cash available is money genuinely in the account, spendable on anything. Reg T buying power is how far the broker will extend you against equity. A purchase you can pay for in cash never needs margin at all.',
    { where: 'MARG', see: ['Excess liquidity', 'Regulation T', 'Margin'] }),

  T('Excess liquidity', 'margin',
    'Equity above the maintenance requirement.',
    'Your cushion. When it hits zero you are on a margin call. Watching it is more useful than watching profit and loss, because it is what determines whether you survive to be right later.',
    { where: 'MARG', see: ['Maintenance margin', 'Margin call'] }),

  T('Net liquidation value', 'margin',
    'What the account would be worth if everything were closed right now.',
    'Cash plus positions at market, minus what you owe. The single honest number for "how much do I have", and the base every margin calculation works from.',
    { where: 'PORT', see: ['Equity', 'Buying power'] }),

  T('Debit balance', 'margin',
    'The amount you owe your broker.',
    'A negative cash balance. It accrues interest daily, every day, including weekends and holidays. Debt does not observe market hours.',
    { where: 'BORR', see: ['Margin interest', 'Cost of carry'] }),

  T('Margin interest', 'margin',
    'What borrowing costs you.',
    'Charged on the debit balance, typically a broker base rate plus a spread that shrinks as you borrow more. It compounds, it accrues whether you are right or wrong, and over a long enough hold it can exceed the profit you were waiting for.',
    { where: 'BORR', see: ['Debit balance', 'Break-even on carry'] }),

  T('Break-even on carry', 'margin',
    'How far your book must rise just to cover interest.',
    'If interest costs $37 a month on $6,900 of exposure, the book must gain 0.54% a month before you have made a single cent. Time is working against a leveraged position in a way it never does against an unleveraged one.',
    { where: 'MARG', see: ['Margin interest', 'Debit balance'] }),

  T('Pattern day trader', 'margin',
    'A US designation for accounts making four or more day trades in five business days.',
    'Once flagged, the account must hold $25,000 in equity to keep day trading. Below that, opening day trades is blocked. On a four-figure account with intraday ambitions you will meet this rule quickly, and meeting it is the lesson.',
    { where: 'MARG', see: ['Day trade', 'Maintenance margin'] }),

  T('Haircut', 'margin',
    'The discount applied to an asset\'s value when used as collateral.',
    'A volatile asset might only count for 70% of its market value. It is why leverage on risky holdings is lower than the headline rule suggests.',
    { see: ['Margin', 'Maintenance margin'] }),

  // ──────────────────────────────────────────────────────────── tax
  T('Capital gain', 'tax',
    'Profit from selling an asset for more than you paid.',
    'Taxable when realised, not while it sits on screen. Whether it is taxed as short or long term depends entirely on how long you held it, and the difference is large.',
    { where: 'TAX', see: ['Short-term capital gain', 'Long-term capital gain', 'Cost basis'] }),

  T('Short-term capital gain', 'tax',
    'Gain on an asset held one year or less.',
    'Taxed at ordinary income rates in the US — the same as wages, up to 37% federal. This is the single strongest financial argument against frequent trading.',
    { where: 'TAX', see: ['Long-term capital gain', 'Holding period'] }),

  T('Long-term capital gain', 'tax',
    'Gain on an asset held more than one year.',
    'Taxed at 0%, 15% or 20% federally depending on income. On a large gain the difference against short-term treatment can be more than a fifth of the profit, for doing nothing but waiting.',
    { where: 'TAX', see: ['Short-term capital gain', 'Holding period'] }),

  T('Holding period', 'tax',
    'How long you owned an asset before selling.',
    'The clock starts the day after purchase. One year and one day qualifies as long term; one year exactly does not. Lots are tracked separately, so parts of the same position can have different holding periods.',
    { where: 'TAX', see: ['Tax lot', 'Long-term capital gain'] }),

  T('Cost basis', 'tax',
    'What you paid, adjusted for commissions and certain events.',
    'Subtracted from proceeds to compute the gain. A disallowed wash sale loss gets added to the basis of the replacement position, which defers the loss rather than destroying it.',
    { where: 'TAX', see: ['Tax lot', 'Wash sale'] }),

  T('Tax lot', 'tax',
    'A specific parcel of shares with its own purchase date and price.',
    'Buy the same stock three times and you have three lots. Which one you sell decides both your gain and your holding period, which is why PaperTerminal treats lots as the truth and average price as a convenience.',
    { where: 'TAX', see: ['FIFO', 'HIFO', 'Cost basis'] }),

  T('FIFO', 'tax',
    'First in, first out — the oldest lot is sold first.',
    'The default in most jurisdictions. In a long uptrend it sells your cheapest shares first, which maximises the taxable gain — usually the worst outcome available.',
    { where: 'TAX', see: ['HIFO', 'LIFO', 'Tax lot'] }),

  T('HIFO', 'tax',
    'Highest in, first out — the most expensive lot is sold first.',
    'Minimises the current gain, and therefore the current tax bill. Legal in the US if you identify the lots specifically at the time of sale. Switching methods on identical trades can change the bill substantially, which the tax panel shows directly.',
    { where: 'TAX', see: ['FIFO', 'Tax lot'] }),

  T('LIFO', 'tax',
    'Last in, first out — the newest lot is sold first.',
    'Useful when recent purchases were expensive, and it tends to keep gains short-term, which is usually the wrong direction.',
    { where: 'TAX', see: ['FIFO', 'HIFO'] }),

  T('Wash sale', 'tax',
    'Selling at a loss and rebuying substantially the same security within 30 days.',
    'The loss is disallowed for tax purposes and added to the cost basis of the replacement instead. The window runs 30 days both before and after the sale — 61 days in total. It exists to stop people harvesting losses without genuinely changing position.',
    { where: 'TAX', see: ['Cost basis', 'Tax-loss harvesting'] }),

  T('Tax-loss harvesting', 'tax',
    'Deliberately realising losses to offset gains.',
    'Sell what is down, book the loss, reduce the taxable gain. The wash sale rule is what stops you simply rebuying the same thing the next morning — though it does not apply to crypto.',
    { where: 'TAX', see: ['Wash sale', 'Capital loss'] }),

  T('Capital loss', 'tax',
    'A realised loss, usable against gains.',
    'Losses offset gains of the same type first. In the US, up to $3,000 of net loss can be deducted against ordinary income each year, and anything beyond that carries forward indefinitely.',
    { where: 'TAX', see: ['Capital gain', 'Carryforward'] }),

  T('Carryforward', 'tax',
    'Unused losses carried into future tax years.',
    'Nothing is wasted — it just waits. A large loss can shelter gains for years afterwards.',
    { where: 'TAX', see: ['Capital loss'] }),

  T('Section 1256 contract', 'tax',
    'US futures and broad-based index options, taxed under special rules.',
    'Two consequences. First, the 60/40 rule: 60% of the gain is treated as long term and 40% as short term, regardless of how briefly you held it. Second, mark-to-market at year end — you are taxed on unrealised gains in open positions, on paper profits you never took.',
    { where: 'TAX', see: ['60/40 rule', 'Mark-to-market taxation'] }),

  T('60/40 rule', 'tax',
    'The split applied to Section 1256 contracts.',
    'A blended rate well below ordinary income rates, available on a position held for minutes. It is why an active futures trader can face a materially lower tax rate than an active stock trader doing the same thing.',
    { where: 'TAX', see: ['Section 1256 contract'] }),

  T('Mark-to-market taxation', 'tax',
    'Being taxed on unrealised gains at year end.',
    'Applies to Section 1256 contracts. You may owe real cash tax on a position you still hold and which may be worth less by the time you actually close it.',
    { where: 'TAX', see: ['Section 1256 contract', 'Mark to market'] }),

  T('Property treatment', 'tax',
    'The IRS classification of crypto as property, not currency or securities.',
    'It means normal capital gains rules apply — but also that the wash sale rule, which only covers securities, does not. Crypto losses can currently be harvested and the position rebought immediately.',
    { where: 'TAX', see: ['Wash sale', 'Capital gain'] }),

  T('Net investment income tax', 'tax',
    'An additional 3.8% US surtax on investment income above certain thresholds.',
    'Sits on top of capital gains tax for higher earners, and is easy to forget when estimating what a gain will actually net.',
    { where: 'TAX', see: ['Capital gain'] }),

  T('Investment interest expense', 'tax',
    'Margin interest, potentially deductible.',
    'Deductible against net investment income if you itemise, and capped at that amount. Anything above the cap carries forward.',
    { where: 'TAX', see: ['Margin interest', 'Carryforward'] }),

  // ───────────────────────────────────────────── risk & performance
  T('Volatility', 'risk',
    'How much a price moves, measured as the standard deviation of returns.',
    'Usually annualised. It is a measure of variability, not of direction — high volatility is not the same as falling. It is the single most important input to option pricing and the usual proxy for risk.',
    { where: 'RISK', see: ['Realised volatility', 'Implied volatility', 'Standard deviation'] }),

  T('Standard deviation', 'risk',
    'The typical distance of an outcome from the average.',
    'One standard deviation covers about 68% of outcomes if returns were normally distributed, two covers 95%. Market returns are not normally distributed — the tails are fatter — so these numbers understate how bad the bad days get.',
    { where: 'RISK', see: ['Volatility', 'Fat tails'] }),

  T('Fat tails', 'risk',
    'Extreme outcomes occurring more often than a normal distribution predicts.',
    'Markets produce "once in a century" moves considerably more than once a century. Every risk model built on normal distributions, including value at risk, is too optimistic about exactly the days that matter.',
    { see: ['Standard deviation', 'Value at risk', 'Volatility skew'] }),

  T('Value at risk', 'risk',
    'The loss you would exceed only a set percentage of the time.',
    'A 95% one-day VaR of $450 means: on 19 days out of 20 you lose less than that. It says nothing whatsoever about the twentieth day, which is the criticism that matters.',
    { where: 'RISK', see: ['Expected shortfall', 'Fat tails'] }),

  T('Expected shortfall', 'risk',
    'The average loss on the days that breach VaR.',
    'Also called conditional VaR. It answers the question VaR ducks: when it does go wrong, how bad is it on average?',
    { where: 'RISK', see: ['Value at risk'] }),

  T('Drawdown', 'risk',
    'The decline from a peak in account value.',
    'Maximum drawdown is the worst such fall on record. It matters more than volatility for most people, because it is what you actually experience — and a 50% drawdown requires a 100% gain just to recover.',
    { where: 'PNL', see: ['Maximum drawdown', 'Calmar ratio'] }),

  T('Maximum drawdown', 'risk',
    'The largest peak-to-trough fall in the account\'s history.',
    'The best single measure of how much pain a strategy demanded. Most people discover their true risk tolerance during one, not before.',
    { where: 'PNL', see: ['Drawdown'] }),

  T('Sharpe ratio', 'risk',
    'Excess return per unit of volatility.',
    'Return above the risk-free rate, divided by standard deviation. It makes strategies with different risk levels comparable. Its blind spot is that it penalises upside volatility exactly as much as downside.',
    { where: 'PNL', see: ['Sortino ratio', 'Volatility', 'Risk-free rate'] }),

  T('Sortino ratio', 'risk',
    'Like Sharpe, but counting only downside volatility.',
    'Fixes Sharpe\'s main flaw. Large gains no longer count against you.',
    { where: 'PNL', see: ['Sharpe ratio'] }),

  T('Calmar ratio', 'risk',
    'Annualised return divided by maximum drawdown.',
    'Return per unit of worst-case pain. Blunt, and closer than most ratios to how people actually judge whether a strategy was worth holding.',
    { where: 'PNL', see: ['Maximum drawdown', 'Sharpe ratio'] }),

  T('Correlation', 'risk',
    'How closely two things move together.',
    'From +1 to −1. The critical fact for portfolios: correlations rise towards 1 in a crisis. Six positions that looked diversified in calm markets can fall together on the day it matters.',
    { where: 'RISK', see: ['Diversification', 'Concentration risk'] }),

  T('Diversification', 'risk',
    'Spreading risk across holdings that do not move together.',
    'The only genuinely free lunch in finance — but only to the extent the holdings are actually uncorrelated. Six technology stocks are one position wearing six names.',
    { where: 'RISK', see: ['Correlation', 'Concentration risk'] }),

  T('Concentration risk', 'risk',
    'Too much of your risk in one place.',
    'PaperTerminal decomposes portfolio volatility by position and flags when one carries a disproportionate share — which is often not the largest holding, but the most volatile one.',
    { where: 'RISK', see: ['Diversification', 'Correlation'] }),

  T('Beta', 'risk',
    'How much a security moves relative to the market.',
    'Beta of 1.5 means it tends to move 50% more than the index, in both directions. It measures market risk only, not company-specific risk.',
    { see: ['Correlation', 'Volatility'] }),

  T('Stress test', 'risk',
    'Revaluing a portfolio under a hypothetical shock.',
    'What happens at −10%, −20%, −30%. PaperTerminal shocks options to second order — delta plus half gamma squared — which is why a short option book reads harmless at −2% and ruinous at −20%.',
    { where: 'RISK', see: ['Gamma', 'Value at risk'] }),

  T('Expectancy', 'risk',
    'Average profit or loss per trade.',
    'Win rate times average win, minus loss rate times average loss. Negative expectancy means the strategy loses money over time regardless of how good the recent run looks. It is the only trade statistic that settles the question.',
    { where: 'PNL', see: ['Win rate', 'Payoff ratio', 'Profit factor'] }),

  T('Win rate', 'risk',
    'The share of trades that made money.',
    'Almost meaningless alone. A 90% win rate with one catastrophic loss is a losing strategy; a 30% win rate with large winners can be excellent.',
    { where: 'PNL', see: ['Expectancy', 'Payoff ratio'] }),

  T('Payoff ratio', 'risk',
    'Average win divided by average loss.',
    'Paired with win rate it gives expectancy. A low win rate is perfectly viable if the payoff ratio is high enough — that is the entire premise of trend following.',
    { where: 'PNL', see: ['Win rate', 'Expectancy'] }),

  T('Profit factor', 'risk',
    'Gross profit divided by gross loss.',
    'Above 1 means profitable. Below 1.2 is usually too thin to survive costs and a bad streak.',
    { where: 'PNL', see: ['Expectancy'] }),

  T('Risk of ruin', 'risk',
    'The probability of losing enough capital to be unable to continue.',
    'Rises sharply with leverage and position size. The uncomfortable point is that a strategy with positive expectancy can still ruin you if the position sizing is wrong.',
    { where: 'RISK', see: ['Leverage', 'Expectancy', 'Position sizing'] }),

  T('Position sizing', 'risk',
    'How much capital to put into a single trade.',
    'Arguably more important than entry timing. It determines whether a losing streak is an inconvenience or the end, and it is the part of trading most consistently neglected by beginners.',
    { see: ['Risk of ruin', 'Leverage'] }),

  // ──────────────────────────────────────────── crypto & blockchain
  T('Blockchain', 'crypto',
    'A shared ledger that many computers hold copies of and agree on.',
    'Transactions are grouped into blocks, each cryptographically linked to the one before, so altering an old record would require redoing everything after it — on a majority of machines at once. That is the whole security model.',
    { see: ['Block', 'Consensus', 'Distributed ledger', 'Immutability'] }),

  T('Distributed ledger', 'crypto',
    'A database held by many parties with no central master copy.',
    'The generic category blockchain belongs to. Removing the central authority is the point; it is also why these systems are slow and expensive relative to a normal database.',
    { see: ['Blockchain', 'Decentralisation'] }),

  T('Block', 'crypto',
    'A batch of transactions added to the chain.',
    'Contains a reference to the previous block, which is what makes it a chain. Block time is how often a new one appears — roughly ten minutes on Bitcoin, twelve seconds on Ethereum.',
    { see: ['Blockchain', 'Confirmation', 'Mining'] }),

  T('Consensus', 'crypto',
    'How a decentralised network agrees on what is true.',
    'The core problem: with no central authority, who decides which transactions count? Proof of work answers with computation, proof of stake with capital at risk.',
    { see: ['Proof of work', 'Proof of stake', '51% attack'] }),

  T('Proof of work', 'crypto',
    'Consensus by expending computing power.',
    'Miners race to solve a meaningless puzzle; the winner adds the block and collects the reward. Security comes from the cost of the electricity — attacking the chain means outspending everyone honest.',
    { see: ['Mining', 'Proof of stake', 'Hash'] }),

  T('Proof of stake', 'crypto',
    'Consensus by putting capital at risk.',
    'Validators lock up coins as collateral. Behave honestly and earn rewards; cheat and the stake is destroyed. Vastly less energy than proof of work, which is why Ethereum switched.',
    { see: ['Staking', 'Validator', 'Slashing', 'Proof of work'] }),

  T('Mining', 'crypto',
    'Competing to add the next block under proof of work.',
    'Rewarded with newly issued coins plus transaction fees. Now an industrial business run on purpose-built hardware, not something a laptop can do.',
    { see: ['Proof of work', 'Block reward', 'Halving'] }),

  T('Staking', 'crypto',
    'Locking coins as collateral to help secure a proof-of-stake network.',
    'Earns a yield, and carries real risks: the stake can be slashed for misbehaviour, and it is often locked for a period during which you cannot sell however far the price falls.',
    { see: ['Proof of stake', 'Validator', 'Slashing'] }),

  T('Validator', 'crypto',
    'A participant that proposes and attests to blocks in proof of stake.',
    'The proof-of-stake equivalent of a miner. Requires a stake, uptime, and correct behaviour.',
    { see: ['Proof of stake', 'Staking', 'Slashing'] }),

  T('Slashing', 'crypto',
    'Destroying part of a validator\'s stake as a penalty.',
    'The enforcement mechanism behind proof of stake. Misbehaviour, and sometimes mere unreliability, costs real money.',
    { see: ['Validator', 'Staking'] }),

  T('Hash', 'crypto',
    'A fixed-length fingerprint of any input data.',
    'Change one character of the input and the output changes entirely. It is one-way — trivial to compute forwards, infeasible to reverse — which is what links blocks together tamper-evidently.',
    { see: ['Cryptography', 'Block', 'Proof of work'] }),

  T('Cryptography', 'crypto',
    'The mathematics of securing information.',
    'Public key cryptography is the piece that matters here: a keypair where one key can be shared freely and the other must never be, letting you prove ownership without revealing the secret.',
    { see: ['Public key', 'Private key', 'Digital signature'] }),

  T('Private key', 'crypto',
    'The secret that controls a crypto address.',
    'Whoever holds it owns the funds, completely and irreversibly. There is no password reset, no support line, no chargeback. This is the single most consequential fact about self-custody.',
    { see: ['Public key', 'Wallet', 'Seed phrase'] }),

  T('Public key', 'crypto',
    'The shareable half of a keypair, from which an address is derived.',
    'Safe to publish. It lets others verify your signatures and send you funds without being able to spend them.',
    { see: ['Private key', 'Address', 'Digital signature'] }),

  T('Address', 'crypto',
    'The destination identifier for a crypto transaction.',
    'Derived from a public key. Send to the wrong one and the funds are gone permanently — there is no recall mechanism.',
    { see: ['Public key', 'Wallet'] }),

  T('Digital signature', 'crypto',
    'Cryptographic proof that the holder of a private key authorised something.',
    'Verifiable by anyone with the public key, forgeable by nobody without the private one. How every transaction is authorised.',
    { see: ['Private key', 'Public key'] }),

  T('Wallet', 'crypto',
    'Software or hardware that manages your keys.',
    'It does not hold coins — the coins are entries on the chain. It holds the keys that let you move them. Hot wallets are online and convenient; cold wallets are offline and safer.',
    { see: ['Private key', 'Seed phrase', 'Cold storage'] }),

  T('Cold storage', 'crypto',
    'Keeping keys entirely offline.',
    'A hardware device or paper, disconnected from any network. Inconvenient by design — an attacker cannot reach what is not connected.',
    { see: ['Wallet', 'Private key'] }),

  T('Seed phrase', 'crypto',
    'A word sequence that can regenerate every key in a wallet.',
    'Usually twelve or twenty-four words. It is the master key. Anyone who reads it owns your funds, and losing it with no backup means losing everything irrecoverably.',
    { see: ['Private key', 'Wallet'] }),

  T('Coin', 'crypto',
    'A cryptocurrency native to its own blockchain.',
    'Bitcoin on Bitcoin, Ether on Ethereum. Distinct from a token, which lives on somebody else\'s chain.',
    { where: 'CRYP', see: ['Token', 'Altcoin'] }),

  T('Token', 'crypto',
    'An asset issued on an existing blockchain.',
    'Created by a smart contract rather than by the chain itself. Most tokens are ERC-20s on Ethereum. Cheaper to create than a coin, which is both the appeal and the problem.',
    { see: ['Coin', 'ERC-20', 'Smart contract'] }),

  T('Altcoin', 'crypto',
    'Any cryptocurrency other than Bitcoin.',
    'A vast range, from serious infrastructure to outright fraud. Altcoins are typically far more volatile than Bitcoin and tend to fall harder when it does.',
    { where: 'CRYP', see: ['Coin', 'Volatility'] }),

  T('Stablecoin', 'crypto',
    'A token designed to hold a constant value, usually one dollar.',
    'Backed by reserves, by other crypto as collateral, or by an algorithm. The last kind has failed spectacularly more than once. Stablecoins are the settlement layer of crypto trading — most pairs are quoted against them rather than actual dollars.',
    { where: 'CRYP', see: ['Token', 'Peg'] }),

  T('Peg', 'crypto',
    'A fixed target value an asset is meant to hold.',
    'A stablecoin pegged to the dollar should trade at one dollar. When it does not, the peg has "broken" — usually because the market doubts the backing.',
    { see: ['Stablecoin'] }),

  T('Smart contract', 'crypto',
    'Code that runs on a blockchain and executes automatically.',
    'No intermediary, no discretion. It does exactly what it says, including when what it says contains a bug — which is how most large crypto losses have actually happened.',
    { see: ['Ethereum', 'DeFi', 'Token'] }),

  T('Ethereum', 'crypto',
    'A blockchain designed to run programs, not just payments.',
    'Its virtual machine executes smart contracts, which is what enabled tokens, DeFi and NFTs. Ether is its native coin.',
    { where: 'CRYP', see: ['Smart contract', 'Gas', 'Token'] }),

  T('Gas', 'crypto',
    'The fee paid to execute a transaction on Ethereum.',
    'Priced in gwei, a billionth of an ether. It rises with network congestion, so the same action can cost cents or tens of dollars depending on when you do it.',
    { see: ['Ethereum', 'Transaction fee'] }),

  T('Transaction fee', 'crypto',
    'What you pay to get a transaction included in a block.',
    'Bid higher and you are included sooner. During congestion, fees can exceed the value being sent.',
    { see: ['Gas', 'Block'] }),

  T('Confirmation', 'crypto',
    'A block added on top of the one containing your transaction.',
    'More confirmations mean more work to reverse it. Exchanges typically require several before crediting a deposit.',
    { see: ['Block', 'Finality'] }),

  T('Finality', 'crypto',
    'The point at which a transaction cannot be reversed.',
    'Probabilistic under proof of work — never mathematically certain, just increasingly unlikely to reverse. Proof of stake chains can offer stronger guarantees.',
    { see: ['Confirmation', 'Consensus'] }),

  T('Fork', 'crypto',
    'A change to a blockchain\'s rules.',
    'A soft fork is backward compatible; a hard fork is not and can split the chain into two, each with its own history and coin. Bitcoin Cash came from exactly that.',
    { see: ['Blockchain', 'Consensus'] }),

  T('Halving', 'crypto',
    'The scheduled halving of Bitcoin\'s block reward, roughly every four years.',
    'Slows new supply and is written into the protocol. Widely treated as a bullish catalyst, which means it is also widely priced in beforehand.',
    { see: ['Mining', 'Block reward'] }),

  T('Block reward', 'crypto',
    'Newly issued coins paid to whoever adds a block.',
    'How supply enters circulation and how the network pays for its own security.',
    { see: ['Mining', 'Halving'] }),

  T('DeFi', 'crypto',
    'Financial services built from smart contracts rather than institutions.',
    'Lending, exchange, derivatives — with no bank in the middle. Removes counterparty risk and replaces it with code risk, which has proven at least as expensive.',
    { see: ['Smart contract', 'DEX', 'Total value locked'] }),

  T('DEX', 'crypto',
    'A decentralised exchange, run by smart contracts.',
    'You trade from your own wallet without depositing with anyone. No account, no custody risk, and no recourse if you send to the wrong place.',
    { see: ['DeFi', 'Liquidity', 'Smart contract'] }),

  T('Total value locked', 'crypto',
    'The total assets deposited in a DeFi protocol.',
    'The usual size metric for DeFi. It rises when prices rise even if no new money arrived, so it flatters during bull markets.',
    { see: ['DeFi'] }),

  T('NFT', 'crypto',
    'A token representing a unique item rather than an interchangeable unit.',
    'Non-fungible: one bitcoin equals any other bitcoin, but each NFT is distinct. Used for digital art, collectibles and ownership records.',
    { see: ['Token', 'Smart contract'] }),

  T('Layer 2', 'crypto',
    'A network built on top of a blockchain to make it faster and cheaper.',
    'Transactions are processed off the main chain and settled back to it in batches. Rollups are the dominant design.',
    { see: ['Rollup', 'Scalability', 'Ethereum'] }),

  T('Rollup', 'crypto',
    'A Layer 2 that bundles many transactions into one main-chain entry.',
    'Optimistic rollups assume validity and allow challenges; zero-knowledge rollups prove validity mathematically upfront.',
    { see: ['Layer 2', 'Scalability'] }),

  T('Scalability', 'crypto',
    'How much throughput a network can handle.',
    'The binding constraint on blockchains. The trilemma holds that decentralisation, security and scalability cannot all be maximised at once.',
    { see: ['Layer 2', 'Blockchain trilemma'] }),

  T('Blockchain trilemma', 'crypto',
    'The claim that decentralisation, security and scalability trade off against each other.',
    'Improve one and at least one other suffers. Most design disagreements in crypto are arguments about which corner to sacrifice.',
    { see: ['Scalability', 'Decentralisation'] }),

  T('Decentralisation', 'crypto',
    'Control distributed across many independent participants.',
    'The founding premise. It is a spectrum, not a binary, and many projects describing themselves as decentralised are considerably less so than they claim.',
    { see: ['Blockchain', 'Consensus'] }),

  T('Immutability', 'crypto',
    'Recorded data being practically impossible to alter.',
    'A feature when it prevents tampering, and a problem when a mistake or a theft is equally permanent.',
    { see: ['Blockchain', 'Finality'] }),

  T('51% attack', 'crypto',
    'One party controlling enough of a network to rewrite recent history.',
    'A majority of mining power or stake allows double-spending. Prohibitively expensive on large chains, genuinely achievable on small ones.',
    { see: ['Consensus', 'Proof of work', 'Double spend'] }),

  T('Double spend', 'crypto',
    'Spending the same coin twice.',
    'The problem digital cash could not solve before blockchains. Consensus exists specifically to prevent it.',
    { see: ['51% attack', 'Consensus'] }),

  T('Oracle', 'crypto',
    'A service that feeds external data to a smart contract.',
    'Contracts cannot see outside their chain, so anything price-dependent needs one. Manipulating an oracle is a recurring and lucrative attack.',
    { see: ['Smart contract', 'DeFi'] }),

  T('Bridge', 'crypto',
    'Infrastructure for moving assets between blockchains.',
    'Historically the most attacked component in crypto, because a bridge concentrates large balances behind complex code.',
    { see: ['Layer 2', 'Smart contract'] }),

  T('Custody', 'crypto',
    'Who actually holds the keys.',
    'Self-custody means total control and total responsibility. Exchange custody means convenience and counterparty risk. Several large exchanges have failed with customer funds inside them.',
    { see: ['Wallet', 'Private key', 'Counterparty risk'] }),

  T('KYC', 'crypto',
    'Know Your Customer — identity verification required of regulated services.',
    'Why exchanges ask for documents. Paired with anti-money-laundering rules, and a fundamental tension with the pseudonymity crypto was built for.',
    { see: ['Custody'] }),

  T('Rug pull', 'crypto',
    'A project\'s creators abandoning it and taking investors\' funds.',
    'Common in low-quality token launches. Anonymous teams, unlocked liquidity and unaudited contracts are the recurring warning signs.',
    { see: ['Token', 'DeFi'] }),
];
