import gzip
import json
import os
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
HISTORY = DATA / "history"
TOKEN = os.environ.get("UPSTOX_ANALYTICS_TOKEN")
if not TOKEN:
    raise SystemExit("UPSTOX_ANALYTICS_TOKEN is required")

BASE = "https://api.upstox.com/v2"
INSTRUMENT_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
INDEX_CSV = {
    "nifty50": "https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv",
    "niftynext50": "https://www.niftyindices.com/IndexConstituent/ind_niftynext50list.csv",
    "nifty500": "https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv",
}

session = requests.Session()
session.headers.update({"Authorization": f"Bearer {TOKEN}", "Accept": "application/json", "User-Agent": "Mozilla/5.0"})


def request(url, **kwargs):
    for attempt in range(5):
        r = session.get(url, timeout=90, **kwargs)
        if r.status_code == 200:
            return r
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(2 ** attempt)
            continue
        raise RuntimeError(f"GET {url} failed: HTTP {r.status_code}: {r.text[:300]}")
    raise RuntimeError(f"GET {url} failed after retries")


def index_symbols(url):
    r = request(url)
    text = r.content.decode("utf-8-sig")
    lines = text.splitlines()
    if not lines:
        return []
    header = [x.strip().strip('"').lower() for x in lines[0].split(",")]
    try:
        col = header.index("symbol")
    except ValueError:
        raise RuntimeError(f"Index CSV has no Symbol column: {url}")
    symbols = []
    for line in lines[1:]:
        parts = [x.strip().strip('"') for x in line.split(",")]
        if len(parts) > col and parts[col]:
            symbols.append(parts[col].upper())
    return symbols


def build_instrument_map():
    r = request(INSTRUMENT_URL)
    try:
        records = json.loads(gzip.decompress(r.content).decode("utf-8"))
    except OSError:
        records = json.loads(r.content.decode("utf-8"))
    mapping = {}
    for x in records:
        if x.get("segment") != "NSE_EQ":
            continue
        symbol = str(x.get("trading_symbol", "")).upper()
        key = x.get("instrument_key")
        if symbol and key and x.get("instrument_type") == "EQ":
            mapping.setdefault(symbol, key)
    return mapping


def build_universes(mapping):
    universes = {name: index_symbols(url) for name, url in INDEX_CSV.items()}
    # All NSE Equity is derived from the current Upstox NSE_EQ instrument master.
    universes["allnse"] = sorted(mapping.keys())
    return universes


def monthly_candles(key, from_date, to_date):
    encoded = urllib.parse.quote(key, safe="")
    url = f"{BASE}/historical-candle/{encoded}/1month/{to_date}/{from_date}"
    r = request(url)
    return r.json().get("data", {}).get("candles", [])


def normalize(candles):
    result = {}
    for candle in candles:
        if len(candle) < 5:
            continue
        timestamp = str(candle[0])
        month = timestamp[:7]
        result[month] = {
            "timestamp": timestamp,
            "open": candle[1],
            "high": candle[2],
            "low": candle[3],
            "close": candle[4],
            "volume": candle[5] if len(candle) > 5 else None,
        }
    return result


def write_history(symbol, key, monthly):
    HISTORY.mkdir(parents=True, exist_ok=True)
    path = HISTORY / f"{symbol}.json"
    path.write_text(json.dumps({"symbol": symbol, "instrumentKey": key, "monthly": monthly}, separators=(",", ":")) + "\n")


def main():
    mapping = build_instrument_map()
    universes = build_universes(mapping)
    all_symbols = sorted({s for symbols in universes.values() for s in symbols})
    if not all_symbols:
        raise SystemExit("No NSE equity instruments were returned by Upstox")

    today = datetime.now(timezone.utc).date()
    from_date = f"{today.year - 10:04d}-01-01"
    to_date = today.isoformat()
    done = 0
    missing = []

    for i, symbol in enumerate(all_symbols, 1):
        key = mapping.get(symbol)
        if not key:
            missing.append(symbol)
            continue
        try:
            monthly = normalize(monthly_candles(key, from_date, to_date))
            if monthly:
                write_history(symbol, key, monthly)
                done += 1
        except Exception as exc:
            print(f"WARN {symbol}: {exc}")
        if i % 25 == 0:
            print(f"Progress: {i}/{len(all_symbols)} symbols; {done} histories stored")
        time.sleep(0.08)

    DATA.mkdir(exist_ok=True)
    (DATA / "universes").mkdir(parents=True, exist_ok=True)
    for name, symbols in universes.items():
        (DATA / "universes" / f"{name}.json").write_text(json.dumps({"stocks": symbols}, separators=(",", ":")) + "\n")

    metadata = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "Upstox + NSE index constituent CSVs",
        "years": 10,
        "counts": {name: len(symbols) for name, symbols in universes.items()},
        "historyStocks": done,
        "missingInstrumentSymbols": missing[:100],
    }
    (DATA / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))
    if done == 0:
        raise SystemExit("No historical datasets were stored")


if __name__ == "__main__":
    main()
