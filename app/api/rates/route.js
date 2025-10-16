import { NextResponse } from 'next/server';
import { fetchHyperliquidRates } from '@/lib/exchanges/hyperliquid';
import { fetchBinanceRates } from '@/lib/exchanges/binance';
import { fetchBybitRates } from '@/lib/exchanges/bybit';
import { fetchLighterRates } from '@/lib/exchanges/lighter';
import { fetchEdgeXRates } from '@/lib/exchanges/edgex';

export async function GET(request) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const minOpenInterest = parseFloat(searchParams.get('minOpenInterest')) || 0;
    
    // Fetch from all exchanges in parallel with open interest filtering
    const [
      hyperliquidRates,
      lighterRates,
      binanceRates,
      bybitRates,
      edgexRates
    ] = await Promise.allSettled([
      fetchHyperliquidRates(minOpenInterest),
      fetchLighterRates(minOpenInterest),
      fetchBinanceRates(),
      fetchBybitRates(),
      fetchEdgeXRates(minOpenInterest),
    ]);

    const allRates = [];

    // Only include successful results
    if (hyperliquidRates.status === 'fulfilled') allRates.push(...hyperliquidRates.value);
    // if (binanceRates.status === 'fulfilled') allRates.push(...binanceRates.value);
    // if (bybitRates.status === 'fulfilled') allRates.push(...bybitRates.value);
    if (lighterRates.status === 'fulfilled') allRates.push(...lighterRates.value);
    if (edgexRates.status === 'fulfilled') allRates.push(...edgexRates.value);

    // Optional: Log failures
    if (hyperliquidRates.status === 'rejected') console.error('Hyperliquid error:', hyperliquidRates.reason);
    if (binanceRates.status === 'rejected') console.error('Binance error:', binanceRates.reason);
    if (bybitRates.status === 'rejected') console.error('Bybit error:', bybitRates.reason);
    if (lighterRates.status === 'rejected') console.error('Lighter error:', lighterRates.reason);
    if (edgexRates.status === 'rejected') console.error('edgeX error:', edgexRates.reason);
    
    return NextResponse.json(allRates);
  } catch (error) {
    console.error('Unexpected error in /api/rates:', error);
    return NextResponse.json({ error: 'Failed to fetch rates' }, { status: 500 });
  }
}

export const revalidate = 0; // No caching – always fresh

// import { NextResponse } from 'next/server';
// import { fetchHyperliquidRates } from '@/lib/exchanges/hyperliquid';
// import { fetchBinanceRates } from '@/lib/exchanges/binance';
// import { fetchBybitRates } from '@/lib/exchanges/bybit';
// import { fetchLighterRates } from '@/lib/exchanges/lighter';

// export async function GET() {
//   try {
//     // Fetch from all exchanges in parallel
//     const [
//       hyperliquidRates,
//       lighterRates,
//       binanceRates,
//       bybitRates
//     ] = await Promise.allSettled([
//       fetchHyperliquidRates(),
//       fetchBinanceRates(),
//       fetchBybitRates(),
//       fetchLighterRates(),
//     ]);

//     const allRates = [];

//     // Only include successful results
//     if (hyperliquidRates.status === 'fulfilled') allRates.push(...hyperliquidRates.value);
//     if (binanceRates.status === 'fulfilled') allRates.push(...binanceRates.value);
//     if (bybitRates.status === 'fulfilled') allRates.push(...bybitRates.value);
//     if (lighterRates.status === 'fulfilled') allRates.push(...lighterRates.value);

//     // Optional: Log failures
//     if (hyperliquidRates.status === 'rejected') console.error('Hyperliquid error:', hyperliquidRates.reason);
//     if (binanceRates.status === 'rejected') console.error('Binance error:', binanceRates.reason);
//     if (bybitRates.status === 'rejected') console.error('Bybit error:', bybitRates.reason);
//     if (lighterRates.status === 'rejected') console.error('Lighter error:', lighterRates.reason);
//     return NextResponse.json(allRates);
//   } catch (error) {
//     console.error('Unexpected error in /api/rates:', error);
//     return NextResponse.json({ error: 'Failed to fetch rates' }, { status: 500 });
//   }
// }

// export const revalidate = 0; // No caching – always fresh

