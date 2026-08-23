#!/usr/bin/env python3
"""
PaperTerminal data plane.

Stdlib only. No pip install, no virtualenv, no database.

This process holds NO account state and has NO concept of a user. It proxies
market data from free providers, normalises it into one schema, and caches it
to disk so a reload does not re-hit an upstream rate limit. Everything about
your portfolio lives in the browser and in state/portfolio.json.

    python3 server.py            -> http://localhost:8317

Keys are optional. With no config.json at all you still get live crypto and FX;
equities fall back to Yahoo, then to the bundled snapshot in web/data/.
"""

import json
import os
import re
import sys
import time
import gzip
import http.cookiejar

import demo_data
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, "web")
CACHE = os.path.join(ROOT, "cache")

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")

# How long a cached response stays fresh, in seconds, per data class.
TTL = {
    "equity": 60,
    "index": 60,
    "crypto": 15,
    "fx": 300,
    "yield": 300,
    "history": 43200,
}

DEFAULTS = {"twelvedata_key": "", "fred_key": "", "port": 8317, "cache_ttl_override": {}}


def load_config():
    cfg = dict(DEFAULTS)
    path = os.path.join(ROOT, "config.json")
    if os.path.exists(path):
        try:
            with open(path) as fh:
                cfg.update(json.load(fh))
        except Exception as exc:
            log("config.json unreadable (%s) - continuing with defaults" % exc)
    env_key = os.environ.get("TWELVEDATA_KEY")
    if env_key:
        cfg["twelvedata_key"] = env_key
    TTL.update(cfg.get("cache_ttl_override") or {})
    return cfg


CFG = load_config()


def log(msg):
    sys.stderr.write("[paperterminal] %s\n" % msg)
    sys.stderr.flush()


# ---------------------------------------------------------------- cache

_lock = threading.Lock()
_mem = {}


def _cache_path(key):
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", key)[:180]
    return os.path.join(CACHE, safe + ".json")


def cache_get(key, ttl):
    """Return (payload, age_seconds) or (None, None). Memory first, then disk."""
    now = time.time()
    with _lock:
        hit = _mem.get(key)
    if hit and now - hit[0] < ttl:
        return hit[1], now - hit[0]
    path = _cache_path(key)
    if os.path.exists(path):
        try:
            age = now - os.path.getmtime(path)
            if age < ttl:
                with open(path) as fh:
                    payload = json.load(fh)
                with _lock:
                    _mem[key] = (now - age, payload)
                return payload, age
        except Exception:
            pass
    return None, None


def cache_put(key, payload):
    with _lock:
        _mem[key] = (time.time(), payload)
    try:
        os.makedirs(CACHE, exist_ok=True)
        tmp = _cache_path(key) + ".tmp"
        with open(tmp, "w") as fh:
            json.dump(payload, fh)
        os.replace(tmp, _cache_path(key))
    except Exception:
        pass


def cache_stale(key):
    """Last known value regardless of age - used when every provider fails."""
    with _lock:
        hit = _mem.get(key)
    if hit:
        return hit[1], time.time() - hit[0]
    path = _cache_path(key)
    if os.path.exists(path):
        try:
            with open(path) as fh:
                return json.load(fh), time.time() - os.path.getmtime(path)
        except Exception:
            pass
    return None, None


# ---------------------------------------------------------------- http

def fetch(url, timeout=12, headers=None):
    req = urllib.request.Request(url)
    req.add_header("User-Agent", UA)
    req.add_header("Accept", "application/json, text/plain, */*")
    req.add_header("Accept-Encoding", "gzip")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        return json.loads(raw.decode("utf-8", "replace"))


def num(v):
    try:
        if v is None or v == "":
            return None
        f = float(v)
        return f if f == f else None   # drop NaN
    except (TypeError, ValueError):
        return None


def quote_row(symbol, price, prev, **kw):
    price = num(price)
    prev = num(prev)
    chg = pct = None
    if price is not None and prev:
        chg = price - prev
        pct = chg / prev * 100.0
    row = {
        "symbol": symbol,
        "price": price,
        "prevClose": prev,
        "change": chg,
        "changePct": pct,
        "ts": kw.get("ts") or int(time.time()),
    }
    for f in ("open", "high", "low", "volume", "currency", "name", "bid", "ask"):
        if kw.get(f) is not None:
            row[f] = num(kw[f]) if f not in ("currency", "name") else kw[f]
    return row


# ---------------------------------------------------------------- providers

def p_twelvedata(symbols):
    key = CFG.get("twelvedata_key") or "demo"
    url = ("https://api.twelvedata.com/quote?symbol=%s&apikey=%s"
           % (urllib.parse.quote(",".join(symbols)), key))
    data = fetch(url)
    if isinstance(data, dict) and data.get("code") in (400, 401, 429):
        raise RuntimeError("twelvedata: %s" % data.get("message", data.get("code")))
    rows = {}
    items = data.values() if (isinstance(data, dict) and "symbol" not in data) else [data]
    for it in items:
        if not isinstance(it, dict) or it.get("status") == "error":
            continue
        sym = it.get("symbol")
        if not sym:
            continue
        rows[sym] = quote_row(
            sym, it.get("close"), it.get("previous_close"),
            open=it.get("open"), high=it.get("high"), low=it.get("low"),
            volume=it.get("volume"), currency=it.get("currency"),
            name=it.get("name"), ts=it.get("timestamp"))
    if not rows:
        raise RuntimeError("twelvedata: empty")
    return rows


_yahoo_jar = {"cookie": None, "crumb": None, "at": 0}


def yahoo_session():
    """Yahoo now gates its JSON endpoints behind a consent cookie plus a crumb."""
    if _yahoo_jar["cookie"] and time.time() - _yahoo_jar["at"] < 1800:
        return _yahoo_jar
    try:
        opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        opener.addheaders = [("User-Agent", UA)]
        opener.open("https://fc.yahoo.com/", timeout=8)
        crumb = opener.open(
            "https://query2.finance.yahoo.com/v1/test/getcrumb", timeout=8
        ).read().decode("utf-8", "replace").strip()
        if crumb and len(crumb) < 40 and "Too Many" not in crumb:
            _yahoo_jar.update({"crumb": crumb, "cookie": True, "at": time.time(),
                               "opener": opener})
    except Exception as exc:
        log("yahoo handshake failed (%s) - trying unauthenticated" % exc)
        _yahoo_jar.update({"cookie": None, "crumb": None, "at": time.time()})
    return _yahoo_jar


def p_yahoo(symbols):
    rows = {}
    sess = yahoo_session()
    errors = 0
    for sym in symbols:
        url = ("https://query1.finance.yahoo.com/v8/finance/chart/%s?range=1d&interval=5m"
               % urllib.parse.quote(sym))
        if sess.get("crumb"):
            url += "&crumb=" + urllib.parse.quote(sess["crumb"])
        try:
            res = fetch(url)["chart"]["result"][0]["meta"]
        except Exception:
            errors += 1
            # One retry on the alternate host before giving up on this symbol.
            try:
                alt = url.replace("query1.", "query2.")
                res = fetch(alt, timeout=8)["chart"]["result"][0]["meta"]
            except Exception:
                continue
        rows[sym] = quote_row(
            sym, res.get("regularMarketPrice"),
            res.get("chartPreviousClose") or res.get("previousClose"),
            high=res.get("regularMarketDayHigh"), low=res.get("regularMarketDayLow"),
            volume=res.get("regularMarketVolume"), currency=res.get("currency"),
            name=res.get("shortName"), ts=res.get("regularMarketTime"))
    if not rows:
        raise RuntimeError("yahoo: %d/%d symbols, all failed" % (0, len(symbols)))
    return rows


def crypto_base(sym):
    """BTC, BTC/USD, BTC-USD, BTCUSDT all mean the same coin. Reduce to 'BTC'."""
    s = str(sym).upper().strip()
    for sep in ("/", "-", ":"):
        if sep in s:
            s = s.split(sep)[0]
    for suffix in ("USDT", "USDC", "USD"):
        if s.endswith(suffix) and len(s) > len(suffix):
            s = s[: -len(suffix)]
            break
    return s


def p_binance(symbols):
    bases = [crypto_base(s) for s in symbols]
    rows = {}
    # Tether is the quote asset, so USDTUSDT does not exist. Asking for it makes
    # Binance reject the WHOLE batch with a 400, which used to take every other
    # coin down with it.
    if "USDT" in bases:
        rows["USDT"] = quote_row("USDT", 1.0, 1.0, currency="USD")
        bases = [b for b in bases if b != "USDT"]
    if not bases:
        return rows
    pairs = [b + "USDT" for b in bases]
    url = ("https://api.binance.com/api/v3/ticker/24hr?symbols=%s"
           % urllib.parse.quote(json.dumps(pairs, separators=(",", ":"))))
    data = fetch(url)
    for it in data:
        base = it["symbol"][:-4] if it["symbol"].endswith("USDT") else it["symbol"]
        rows[base] = quote_row(
            base, it.get("lastPrice"), it.get("openPrice"),
            high=it.get("highPrice"), low=it.get("lowPrice"),
            volume=it.get("quoteVolume"), bid=it.get("bidPrice"), ask=it.get("askPrice"),
            currency="USD")
    if not rows:
        raise RuntimeError("binance: empty")
    return rows


def p_coingecko(symbols):
    url = ("https://api.coingecko.com/api/v3/coins/markets"
           "?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&price_change_percentage=24h")
    data = fetch(url)
    want = set(crypto_base(s) for s in symbols)
    rows = {}
    for it in data:
        sym = (it.get("symbol") or "").upper()
        if want and sym not in want:
            continue
        price = num(it.get("current_price"))
        chg = num(it.get("price_change_24h")) or 0.0
        rows[sym] = quote_row(
            sym, price, (price - chg) if price is not None else None,
            high=it.get("high_24h"), low=it.get("low_24h"),
            volume=it.get("total_volume"), name=it.get("name"), currency="USD")
        rows[sym]["marketCap"] = num(it.get("market_cap"))
    if not rows:
        raise RuntimeError("coingecko: empty")
    return rows


def p_frankfurter(_symbols):
    data = fetch("https://api.frankfurter.dev/v1/latest?base=USD")
    rates = data.get("rates") or {}
    rows = {}
    for ccy, rate in rates.items():
        rows["USD" + ccy] = quote_row("USD" + ccy, rate, rate, currency=ccy)
    rows["USDUSD"] = quote_row("USDUSD", 1.0, 1.0, currency="USD")
    if len(rows) < 2:
        raise RuntimeError("frankfurter: empty")
    return rows


def p_erapi(_symbols):
    data = fetch("https://open.er-api.com/v6/latest/USD")
    rates = data.get("rates") or {}
    rows = {}
    for ccy, rate in rates.items():
        rows["USD" + ccy] = quote_row("USD" + ccy, rate, rate, currency=ccy)
    if len(rows) < 2:
        raise RuntimeError("er-api: empty")
    return rows


CHAINS = {
    "equity": [p_twelvedata, p_yahoo],
    "index":  [p_twelvedata, p_yahoo],
    "crypto": [p_binance, p_coingecko],
    "fx":     [p_frankfurter, p_erapi],
    "yield":  [p_yahoo, p_twelvedata],
}


def resolve(kind, symbols):
    """
    Walk the provider chain, MERGING partial fills.

    No single free vendor covers all ten exchanges. Twelve Data knows NASDAQ and
    NSE but may miss SGX; Yahoo covers almost everything but rate-limits by IP
    and will happily return three symbols out of ten. Taking the first provider
    that returns anything at all would then cache a mostly-empty board and
    starve every symbol it missed.

    So each provider is asked only for what is still outstanding, and whatever
    it returns is kept. Gaps fall through to the stale cache, then to the
    clearly-flagged demo walk.

    Returns (rows, source, degraded).
    """
    key = "%s:%s" % (kind, ",".join(sorted(symbols)))
    ttl = TTL.get(kind, 60)
    hit, age = cache_get(key, ttl)
    if hit is not None:
        return hit["rows"], hit.get("source", "cache"), hit.get("degraded", False)

    rows = {}
    sources = []
    errors = []
    outstanding = list(symbols)

    for provider in CHAINS.get(kind, []):
        if kind != "fx" and not outstanding:
            break
        try:
            got = provider(outstanding if kind != "fx" else symbols)
        except Exception as exc:
            errors.append("%s: %s" % (provider.__name__[2:], exc))
            continue
        fresh = {k: v for k, v in got.items() if k not in rows}
        if not fresh:
            continue
        rows.update(fresh)
        sources.append("%s(%d)" % (provider.__name__[2:], len(fresh)))
        if kind == "fx":
            break
        outstanding = [s for s in outstanding if s not in rows]

    degraded = bool(outstanding) if kind != "fx" else not rows

    # Fill any remaining gaps from the last good values, however old.
    if outstanding:
        stale, stale_age = cache_stale(key)
        if stale:
            filled = 0
            for sym in list(outstanding):
                if sym in stale["rows"]:
                    rows[sym] = stale["rows"][sym]
                    outstanding.remove(sym)
                    filled += 1
            if filled:
                sources.append("cache/stale(%d)" % filled)

    # Still short? Synthetic prices, loudly flagged, so every downstream feature
    # stays testable instead of the board going blank.
    if outstanding:
        demo_rows = demo_data.rows_for([x for x in outstanding if demo_data.covers(x)])
        if demo_rows:
            rows.update(demo_rows)
            sources.append("demo(%d)" % len(demo_rows))
            outstanding = [x for x in outstanding if x not in demo_rows]

    if errors and not rows:
        log("no provider answered for %s: %s" % (kind, "; ".join(errors)))
    elif errors:
        log("%s partially filled (%s); unresolved: %s"
            % (kind, "; ".join(errors), ",".join(outstanding) or "none"))

    source = "+".join(sources) or "none"
    if rows:
        cache_put(key, {"rows": rows, "source": source, "degraded": degraded,
                        "fetched": time.time()})
    return rows, source, degraded


def history(symbol, kind, days):
    key = "hist:%s:%s" % (kind, symbol)
    hit, _ = cache_get(key, TTL["history"])
    if hit is not None:
        return hit

    bars = None
    if kind == "crypto":
        try:
            pair = symbol.upper() + ("" if symbol.upper().endswith("USDT") else "USDT")
            raw = fetch("https://api.binance.com/api/v3/klines?symbol=%s&interval=1d&limit=%d"
                        % (pair, min(days, 500)))
            bars = [{"t": int(r[0] / 1000), "o": num(r[1]), "h": num(r[2]),
                     "l": num(r[3]), "c": num(r[4]), "v": num(r[5])} for r in raw]
        except Exception as exc:
            log("history binance %s: %s" % (symbol, exc))
    if bars is None:
        try:
            url = ("https://query1.finance.yahoo.com/v8/finance/chart/%s?range=1y&interval=1d"
                   % urllib.parse.quote(symbol))
            res = fetch(url)["chart"]["result"][0]
            ts, q = res["timestamp"], res["indicators"]["quote"][0]
            bars = []
            for i, t in enumerate(ts):
                c = num(q["close"][i])
                if c is None:
                    continue
                bars.append({"t": int(t), "o": num(q["open"][i]), "h": num(q["high"][i]),
                             "l": num(q["low"][i]), "c": c, "v": num(q["volume"][i])})
        except Exception as exc:
            log("history yahoo %s: %s" % (symbol, exc))
    if bars is None and CFG.get("twelvedata_key"):
        try:
            url = ("https://api.twelvedata.com/time_series?symbol=%s&interval=1day"
                   "&outputsize=%d&apikey=%s"
                   % (urllib.parse.quote(symbol), min(days, 500), CFG["twelvedata_key"]))
            vals = fetch(url).get("values") or []
            bars = [{"t": int(time.mktime(time.strptime(v["datetime"][:10], "%Y-%m-%d"))),
                     "o": num(v["open"]), "h": num(v["high"]), "l": num(v["low"]),
                     "c": num(v["close"]), "v": num(v.get("volume"))} for v in reversed(vals)]
        except Exception as exc:
            log("history twelvedata %s: %s" % (symbol, exc))

    if not bars:
        stale, _ = cache_stale(key)
        if stale:
            return stale
        if demo_data.covers(symbol):
            return {"symbol": symbol, "bars": demo_data.bars_for(symbol, days), "demo": True}
        return {"symbol": symbol, "bars": []}
    payload = {"symbol": symbol, "bars": bars}
    cache_put(key, payload)
    return payload


# ---------------------------------------------------------------- handler

MIME = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
        ".map": "application/json"}


class Handler(BaseHTTPRequestHandler):
    server_version = "PaperTerminal"
    protocol_version = "HTTP/1.1"

    def log_message(self, *_a):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8", cache=False):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=300" if cache else "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path, qs = parsed.path, urllib.parse.parse_qs(parsed.query)
        try:
            if path.startswith("/api/"):
                return self.api(path[5:], qs)
            return self.static(path)
        except Exception as exc:
            log("500 on %s: %s" % (path, exc))
            self._send(500, {"error": str(exc)})

    def api(self, route, qs):
        if route == "quote":
            kind = (qs.get("class") or ["equity"])[0]
            symbols = [s for s in (qs.get("symbols") or [""])[0].split(",") if s]
            if not symbols and kind != "fx":
                return self._send(400, {"error": "symbols required"})
            rows, source, degraded = resolve(kind, symbols)
            now = int(time.time())
            for r in rows.values():
                r["age"] = max(0, now - int(r.get("ts") or now))
                r["source"] = source
            return self._send(200, {"rows": rows, "source": source,
                                    "degraded": degraded, "demo": "demo(" in source,
                                    "server": now})
        if route == "history":
            sym = (qs.get("symbol") or [""])[0]
            if not sym:
                return self._send(400, {"error": "symbol required"})
            kind = (qs.get("class") or ["equity"])[0]
            days = int((qs.get("days") or ["365"])[0])
            return self._send(200, history(sym, kind, days))
        if route == "health":
            return self._send(200, {
                "ok": True, "server": int(time.time()),
                "twelvedata_key": bool(CFG.get("twelvedata_key")),
                "fred_key": bool(CFG.get("fred_key")),
                "cache_entries": len(_mem), "ttl": TTL,
            })
        return self._send(404, {"error": "no such route"})

    def static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        target = os.path.normpath(os.path.join(WEB, path.lstrip("/")))
        # Directory requests resolve to their index, so /guide/ works the way it
        # does on every static host this is meant to be deployable to.
        if os.path.isdir(target):
            if not path.endswith("/"):
                self.send_response(301)
                self.send_header("Location", path + "/")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            target = os.path.join(target, "index.html")
        if not target.startswith(WEB) or not os.path.isfile(target):
            return self._send(404, "not found", "text/plain; charset=utf-8")
        with open(target, "rb") as fh:
            body = fh.read()
        ext = os.path.splitext(target)[1]
        self._send(200, body, MIME.get(ext, "application/octet-stream"),
                   cache=(ext in (".woff2", ".svg", ".ico")))


def main():
    port = int(os.environ.get("PORT") or CFG.get("port") or 8317)
    os.makedirs(CACHE, exist_ok=True)
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    srv.daemon_threads = True
    log("PaperTerminal on http://localhost:%d" % port)
    log("data plane only - no accounts, no login, no telemetry")
    if not CFG.get("twelvedata_key"):
        log("no twelvedata key: equities via Yahoo fallback. See config.example.json")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        log("shutdown")
        srv.shutdown()


if __name__ == "__main__":
    main()
