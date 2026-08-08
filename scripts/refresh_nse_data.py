import csv
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
UNIVERSES = DATA / "universes"
HISTORY = DATA / "history"
TOKEN = os.environ.get("UPSTOX_ANALYTICS_TOKEN")
if not TOKEN:
    raise SystemExit("UPSTOX_ANALYTICS_TOKEN is required")

HEADERS = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/json"}
BASE = "https://api.upstox.com/v2"

# Upstox instrument master is the safest way to map NSE symbols to instrument keys.
INSTRUMENT_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"

session = requests.Session()
session.headers.update(HEADERS)

def get_json(url, params=None, retries=4):
    for attempt in range(retries):
        r = session.get(url, params=params, timeout=45)
        if r.status_code == 200:
            return r.json()
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(2 ** attempt)
            continue
        raise RuntimeError(f"GET {url} failed: HTTP {r.status_code}: {r.text[:300]}")
    raise RuntimeError(f"GET {url} failed after retries")

def load_universe(name):
    p = UNIVERSES / f"{name}.json"
    if not p.exists():
        return []
    obj = json.loads(p.read_text())
    if isinstance(obj, list):
        return obj
    return obj.get("stocks", obj.get("symbols", []))

def symbol_from_item(item):
    if isinstance(item, str):
        return item.upper()
    return str(item.get("symbol", item.get("tradingsymbol", ""))).upper()

def build_instrument_map():
    # Upstox publishes the master as gzip JSON; requests transparently decompresses it.
    r = session.get(INSTRUMENT_URL, timeout=90)
    r.raise_for_status()
    raw = r.content
    import gzip
    try:
        text = gzip.decompress(raw).decode("utf-8")
    except OSError:
        text = raw.decode("utf-8")
    records = json.loads(text)
    mapping = {}
    for x in records:
        if x.get("segment") != "NSE_EQ":
            continue
        symbol = str(x.get("trading_symbol", x.get("tradingsymbol", ""))).upper()
        instrument_key = x.get("instrument_key")
        if symbol and instrument_key and x.get("instrument_type", "EQ") == "EQ":
            mapping.setdefault(symbol, instrument_key)
    return mapping

def monthly_candles(instrument_key, from_date, to_date):
    # The API route uses URL-encoded instrument keys. Response timestamps are kept
    # as supplied by Upstox; the scanner later interprets the calendar month in IST.
    import urllib.parse
    key = urllib.parse.quote(instrument_key, safe="")
    url = f"{BASE}/historical-candle/{key}/1month/{to_date}/{from_date}"
    body = get_json(url)
    return body.get("data", {}).get("candles", [])

def normalize(candles):
    out = {}
    for c in candles:
        if len(c) < 5:
            continue
        ts = str(c[0])
        # Upstox monthly timestamps represent the start of the candle in IST.
        month = ts[:7]
        out[month] = {"timestamp": ts, "open": c[1], "high": c[2], "low": c[3], "close": c[4], "volume": c[5] if len(c) > 5 else None}
    return out

def write_history(symbol, instrument_key, monthly):
    HISTORY.mkdir(parents=True, exist_ok=True)
    (HISTORY / f"{symbol}.json").write_text(json.dumps({"symbol": symbol, "instrumentKey": instrument_key, "monthly": monthly}, separators=(",", ":")) + "\n")

def main():
    names = ["nifty50", "niftynext50", "nifty500", "allnse"]
    requested = {n: [symbol_from_item(x) for x in load_universe(n)] for n in names}
    all_symbols = sorted({s for values in requested.values() for s in values if s})
    if not all_symbols:
        raise SystemExit("No universe manifests found. Populate data/universes/*.json first.")

    mapping = build_instrument_map()
    # Ten calendar years plus the preceding month are fetched. Re-running overwrites
    # the same month keys, making the job idempotent and safe for scheduled refreshes.
    today = datetime.now(timezone.utc).date()
    from_date = f"{today.year - 10:04d}-01-01"
    to_date = today.isoformat()
    done = 0
    missing = []
    for symbol in all_symbols:
        key = mapping.get(symbol)
        if not key:
            missing.append(symbol)
            continue
        candles = monthly_candles(key, from_date, to_date)
        monthly = normalize(candles)
        if monthly:
            write_history(symbol, key, monthly)
            done += 1
        time.sleep(0.08)

    metadata = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "Upstox",
        "years": 10,
        "counts": {n: len(requested[n]) for n in names},
        "historyStocks": done,
        "missingInstrumentSymbols": missing[:100],
    }
    (DATA / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))

if __name__ == "__main__":
    main()
