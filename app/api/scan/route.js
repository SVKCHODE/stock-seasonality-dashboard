import { NextResponse } from 'next/server';
import { gunzipSync } from 'zlib';
import { getMonthlyCandles } from '../../../lib/upstox.js';
import { getNifty500Symbols } from '../../../lib/nifty500.js';

const TEST10 = ['RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','SBIN','ITC','DEEPINDS','AXISBANK','MARUTI'];
const UPSTOX_NSE_INSTRUMENTS_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz';
let instrumentMapCache = null;

function average(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values) { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }

// Upstox monthly timestamps contain the candle's IST calendar date.
// Preserve YYYY-MM directly; converting to UTC can shift the month backwards.
function monthKey(timestamp) {
  const text = String(timestamp ?? '');
  if (text.length >= 7 && text[4] === '-') return text.slice(0, 7);
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousMonthKey(year, month) {
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

async function getInstrumentMap(token) {
  if (instrumentMapCache?.size) return instrumentMapCache;
  const response = await fetch(UPSTOX_NSE_INSTRUMENTS_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Upstox NSE instruments download failed: ${response.status}`);
  const compressed = Buffer.from(await response.arrayBuffer());
  const records = JSON.parse(gunzipSync(compressed).toString('utf8'));
  const map = new Map();
  for (const item of records) {
    if (item?.segment === 'NSE_EQ' && ['EQ', 'BE'].includes(item?.instrument_type) && item?.trading_symbol && item?.instrument_key) {
      map.set(String(item.trading_symbol).toUpperCase(), item);
    }
  }
  instrumentMapCache = map;
  return map;
}

function calculateMonthSeasonality(candles, month, years, now = new Date()) {
  const rows = candles
    .map(candle => ({ timestamp: candle[0], calendarMonth: monthKey(candle[0]), close: Number(candle[4]) }))
    .filter(row => Number.isFinite(row.close))
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const closes = new Map(rows.map(row => [row.calendarMonth, row.close]));
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const latestCompletedYear = currentMonth === month ? currentYear - 1 : currentYear;
  const returns = [];

  for (let year = latestCompletedYear; year > latestCompletedYear - years; year -= 1) {
    const selectedKey = `${year}-${String(month).padStart(2, '0')}`;
    const previousKey = previousMonthKey(year, month);
    const currentClose = closes.get(selectedKey);
    const previousClose = closes.get(previousKey);
    if (Number.isFinite(currentClose) && Number.isFinite(previousClose) && previousClose !== 0) {
      returns.push({
        year,
        previousMonth: previousKey,
        selectedMonth: selectedKey,
        previousMonthClose: previousClose,
        monthClose: currentClose,
        returnPct: ((currentClose / previousClose) - 1) * 100,
        sourcePreviousTimestamp: rows.find(row => row.calendarMonth === previousKey)?.timestamp,
        sourceSelectedTimestamp: rows.find(row => row.calendarMonth === selectedKey)?.timestamp
      });
    }
  }

  const values = returns.map(item => item.returnPct);
  if (!values.length) throw new Error(`Not enough completed ${month}-month history`);
  return {
    yearsAvailable: returns.length,
    average: average(values),
    positiveYears: values.filter(value => value > 0).length,
    median: median(values),
    best: Math.max(...values),
    worst: Math.min(...values),
    yearlyReturns: returns
  };
}

async function scanSymbol(symbol, instrument, month, years, fromDate, toDate, token) {
  try {
    const candles = await getMonthlyCandles(instrument.instrument_key, fromDate, toDate, token);
    const stats = calculateMonthSeasonality(candles, month, years);
    return { symbol, name: instrument.short_name || instrument.name || symbol, instrumentKey: instrument.instrument_key, ...stats };
  } catch (error) {
    return { error: { symbol, error: error.message } };
  }
}

export async function GET(request) {
  const token = process.env.UPSTOX_ANALYTICS_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: 'UPSTOX_ANALYTICS_TOKEN is not configured' }, { status: 500 });
  const { searchParams } = new URL(request.url);
  const month = Number(searchParams.get('month') ?? 7);
  const years = Number(searchParams.get('years') ?? 6);
  const minAvg = Number(searchParams.get('minAvg') ?? 0);
  const minPositive = Number(searchParams.get('minPositive') ?? 0);
  const universeName = searchParams.get('universe') ?? 'test10';
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? (universeName === 'nifty500' ? 50 : 10))));

  if (!Number.isInteger(month) || month < 1 || month > 12) return NextResponse.json({ ok:false, error:'month must be 1-12' }, { status:400 });
  if (![3,5,6,10].includes(years)) return NextResponse.json({ ok:false, error:'years must be 3, 5, 6 or 10' }, { status:400 });
  if (!Number.isFinite(offset) || !Number.isFinite(limit)) return NextResponse.json({ ok:false, error:'invalid batch parameters' }, { status:400 });

  let symbols;
  try {
    symbols = universeName === 'nifty500' ? await getNifty500Symbols() : TEST10;
  } catch (error) {
    return NextResponse.json({ ok:false, error:error.message }, { status:502 });
  }
  if (!['test10', 'nifty500'].includes(universeName)) return NextResponse.json({ ok:false, error:'Unknown universe' }, { status:400 });

  const batch = symbols.slice(offset, offset + limit);
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear() - years - 1, today.getUTCMonth(), 1));
  const fromDate = from.toISOString().slice(0,10);
  const toDate = today.toISOString().slice(0,10);

  let instruments;
  try {
    instruments = await getInstrumentMap(token);
  } catch (error) {
    return NextResponse.json({ ok:false, error:error.message }, { status:502 });
  }

  const errors = [];
  const candidates = [];
  for (const symbol of batch) {
    const instrument = instruments.get(symbol);
    if (!instrument) errors.push({ symbol, error: 'NSE equity instrument not found in Upstox instrument master' });
    else candidates.push({ symbol, instrument });
  }

  // Keep concurrency bounded so a Nifty 500 scan does not overwhelm Upstox.
  const results = [];
  const concurrency = 5;
  for (let i = 0; i < candidates.length; i += concurrency) {
    const group = candidates.slice(i, i + concurrency);
    const groupResults = await Promise.all(group.map(item => scanSymbol(item.symbol, item.instrument, month, years, fromDate, toDate, token)));
    for (const item of groupResults) {
      if (item.error) errors.push(item.error);
      else if (item.average >= minAvg && item.positiveYears >= minPositive) results.push(item);
    }
  }

  results.sort((a, b) => b.average - a.average);
  return NextResponse.json({
    ok: true,
    source: 'Upstox historical candles',
    universe: universeName,
    month,
    years,
    completedMonthOnly: true,
    offset,
    limit,
    batchCount: batch.length,
    totalUniverse: symbols.length,
    scanned: batch.length,
    matched: results.length,
    results,
    errors
  });
}
