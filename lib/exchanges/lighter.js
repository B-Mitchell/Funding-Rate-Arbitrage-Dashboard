import { toAPY } from '../calc';

/**
 * Fetch funding rates from Lighter exchange
 * 
 * According to Lighter docs:
 * - Funding occurs every hour
 * - Rate is clamped between -0.5% and +0.5%
 * - Rate calculation: (premium / 8) + interestRateComponent
 * - Premium is time-weighted average over the last hour
 */
export async function fetchLighterRates(minOpenInterest = 0) {
  try {
    const res = await fetch('https://mainnet.zklighter.elliot.ai/api/v1/funding-rates', {
      next: { revalidate: 30 }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    if (!Array.isArray(data.funding_rates)) {
      throw new Error('Unexpected response format');
    }

    return data.funding_rates
      .filter(item => 
        item.exchange === 'lighter' && 
        item.symbol && 
        typeof item.rate === 'number'
      )
      .map(item => {
        // According to Lighter docs: funding rate is hourly and clamped [-0.5%, +0.5%]
        // The API should return the rate in percentage format (e.g., 0.01 for 0.01%)
        // If the rate is in decimal format, we need to convert it
        let hourlyRatePercent;
        
        // Check if rate is in decimal format (typical range: -0.005 to 0.005 for ±0.5%)
        if (Math.abs(item.rate) <= 0.01) {
          // Rate appears to be in decimal format, convert to percentage
          hourlyRatePercent = item.rate * 100;
        } else {
          // Rate appears to already be in percentage format
          hourlyRatePercent = item.rate;
        }
        
        // Note: Lighter API doesn't provide open interest data yet
        // For now, we'll include all assets but mark openInterest as null
        // This allows the filtering to work when OI data becomes available
        
        return {
          exchange: 'Lighter',
          symbol: `${item.symbol}-PERP`,
          rate: hourlyRatePercent, // Store as percentage for consistency with other exchanges
          apy: toAPY(hourlyRatePercent), // toAPY expects percentage input
          openInterest: null, // No OI data available from Lighter API yet
          timestamp: new Date().toISOString(),
          interval: '1h'
        };
      })
      .filter(item => {
        // If minOpenInterest is set and we don't have OI data, include the asset
        // This ensures Lighter assets aren't filtered out due to missing OI data
        if (minOpenInterest > 0 && item.openInterest === null) {
          return true; // Include Lighter assets even without OI data
        }
        return minOpenInterest === 0 || (item.openInterest && item.openInterest >= minOpenInterest);
      });
  } catch (err) {
    console.error('Lighter fetch error:', err);
    return [];
  }
}