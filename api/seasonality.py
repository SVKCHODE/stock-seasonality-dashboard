import os
from datetime import datetime, timezone
from urllib.parse import quote

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

UNIVERSES = {
    "test10": [
        {"symbol": "DEEPINDS", "name": "Deep Industries"},
        {"symbol": "RELIANCE", "name": "Reliance Industries"},
        {"symbol": "TCS", "name": "TCS"},
        {"symbol": "INFY", "name": "Infosys"},
        {"symbol": "HDFCBANK", "name": "HDFC Bank"},
        {"symbol": "ICICIBANK", "name": "ICICI Bank"},
        {"symbol": "SBIN", "name": "State Bank of India"},
        {"symbol": "ITC", "name": "ITC"},
        {"symbol": "LT", "name": "Larsen & Toubro"},
        {"symbol": "BHARTIARTL", "name": "Bharti Airtel"},
    ]
}


def month_key(timestamp):
    """Preserve the calendar date represented by the source timestamp.

    Upstox monthly candle timestamps are the start of the candle in IST.
    Converting them to UTC first can turn July 1 00:00 IST into June 30 UTC.
    We therefore take the YYYY-MM portion directly from the source timestamp.
    """
    if not timestamp:
        return None
    text = str(timestamp)
    if len(text) >= 7 and text[4] == "-":
        return text[:7]
    dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    return f"{dt.year:04d}-{dt.month:02d}"


def previous_month_key(year, month):
    if month == 1:
        return f"{year - 1:04d}-12"
    return f"{year:04d}-{month - 1:02d}"


def get_candles(instrument_key, from_date, to_date, token):
    url = (
        "https://api.upstox.com/v3/historical-candle/"
        f"{quote(instrument_key, safe='')}/months/1/{to_date}/{from_date}"
    )
    response = requests.get(
        url,
        headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
        timeout=20,
    )
    response.raise_for_status()
    return response.json().get("data", {}).get("candles", [])


def calculate_month_return(candles, target_year, target_month):
    target = f"{target_year:04d}-{target_month:02d}"
    previous = previous_month_key(target_year, target_month)
    by_month = {month_key(c[0]): c for c in candles if len(c) >= 5}
    previous_candle = by_month.get(previous)
    target_candle = by_month.get(target)
    if not previous_candle or not target_candle:
        return None
    start_price = float(previous_candle[4])
    end_price = float(target_candle[4])
    if start_price == 0:
        return None
    return {
        "year": target_year,
        "previous_month": previous,
        "selected_month": target,
        "start": start_price,
        "end": end_price,
        "return_pct": (end_price / start_price - 1) * 100,
        "source_previous_timestamp": previous_candle[0],
        "source_selected_timestamp": target_candle[0],
    }


@app.get("/api/scan")
def scan():
    try:
        month = int(request.args.get("month", "7"))
        years = int(request.args.get("years", "6"))
        universe_name = request.args.get("universe", "test10")
        min_avg = float(request.args.get("minAvg", "0"))
        min_positive = float(request.args.get("minPositive", "0"))
        if not 1 <= month <= 12:
            return jsonify({"error": "month must be 1-12"}), 400
        if years < 1 or years > 20:
            return jsonify({"error": "years must be between 1 and 20"}), 400

        token = os.getenv("UPSTOX_ANALYTICS_TOKEN") or os.getenv("UPSTOX_ACCESS_TOKEN")
        if not token:
            return jsonify({"error": "UPSTOX_ANALYTICS_TOKEN is not configured"}), 500

        stocks = UNIVERSES.get(universe_name)
        if not stocks:
            return jsonify({"error": f"Unknown universe: {universe_name}"}), 400

        current_year = datetime.now(timezone.utc).year
        target_years = list(range(current_year - years + 1, current_year + 1))
        results = []
        for stock in stocks:
            # Fetch enough history for the requested years plus the previous month.
            from_date = f"{target_years[0] - 1}-12-01"
            to_date = f"{target_years[-1]}-12-31"
            try:
                candles = get_candles(stock["symbol"], from_date, to_date, token)
            except Exception as exc:
                results.append({"symbol": stock["symbol"], "name": stock["name"], "error": str(exc)})
                continue

            rows = [calculate_month_return(candles, year, month) for year in target_years]
            rows = [row for row in rows if row]
            if not rows:
                continue
            avg_return = sum(row["return_pct"] for row in rows) / len(rows)
            positive_count = sum(1 for row in rows if row["return_pct"] > 0)
            if avg_return < min_avg or positive_count < min_positive:
                continue
            results.append({
                "symbol": stock["symbol"],
                "name": stock["name"],
                "avg_return": avg_return,
                "positive_years": positive_count,
                "years_available": len(rows),
                "yearly": rows,
            })

        return jsonify({
            "month": month,
            "month_name": datetime(2000, month, 1).strftime("%B"),
            "years": years,
            "universe": universe_name,
            "results": results,
            "mapping": "source timestamp calendar month preserved; no UTC month conversion",
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))
