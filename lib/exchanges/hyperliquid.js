import { toAPY } from '../calc';

const HYPERLIQUID_API = 'https://api.hyperliquid.xyz/info';

export async function fetchHyperliquidRates(minOpenInterest = 0) {
  const rates = [];
  
  try {
    const res = await fetch(HYPERLIQUID_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' })
    });
    
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
        // Hyperliquid funding is hourly already
        const hourlyRate = parseFloat(ctx.funding);
        
        // Get open interest (in USD)
        const openInterest = parseFloat(ctx.openInterest) || 0;
        
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