const BASE_URL = 'https://api.upstox.com/v3';

export async function getMonthlyCandles(instrumentKey, fromDate, toDate, token) {
  if (!token) throw new Error('UPSTOX_ANALYTICS_TOKEN is not configured');
  const encoded = encodeURIComponent(instrumentKey);
  const url = `${BASE_URL}/historical-candle/${encoded}/months/1/${toDate}/${fromDate}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Upstox historical data request failed: ${response.status}`);
  const body = await response.json();
  return body?.data?.candles ?? [];
}

export function candlesToMonthlyRows(symbol, candles) {
  return candles.map(c => ({
    symbol,
    year: new Date(c[0]).getUTCFullYear(),
    month: new Date(c[0]).getUTCMonth() + 1,
    monthStartClose: Number(c[1]),
    monthEndClose: Number(c[4])
  })).sort((a,b) => a.year - b.year || a.month - b.month);
}
