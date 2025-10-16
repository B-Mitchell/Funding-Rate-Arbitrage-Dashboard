import { toAPY } from '../calc';

export async function fetchBinanceRates() {
    const res = await fetch('https://fapi.binance.com/fapi/v1/premiumIndex', {
      next: { revalidate: 30 }
    });
  
    if (!res.ok) throw new Error('Binance API failed');
  
    const data = await res.json();
  
    return data
      .filter(item => item.symbol && item.symbol.endsWith('USDT'))
      .map(item => {
        const symbol = item.symbol.replace('USDT', '') + '-PERP';
        const ratePercent = parseFloat(item.lastFundingRate) * 100; // e.g., 0.0001 → 0.01%

        // Convert 8-hour rate to hourly rate for standardized APY calculation
        const hourlyRate = ratePercent / 8; // Binance uses 8-hour funding intervals
        const apy = toAPY(hourlyRate);

        return {
          exchange: 'Binance',
          symbol,
          rate: hourlyRate, // Store hourly rate for consistency
          apy,
          timestamp: new Date().toISOString(),
          interval: '8h' // Binance uses 8-hour funding intervals
        };
      });
  }