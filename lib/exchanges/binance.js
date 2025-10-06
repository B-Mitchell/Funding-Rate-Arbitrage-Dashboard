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
  
        // APY calculation (same as your frontend)
        const hourlyRate = ratePercent / 100;
        const apy = (Math.pow(1 + hourlyRate, 24 * 365) - 1) * 100;
  
        return {
          exchange: 'Binance',
          symbol,
          rate: ratePercent,
          apy
        };
      });
  }