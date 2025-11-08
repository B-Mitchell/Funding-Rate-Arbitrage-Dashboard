import { toAPY } from '../calc';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

export async function fetchBinanceRates(minOpenInterest = 0) {
  const [fundingRes, oiRes] = await Promise.allSettled([
    fetchWithTimeout('https://fapi.binance.com/fapi/v1/premiumIndex', {
      next: { revalidate: 30 }
    }, 20000),
    fetchWithTimeout('https://fapi.binance.com/fapi/v1/openInterest', {
      next: { revalidate: 30 }
    }, 20000)
  ]);

  if (fundingRes.status !== 'fulfilled' || !fundingRes.value.ok) {
    throw new Error('Binance funding API failed');
  }

  if (oiRes.status !== 'fulfilled' || !oiRes.value.ok) {
    console.warn('Binance OI API failed – proceeding with zero open interest');
  }

  const funding = await fundingRes.value.json();
  const oiData = oiRes.status === 'fulfilled' && oiRes.value.ok ? await oiRes.value.json() : [];

  // Build OI map: symbol → { contracts, markPrice }
  // Binance /fapi/v1/openInterest returns OI in CONTRACTS, not USD
  // We need to multiply by mark price to get USD value
  const oiMap = {};
  if (Array.isArray(oiData)) {
    oiData.forEach(item => {
      oiMap[item.symbol] = {
        contracts: parseFloat(item.openInterest) || 0,
        // Mark price will be matched from funding data
      };
    });
  }

  return funding
    .filter(i => i.symbol && i.symbol.endsWith('USDT'))
    .map(i => {
      const symbol = i.symbol.replace('USDT', '') + '-PERP';
      const rawFundingRate = parseFloat(i.lastFundingRate) || 0; // 8h funding in decimal
      const hourlyRate = rawFundingRate / 8; // convert to hourly decimal

      const oiInfo = oiMap[i.symbol];
      const oiContracts = oiInfo?.contracts || 0;

      const markPrice = parseFloat(i.markPrice || 0);
      const indexPrice = parseFloat(i.indexPrice || 0);
      const lastPrice = parseFloat(i.lastPrice || 0);
      const referencePrice = [markPrice, indexPrice, lastPrice].find(
        price => Number.isFinite(price) && price > 0
      ) || 0;

      const openInterestUsd = oiContracts * referencePrice;

      return {
        exchange: 'Binance',
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
        interval: '8h'
      };
    })
    .filter(r => minOpenInterest === 0 || r.openInterest >= minOpenInterest);
}