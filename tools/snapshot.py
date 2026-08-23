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
import demo_data  # noqa: E402

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


def load_existing():
    """Whatever snapshot is already committed, so a bad run cannot erase coverage."""
    try:
        with open(OUT) as fh:
            return json.load(fh).get("rows", {}) or {}
    except Exception:
        return {}


def build_demo():
    """
    A seed snapshot so a fresh static deploy is not blank on day one.

    Every row is flagged demo:true, so the terminal shows DEMO DATA - NOT REAL
    PRICES until the scheduled workflow replaces this with the real thing.
    """
    rows = demo_data.rows_for(INDICES + YIELDS + EQUITIES)
    return {
        "asOf": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "generated": int(time.time()),
        "sources": ["demo"],
        "demo": True,
        "count": len(rows),
        "rows": rows,
    }


def write(payload):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    print("wrote %s with %d rows (%s)"
          % (OUT, payload["count"], "+".join(payload["sources"])), file=sys.stderr)


def main():
    if "--demo" in sys.argv:
        write(build_demo())
        return 0

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

    # Deliberately no crypto or FX here. Binance, CoinGecko and the ECB all send
    # open CORS headers, so the browser fetches those live even on a static host
    # with no server at all. Snapshotting them would add bytes, produce a commit
    # every run, and change nothing a visitor sees.

    fresh_real = {k: v for k, v in rows.items() if not v.get("demo")}
    fell_back = {k: v for k, v in rows.items() if v.get("demo")}

    # Merge over whatever is already committed, in priority order:
    #   a real quote from this run  >  whatever the snapshot already had  >  demo
    #
    # The earlier version simply discarded every demo row, which looked prudent
    # and was not: on a runner where Yahoo is IP-blocked and no API key is set,
    # EVERY equity falls back to demo, so the filter silently emptied the board
    # of the only asset class the snapshot exists to carry.
    previous = load_existing()
    merged = dict(previous)
    kept_previous = 0
    for sym, row in fell_back.items():
        if sym in previous and not previous[sym].get("demo"):
            kept_previous += 1          # a stale real price beats a fresh fake one
        else:
            merged[sym] = row
    merged.update(fresh_real)

    if not merged:
        print("nothing to write and nothing already committed", file=sys.stderr)
        return 1

    real_count = sum(1 for v in merged.values() if not v.get("demo"))
    print("merged: %d real, %d synthetic, %d stale-real preserved"
          % (real_count, len(merged) - real_count, kept_previous), file=sys.stderr)

    if not fresh_real:
        print("WARNING: no provider returned a real equity or index price this run.",
              file=sys.stderr)
        print("         Set a TWELVEDATA_KEY repository secret - Yahoo blocks the",
              file=sys.stderr)
        print("         datacentre IPs that GitHub Actions runners use.", file=sys.stderr)

    write({
        "asOf": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "generated": int(time.time()),
        "sources": sorted(sources),
        # True if the file contains ANY synthetic rows. Per-row `demo` flags stay
        # authoritative for what the terminal displays; this is the summary for a
        # human reading the file, and "1 real out of 100" is not "not demo".
        "demo": real_count < len(merged),
        "real": real_count,
        "count": len(merged),
        "rows": merged,
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
