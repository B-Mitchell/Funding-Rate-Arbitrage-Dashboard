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
  
        const hourlyRate = ratePercent / 100;
        const apy = (Math.pow(1 + hourlyRate, 24 * 365) - 1) * 100;
  
        return {
          exchange: 'Bybit',
          symbol,
          rate: ratePercent,
          apy
        };
      });
  }