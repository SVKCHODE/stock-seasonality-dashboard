import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import marketData from '../../../data/monthly_prices.json';

const TEST10 = ['RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','SBIN','ITC','DEEPINDS','AXISBANK','MARUTI'];
const SUPPORTED_UNIVERSES = ['test10', 'nifty50', 'niftynext50', 'nifty500', 'allnse'];
const DATA_DIR = path.join(process.cwd(), 'data');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const UNIVERSE_DIR = path.join(DATA_DIR, 'universes');

function average(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values) { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function previousMonthKey(year, month) { return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`; }

function calculateMonthSeasonality(stock, month, years, now = new Date()) {
  const closes = stock.monthly || {};
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const latestCompletedYear = currentMonth === month ? currentYear - 1 : currentYear;
  const returns = [];
  const maxYears = years > 0 ? years : Number.MAX_SAFE_INTEGER;

  for (let year = latestCompletedYear; year >= 1900 && returns.length < maxYears; year -= 1) {
    const selectedKey = `${year}-${String(month).padStart(2, '0')}`;
    const previousKey = previousMonthKey(year, month);
    const current = closes[selectedKey];
    const previous = closes[previousKey];
    if (current && previous && Number.isFinite(current.close) && Number.isFinite(previous.close) && previous.close !== 0) {
      returns.push({ year, previousMonth: previousKey, selectedMonth: selectedKey, previousMonthClose: previous.close, monthClose: current.close, returnPct: ((current.close / previous.close) - 1) * 100, sourcePreviousTimestamp: previous.timestamp, sourceSelectedTimestamp: current.timestamp });
    }
  }

  const values = returns.map(item => item.returnPct);
  if (!values.length) return null;
  return { yearsAvailable: returns.length, average: average(values), positiveYears: values.filter(value => value > 0).length, median: median(values), best: Math.max(...values), worst: Math.min(...values), yearlyReturns: returns };
}

function loadUniverse(universeName) {
  if (universeName === 'test10') return TEST10;
  const file = path.join(UNIVERSE_DIR, `${universeName}.json`);
  if (!fs.existsSync(file)) return [];
  try { const parsed = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(parsed.stocks) ? parsed.stocks : []; } catch { return []; }
}

function loadHistory(symbol) {
  const file = path.join(HISTORY_DIR, `${symbol}.json`);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function loadStock(symbol, universeName) { return universeName === 'test10' ? marketData.stocks?.[symbol] || null : loadHistory(symbol); }

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const month = Number(searchParams.get('month') ?? 7);
  const years = Number(searchParams.get('years') ?? 0);
  const minAvg = Number(searchParams.get('minAvg') ?? 0);
  const recentConsecutive = Math.max(1, Number(searchParams.get('recentConsecutive') ?? 4));
  const minPositive = Number(searchParams.get('minPositive') ?? 0);
  const universeName = searchParams.get('universe') ?? 'test10';
  const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));
  const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? 500)));

  if (!Number.isInteger(month) || month < 1 || month > 12) return NextResponse.json({ ok:false, error:'month must be 1-12' }, { status:400 });
  if (!Number.isInteger(years) || years < 0) return NextResponse.json({ ok:false, error:'years must be 0 (maximum available) or a positive integer' }, { status:400 });
  if (!Number.isFinite(minAvg) || !Number.isFinite(recentConsecutive)) return NextResponse.json({ ok:false, error:'invalid screening parameters' }, { status:400 });
  if (!SUPPORTED_UNIVERSES.includes(universeName)) return NextResponse.json({ ok:false, error:'Unknown universe' }, { status:400 });

  const allSymbols = loadUniverse(universeName);
  if (universeName !== 'test10' && allSymbols.length === 0) return NextResponse.json({ ok:false, error:`${universeName} universe dataset is not populated in this deployment.` }, { status:503 });
  if (universeName === 'nifty500' && allSymbols.length < 450) return NextResponse.json({ ok:false, error:`Nifty 500 universe is incomplete (${allSymbols.length} stocks available).` }, { status:503 });

  const batch = allSymbols.slice(offset, offset + limit);
  const results = [];
  const errors = [];
  for (const symbol of batch) {
    const stock = loadStock(symbol, universeName);
    if (!stock) { errors.push({ symbol, error:'No historical data stored' }); continue; }
    const stats = calculateMonthSeasonality(stock, month, years);
    if (!stats) { errors.push({ symbol, error:`No completed ${month}-month history` }); continue; }

    // The consecutive-years rule is based on the most recent available
    // observations, not on a streak found somewhere inside the lookback window.
    // A stock must have at least N available observations to satisfy an N-year rule.
    const recentReturns = stats.yearlyReturns.slice(0, recentConsecutive);
    const recentConsecutiveMet = recentReturns.length === recentConsecutive && recentReturns.every(item => item.returnPct >= minAvg);
    const qualifyingYears = stats.yearlyReturns.filter(item => item.returnPct >= minAvg).length;

    if (stats.average >= minAvg && recentConsecutiveMet) {
      results.push({
        symbol,
        name: stock.name || symbol,
        instrumentKey: stock.instrumentKey,
        qualifyingYears,
        recentYearsChecked: recentReturns.length,
        recentConsecutiveMet: recentConsecutiveMet ? recentConsecutive : 0,
        recentReturns,
        ...stats
      });
    }
  }

  results.sort((a, b) => b.average - a.average);
  return NextResponse.json({
    ok:true,
    source: universeName === 'test10' ? (marketData.source || 'Stored monthly dataset') : 'Upstox historical monthly files',
    dataUpdatedAt: universeName === 'test10' ? marketData.updatedAt : null,
    historyYears: universeName === 'test10' ? marketData.historyYears : 10,
    universe: universeName,
    month,
    years,
    completedMonthOnly:true,
    minAvg,
    recentConsecutive,
    offset,
    limit,
    batchCount:batch.length,
    totalUniverse:allSymbols.length,
    scanned:batch.length,
    matched:results.length,
    results,
    errors
  });
}
