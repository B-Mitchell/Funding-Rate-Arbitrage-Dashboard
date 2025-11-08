import { getCVDWithMomentum } from '@/lib/cvd';

export async function GET() {
  try {
    const { fetchHyperliquidRates } = await import('@/lib/exchanges/hyperliquid');
    const { fetchBinanceRates } = await import('@/lib/exchanges/binance');
    const { fetchBybitRates } = await import('@/lib/exchanges/bybit');

    const [hyperliquidRates, binanceRates, bybitRates] = await Promise.allSettled([
      fetchHyperliquidRates(0),
      fetchBinanceRates(),
      fetchBybitRates(),
    ]);

    const rates = [];
    if (hyperliquidRates.status === 'fulfilled') rates.push(...hyperliquidRates.value);
    if (binanceRates.status === 'fulfilled') rates.push(...binanceRates.value);
    if (bybitRates.status === 'fulfilled') rates.push(...bybitRates.value);

    if (hyperliquidRates.status === 'rejected') {
      console.error('Hyperliquid error:', hyperliquidRates.reason);
    }
    if (binanceRates.status === 'rejected') {
      console.error('Binance error:', binanceRates.reason);
    }
    if (bybitRates.status === 'rejected') {
      console.error('Bybit error:', bybitRates.reason);
    }

    const MAX_SYMBOLS = 100;

    // Aggregate open interest per symbol to prioritize most liquid names
    const symbolOI = new Map();
    rates.forEach(r => {
      const sym = r.symbol.replace('-PERP', '').trim();
      symbolOI.set(sym, (symbolOI.get(sym) || 0) + (r.openInterest || 0));
    });

    const uniqueSymbols = Array.from(symbolOI.entries())
      .sort(([, oiA], [, oiB]) => oiB - oiA)
      .slice(0, MAX_SYMBOLS)
      .map(([sym]) => sym);

    // Fetch CVD (now only for top 100)
    const cvdPromises = uniqueSymbols.map(sym =>
      getCVDWithMomentum(`${sym}USDT`, '15', 100).catch(err => {
        console.warn(`CVD momentum failed for ${sym}:`, err.message);
        return { cvd: 0, momentum: 0, isAccelerating: false };
      })
    );
    const cvdValues = await Promise.all(cvdPromises);
    const cvdMap = Object.fromEntries(uniqueSymbols.map((s, i) => [s, cvdValues[i]]));

    // Group by symbol (only top 100 processed)
    const bySymbol = {};

    rates.forEach(r => {
      const sym = r.symbol.replace('-PERP', '').trim();
      if (!uniqueSymbols.includes(sym)) return;

      const cvdData = cvdMap[sym] || { cvd: 0, momentum: 0, isAccelerating: false };
      const { cvd, momentum = 0, isAccelerating = false } = cvdData;
      const interval = r.interval || '8h';
      const rateRaw = r.rate ?? 0;
      const oi = r.openInterest || 0;

      if (!bySymbol[sym]) {
        bySymbol[sym] = {
          symbol: sym,
          totalRate: 0,
          rateCount: 0,
          weightedRateSum: 0,
          priceSum: 0,
          priceCount: 0,
          weightedPriceSum: 0,
          totalWeight: 0,
          totalOI: 0,
          exchanges: new Set(),
          breakdown: [],
          cvd,
          momentum,
          isAccelerating,
        };
      }

      const price = Number.isFinite(r.price) ? r.price : 0;
      const markPrice = Number.isFinite(r.markPrice) ? r.markPrice : null;
      const indexPrice = Number.isFinite(r.indexPrice) ? r.indexPrice : null;
      const lastPrice = Number.isFinite(r.lastPrice) ? r.lastPrice : null;
      const oraclePrice = Number.isFinite(r.oraclePrice) ? r.oraclePrice : null;
      const impactPrice = Number.isFinite(r.impactPrice) ? r.impactPrice : null;
      const openInterestContracts = Number.isFinite(r.openInterestContracts)
        ? r.openInterestContracts
        : null;

      bySymbol[sym].totalRate += rateRaw;
      bySymbol[sym].rateCount += 1;
      bySymbol[sym].weightedRateSum += rateRaw * oi;
      if (price > 0) {
        bySymbol[sym].priceSum += price;
        bySymbol[sym].priceCount += 1;
        bySymbol[sym].weightedPriceSum += price * oi;
      }
      bySymbol[sym].totalWeight += oi;
      bySymbol[sym].totalOI += oi;
      bySymbol[sym].exchanges.add(r.exchange);

      bySymbol[sym].breakdown.push({
        exchange: r.exchange,
        symbol: r.symbol,
        fundingRate: rateRaw,
        openInterest: oi,
        openInterestContracts,
        price,
        markPrice,
        indexPrice,
        lastPrice,
        oraclePrice,
        impactPrice,
        cvd,
        momentum,
        isAccelerating,
        interval,
        timestamp: r.timestamp,
      });
    });

    const data = [];
    const signals = [];

    let positiveFundingCount = 0;
    let negativeFundingCount = 0;
    let totalOIWithPositiveFunding = 0;
    let totalOIWithNegativeFunding = 0;
    let acceleratingCount = 0;
    let deceleratingCount = 0;
    let highestLiquidationSeverity = 0;

    Object.values(bySymbol).forEach(item => {
      const avgRate =
        item.rateCount > 0 ? item.totalRate / item.rateCount : 0;
      const weightedAvg =
        item.totalWeight > 0 ? item.weightedRateSum / item.totalWeight : avgRate;
      const avgPrice =
        item.priceCount > 0 ? item.priceSum / item.priceCount : 0;
      const weightedPrice =
        item.totalWeight > 0 && item.weightedPriceSum > 0
          ? item.weightedPriceSum / item.totalWeight
          : avgPrice;
      const fundingPct = weightedAvg * 100;
      const absCVD = Math.abs(item.cvd);
      const fundingRates = item.breakdown.map(b => b.fundingRate);
      const maxFunding = fundingRates.length ? Math.max(...fundingRates) : weightedAvg;
      const minFunding = fundingRates.length ? Math.min(...fundingRates) : weightedAvg;
      const fundingSpread = (maxFunding - minFunding) * 100;

      const bias = Math.tanh((fundingPct || 0) / 0.12);
      const longShare = Number.isFinite(item.totalOI) ? ((1 + bias) / 2) : 0.5;
      const shortShare = Number.isFinite(item.totalOI) ? (1 - longShare) : 0.5;
      const avgLongLeverage = fundingPct > 0.02 ? 9 : fundingPct > 0 ? 8 : 6.5;
      const avgShortLeverage = fundingPct < -0.02 ? 9 : fundingPct < 0 ? 8 : 6.5;
      const moveBands = [0.5, 1, 2, 3];
      const liquidationBands = moveBands.map(percent => {
        const move = percent / 100;
        const longThreshold = 1 / avgLongLeverage;
        const shortThreshold = 1 / avgShortLeverage;
        const longRiskRatio = Math.min(1, Math.max(0, move / longThreshold));
        const shortRiskRatio = Math.min(1, Math.max(0, move / shortThreshold));
        const longNotional = item.totalOI * longShare * longRiskRatio;
        const shortNotional = item.totalOI * shortShare * shortRiskRatio;
        return {
          movePercent: percent,
          longNotional,
          shortNotional,
          longThresholdPercent: longThreshold * 100,
          shortThresholdPercent: shortThreshold * 100,
        };
      });
      const liquidationSeverity = liquidationBands.reduce(
        (acc, band) => Math.max(acc, band.longNotional, band.shortNotional),
        0
      );
      if (liquidationSeverity > highestLiquidationSeverity) {
        highestLiquidationSeverity = liquidationSeverity;
      }

      const exchangeFundingMap = {};
      item.breakdown.forEach(entry => {
        const oiWeight = entry.openInterest || 0;
        if (!exchangeFundingMap[entry.exchange]) {
          exchangeFundingMap[entry.exchange] = {
            fundingRateSum: 0,
            count: 0,
            weightedRateSum: 0,
            totalOI: 0,
          };
        }
        exchangeFundingMap[entry.exchange].fundingRateSum += entry.fundingRate ?? 0;
        exchangeFundingMap[entry.exchange].count += 1;
        exchangeFundingMap[entry.exchange].weightedRateSum += (entry.fundingRate ?? 0) * oiWeight;
        exchangeFundingMap[entry.exchange].totalOI += oiWeight;
      });

      const exchangeFunding = Object.entries(exchangeFundingMap).map(([exchange, stats]) => {
        const avgFunding =
          stats.count > 0 ? stats.fundingRateSum / stats.count : 0;
        const weightedFunding =
          stats.totalOI > 0 ? stats.weightedRateSum / stats.totalOI : avgFunding;
        return {
          exchange,
          avgFunding,
          weightedFunding,
          totalOI: stats.totalOI,
        };
      });

      if (weightedAvg > 0) {
        positiveFundingCount += 1;
        totalOIWithPositiveFunding += item.totalOI;
      } else if (weightedAvg < 0) {
        negativeFundingCount += 1;
        totalOIWithNegativeFunding += item.totalOI;
      }

      if (item.isAccelerating) {
        acceleratingCount += 1;
      } else {
        deceleratingCount += 1;
      }

      // Debug logging for PUMPUSDT
      if (item.symbol === 'PUMP') {
        console.log('\n=== PUMPUSDT Debug ===');
        console.log('Breakdown:', item.breakdown.map(b => ({
          exchange: b.exchange,
          rawRate: b.fundingRate,
          oi: b.openInterest,
          interval: b.interval
        })));
        console.log('Total Rate:', item.totalRate);
        console.log('Total Weight (OI):', item.totalWeight);
        console.log('Avg Rate:', avgRate);
        console.log('Weighted Avg Rate:', weightedAvg);
        console.log('Funding %:', fundingPct);
        console.log('Avg Price:', avgPrice);
        console.log('Weighted Price:', weightedPrice);
        console.log('Total OI:', item.totalOI);
        console.log('========================\n');
      }

      data.push({
        symbol: item.symbol,
        fundingRate: avgRate,
        fundingRateWeighted: weightedAvg,
        fundingRateSum: item.totalRate,
        fundingRateCount: item.rateCount,
        avgPrice,
        weightedPrice,
        openInterest: item.totalOI,
        cvd: item.cvd,
        momentum: item.momentum,
        isAccelerating: item.isAccelerating,
        fundingSpread,
        exchangeFunding,
        liquidationBands,
        liquidationSeverity,
        exchanges: [...item.exchanges],
        exchangeBreakdown: item.breakdown,
      });

      const potentialSignals = [];

      // === REALISTIC 8H-BASED SIGNALS ===
      if (fundingPct > 0.06 && item.cvd < -60 && item.totalOI > 10_000_000) {
        potentialSignals.push({
          type: 'LOCAL TOP',
          symbol: item.symbol,
          strength: Math.min(absCVD / 18, 10),
          priority: 1,
          message: 'High long funding + heavy selling pressure → reversal likely',
          indicators: {
            fundingRate: parseFloat(fundingPct.toFixed(3)),
            openInterest: item.totalOI,
            cvd: parseFloat((item.cvd || 0).toFixed(2)),
            price: weightedPrice,
          }
        });
      }

      if (fundingPct < -0.06 && item.cvd > 90 && item.totalOI > 10_000_000) {
        potentialSignals.push({
          type: 'SHORT SQUEEZE',
          symbol: item.symbol,
          strength: Math.min(item.cvd / 20, 10),
          priority: 1,
          message: 'Shorts paying premium + aggressive buying → squeeze incoming',
          indicators: {
            fundingRate: parseFloat(fundingPct.toFixed(3)),
            openInterest: item.totalOI,
            cvd: parseFloat((item.cvd || 0).toFixed(2)),
            price: weightedPrice,
          }
        });
      }

      if (fundingPct < -0.04 && item.cvd > 45 && item.totalOI > 8_000_000) {
        potentialSignals.push({
          type: 'LOCAL BOTTOM',
          symbol: item.symbol,
          strength: Math.min(item.cvd / 15, 10),
          priority: 2,
          message: 'Buyers absorbing shorts + negative funding → bounce setup',
          indicators: {
            fundingRate: parseFloat(fundingPct.toFixed(3)),
            openInterest: item.totalOI,
            cvd: parseFloat((item.cvd || 0).toFixed(2)),
            price: weightedPrice,
          }
        });
      }

      if (fundingPct < -0.03 && item.cvd > 30 && item.totalOI > 5_000_000) {
        potentialSignals.push({
          type: 'BUILDING LONG PRESSURE',
          symbol: item.symbol,
          strength: Math.min(item.cvd / 14, 8),
          priority: 3,
          message: 'Accumulation under short funding → bullish momentum',
          indicators: {
            fundingRate: parseFloat(fundingPct.toFixed(3)),
            openInterest: item.totalOI,
            cvd: parseFloat((item.cvd || 0).toFixed(2)),
            price: weightedPrice,
          }
        });
      }

      if (fundingPct > 0.03 && item.cvd < -30 && item.totalOI > 5_000_000) {
        potentialSignals.push({
          type: 'BUILDING SHORT PRESSURE',
          symbol: item.symbol,
          strength: Math.min(absCVD / 14, 8),
          priority: 3,
          message: 'Distribution while longs pay → bearish setup forming',
          indicators: {
            fundingRate: parseFloat(fundingPct.toFixed(3)),
            openInterest: item.totalOI,
            cvd: parseFloat((item.cvd || 0).toFixed(2)),
            price: weightedPrice,
          }
        });
      }

      if (potentialSignals.length > 0) {
        const top = potentialSignals.sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          return b.strength - a.strength;
        })[0];
        const { priority, ...out } = top;
        signals.push(out);
      }
    });

    signals.sort((a, b) => b.strength - a.strength);

    const totalSymbols = uniqueSymbols.length;
    const positiveFundingPercentage =
      totalSymbols > 0 ? (positiveFundingCount / totalSymbols) * 100 : 0;

    const aggregates = {
      positiveFundingPercentage,
      positiveFundingCount,
      negativeFundingCount,
      totalOIPositiveFunding: totalOIWithPositiveFunding,
      totalOINegativeFunding: totalOIWithNegativeFunding,
      acceleratingCount,
      deceleratingCount,
      peakLiquidationNotional: highestLiquidationSeverity,
    };

    return Response.json({
      data,
      signals,
      meta: {
        totalSymbols, // Now <= 100
        signalsGenerated: signals.length,
        cvdTimeframe: '15min candles, 100 periods (~25 hours)',
        fundingBasis: 'Weighted 8h-equivalent rates (OI-weighted)',
        filteredBy: 'Top 100 symbols by total Open Interest (market activity)',
        timestamp: new Date().toISOString(),
        aggregates,
      },
    });
  } catch (error) {
    console.error('Sentiment API error:', error);
    return Response.json({
      error: error.message,
      data: [],
      signals: [],
      meta: { timestamp: new Date().toISOString() },
    }, { status: 500 });
  }
}

export const revalidate = 0;



// import { getRealCVD } from '@/lib/cvd';

// export async function GET() {
//   try {
//     // Import and fetch rates directly
//     const { fetchHyperliquidRates } = await import('@/lib/exchanges/hyperliquid');
//     const { fetchBinanceRates } = await import('@/lib/exchanges/binance');
//     const { fetchBybitRates } = await import('@/lib/exchanges/bybit');
//     const { fetchEdgeXRates } = await import('@/lib/exchanges/edgex');
    
//     const [hyperliquidRates, binanceRates, bybitRates, edgexRates] = await Promise.allSettled([
//       fetchHyperliquidRates(0),
//       fetchBinanceRates(),
//       fetchBybitRates(),
//       fetchEdgeXRates(0),
//     ]);
    
//     const rates = [];
//     if (hyperliquidRates.status === 'fulfilled') rates.push(...hyperliquidRates.value);
//     if (binanceRates.status === 'fulfilled') rates.push(...binanceRates.value);
//     if (bybitRates.status === 'fulfilled') rates.push(...bybitRates.value);
//     if (edgexRates.status === 'fulfilled') rates.push(...edgexRates.value);

//     // Extract all unique symbols from rates
//     const uniqueSymbols = [...new Set(rates.map(r => r.symbol.replace('-PERP', '').trim()))];
    
//     // Fetch CVD for ALL symbols over 15min timeframe (100 candles = ~25 hours of data)
//     // Using interval='15' and limit=100 for stable, meaningful CVD values
//     const cvdPromises = uniqueSymbols.map(sym => 
//       getRealCVD(`${sym}USDT`, '15', 100).catch(err => {
//         console.warn(`CVD fetch failed for ${sym}:`, err.message);
//         return 0; // fallback to 0 if symbol not available on Bybit
//       })
//     );
//     const cvdValues = await Promise.all(cvdPromises);
//     const cvdMap = Object.fromEntries(uniqueSymbols.map((s, i) => [s, cvdValues[i]]));

//     // Group by symbol for aggregation
//     const bySymbol = {};
    
//     rates.forEach(r => {
//       const sym = r.symbol.replace('-PERP', '').trim();
//       const cvd = cvdMap[sym] || 0;
      
//       if (!bySymbol[sym]) {
//         bySymbol[sym] = {
//           symbol: sym,
//           fundingRates: [],
//           openInterests: [],
//           exchanges: [],
//           exchangeBreakdown: []
//         };
//       }
      
//       bySymbol[sym].fundingRates.push(r.rate);
//       bySymbol[sym].openInterests.push(r.openInterest || 0);
//       bySymbol[sym].exchanges.push(r.exchange);
//       bySymbol[sym].exchangeBreakdown.push({
//         exchange: r.exchange,
//         symbol: r.symbol,
//         fundingRate: r.rate,
//         apy: r.apy,
//         openInterest: r.openInterest || 0,
//         cvd: cvd,
//         timestamp: r.timestamp,
//         interval: r.interval
//       });
//     });

//     const data = [];
//     const signals = [];

//     Object.values(bySymbol).forEach(item => {
//       const avgFundingRate = item.fundingRates.reduce((a, b) => a + b, 0) / item.fundingRates.length;
//       const totalOI = item.openInterests.reduce((a, b) => a + b, 0);
//       const cvd = cvdMap[item.symbol] || 0;

//       const fundingPct = avgFundingRate * 100;
//       const absCVD = Math.abs(cvd);

//       data.push({
//         symbol: item.symbol,
//         fundingRate: avgFundingRate,
//         openInterest: totalOI,
//         cvd,
//         exchanges: [...new Set(item.exchanges)],
//         exchangeBreakdown: item.exchangeBreakdown
//       });

//       // === IMPROVED SIGNAL GENERATION ===
//       // Using timeframe-based CVD thresholds (15min candles over ~25 hours)
//       // Thresholds are now more meaningful as CVD represents sustained buying/selling pressure
      
//       const potentialSignals = [];

//       // 1. LOCAL TOP - Extreme positive funding + sustained selling pressure
//       if (fundingPct > 0.08 && cvd < -50 && totalOI > 8_000_000) {
//         potentialSignals.push({
//           type: 'LOCAL TOP',
//           symbol: item.symbol,
//           strength: Math.min(absCVD / 15, 10), // adjusted for new CVD scale
//           priority: 1,
//           message: 'Sustained selling pressure + longs paying high premium → reversal risk',
//           indicators: { fundingRate: fundingPct.toFixed(3), openInterest: totalOI, cvd: cvd.toFixed(2) }
//         });
//       }

//       // 2. SHORT SQUEEZE - Extreme negative funding + sustained buying pressure
//       if (fundingPct < -0.08 && cvd > 80) {
//         potentialSignals.push({
//           type: 'SHORT SQUEEZE',
//           symbol: item.symbol,
//           strength: Math.min(cvd / 15, 10),
//           priority: 1,
//           message: 'Extreme negative funding + sustained buying → shorts at risk of liquidation',
//           indicators: { fundingRate: fundingPct.toFixed(3), openInterest: totalOI, cvd: cvd.toFixed(2) }
//         });
//       }

//       // 3. LOCAL BOTTOM - Strong negative funding + sustained buying
//       if (fundingPct < -0.08 && totalOI > 8_000_000 && cvd > 40) {
//         potentialSignals.push({
//           type: 'LOCAL BOTTOM',
//           symbol: item.symbol,
//           strength: Math.min(cvd / 12, 10),
//           priority: 2,
//           message: 'Strong buying absorption + shorts paying premium → potential bounce',
//           indicators: { fundingRate: fundingPct.toFixed(3), openInterest: totalOI, cvd: cvd.toFixed(2) }
//         });
//       }

//       // 4. BUILDING LONG PRESSURE - Moderate negative funding + accumulation
//       if (fundingPct < -0.05 && cvd > 25 && totalOI > 5_000_000) {
//         potentialSignals.push({
//           type: 'BUILDING LONG PRESSURE',
//           symbol: item.symbol,
//           strength: Math.min(cvd / 12, 10),
//           priority: 3,
//           message: 'Accumulation pattern while shorts pay funding → bullish momentum building',
//           indicators: { fundingRate: fundingPct.toFixed(3), openInterest: totalOI, cvd: cvd.toFixed(2) }
//         });
//       }

//       // 5. BUILDING SHORT PRESSURE - Moderate positive funding + distribution
//       if (fundingPct > 0.05 && cvd < -25 && totalOI > 5_000_000) {
//         potentialSignals.push({
//           type: 'BUILDING SHORT PRESSURE',
//           symbol: item.symbol,
//           strength: Math.min(absCVD / 12, 10),
//           priority: 3,
//           message: 'Distribution pattern while longs pay funding → bearish momentum building',
//           indicators: { fundingRate: fundingPct.toFixed(3), openInterest: totalOI, cvd: cvd.toFixed(2) }
//         });
//       }

//       // Pick only the highest priority signal per symbol
//       if (potentialSignals.length > 0) {
//         const topSignal = potentialSignals.sort((a, b) => {
//           if (a.priority !== b.priority) return a.priority - b.priority;
//           return b.strength - a.strength; // if same priority, pick stronger
//         })[0];
        
//         // Remove priority field before adding to output
//         const { priority, ...signalOutput } = topSignal;
//         signals.push(signalOutput);
//       }
//     });

//     // Sort signals by strength (highest first)
//     signals.sort((a, b) => b.strength - a.strength);

//     return Response.json({ 
//       data, 
//       signals,
//       meta: {
//         totalSymbols: uniqueSymbols.length,
//         signalsGenerated: signals.length,
//         cvdTimeframe: '15min candles, 100 periods (~25 hours)',
//         timestamp: new Date().toISOString()
//       }
//     });
//   } catch (error) {
//     console.error('Error in /api/sentiment:', error);
//     return Response.json({
//       error: error.message,
//       data: [],
//       signals: [],
//       meta: { timestamp: new Date().toISOString() }
//     }, { status: 500 });
//   }
// }

// export const revalidate = 0;



// // app/api/sentiment/route.js
// import { getRealCVD } from '@/lib/cvd';

// export async function GET() {
//   try {
//     // Import and fetch rates directly
//     const { fetchHyperliquidRates } = await import('@/lib/exchanges/hyperliquid');
//     const { fetchBinanceRates } = await import('@/lib/exchanges/binance');
//     const { fetchBybitRates } = await import('@/lib/exchanges/bybit');
//     const { fetchLighterRates } = await import('@/lib/exchanges/lighter');
//     const { fetchEdgeXRates } = await import('@/lib/exchanges/edgex');
    
//     const [hyperliquidRates, lighterRates, binanceRates, bybitRates, edgexRates] = await Promise.allSettled([
//       fetchHyperliquidRates(0),
//       fetchLighterRates(0),
//       fetchBinanceRates(),
//       fetchBybitRates(),
//       fetchEdgeXRates(0),
//     ]);
    
//     const rates = [];
//     if (hyperliquidRates.status === 'fulfilled') rates.push(...hyperliquidRates.value);
//     if (lighterRates.status === 'fulfilled') rates.push(...lighterRates.value);
//     if (binanceRates.status === 'fulfilled') rates.push(...binanceRates.value);
//     if (bybitRates.status === 'fulfilled') rates.push(...bybitRates.value);
//     if (edgexRates.status === 'fulfilled') rates.push(...edgexRates.value);

//     // REAL CVD FOR TOP COINS - Fetch from Bybit trades API
//     const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PEPEUSDT', 'DOGEUSDT'];
//     console.log('Fetching CVD for symbols:', symbols);
//     const cvdPromises = symbols.map(s => getRealCVD(s));
//     const cvdValues = await Promise.all(cvdPromises);
//     const cvdMap = Object.fromEntries(symbols.map((s, i) => [s.replace('USDT', ''), cvdValues[i]]));
    
//     // Debug: log CVD values
//     console.log('CVD Map (symbol -> CVD in millions):', cvdMap);
//     console.log('CVD Values fetched:', cvdValues);

//     // Group by symbol for aggregation
//     const bySymbol = {};
    
//     rates.forEach(r => {
//       // Normalize symbol (remove -PERP suffix, handle different formats)
//       const sym = r.symbol.replace('-PERP', '').replace('-PERP', '').trim();
//       const cvd = cvdMap[sym] || 0;
      
//       // Debug: log CVD assignment for first few rates
//       if (rates.indexOf(r) < 3) {
//         console.log(`Rate: ${r.symbol} -> normalized: "${sym}" -> CVD: ${cvd} (from map: ${cvdMap[sym] !== undefined ? cvdMap[sym] : 'not found'})`);
//       }
      
//       if (!bySymbol[sym]) {
//         bySymbol[sym] = {
//           symbol: sym,
//           fundingRates: [],
//           openInterests: [],
//           exchanges: [],
//           exchangeBreakdown: [],
//           cvd: cvd // Use real CVD from trades API
//         };
//       }
      
//       bySymbol[sym].fundingRates.push(r.rate);
//       bySymbol[sym].openInterests.push(r.openInterest || 0);
//       bySymbol[sym].exchanges.push(r.exchange);
//       bySymbol[sym].exchangeBreakdown.push({
//         exchange: r.exchange,
//         symbol: r.symbol,
//         fundingRate: r.rate,
//         apy: r.apy,
//         openInterest: r.openInterest || 0,
//         cvd: cvd, // Use real CVD from trades API (same for all exchanges of this symbol)
//         timestamp: r.timestamp,
//         interval: r.interval
//       });
//     });

//     const data = [];
//     const signals = [];

//     // Aggregate and create data entries
//     Object.values(bySymbol).forEach(item => {
//       const avgFundingRate = item.fundingRates.reduce((a, b) => a + b, 0) / item.fundingRates.length;
//       const totalOI = item.openInterests.reduce((a, b) => a + b, 0);
//       const cvd = item.cvd; // This should be the real CVD from getRealCVD() trades API
      
//       // Debug: verify CVD is being used
//       if (['BTC', 'ETH', 'SOL'].includes(item.symbol)) {
//         console.log(`Aggregated data for ${item.symbol}: CVD=${cvd}M, Funding=${avgFundingRate}, OI=$${(totalOI/1e6).toFixed(2)}M`);
//       }

//       data.push({
//         symbol: item.symbol,
//         fundingRate: avgFundingRate, // Already in decimal format (0.01 = 1%)
//         openInterest: totalOI,
//         cvd: cvd,
//         exchangeCount: item.exchanges.length,
//         exchanges: [...new Set(item.exchanges)],
//         exchangeBreakdown: item.exchangeBreakdown
//       });

//       // REAL SIGNALS (using aggregated funding rate and real CVD)
//       // Funding rate is in decimal (0.01 = 1%), convert to percentage for comparison
//       // 0.08 = 0.8% hourly, 0.198 = 1.98% hourly
//       const fundingPct = avgFundingRate * 100; // Convert to percentage
      
//       if (fundingPct > 0.08 && cvd < -40 && totalOI > 8000000) {
//         signals.push({ 
//           type: 'LOCAL TOP', 
//           symbol: item.symbol, 
//           exchange: item.exchanges.join(', '),
//           strength: Math.abs(cvd) / 10,
//           message: 'Sellers smashing longs → dump incoming',
//           indicators: {
//             fundingRate: fundingPct,
//             openInterest: totalOI,
//             cvd: cvd
//           }
//         });
//       }
      
//       if (fundingPct < -0.08 && cvd > 60) {
//         signals.push({ 
//           type: 'SHORT SQUEEZE', 
//           symbol: item.symbol,
//           exchange: item.exchanges.join(', '),
//           strength: cvd / 15,
//           message: 'Shorts paying 110% APR + buyers aggressive',
//           indicators: {
//             fundingRate: fundingPct,
//             openInterest: totalOI,
//             cvd: cvd
//           }
//         });
//       }
      
//       // LOCAL BOTTOM signal
//       if (fundingPct < -0.08 && totalOI > 8000000 && cvd > 30) {
//         signals.push({
//           type: 'LOCAL BOTTOM',
//           symbol: item.symbol,
//           exchange: item.exchanges.join(', '),
//           strength: cvd / 10,
//           message: 'Buyers absorbing shorts → moon setup',
//           indicators: {
//             fundingRate: fundingPct,
//             openInterest: totalOI,
//             cvd: cvd
//           }
//         });
//       }
//     });

//     return Response.json({ data, signals });
//   } catch (error) {
//     console.error('Error in /api/sentiment:', error);
//     return Response.json({
//       error: error.message,
//       data: [],
//       signals: []
//     }, { status: 500 });
//   }
// }

// export const revalidate = 0;
