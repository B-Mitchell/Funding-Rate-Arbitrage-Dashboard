export function toAPY(hourlyRate) {
    return (Math.pow(1 + hourlyRate / 100, 24 * 365) - 1) * 100;
  }
  
  export function toHourly(rate, intervalMin) {
    const hours = intervalMin / 60;
    return rate / hours;
  }