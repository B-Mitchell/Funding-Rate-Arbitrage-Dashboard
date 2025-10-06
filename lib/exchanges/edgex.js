const EDGEX_CONTRACTS = [
    { id: '10000001', symbol: 'BTC-PERP' },
    { id: '10000002', symbol: 'ETH-PERP' },
    // Add more contracts as needed
  ];
  
  export async function fetchEdgeXRates() {
    try {
      // Fetch funding rates for all known contracts in parallel
      const results = await Promise.allSettled(
        EDGEX_CONTRACTS.map(async (contract) => {
          const res = await fetch(
            `https://pro.edgex.exchange/api/v1/public/funding/getLatestFundingRate?contractId=${contract.id}`,
            {
              next: { revalidate: 0 } // Always fresh
            }
          );
  
          if (!res.ok) throw new Error(`edgeX API failed for contract ${contract.id}`);
  
          const json = await res.json();
  
          // Check if the API call was successful and has data
          if (json.code !== 'SUCCESS' || !json.data || json.data.length === 0) {
            return null; // Contract not active or no data
          }
  
          const item = json.data[0]; // Get first (and usually only) result
  
          // The funding rate is already in decimal format (e.g., -0.00005537)
          const ratePercent = parseFloat(item.fundingRate) * 100; // Convert to percentage
  
          // APY calculation for edgeX
          // edgeX uses 4-hour funding intervals (240 minutes)
          const fundingIntervalHours = parseInt(item.fundingRateIntervalMin) / 60;
          const periodsPerDay = 24 / fundingIntervalHours;
          const periodsPerYear = periodsPerDay * 365;
          
          const rateDecimal = parseFloat(item.fundingRate);
          const apy = (Math.pow(1 + rateDecimal, periodsPerYear) - 1) * 100;
  
          return {
            exchange: 'edgeX',
            symbol: contract.symbol,
            contractId: item.contractId,
            rate: ratePercent,
            apy,
            fundingTime: parseInt(item.fundingTime),
            indexPrice: parseFloat(item.indexPrice),
            forecastRate: item.forecastFundingRate 
              ? parseFloat(item.forecastFundingRate) * 100 
              : null
          };
        })
      );
  
      // Filter out failed requests and null results
      const successfulRates = results
        .filter(result => result.status === 'fulfilled' && result.value !== null)
        .map(result => result.value);
  
      return successfulRates;
    } catch (error) {
      console.error('edgeX fetch error:', error);
      throw error;
    }
  }

// export async function fetchEdgeXRates() {
//     const res = await fetch(
//       'https://pro.edgex.exchange/api/v1/public/funding/getLatestFundingRate',
//       {
//         next: { revalidate: 30 } // Revalidate every 30 seconds
//       }
//     );
  
//     if (!res.ok) throw new Error('edgeX API failed');
  
//     const json = await res.json();
  
//     // Check if the API call was successful
//     if (json.code !== 'SUCCESS' || !json.data) {
//       throw new Error('edgeX API returned error');
//     }
  
//     return json.data.map(item => {
//       // The funding rate is already in decimal format (e.g., -0.00005537)
//       const ratePercent = parseFloat(item.fundingRate) * 100; // Convert to percentage
  
//       // APY calculation
//       // edgeX uses 4-hour funding intervals (240 minutes)
//       const intervalsPerDay = 24 / (parseInt(item.fundingRateIntervalMin) / 60);
//       const dailyRate = ratePercent / 100;
//       const apy = (Math.pow(1 + dailyRate, 365) - 1) * 100;
  
//       // Extract symbol from contractId or use a mapping
//       // You may need to fetch contract metadata separately to get proper symbols
//       const symbol = `CONTRACT-${item.contractId}`;
  
//       return {
//         exchange: 'edgeX',
//         symbol,
//         contractId: item.contractId,
//         rate: ratePercent,
//         apy,
//         fundingTime: new Date(parseInt(item.fundingTime)),
//         indexPrice: parseFloat(item.indexPrice),
//         forecastRate: item.forecastFundingRate 
//           ? parseFloat(item.forecastFundingRate) * 100 
//           : null
//       };
//     });
//   }