import fs from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const token = process.env.UPSTOX_ANALYTICS_TOKEN;
if (!token) throw new Error('UPSTOX_ANALYTICS_TOKEN secret is required');

const NIFTY_URL = 'https://archives.nseindia.com/content/indices/ind_nifty500list.csv';
const INSTRUMENTS_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz';
const YEARS = Number(process.env.HISTORY_YEARS || 10);

function parseSymbols(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',').map(v => v.trim().toLowerCase());
  const idx = header.indexOf('symbol');
  if (idx < 0) throw new Error('Nifty 500 CSV has no Symbol column');
  return [...new Set(lines.slice(1).map(line => line.split(',')[idx]?.trim().toUpperCase()).filter(Boolean))];
}

function monthKey(timestamp) {
  const text = String(timestamp || '');
  return text.length >= 7 && text[4] === '-' ? text.slice(0, 7) : null;
}

async function getInstruments() {
  const r = await fetch(INSTRUMENTS_URL);
  if (!r.ok) throw new Error(`Instrument download failed: ${r.status}`);
  const records = JSON.parse(gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8'));
  const map = new Map();
  for (const x of records) {
    if (x?.segment === 'NSE_EQ' && ['EQ','BE'].includes(x?.instrument_type) && x?.trading_symbol && x?.instrument_key) {
      map.set(String(x.trading_symbol).toUpperCase(), x);
    }
  }
  return map;
}

async function getCandles(key, from, to) {
  const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(key)}/months/1/${to}/${from}`;
  const r = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Upstox ${r.status}`);
  return (await r.json())?.data?.candles ?? [];
}

const today = new Date();
const from = `${today.getUTCFullYear() - YEARS - 1}-01-01`;
const to = today.toISOString().slice(0, 10);
const symbols = parseSymbols(await (await fetch(NIFTY_URL, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/csv' } })).text());
if (symbols.length < 450) throw new Error(`Expected Nifty 500, got ${symbols.length}`);
const instruments = await getInstruments();

const out = { version: 1, source: 'Upstox', updatedAt: new Date().toISOString(), historyYears: YEARS, stocks: {} };
const errors = [];
for (let i = 0; i < symbols.length; i += 5) {
  const batch = symbols.slice(i, i + 5);
  const rows = await Promise.all(batch.map(async symbol => {
    const instrument = instruments.get(symbol);
    if (!instrument) return { symbol, error: 'instrument not found' };
    try {
      const candles = await getCandles(instrument.instrument_key, from, to);
      const monthly = {};
      for (const c of candles) {
        const key = monthKey(c[0]);
        const close = Number(c[4]);
        if (key && Number.isFinite(close)) monthly[key] = { close, timestamp: c[0] };
      }
      return { symbol, name: instrument.short_name || instrument.name || symbol, instrumentKey: instrument.instrument_key, monthly };
    } catch (error) {
      return { symbol, error: error.message };
    }
  }));
  for (const row of rows) {
    if (row.error) errors.push(row);
    else out.stocks[row.symbol] = row;
  }
  console.log(`Processed ${Math.min(i + 5, symbols.length)}/${symbols.length}`);
}
await fs.writeFile('data/monthly_prices.json', JSON.stringify(out));
console.log(`Saved ${Object.keys(out.stocks).length} stocks; ${errors.length} errors`);
if (errors.length) await fs.writeFile('data/refresh-errors.json', JSON.stringify(errors, null, 2));
