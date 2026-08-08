// Weekly ingestion job skeleton.
// Secrets are read from environment variables; never commit tokens here.
// The production job should:
// 1. Load the current NSE universe + Upstox instrument keys.
// 2. Fetch monthly candles for each active instrument.
// 3. Convert consecutive month-end closes into monthly returns.
// 4. Upsert rows into monthly_returns.
// 5. Record the provider/data timestamp for freshness monitoring.

import { getMonthlyCandles, candlesToMonthlyRows } from '../lib/upstox.js';

const token = process.env.UPSTOX_ANALYTICS_TOKEN;
const instrumentKey = process.env.TEST_UPSTOX_INSTRUMENT_KEY;

if (!token || !instrumentKey) {
  console.error('Set UPSTOX_ANALYTICS_TOKEN and TEST_UPSTOX_INSTRUMENT_KEY to run the ingestion smoke test.');
  process.exit(1);
}

const to = new Date().toISOString().slice(0,10);
const fromDate = new Date();
fromDate.setFullYear(fromDate.getFullYear() - 10);
const from = fromDate.toISOString().slice(0,10);

const candles = await getMonthlyCandles(instrumentKey, from, to, token);
const rows = candlesToMonthlyRows('TEST', candles);

console.log(JSON.stringify({ rows: rows.length, first: rows[0] ?? null, last: rows.at(-1) ?? null }, null, 2));
