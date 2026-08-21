#!/usr/bin/env python3
"""
Offline demo prices.

WHAT THIS IS NOT: real market data. Every number produced here is synthetic.

PaperTerminal needs a working price for every instrument or none of the
derivatives, margin or tax machinery can be demonstrated. Some people will run
this behind a blocked IP, on a plane, or before signing up for an API key. So
rather than show an empty board, the server falls back to a seeded random walk
around plausible reference levels, and flags EVERY row with `"demo": true` so
the terminal can shout about it in the status bar and on every panel.

The moment a real provider answers, this file stops being used.
"""

import hashlib
import math
import time

# Reference levels are order-of-magnitude anchors so that strike ladders, margin
# requirements and contract multipliers behave sensibly. They are not quotes.
REFERENCE = {
    # US
    "AAPL": 245.0, "MSFT": 495.0, "NVDA": 178.0, "AMZN": 228.0, "GOOGL": 205.0,
    "META": 640.0, "TSLA": 385.0, "BRK-B": 495.0, "JPM": 285.0, "V": 350.0,
    "XOM": 118.0, "JNJ": 165.0, "WMT": 98.0, "AMD": 165.0, "COIN": 285.0, "GME": 24.0,
    # India (INR)
    "RELIANCE.NS": 1465.0, "TCS.NS": 4120.0, "HDFCBANK.NS": 1795.0, "INFY.NS": 1885.0,
    "ICICIBANK.NS": 1310.0, "BHARTIARTL.NS": 1640.0, "SBIN.NS": 825.0, "ITC.NS": 465.0,
    "TATAMOTORS.NS": 785.0, "ADANIENT.NS": 2420.0,
    # Japan (JPY)
    "7203.T": 2980.0, "6758.T": 3240.0, "8306.T": 1885.0, "6861.T": 62800.0,
    "9984.T": 9850.0, "6098.T": 8420.0, "7974.T": 9180.0, "8035.T": 27600.0,
    # Korea (KRW)
    "005930.KS": 78500.0, "000660.KS": 218000.0, "005380.KS": 245000.0,
    "051910.KS": 385000.0, "035420.KS": 215000.0, "207940.KS": 985000.0,
    # Singapore (SGD)
    "D05.SI": 43.20, "O39.SI": 17.85, "U11.SI": 37.40, "Z74.SI": 3.42,
    "C6L.SI": 6.28, "F34.SI": 3.15,
    # China (CNY)
    "600519.SS": 1485.0, "601398.SS": 7.15, "601857.SS": 8.62, "600036.SS": 42.80,
    "000858.SZ": 138.0, "300750.SZ": 265.0,
    # Germany (EUR)
    "SAP.DE": 245.0, "SIE.DE": 218.0, "ALV.DE": 358.0, "MBG.DE": 58.0,
    "BMW.DE": 82.0, "BAS.DE": 46.0,
    # UK (GBp - London quotes in pence)
    "SHEL.L": 2850.0, "AZN.L": 12400.0, "HSBA.L": 985.0, "ULVR.L": 4720.0,
    "BP.L": 425.0, "BARC.L": 348.0,
    # France (EUR)
    "MC.PA": 685.0, "OR.PA": 385.0, "TTE.PA": 58.0, "SAN.PA": 98.0,
    "AIR.PA": 178.0, "BNP.PA": 72.0,
    # Canada (CAD)
    "RY.TO": 178.0, "TD.TO": 88.0, "ENB.TO": 62.0, "CNR.TO": 148.0,
    "SHOP.TO": 145.0, "CNQ.TO": 46.0,
    # Indices
    "^GSPC": 6180.0, "^NDX": 22400.0, "^DJI": 44800.0, "^RUT": 2380.0, "^VIX": 16.4,
    "^NSEI": 25850.0, "^NSEBANK": 57200.0, "^BSESN": 84600.0,
    "^N225": 42800.0, "^TOPX": 3050.0, "^KS11": 2680.0, "^KQ11": 785.0,
    "^STI": 3920.0, "000001.SS": 3420.0, "399001.SZ": 10850.0, "^HSI": 24200.0,
    "^GDAXI": 23800.0, "^FTSE": 8620.0, "^FCHI": 7920.0, "^GSPTSE": 25400.0,
    # Sovereign yields, in percent
    "^IRX": 4.05, "^FVX": 3.90, "^TNX": 4.15, "^TYX": 4.55,
}

# Annualised volatility used to shape the walk, so a demo index does not move
# like a meme stock and options priced off it stay sane.
VOL = {"^VIX": 0.95, "^GSPC": 0.14, "^NDX": 0.19, "^DJI": 0.13, "^RUT": 0.22,
       "^IRX": 0.10, "^FVX": 0.12, "^TNX": 0.13, "^TYX": 0.14}
DEFAULT_INDEX_VOL = 0.17
DEFAULT_EQUITY_VOL = 0.30

CCY = {".NS": "INR", ".T": "JPY", ".KS": "KRW", ".SI": "SGD", ".SS": "CNY",
       ".SZ": "CNY", ".DE": "EUR", ".L": "GBp", ".PA": "EUR", ".TO": "CAD"}


def _ccy(symbol):
    if symbol.startswith("^"):
        return {"^NSEI": "INR", "^NSEBANK": "INR", "^BSESN": "INR", "^N225": "JPY",
                "^TOPX": "JPY", "^KS11": "KRW", "^KQ11": "KRW", "^STI": "SGD",
                "^HSI": "HKD", "^GDAXI": "EUR", "^FTSE": "GBP", "^FCHI": "EUR",
                "^GSPTSE": "CAD"}.get(symbol, "USD")
    for suffix, ccy in CCY.items():
        if symbol.endswith(suffix):
            return ccy
    return "USD"


def _vol(symbol):
    if symbol in VOL:
        return VOL[symbol]
    return DEFAULT_INDEX_VOL if symbol.startswith("^") or "00000" in symbol \
        else DEFAULT_EQUITY_VOL


def _noise(symbol, bucket):
    """Deterministic per-symbol, per-time-bucket noise in [-1, 1]."""
    h = hashlib.sha256(("%s|%d" % (symbol, bucket)).encode()).digest()
    return (int.from_bytes(h[:6], "big") / float(1 << 48)) * 2 - 1


def quote(symbol, now=None):
    """One synthetic row, shaped like a real provider response."""
    base = REFERENCE.get(symbol)
    if base is None:
        return None
    now = now or time.time()
    vol = _vol(symbol)

    # A slow drift across the session plus a faster wiggle, so the tape moves
    # and stop orders and P&L actually have something to react to.
    day_bucket = int(now // 86400)
    tick_bucket = int(now // 45)
    drift = _noise(symbol, day_bucket) * vol / math.sqrt(252) * 1.6
    wiggle = _noise(symbol, tick_bucket) * vol / math.sqrt(252) * 0.35

    prev = base * (1 + _noise(symbol, day_bucket - 1) * vol / math.sqrt(252))
    price = base * (1 + drift + wiggle)
    intraday = abs(_noise(symbol, day_bucket + 7)) * vol / math.sqrt(252)

    dp = 4 if price < 10 else 2
    return {
        "symbol": symbol,
        "price": round(price, dp),
        "prevClose": round(prev, dp),
        "change": round(price - prev, dp),
        "changePct": round((price / prev - 1) * 100, 3) if prev else 0.0,
        "open": round(prev * (1 + _noise(symbol, day_bucket + 3) * 0.002), dp),
        "high": round(max(price, prev) * (1 + intraday), dp),
        "low": round(min(price, prev) * (1 - intraday), dp),
        "volume": int(abs(_noise(symbol, day_bucket + 11)) * 4e7 + 1e6),
        "currency": _ccy(symbol),
        "ts": int(now),
        "demo": True,
    }


def rows_for(symbols, now=None):
    out = {}
    for sym in symbols:
        row = quote(sym, now)
        if row:
            out[sym] = row
    return out


def bars_for(symbol, days=365, now=None):
    """Daily history for the volatility estimators, same walk, one bucket per day."""
    base = REFERENCE.get(symbol)
    if base is None:
        return []
    now = now or time.time()
    vol = _vol(symbol)
    step = vol / math.sqrt(252)
    out = []
    level = base * 0.82
    start_day = int(now // 86400) - days
    for i in range(days):
        bucket = start_day + i
        level *= 1 + _noise(symbol, bucket) * step + step * 0.02
        hi = level * (1 + abs(_noise(symbol, bucket + 5)) * step * 0.8)
        lo = level * (1 - abs(_noise(symbol, bucket + 9)) * step * 0.8)
        op = lo + (hi - lo) * abs(_noise(symbol, bucket + 13))
        out.append({"t": bucket * 86400, "o": round(op, 4), "h": round(hi, 4),
                    "l": round(lo, 4), "c": round(level, 4),
                    "v": int(abs(_noise(symbol, bucket + 17)) * 3e7 + 5e5)})
    return out


def covers(symbol):
    return symbol in REFERENCE
