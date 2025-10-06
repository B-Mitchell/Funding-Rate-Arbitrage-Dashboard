import { toAPY } from '../calc';

export async function fetchLighterRates() {
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
        const hourlyRatePercent = item.rate * 100;
        return {
          exchange: 'Lighter',
          symbol: `${item.symbol}-PERP`,
          rate: hourlyRatePercent,
          apy: toAPY(hourlyRatePercent),
          timestamp: new Date().toISOString(),
          interval: '1h'
        };
      });
  } catch (err) {
    console.error('Lighter fetch error:', err);
    return [];
  }
}