import { toAPY } from '../calc';

export async function fetchBybitRates() {
    const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear', {
      next: { revalidate: 30 }
    });
  
    if (!res.ok) throw new Error('Bybit API failed');
  
    const data = await res.json();
  
    if (data.retCode !== 0) {
      throw new Error(`Bybit error: ${data.retMsg}`);
    }
  
    return data.result.list
      .filter(item => item.symbol && item.symbol.endsWith('USDT'))
      .map(item => {
        const symbol = item.symbol.replace('USDT', '') + '-PERP';
        const ratePercent = parseFloat(item.fundingRate || 0) * 100;

        // Convert 8-hour rate to hourly rate for standardized APY calculation
        const hourlyRate = ratePercent / 8; // Bybit uses 8-hour funding intervals
        const apy = toAPY(hourlyRate);

        return {
          exchange: 'Bybit',
          symbol,
          rate: hourlyRate, // Store hourly rate for consistency
          apy,
          timestamp: new Date().toISOString(),
          interval: '8h' // Bybit uses 8-hour funding intervals
        };
      });
  }