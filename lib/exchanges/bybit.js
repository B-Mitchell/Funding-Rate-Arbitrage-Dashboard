import { toAPY } from '../calc';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

export async function fetchBybitRates(minOpenInterest = 0) {
  const res = await fetchWithTimeout('https://api.bybit.com/v5/market/tickers?category=linear', {
    next: { revalidate: 30 }
  }, 20000);

  if (!res.ok) throw new Error('Bybit API failed');

  const data = await res.json();

  if (data.retCode !== 0) {
    throw new Error(`Bybit error: ${data.retMsg}`);
  }

  return data.result.list
    .filter(i => i.symbol && i.symbol.endsWith('USDT'))
    .map(i => {
      const symbol = i.symbol.replace('USDT', '') + '-PERP';
      const rawFundingRate = parseFloat(i.fundingRate || 0); // 8h decimal
      const hourlyRate = rawFundingRate / 8; // Convert to hourly decimal

      const oiContracts = parseFloat(i.openInterest) || 0;
      const oiValue = parseFloat(i.openInterestValue) || 0;

      const markPrice = parseFloat(i.markPrice || 0);
      const indexPrice = parseFloat(i.indexPrice || 0);
      const lastPrice = parseFloat(i.lastPrice || 0);
      const referencePrice = [markPrice, indexPrice, lastPrice].find(
        price => Number.isFinite(price) && price > 0
      ) || 0;

      const openInterestUsd = oiValue > 0 ? oiValue : oiContracts * referencePrice;

      return {
        exchange: 'Bybit',
        symbol,
        rate: rawFundingRate,
        apy: toAPY(hourlyRate),
        openInterest: openInterestUsd,
        openInterestContracts: oiContracts,
        price: referencePrice,
        markPrice,
        indexPrice,
        lastPrice,
        timestamp: new Date().toISOString(),
        interval: '8h' // Bybit uses 8-hour funding intervals
      };
    })
    .filter(r => minOpenInterest === 0 || r.openInterest >= minOpenInterest);
}