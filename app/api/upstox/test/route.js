import { NextResponse } from 'next/server';
import { getMonthlyCandles } from '../../../../lib/upstox.js';

export async function GET() {
  const token = process.env.UPSTOX_ANALYTICS_TOKEN;
  const instrumentKey = process.env.TEST_UPSTOX_INSTRUMENT_KEY;
  if (!token || !instrumentKey) {
    return NextResponse.json({ ok:false, error:'Upstox test credentials are not configured.' }, { status:500 });
  }
  try {
    const to = new Date().toISOString().slice(0,10);
    const fromDate = new Date();
    fromDate.setFullYear(fromDate.getFullYear()-5);
    const from = fromDate.toISOString().slice(0,10);
    const candles = await getMonthlyCandles(instrumentKey, from, to, token);
    return NextResponse.json({ ok:true, candlesReturned:candles.length, first:candles[0] ?? null, last:candles.at(-1) ?? null });
  } catch (error) {
    return NextResponse.json({ ok:false, error:error.message }, { status:502 });
  }
}
