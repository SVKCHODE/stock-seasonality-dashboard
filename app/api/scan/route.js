import { NextResponse } from 'next/server';
import { getMonthlyCandles } from '../../../lib/upstox.js';

const UNIVERSES = {
  test10: ['RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','SBIN','ITC','DEEPINDS','AXISBANK','MARUTI']
};

const SEARCH_URL = 'https://api.upstox.com/v2/instruments/search';

function average(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values) { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }

// Upstox monthly candle timestamps represent the start of the candle in IST.
// Do NOT convert the timestamp to UTC before identifying its calendar month.
function monthKey(timestamp) {
  const text = String(timestamp ?? '');
  if (text.length >= 7 && text[4] === '-') return text.slice(0, 7);
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function previousMonthKey(year, month) {
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

async function findEquity(symbol, token) {
  const params = new URLSearchParams({ query: symbol, exchanges: 'NSE', segments: 'EQ', instrument_types: 'EQ', page_number: '1', records: '30' });
  const response = await fetch(`${SEARCH_URL}?${params}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!response.ok) throw new Error(`Instrument search failed: ${response.status}`);
  const body = await response.json();
  const exact = (body?.data ?? []).find(item => item.segment === 'NSE_EQ' && item.instrument_type === 'EQ' && item.trading_symbol === symbol);
  if (!exact) throw new Error(`NSE equity instrument not found for ${symbol}`);
  return exact;
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

export async function GET(request) {
  const token = process.env.UPSTOX_ANALYTICS_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: 'UPSTOX_ANALYTICS_TOKEN is not configured' }, { status: 500 });
  const { searchParams } = new URL(request.url);
  const month = Number(searchParams.get('month') ?? 7);
  const years = Number(searchParams.get('years') ?? 6);
  const minAvg = Number(searchParams.get('minAvg') ?? 0);
  const minPositive = Number(searchParams.get('minPositive') ?? 0);
  const universeName = searchParams.get('universe') ?? 'test10';
  const universe = UNIVERSES[universeName];
  if (!Number.isInteger(month) || month < 1 || month > 12) return NextResponse.json({ ok:false, error:'month must be 1-12' }, { status:400 });
  if (![3,5,6,10].includes(years)) return NextResponse.json({ ok:false, error:'years must be 3, 5, 6 or 10' }, { status:400 });
  if (!universe) return NextResponse.json({ ok:false, error:'Unknown universe' }, { status:400 });

  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear() - years - 1, today.getUTCMonth(), 1));
  const fromDate = from.toISOString().slice(0,10);
  const toDate = today.toISOString().slice(0,10);
  const results = [];
  const errors = [];

  for (const symbol of universe) {
    try {
      const instrument = await findEquity(symbol, token);
      const candles = await getMonthlyCandles(instrument.instrument_key, fromDate, toDate, token);
      const stats = calculateMonthSeasonality(candles, month, years, today);
      if (stats.average >= minAvg && stats.positiveYears >= minPositive) results.push({ symbol, name: instrument.short_name || instrument.name || symbol, instrumentKey: instrument.instrument_key, ...stats });
    } catch (error) { errors.push({ symbol, error: error.message }); }
  }
  results.sort((a, b) => b.average - a.average);
  return NextResponse.json({ ok: true, source: 'Upstox historical candles', universe: universeName, month, years, completedMonthOnly: true, scanned: universe.length, matched: results.length, results, errors });
}
