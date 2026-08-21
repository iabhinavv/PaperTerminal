#!/usr/bin/env python3
"""
Write web/data/snapshot.json from live providers.

This is what the GitHub Action runs on a cron so a pure-static deploy (Pages,
Netlify, a plain file server) still shows equities and indices. Crypto and FX
stay live in the browser regardless, because their CORS is open.

    python3 tools/snapshot.py

Writes nothing and exits non-zero if no provider answers, so a failed cron run
never overwrites a good snapshot with an empty one.
"""

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(HERE, "web", "data", "snapshot.json")

# Mirrors web/js/market/universe.js. Kept as Yahoo spellings because that is the
# provider most likely to answer without a key.
EQUITIES = [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "BRK-B", "JPM", "V",
    "XOM", "JNJ", "WMT", "AMD", "COIN", "GME",
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "BHARTIARTL.NS", "SBIN.NS", "ITC.NS", "TATAMOTORS.NS", "ADANIENT.NS",
    "7203.T", "6758.T", "8306.T", "6861.T", "9984.T", "6098.T", "7974.T", "8035.T",
    "005930.KS", "000660.KS", "005380.KS", "051910.KS", "035420.KS", "207940.KS",
    "D05.SI", "O39.SI", "U11.SI", "Z74.SI", "C6L.SI", "F34.SI",
    "600519.SS", "601398.SS", "601857.SS", "600036.SS", "000858.SZ", "300750.SZ",
    "SAP.DE", "SIE.DE", "ALV.DE", "MBG.DE", "BMW.DE", "BAS.DE",
    "SHEL.L", "AZN.L", "HSBA.L", "ULVR.L", "BP.L", "BARC.L",
    "MC.PA", "OR.PA", "TTE.PA", "SAN.PA", "AIR.PA", "BNP.PA",
    "RY.TO", "TD.TO", "ENB.TO", "CNR.TO", "SHOP.TO", "CNQ.TO",
]
INDICES = ["^GSPC", "^NDX", "^DJI", "^RUT", "^VIX", "^NSEI", "^NSEBANK", "^BSESN",
           "^N225", "^TOPX", "^KS11", "^KQ11", "^STI", "000001.SS", "399001.SZ",
           "^HSI", "^GDAXI", "^FTSE", "^FCHI", "^GSPTSE"]
YIELDS = ["^IRX", "^FVX", "^TNX", "^TYX"]


def chunked(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def main():
    rows = {}
    sources = set()

    for label, symbols, kind in (("indices", INDICES, "index"),
                                 ("yields", YIELDS, "yield"),
                                 ("equities", EQUITIES, "equity")):
        got = 0
        for batch in chunked(symbols, 12):
            got_rows, source, _ = server.resolve(kind, batch)
            rows.update(got_rows)
            got += len(got_rows)
            if got_rows:
                sources.add(source)
            time.sleep(1.0)   # stay inside the free-tier rate limits
        print("%-9s %d/%d" % (label, got, len(symbols)), file=sys.stderr)

    for kind, symbols in (("crypto", ["BTC", "ETH", "XRP", "BNB", "SOL", "DOGE",
                                      "ADA", "TRX", "AVAX", "LINK"]),
                          ("fx", [])):
        got_rows, source, _ = server.resolve(kind, symbols)
        rows.update(got_rows)
        if got_rows:
            sources.add(source)

    if not rows:
        print("no provider answered - refusing to write an empty snapshot", file=sys.stderr)
        return 1

    payload = {
        "asOf": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "generated": int(time.time()),
        "sources": sorted(sources),
        "count": len(rows),
        "rows": rows,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    print("wrote %s with %d rows" % (OUT, len(rows)), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
