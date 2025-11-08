import { fetchWithTimeout } from './utils/fetchWithTimeout';

/**
 * Calculate CVD over a specific timeframe using Bybit kline data
 * This gives more stable and meaningful CVD values than using raw trades
 * 
 * @param {string} symbol - e.g., "BTCUSDT"
 * @param {string} interval - Kline interval: "1" (1min), "5" (5min), "15" (15min), "60" (1hr)
 * @param {number} limit - Number of candles to analyze (default: 100)
 * @returns {Promise<number>} CVD value in millions
 */
export async function getRealCVD(symbol, interval = '15', limit = 100) {
  try {
    const endTime = Date.now();
    const startTime = endTime - (getIntervalMs(interval) * limit);

    const res = await fetchWithTimeout(
      `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&start=${startTime}&end=${endTime}&limit=${limit}`,
      {},
      20000
    );
    
    if (!res.ok) {
      console.error(`Bybit kline API error for ${symbol}: ${res.status} ${res.statusText}`);
      return 0;
    }

    const json = await res.json();

    if (json.retCode !== 0 || !json.result?.list?.length) {
      console.warn(`No kline data for ${symbol}: ${json.retMsg || 'Unknown error'}`);
      return 0;
    }

    // Calculate CVD from volume-weighted price movement
    // Kline structure: [startTime, open, high, low, close, volume, turnover]
    let cumulativeDelta = 0;

    for (const candle of json.result.list) {
      const [, open, high, low, close, volume] = candle.map(parseFloat);
      
      // Determine buying vs selling pressure based on close vs open
      const closeVsOpen = close - open;
      const range = high - low;
      
      if (range === 0) continue; // skip if no price movement
      
      // Calculate delta: positive close = buyers won, negative = sellers won
      // Weight by volume and normalize by range
      const delta = (closeVsOpen / range) * volume;
      cumulativeDelta += delta;
    }

    // Convert to millions and normalize
    const cvd = cumulativeDelta / 1e6;

    console.log(`CVD (${symbol}, ${interval}m, ${json.result.list.length} candles): ${cvd.toFixed(2)}M`);

    return cvd;
  } catch (error) {
    console.error(`Error fetching CVD for ${symbol}:`, error.message);
    return 0;
  }
}

/**
 * Alternative: Calculate CVD from recent trades (last N trades snapshot)
 * Less stable but more real-time
 */
export async function getRealCVDFromTrades(symbol, limit = 1000) {
  try {
    const res = await fetchWithTimeout(
      `https://api.bybit.com/v5/market/trades?category=linear&symbol=${symbol}&limit=${limit}`,
      {},
      20000
    );
    
    if (!res.ok) {
      console.error(`Bybit trades API error for ${symbol}: ${res.status} ${res.statusText}`);
      return 0;
    }

    const json = await res.json();

    if (json.retCode !== 0 || !json.result?.list?.length) {
      console.warn(`No trades for ${symbol}: ${json.retMsg || 'Unknown error'}`);
      return 0;
    }

    let buyVolume = 0;
    let sellVolume = 0;

    for (const trade of json.result.list) {
      const size = parseFloat(trade.size || 0);
      if (trade.side === 'Buy') buyVolume += size;
      else if (trade.side === 'Sell') sellVolume += size;
    }

    const cvd = (buyVolume - sellVolume) / 1e6;

    console.log(`CVD from trades (${symbol}): buys=${buyVolume.toFixed(2)}, sells=${sellVolume.toFixed(2)}, cvd=${cvd.toFixed(2)}M`);

    return cvd;
  } catch (error) {
    console.error(`Error fetching CVD for ${symbol}:`, error.message);
    return 0;
  }
}

/**
 * Get interval in milliseconds
 */
function getIntervalMs(interval) {
  const intervals = {
    '1': 60 * 1000,           // 1 minute
    '3': 3 * 60 * 1000,       // 3 minutes
    '5': 5 * 60 * 1000,       // 5 minutes
    '15': 15 * 60 * 1000,     // 15 minutes
    '30': 30 * 60 * 1000,     // 30 minutes
    '60': 60 * 60 * 1000,     // 1 hour
    '120': 120 * 60 * 1000,   // 2 hours
    '240': 240 * 60 * 1000,   // 4 hours
    '360': 360 * 60 * 1000,   // 6 hours
    '720': 720 * 60 * 1000,   // 12 hours
    'D': 24 * 60 * 60 * 1000, // 1 day
  };
  return intervals[interval] || intervals['15']; // default to 15min
}

/**
 * Calculate CVD with momentum (comparing current vs previous period)
 * Returns both current CVD and momentum indicator
 */
export async function getCVDWithMomentum(symbol, interval = '15', limit = 100) {
  try {
    const currentCVD = await getRealCVD(symbol, interval, limit);
    
    // Get previous period (double the limit to get historical comparison)
    const prevCVD = await getRealCVD(symbol, interval, limit * 2);
    
    const momentum = currentCVD - (prevCVD / 2); // rough momentum estimate
    
    return {
      cvd: currentCVD,
      momentum,
      isAccelerating: momentum > 0
    };
  } catch (error) {
    console.error(`Error calculating CVD momentum for ${symbol}:`, error.message);
    return { cvd: 0, momentum: 0, isAccelerating: false };
  }
}
