/**
 * Convert hourly funding rate (decimal form) to Annual Percentage Yield (APY %).
 *
 * @param {number} hourlyRateDecimal - Hourly funding rate as decimal (e.g., 0.0001 = 0.01%)
 * @returns {number} APY as percentage (e.g., 26.5 for 26.5% APY)
 */
export function toAPY(hourlyRateDecimal) {
  return (Math.pow(1 + hourlyRateDecimal, 24 * 365) - 1) * 100;
}

export function toHourly(rate, intervalMin) {
  const hours = intervalMin / 60;
  return rate / hours;
}