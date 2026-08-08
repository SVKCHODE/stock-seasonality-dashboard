import { NextResponse } from 'next/server';
import marketData from '../../../data/monthly_prices.json';

const TEST10 = ['RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','SBIN','ITC','DEEPINDS','AXISBANK','MARUTI'];

function average(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values) { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function previousMonthKey(year, month) { return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`; }

function calculateMonthSeasonality(stock, month, years, now = new Date()) {
  const closes = stock.monthly || {};
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const latestCompletedYear = currentMonth === month ? currentYear - 1 : currentYear;
  const returns = [];

  for (let year = latestCompletedYear; year > latestCompletedYear - years; year -= 1) {
    const selectedKey = `${year}-${String(month).padStart(2, '0')}`;
    const previousKey = previousMonthKey(year, month);
    const current = closes[selectedKey];
    const previous = closes[previousKey];
    if (current && previous && Number.isFinite(current.close) && Number.isFinite(previous.close) && previous.close !== 0) {
      returns.push({
        year,
        previousMonth: previousKey,
        selectedMonth: selectedKey,
        previousMonthClose: previous.close,
        monthClose: current.close,
        returnPct: ((current.close / previous.close) - 1) * 100,
        sourcePreviousTimestamp: previous.timestamp,
        sourceSelectedTimestamp: current.timestamp
      });
    }
  }

  const values = returns.map(item => item.returnPct);
  if (!values.length) return null;
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
  const { searchParams } = new URL(request.url);
  const month = Number(searchParams.get('month') ?? 7);
  const years = Number(searchParams.get('years') ?? 6);
  const minAvg = Number(searchParams.get('minAvg') ?? 0);
  const minPositive = Number(searchParams.get('minPositive') ?? 0);
  const universeName = searchParams.get('universe') ?? 'test10';
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));
  const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? (universeName === 'nifty500' ? 500 : 10))));

  if (!Number.isInteger(month) || month < 1 || month > 12) return NextResponse.json({ ok:false, error:'month must be 1-12' }, { status:400 });
  if (![3,5,6,10].includes(years)) return NextResponse.json({ ok:false, error:'years must be 3, 5, 6 or 10' }, { status:400 });
  if (!Number.isFinite(offset) || !Number.isFinite(limit)) return NextResponse.json({ ok:false, error:'invalid batch parameters' }, { status:400 });
  if (!['test10', 'nifty500'].includes(universeName)) return NextResponse.json({ ok:false, error:'Unknown universe' }, { status:400 });

  const allSymbols = universeName === 'nifty500' ? Object.keys(marketData.stocks || {}) : TEST10;
  if (universeName === 'nifty500' && allSymbols.length < 450) {
    return NextResponse.json({ ok:false, error:`Nifty 500 historical dataset is not populated yet (${allSymbols.length} stocks available). Run the GitHub Actions data refresh first.` }, { status:503 });
  }

  const batch = allSymbols.slice(offset, offset + limit);
  const results = [];
  const errors = [];
  for (const symbol of batch) {
    const stock = marketData.stocks?.[symbol];
    if (!stock) { errors.push({ symbol, error:'No historical data stored' }); continue; }
    const stats = calculateMonthSeasonality(stock, month, years);
    if (!stats) { errors.push({ symbol, error:`Not enough completed ${month}-month history` }); continue; }
    if (stats.average >= minAvg && stats.positiveYears >= minPositive) results.push({ symbol, name: stock.name || symbol, instrumentKey: stock.instrumentKey, ...stats });
  }

  results.sort((a, b) => b.average - a.average);
  return NextResponse.json({
    ok: true,
    source: marketData.source || 'Stored monthly dataset',
    dataUpdatedAt: marketData.updatedAt,
    historyYears: marketData.historyYears,
    universe: universeName,
    month,
    years,
    completedMonthOnly: true,
    offset,
    limit,
    batchCount: batch.length,
    totalUniverse: allSymbols.length,
    scanned: batch.length,
    matched: results.length,
    results,
    errors
  });
}
