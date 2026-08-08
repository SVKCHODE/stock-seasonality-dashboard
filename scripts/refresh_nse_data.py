import gzip
import io
import json
import os
import time
import urllib.parse
import csv
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
HISTORY = DATA / "history"
TOKEN = os.environ.get("UPSTOX_ANALYTICS_TOKEN")
if not TOKEN:
    raise SystemExit("UPSTOX_ANALYTICS_TOKEN is required")

BASE = "https://api.upstox.com/v2"
INDEX_CSV = {
    "nifty50": "https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv",
    "niftynext50": "https://www.niftyindices.com/IndexConstituent/ind_niftynext50list.csv",
    "nifty500": "https://www.niftyindices.com/IndexConstituent/ind_nifty500list.csv",
}

session = requests.Session()
session.headers.update({
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; StockSeasonalityDashboard/1.0)",
    "Referer": "https://www.niftyindices.com/",
})


def request(url, headers=None, **kwargs):
    for attempt in range(5):
        r = session.get(url, timeout=90, headers=headers or {}, **kwargs)
        if r.status_code == 200:
            return r
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(2 ** attempt)
            continue
        raise RuntimeError(f"GET {url} failed: HTTP {r.status_code}: {r.text[:500]}")
    raise RuntimeError(f"GET {url} failed after retries")


def index_symbols(url):
    r = request(url, headers={"Accept": "text/csv, text/plain, */*"})
    text = r.content.decode("utf-8-sig", errors="replace")
    if "<html" in text[:500].lower() or "captcha" in text[:500].lower():
        raise RuntimeError(f"Nifty Indices did not return CSV data: {url}")
    rows = list(csv.reader(io.StringIO(text)))
    header_idx = symbol_col = None
    for i, row in enumerate(rows[:20]):
        normalized = [str(x).strip().strip('"').lower().replace(" ", "_") for x in row]
        for candidate in ("symbol", "ticker", "tradingsymbol", "trading_symbol"):
            if candidate in normalized:
                header_idx, symbol_col = i, normalized.index(candidate)
                break
        if header_idx is not None:
            break
    if header_idx is None:
        raise RuntimeError(f"Could not identify Symbol column in Nifty CSV: {url}; headers={rows[:3]}")
    return sorted({row[symbol_col].strip().strip('"').upper() for row in rows[header_idx + 1:] if len(row) > symbol_col and row[symbol_col].strip()})


def build_instrument_map():
    url = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz"
    r = session.get(url, timeout=120)
    r.raise_for_status()
    try:
        records = json.loads(gzip.decompress(r.content).decode("utf-8"))
    except OSError:
        records = json.loads(r.content.decode("utf-8"))
    mapping = {}
    for x in records:
        if x.get("segment") != "NSE_EQ":
            continue
        symbol = str(x.get("trading_symbol", x.get("tradingsymbol", ""))).upper()
        key = x.get("instrument_key")
        if symbol and key and x.get("instrument_type") == "EQ":
            mapping.setdefault(symbol, key)
    if not mapping:
        raise RuntimeError("Upstox NSE instrument master returned zero NSE_EQ instruments")
    return mapping


def build_universes(mapping):
    return {**{name: index_symbols(url) for name, url in INDEX_CSV.items()}, "allnse": sorted(mapping.keys())}


def parse_api_response(response, symbol):
    try:
        body = response.json()
    except ValueError:
        raise RuntimeError(f"{symbol}: Upstox returned non-JSON HTTP {response.status_code}: {response.text[:500]}")
    if response.status_code != 200:
        raise RuntimeError(f"{symbol}: Upstox HTTP {response.status_code}: {body}")
    if body.get("status") not in (None, "success"):
        raise RuntimeError(f"{symbol}: Upstox API status={body.get('status')}: {body}")
    return (body.get("data") or {}).get("candles") or []


def historical_request(key, symbol, to_date, from_date):
    encoded = urllib.parse.quote(key, safe="")
    # v2 historical candle API uses: /historical-candle/{instrument_key}/{interval}/{to_date}/{from_date}
    url = f"{BASE}/historical-candle/{encoded}/1month/{to_date}/{from_date}"
    response = session.get(url, timeout=60)
    candles = parse_api_response(response, symbol)
    print(f"DIAGNOSTIC {symbol}: HTTP={response.status_code} URL={url} CANDLES={len(candles)}")
    if not candles:
        print(f"DIAGNOSTIC {symbol}: response={response.text[:1000]}")
    return candles


def monthly_candles(key, symbol, from_date, to_date):
    start = date.fromisoformat(from_date)
    end = date.fromisoformat(to_date)
    all_candles = []
    cursor = start
    while cursor <= end:
        chunk_end = min(date(cursor.year, 12, 31), end)
        all_candles.extend(historical_request(key, symbol, chunk_end.isoformat(), cursor.isoformat()))
        cursor = chunk_end + timedelta(days=1)
        time.sleep(0.05)
    return all_candles


def normalize(candles):
    result = {}
    for candle in candles:
        if len(candle) < 5:
            continue
        timestamp = str(candle[0])
        result[timestamp[:7]] = {"timestamp": timestamp, "open": candle[1], "high": candle[2], "low": candle[3], "close": candle[4], "volume": candle[5] if len(candle) > 5 else None}
    return result


def write_history(symbol, key, monthly):
    HISTORY.mkdir(parents=True, exist_ok=True)
    (HISTORY / f"{symbol}.json").write_text(json.dumps({"symbol": symbol, "instrumentKey": key, "monthly": monthly}, separators=(",", ":")) + "\n")


def main():
    mapping = build_instrument_map()
    universes = build_universes(mapping)
    counts = {name: len(symbols) for name, symbols in universes.items()}
    if counts["nifty50"] < 40 or counts["niftynext50"] < 40 or counts["nifty500"] < 400 or counts["allnse"] < 1000:
        raise RuntimeError(f"Universe download looks incomplete: {counts}")

    # Diagnostic probe: one liquid, long-lived NSE equity before the full backfill.
    probe = "RELIANCE" if "RELIANCE" in mapping else next(iter(mapping))
    today = datetime.now(timezone.utc).date()
    probe_from = date(today.year - 1, 1, 1).isoformat()
    probe_to = today.isoformat()
    print(f"Starting Upstox historical diagnostic for {probe} ({mapping[probe]})")
    probe_candles = historical_request(mapping[probe], probe, probe_to, probe_from)
    if not probe_candles:
        raise RuntimeError("Upstox historical-candle diagnostic returned zero candles. See DIAGNOSTIC lines above.")

    all_symbols = sorted({s for symbols in universes.values() for s in symbols})
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
            monthly = normalize(monthly_candles(key, symbol, from_date, to_date))
            if monthly:
                write_history(symbol, key, monthly)
                done += 1
            else:
                print(f"WARN {symbol}: Upstox returned zero monthly candles")
        except Exception as exc:
            print(f"WARN {symbol}: {exc}")
        if i % 25 == 0:
            print(f"Progress: {i}/{len(all_symbols)} symbols; {done} histories stored")
        time.sleep(0.08)

    (DATA / "universes").mkdir(parents=True, exist_ok=True)
    for name, symbols in universes.items():
        (DATA / "universes" / f"{name}.json").write_text(json.dumps({"stocks": symbols}, separators=(",", ":")) + "\n")
    metadata = {"updatedAt": datetime.now(timezone.utc).isoformat(), "source": "Upstox + NSE index constituent CSVs", "years": 10, "counts": counts, "historyStocks": done, "missingInstrumentSymbols": missing[:100]}
    DATA.mkdir(exist_ok=True)
    (DATA / "metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))
    if done == 0:
        raise SystemExit("No historical datasets were stored")


if __name__ == "__main__":
    main()
