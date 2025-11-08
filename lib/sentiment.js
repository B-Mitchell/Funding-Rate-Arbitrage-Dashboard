// Market Sentiment Analysis
class SentimentAnalyzer {
  constructor() {
    this.sentimentData = {
      bullish: 0,
      bearish: 0,
      neutral: 0,
      extreme: 0
    };
  }

  analyzeSentiment(rates) {
    if (!rates || rates.length === 0) {
      return { sentiment: 'neutral', score: 0, confidence: 0 };
    }

    let bullishCount = 0;
    let bearishCount = 0;
    let extremeCount = 0;
    let totalWeight = 0;

    rates.forEach(rate => {
      const weight = this.getWeight(rate);
      totalWeight += weight;

      if (Math.abs(rate.rate) > 0.01) { // 1% threshold for extreme
        extremeCount += weight;
      }

      if (rate.rate > 0.005) { // 0.5% threshold for bullish
        bullishCount += weight;
      } else if (rate.rate < -0.005) { // -0.5% threshold for bearish
        bearishCount += weight;
      }
    });

    if (totalWeight === 0) {
      return { sentiment: 'neutral', score: 0, confidence: 0 };
    }

    const bullishRatio = bullishCount / totalWeight;
    const bearishRatio = bearishCount / totalWeight;
    const extremeRatio = extremeCount / totalWeight;

    // Calculate sentiment score (-100 to +100)
    const score = (bullishRatio - bearishRatio) * 100;
    
    // Determine sentiment
    let sentiment = 'neutral';
    if (extremeRatio > 0.3) {
      sentiment = 'extreme';
    } else if (score > 20) {
      sentiment = 'bullish';
    } else if (score < -20) {
      sentiment = 'bearish';
    }

    // Calculate confidence (0-100)
    const confidence = Math.min(100, Math.abs(score) + (extremeRatio * 50));

    return {
      sentiment,
      score: Math.round(score),
      confidence: Math.round(confidence),
      bullishRatio: Math.round(bullishRatio * 100),
      bearishRatio: Math.round(bearishRatio * 100),
      extremeRatio: Math.round(extremeRatio * 100)
    };
  }

  getWeight(rate) {
    // Weight by open interest if available, otherwise by exchange importance
    if (rate.openInterest && rate.openInterest > 0) {
      return Math.min(10, Math.log10(rate.openInterest / 1000000) + 1); // Log scale
    }
    
    // Exchange weights (based on typical volume)
    const exchangeWeights = {
      'Binance': 5,
      'Bybit': 4,
      'Hyperliquid': 3,
      'edgeX': 1
    };
    
    return exchangeWeights[rate.exchange] || 1;
  }

  getSentimentColor(sentiment) {
    switch (sentiment) {
      case 'bullish': return 'text-emerald-400';
      case 'bearish': return 'text-rose-400';
      case 'extreme': return 'text-orange-400';
      default: return 'text-gray-400';
    }
  }

  getSentimentIcon(sentiment) {
    switch (sentiment) {
      case 'bullish': return '📈';
      case 'bearish': return '📉';
      case 'extreme': return '⚡';
      default: return '➡️';
    }
  }

  getSentimentDescription(sentiment, score) {
    switch (sentiment) {
      case 'bullish':
        return score > 50 ? 'Strongly Bullish' : 'Moderately Bullish';
      case 'bearish':
        return score < -50 ? 'Strongly Bearish' : 'Moderately Bearish';
      case 'extreme':
        return 'Extreme Volatility';
      default:
        return 'Neutral Market';
    }
  }
}

export default SentimentAnalyzer;

