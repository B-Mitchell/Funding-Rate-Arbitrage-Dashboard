/**
 * Convert hourly funding rate percentage to Annual Percentage Yield (APY)
 * 
 * Formula: APY = (1 + hourly_rate)^(24 * 365) - 1
 * 
 * This standardizes APY calculation across all exchanges for accurate arbitrage comparison
 * 
 * @param {number} hourlyRate - Hourly funding rate as percentage (e.g., 0.01 for 0.01%)
 * @returns {number} APY as percentage (e.g., 26.5 for 26.5% APY)
 */
export function toAPY(hourlyRate) {
    return (Math.pow(1 + hourlyRate / 100, 24 * 365) - 1) * 100;
  }
  
  export function toHourly(rate, intervalMin) {
    const hours = intervalMin / 60;
    return rate / hours;
  }