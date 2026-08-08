import { NextResponse } from 'next/server';
import { getMonthlyCandles } from '../../../../lib/upstox.js';

// Fixed NSE equity used only to verify the deployed Upstox connection.
// Upstox's V3 historical API accepts NSE equity instrument keys in this format.
const TEST_INSTRUMENT_KEY = 'NSE_EQ|INE848E01016';

export async function GET() {
  const token = process.env.UPSTOX_ANALYTICS_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'UPSTOX_ANALYTICS_TOKEN is not configured.' }, { status: 500 });
  }

  try {
    const to = new Date().toISOString().slice(0, 10);
    const fromDate = new Date();
    fromDate.setFullYear(fromDate.getFullYear() - 5);
    const from = fromDate.toISOString().slice(0, 10);
    const candles = await getMonthlyCandles(TEST_INSTRUMENT_KEY, from, to, token);

    return NextResponse.json({
      ok: true,
      message: 'Upstox historical data connection successful.',
      instrumentKey: TEST_INSTRUMENT_KEY,
      candlesReturned: candles.length,
      first: candles[0] ?? null,
      last: candles.at(-1) ?? null
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }
}
