const NSE_NIFTY500_URL = 'https://archives.nseindia.com/content/indices/ind_nifty500list.csv';

let cachedStocks = null;

function parseCsvSymbols(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) throw new Error('NIFTY 500 CSV was empty');
  const header = lines[0].replace(/^\uFEFF/, '').split(',').map(v => v.trim().toLowerCase());
  const symbolIndex = header.findIndex(v => v === 'symbol');
  if (symbolIndex < 0) throw new Error('NIFTY 500 CSV does not contain a Symbol column');
  return lines.slice(1).map(line => line.split(',')[symbolIndex]?.trim().toUpperCase()).filter(Boolean);
}

export async function getNifty500Symbols() {
  if (cachedStocks?.length) return cachedStocks;
  const response = await fetch(NSE_NIFTY500_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/csv' },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`NSE NIFTY 500 list request failed: ${response.status}`);
  const symbols = parseCsvSymbols(await response.text());
  if (symbols.length < 450) throw new Error(`NSE NIFTY 500 list returned only ${symbols.length} symbols`);
  cachedStocks = [...new Set(symbols)];
  return cachedStocks;
}

export function getNifty500Batch(symbols, offset = 0, limit = 50) {
  return symbols.slice(offset, offset + limit);
}
