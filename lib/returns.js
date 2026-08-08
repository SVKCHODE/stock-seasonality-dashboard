export function candlesToMonthlyReturns(symbol, candles) {
  // Upstox monthly candles are [timestamp, open, high, low, close, volume, oi].
  // A month's return is measured from the prior month's close to that month's close.
  const points = candles.map(c => ({
    date: new Date(c[0]),
    close: Number(c[4])
  })).filter(x => Number.isFinite(x.close)).sort((a,b) => a.date - b.date);

  const rows = [];
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const current = points[i];
    const year = current.date.getUTCFullYear();
    const month = current.date.getUTCMonth() + 1;
    if (previous.close === 0) continue;
    rows.push({
      symbol,
      year,
      month,
      monthStartClose: previous.close,
      monthEndClose: current.close,
      returnPct: ((current.close / previous.close) - 1) * 100
    });
  }
  return rows;
}
