import { toAPY } from '../calc';
import WebSocket from 'ws';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

// 1. CACHE OI SO WE HIT WEBSOCKET ONLY ONCE PER MINUTE
let oiCache = {};
let oiTimestamp = 0;

// 2. FETCH OPEN INTEREST VIA WEBSOCKET (9 lines)
async function updateOI() {
  return new Promise((resolve) => {
    const ws = new WebSocket('wss://mainnet.zklighter.elliot.ai/ws');
    const needed = ['BTC', 'ETH', 'SOL', 'DOGE', 'PEPE'];
    
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: "subscribe",
        channels: needed.map((s, i) => `market_stats:${i}`)
      }));
    });
    
    ws.on('message', (data) => {
      const d = JSON.parse(data.toString());
      if (d.type === 'update/market_stats') {
        const symbol = needed[d.market_stats.market_id];
        if (symbol) {
          oiCache[symbol] = parseFloat(d.market_stats.open_interest) * (d.market_stats.index_price || 65000);
        }
        if (Object.keys(oiCache).length >= needed.length) {
          ws.close();
          oiTimestamp = Date.now();
          resolve();
        }
      }
    });
    
    ws.on('error', (error) => {
      console.error('Lighter WebSocket error:', error);
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch (e) {
        // Ignore errors when closing
      }
      resolve();
    });
    
    ws.on('close', () => {
      resolve();
    });
    
    setTimeout(() => {
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch (e) {
        // Ignore errors when closing
      }
      resolve();
    }, 10000); // Increased from 3s to 10s for slower connections
  });
}

// 3. MAIN FUNCTION (your original + OI)
export async function fetchLighterRates(minOpenInterest = 0) {
  // Refresh OI every 55 seconds
  if (Date.now() - oiTimestamp > 55_000) {
    await updateOI();
  }

  const res = await fetchWithTimeout('https://mainnet.zklighter.elliot.ai/api/v1/funding-rates', { 
    next: { revalidate: 30 } 
  }, 20000);
  
  if (!res.ok) return [];

  const { funding_rates } = await res.json();
  if (!Array.isArray(funding_rates)) return [];

  const symbolMap = { 0: 'BTC', 1: 'ETH', 2: 'SOL', 3: 'DOGE', 4: 'PEPE' };

  return funding_rates
    .filter(r => r.exchange === 'lighter' && symbolMap[r.market_id])
    .map(r => {
      const sym = symbolMap[r.market_id];
      
      const ratePct = Math.abs(r.rate) <= 0.01 ? r.rate * 100 : r.rate; // decimal → %
      
      // Filter by open interest if specified
      const openInterest = oiCache[sym] || null;
      if (minOpenInterest > 0 && openInterest !== null && openInterest < minOpenInterest) {
        return null; // Filter out
      }
      
      return {
        exchange: 'Lighter',
        symbol: `${sym}-PERP`,
        rate: ratePct, // Store as decimal (0.01 = 1% hourly) for consistency
        apy: toAPY(ratePct),
        openInterest: openInterest,
        timestamp: new Date().toISOString(),
        interval: '1h'
      };
    })
    .filter(item => item !== null); // Remove filtered items
}
