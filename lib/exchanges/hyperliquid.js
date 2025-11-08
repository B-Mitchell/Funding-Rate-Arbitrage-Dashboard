import { toAPY } from '../calc';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

const HYPERLIQUID_API = 'https://api.hyperliquid.xyz/info';

export async function fetchHyperliquidRates(minOpenInterest = 0) {
  const rates = [];
  
  try {
    const res = await fetchWithTimeout(HYPERLIQUID_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' })
    }, 20000);
    
    const data = await res.json();
    
    if (!data || data.length < 2) {
      console.error('Invalid Hyperliquid response');
      return [];
    }
    
    const [meta, assetCtxs] = data;
    
    // Loop through all markets
    meta.universe.forEach((market, index) => {
      const ctx = assetCtxs[index];
      if (ctx && ctx.funding) {
        // Hyperliquid funding is hourly decimal
        const hourlyRate = parseFloat(ctx.funding) || 0;

        const rawOi = parseFloat(ctx.openInterest) || 0;
        const oiUsdField = parseFloat(ctx.openInterestUsd || ctx.openInterestNotional || 0);
        const indexPrice = parseFloat(ctx.indexPrice || 0);
        const oraclePrice = parseFloat(market.oraclePrice || 0);
        const impactPrice = parseFloat(market.impactPrice || 0);
        const referencePrice = [indexPrice, oraclePrice, impactPrice].find(
          price => Number.isFinite(price) && price > 0
        ) || 0;
        const openInterest =
          oiUsdField > 0
            ? oiUsdField
            : referencePrice > 0
            ? rawOi * referencePrice
            : rawOi;

        // Filter by minimum open interest if specified
        if (minOpenInterest > 0 && openInterest < minOpenInterest) {
          return; // Skip this asset
        }
        
        rates.push({
          exchange: 'Hyperliquid',
          symbol: market.name,
          rate: hourlyRate,
          apy: toAPY(hourlyRate),
          openInterest: openInterest,
          openInterestContracts: rawOi,
          price: referencePrice,
          indexPrice,
          oraclePrice,
          impactPrice,
          timestamp: new Date().toISOString(),
          interval: '1h'
        });
      }
    });
  } catch (error) {
    console.error('Error fetching Hyperliquid rates:', error);
  }
  
  return rates;
}