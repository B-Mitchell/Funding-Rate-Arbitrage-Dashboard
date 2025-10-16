'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  AlertCircle, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Zap, 
  Settings, 
  Search,
  Plus,
  Target,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import SentimentAnalyzer from '../lib/sentiment';

// Utils
const toAPY = (hourlyRate) => {
  return (Math.pow(1 + hourlyRate / 100, 24 * 365) - 1) * 100;
};

const formatOpenInterest = (openInterest) => {
  if (!openInterest) return 'N/A';
  if (openInterest >= 1000000000) {
    return `$${(openInterest / 1000000000).toFixed(1)}B`;
  } else if (openInterest >= 1000000) {
    return `$${(openInterest / 1000000).toFixed(1)}M`;
  } else if (openInterest >= 1000) {
    return `$${(openInterest / 1000).toFixed(0)}K`;
  } else {
    return `$${openInterest.toFixed(0)}`;
  }
};


// const findAllArbs = (rates, minSpread = 0) => {
//   const symbols = [...new Set(rates.map(r => r.symbol?.replace('-PERP', '')))];
//   const opportunities = [];
  
//   console.log('=== ARB DEBUG ===');
  
//   for (const sym of symbols) {
//     const symRates = rates.filter(r => r.symbol === `${sym}-PERP`);
//     const longs = symRates.filter(r => r.rate > 0);
//     const shorts = symRates.filter(r => r.rate < 0);
    
//     console.log(`${sym}:`, {
//       totalExchanges: symRates.length,
//       positiveLongs: longs.length,
//       negativeShorts: shorts.length,
//       longExchanges: longs.map(l => `${l.exchange}(+${l.apy?.toFixed(1)}%)`),
//       shortExchanges: shorts.map(s => `${s.exchange}(${s.apy?.toFixed(1)}%)`)
//     });
    
//     if (longs.length > 0 && shorts.length > 0) {
//       const combinedAPY = (longs[0].apy || 0) + Math.abs(shorts[0].apy || 0);
      
//       if (combinedAPY >= minSpread) {
//         opportunities.push({
//           symbol: sym,
//           longExchange: longs[0].exchange,
//           longRate: longs[0].rate,
//           longAPY: longs[0].apy || 0,
//           shortExchange: shorts[0].exchange,
//           shortRate: shorts[0].rate,
//           shortAPY: Math.abs(shorts[0].apy || 0),
//           combinedAPY,
//           alternativeLongs: longs.slice(1, 3),
//           alternativeShorts: shorts.slice(1, 3)
//         });
//       }
//     } else {
//       console.log(`  ❌ No arb for ${sym} - missing ${longs.length === 0 ? 'longs' : 'shorts'}`);
//     }
//   }
  
//   return opportunities.sort((a, b) => b.combinedAPY - a.combinedAPY);
// };

const findAllArbs = (rates, minSpread = 0) => {
  const symbols = [...new Set(rates.map(r => r.symbol?.replace('-PERP', '')))];
  const opportunities = [];
  
  for (const sym of symbols) {
    const symRates = rates.filter(r => r.symbol === `${sym}-PERP`);
    const longs = symRates.filter(r => r.rate > 0).sort((a, b) => (b.apy || 0) - (a.apy || 0));
    const shorts = symRates.filter(r => r.rate < 0).sort((a, b) => (a.apy || 0) - (b.apy || 0));
    
    if (longs.length > 0 && shorts.length > 0) {
      const combinedAPY = (longs[0].apy || 0) + Math.abs(shorts[0].apy || 0);
      
      if (combinedAPY >= minSpread) {
        opportunities.push({
          symbol: sym,
          longExchange: longs[0].exchange,
          longRate: longs[0].rate,
          longAPY: longs[0].apy || 0,
          shortExchange: shorts[0].exchange,
          shortRate: shorts[0].rate,
          shortAPY: Math.abs(shorts[0].apy || 0),
          combinedAPY,
          alternativeLongs: longs.slice(1, 3),
          alternativeShorts: shorts.slice(1, 3)
        });
      }
    }
  }
  
  return opportunities.sort((a, b) => b.combinedAPY - a.combinedAPY);
};

export default function FundingRateDashboard({ initialRates = [], initialError = null }) {
  const [rates, setRates] = useState(initialRates);
  const [loading, setLoading] = useState(!initialRates.length);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(!!initialRates.length);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [alertThreshold, setAlertThreshold] = useState(0.02);
  const [spreadThreshold, setSpreadThreshold] = useState(50); // Consider lowering to 10 for testing
  const [minOpenInterest, setMinOpenInterest] = useState(1000000); // $1M default
  const [error, setError] = useState(initialError);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedArbs, setExpandedArbs] = useState({});
  const [showArbsSection, setShowArbsSection] = useState(true);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showSentimentModal, setShowSentimentModal] = useState(false);
  const rowsPerPage = 20;

  // Sentiment state
  const [sentimentAnalyzer] = useState(() => new SentimentAnalyzer());
  const [sentiment, setSentiment] = useState({ sentiment: 'neutral', score: 0, confidence: 0 });

  const [manualInputs, setManualInputs] = useState({
    symbol: 'BTC',
    longExchange: '',
    longRate: '',
    longInterval: 8,
    shortExchange: '',
    shortRate: '',
    shortInterval: 8
  });

  // After the allArbs useMemo
  useEffect(() => {
    const byExchange = {};
    rates.forEach(r => {
      if (!byExchange[r.exchange]) byExchange[r.exchange] = [];
      byExchange[r.exchange].push(r.symbol);
    });
    
    console.log('Symbols by exchange:', byExchange);
  }, [rates]);

  const manualArb = useMemo(() => {
    const { longRate, shortRate, longInterval, shortInterval } = manualInputs;
    const longRateNum = parseFloat(longRate) || 0;
    const shortRateNum = parseFloat(shortRate) || 0;

    if (longRateNum <= 0 || shortRateNum >= 0) return null;

    const longHourly = (Math.pow(1 + longRateNum / 100, 1 / longInterval) - 1) * 100;
    const shortHourly = (Math.pow(1 + Math.abs(shortRateNum) / 100, 1 / shortInterval) - 1) * 100;

    const longAPY = toAPY(longHourly);
    const shortAPY = toAPY(shortHourly);
    const combined = longAPY + shortAPY;

    return { longAPY, shortAPY, combined };
  }, [manualInputs]);

  const fetchRates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/rates?minOpenInterest=${minOpenInterest}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch rates');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      console.log('Fetched rates:', data); // Debug log
      setRates(data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error fetching rates:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setIsInitialLoadComplete(true);
    }
  }, [minOpenInterest]);

  useEffect(() => {
    if (!initialRates.length) {
      fetchRates();
    } else {
      setIsInitialLoadComplete(true);
    }
    const interval = setInterval(fetchRates, 60000);
    return () => clearInterval(interval);
  }, [initialRates.length, fetchRates]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortConfig]);

  // Refetch data when minOpenInterest changes
  useEffect(() => {
    if (isInitialLoadComplete) {
      fetchRates();
    }
  }, [minOpenInterest, isInitialLoadComplete, fetchRates]);

  // Analyze sentiment when rates change
  useEffect(() => {
    if (rates.length > 0) {
      const sentimentData = sentimentAnalyzer.analyzeSentiment(rates);
      setSentiment(sentimentData);
    }
  }, [rates, sentimentAnalyzer]);

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const handleManualChange = (field, value) => {
    setManualInputs(prev => ({ ...prev, [field]: value }));
  };

  const filteredAndSortedRates = useMemo(() => {
    let result = [...rates];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(rate => 
        (rate.exchange?.toLowerCase()?.includes(q) || 
         rate.symbol?.toLowerCase()?.includes(q))
      );
    }
    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue = a[sortConfig.key] || '';
        let bValue = b[sortConfig.key] || '';
        if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
          return sortConfig.direction === 'asc' 
            ? aValue.localeCompare(bValue) 
            : bValue.localeCompare(aValue);
        } else {
          return sortConfig.direction === 'asc' 
            ? (aValue || 0) - (bValue || 0) 
            : (bValue || 0) - (aValue || 0);
        }
      });
    }
    return result;
  }, [rates, searchQuery, sortConfig]);

  const allArbs = useMemo(() => {
    const arbs = findAllArbs(rates, spreadThreshold);
    console.log('Computed arbs:', arbs); // Debug log
    return arbs;
  }, [rates, spreadThreshold]);

  const hasHighAlert = rates.some(r => Math.abs(r.rate || 0) > alertThreshold);

  const getSortIcon = (column) => {
    if (sortConfig.key !== column) return null;
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const totalPages = Math.ceil(filteredAndSortedRates.length / rowsPerPage);
  const displayedRates = filteredAndSortedRates.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const toggleArbExpansion = (symbol) => {
    setExpandedArbs(prev => ({
      ...prev,
      [symbol]: !prev[symbol]
    }));
  };

  if (!isInitialLoadComplete) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-gray-400">Loading funding rates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-gray-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-emerald-600/10 rounded-2xl"></div>
          <div className="relative bg-gray-950/80 backdrop-blur-sm border border-gray-800 rounded-2xl p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
          <div>
                    <h1 className="text-2xl lg:text-3xl font-bold text-white">
                      Funding Rate Arbitrage
            </h1>
                    <p className="text-gray-400 text-sm">
                      Real-time cross-exchange opportunities
            </p>
          </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                    <span>Live Data</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    <span>Updated: {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowSentimentModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 rounded-xl transition-all duration-200 shadow-lg hover:shadow-purple-500/25"
            >
              <span className="text-lg">{sentimentAnalyzer.getSentimentIcon(sentiment.sentiment)}</span>
              <span className="font-medium hidden sm:inline">Sentiment</span>
            </button>
            <button
              onClick={() => setShowManualModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 rounded-xl transition-all duration-200 shadow-lg hover:shadow-emerald-500/25"
            >
              <Plus className="w-4 h-4" />
                  <span className="font-medium">Manual Calc</span>
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 rounded-xl transition-all duration-200"
            >
              <Settings className="w-4 h-4" />
                  <span className="font-medium">Settings</span>
            </button>
            <button
              onClick={fetchRates}
              disabled={loading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl transition-all duration-200 shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="font-medium">Refresh</span>
            </button>
              </div>
            </div>
          </div>
        </header>

        {/* Error Alert */}
        {error && (
          <div className="bg-yellow-900/30 border-l-4 border-yellow-500 p-4 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              <p className="text-yellow-300 text-sm">
                <span className="font-medium">Data Warning:</span> {error}. Showing fallback data.
              </p>
            </div>
          </div>
        )}


        {/* Key Statistics - Compact Mobile Layout */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <div className="bg-gray-950 border border-gray-800 rounded-lg lg:rounded-xl p-3 lg:p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-gray-400 text-xs lg:text-sm font-medium">Opportunities</p>
                <p className="text-lg lg:text-2xl font-bold text-emerald-400">{allArbs.length}</p>
              </div>
              <div className="p-1.5 lg:p-2 bg-emerald-500/20 rounded-lg">
                <Target className="w-4 h-4 lg:w-5 lg:h-5 text-emerald-400" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1 hidden lg:block">Above {spreadThreshold}% APY</p>
          </div>
          
          <div className="bg-gray-950 border border-gray-800 rounded-lg lg:rounded-xl p-3 lg:p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-gray-400 text-xs lg:text-sm font-medium">Markets</p>
                <p className="text-lg lg:text-2xl font-bold text-blue-400">{rates.length}</p>
              </div>
              <div className="p-1.5 lg:p-2 bg-blue-500/20 rounded-lg">
                <TrendingUp className="w-4 h-4 lg:w-5 lg:h-5 text-blue-400" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1 hidden lg:block">Across all exchanges</p>
          </div>
          
          <div className="bg-gray-950 border border-gray-800 rounded-lg lg:rounded-xl p-3 lg:p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-gray-400 text-xs lg:text-sm font-medium">Best APY</p>
                <p className="text-lg lg:text-2xl font-bold text-purple-400">
                  {allArbs.length > 0 ? `${allArbs[0].combinedAPY.toFixed(1)}%` : '0%'}
                </p>
              </div>
              <div className="p-1.5 lg:p-2 bg-purple-500/20 rounded-lg">
                <Zap className="w-4 h-4 lg:w-5 lg:h-5 text-purple-400" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1 hidden lg:block">
              {allArbs.length > 0 ? `${allArbs[0].symbol}` : 'No opportunities'}
            </p>
          </div>
          
          <div className="bg-gray-950 border border-gray-800 rounded-lg lg:rounded-xl p-3 lg:p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-gray-400 text-xs lg:text-sm font-medium">Extreme</p>
                <p className="text-lg lg:text-2xl font-bold text-red-400">
                  {rates.filter(r => Math.abs(r.rate || 0) > alertThreshold).length}
                </p>
              </div>
              <div className="p-1.5 lg:p-2 bg-red-500/20 rounded-lg">
                <AlertCircle className="w-4 h-4 lg:w-5 lg:h-5 text-red-400" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1 hidden lg:block">Above {(alertThreshold * 100).toFixed(2)}% hourly</p>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-gray-950 border border-gray-900 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Alert Thresholds
            </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                title="Close settings"
              >
                <svg className="w-5 h-5 text-gray-400 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Extreme Rate Alert (hourly %)
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Current: {(alertThreshold * 100).toFixed(2)}% hourly ≈ {toAPY(alertThreshold).toFixed(0)}% APY
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Minimum Arb Spread (Combined APY %)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={spreadThreshold}
                  onChange={(e) => setSpreadThreshold(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Show opportunities with combined APY ≥ {spreadThreshold}%
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Minimum Open Interest ($)
                </label>
                <input
                  type="number"
                  step="100000"
                  min="0"
                  value={minOpenInterest}
                  onChange={(e) => setMinOpenInterest(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Filter out assets with OI &lt; ${(minOpenInterest / 1000000).toFixed(1)}M
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Arbitrage Opportunities Section */}
        {allArbs.length > 0 ? (
          <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
            <div 
              className="relative bg-gradient-to-r from-emerald-600/10 to-cyan-600/10 border-b border-gray-800 cursor-pointer hover:from-emerald-600/20 hover:to-cyan-600/20 transition-all duration-200"
              onClick={() => setShowArbsSection(!showArbsSection)}
            >
              <div className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 lg:gap-4">
                    <div className="p-2 lg:p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl shadow-lg">
                      <Target className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
                    </div>
                <div>
                      <h2 className="text-lg lg:text-xl font-bold text-white flex items-center gap-2">
                        <span className="hidden sm:inline">Active Arbitrage Opportunities</span>
                        <span className="sm:hidden">Arbitrage</span>
                        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded-full">
                          {allArbs.length}
                        </span>
                  </h2>
                      <p className="text-xs lg:text-sm text-gray-400 mt-1">
                        <span className="hidden sm:inline">{allArbs.length === 1 ? 'Opportunity' : 'Opportunities'} above {spreadThreshold}% APY threshold</span>
                        <span className="sm:hidden">Above {spreadThreshold}% APY</span>
                  </p>
                </div>
              </div>
                  <div className="flex items-center gap-2 lg:gap-3">
                    <div className="text-right">
                      <p className="text-xl lg:text-2xl font-bold text-emerald-400">
                        {allArbs.length > 0 ? `${allArbs[0].combinedAPY.toFixed(1)}%` : '0%'}
                      </p>
                      <p className="text-xs text-gray-500 hidden lg:block">Best APY</p>
                    </div>
                    <div className="p-2 bg-gray-800 rounded-lg">
                      {showArbsSection ? <ChevronUp className="w-4 h-4 lg:w-5 lg:h-5 text-gray-400" /> : <ChevronDown className="w-4 h-4 lg:w-5 lg:h-5 text-gray-400" />}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {showArbsSection && (
              <div className="p-6 space-y-4">
                {allArbs.map((arb, idx) => (
                  <div 
                    key={arb.symbol}
                    className="bg-gradient-to-r from-emerald-900/30 to-cyan-900/30 border border-emerald-700/30 rounded-2xl overflow-hidden hover:border-emerald-600/50 transition-all duration-200 shadow-lg hover:shadow-emerald-500/10"
                  >
                    <div className="p-6">
                      <div className="flex flex-col xl:flex-row xl:items-center gap-6">
                        <div className="flex-shrink-0">
                          <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 px-4 py-3 rounded-xl text-center border border-emerald-500/30">
                            <div className="text-3xl font-bold text-emerald-400">#{idx + 1}</div>
                            <div className="text-sm font-medium text-emerald-300">{arb.symbol}</div>
                          </div>
                        </div>
                        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
                          <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                              <p className="text-sm font-medium text-gray-400">Long Position</p>
                          </div>
                            <p className="font-bold text-white text-lg">{arb.longExchange}</p>
                            <p className="text-emerald-400 font-bold text-xl">+{arb.longAPY.toFixed(1)}% APY</p>
                            <p className="text-xs text-gray-500 mt-1">{(arb.longRate * 100).toFixed(4)}% / period</p>
                          </div>
                          <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-2 h-2 bg-rose-400 rounded-full"></div>
                              <p className="text-sm font-medium text-gray-400">Short Position</p>
                            </div>
                            <p className="font-bold text-white text-lg">{arb.shortExchange}</p>
                            <p className="text-emerald-400 font-bold text-xl">+{arb.shortAPY.toFixed(1)}% APY</p>
                            <p className="text-xs text-gray-500 mt-1">{(arb.shortRate * 100).toFixed(4)}% / period</p>
                          </div>
                          <div className="bg-gradient-to-br from-emerald-600/20 to-emerald-700/20 rounded-xl p-4 border border-emerald-500/30 flex flex-col justify-center">
                            <p className="text-sm font-medium text-gray-400 mb-1">Total Profit</p>
                            <p className="text-4xl font-bold text-emerald-400">{arb.combinedAPY.toFixed(1)}%</p>
                            <p className="text-sm text-emerald-300 font-medium">Combined APY</p>
                          </div>
                        </div>
                        {(arb.alternativeLongs.length > 0 || arb.alternativeShorts.length > 0) && (
                          <button
                            onClick={() => toggleArbExpansion(arb.symbol)}
                            className="flex-shrink-0 px-3 py-2 bg-gray-900 hover:bg-gray-800 rounded-lg text-sm flex items-center gap-2"
                          >
                            Alternatives
                            {expandedArbs[arb.symbol] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        )}
                      </div>
                      {expandedArbs[arb.symbol] && (
                        <div className="mt-4 pt-4 border-t border-emerald-700/30 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {arb.alternativeLongs.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-400 mb-2 font-semibold">Alternative Long Exchanges:</p>
                              <div className="space-y-1">
                                {arb.alternativeLongs.map((alt, i) => (
                                  <div key={i} className="flex justify-between text-sm bg-gray-900/50 px-3 py-1.5 rounded">
                                    <span className="text-gray-300">{alt.exchange}</span>
                                    <span className="text-emerald-400">+{alt.apy.toFixed(1)}%</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {arb.alternativeShorts.length > 0 && (
                            <div>
                              <p className="text-xs text-gray-400 mb-2 font-semibold">Alternative Short Exchanges:</p>
                              <div className="space-y-1">
                                {arb.alternativeShorts.map((alt, i) => (
                                  <div key={i} className="flex justify-between text-sm bg-gray-900/50 px-3 py-1.5 rounded">
                                    <span className="text-gray-300">{alt.exchange}</span>
                                    <span className="text-emerald-400">+{Math.abs(alt.apy).toFixed(1)}%</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-950 border border-gray-900 rounded-xl p-5 text-center text-gray-500">
            No arbitrage opportunities found with combined APY ≥ {spreadThreshold}%.
            {error ? ' Please check the API connection.' : ' Try lowering the spread threshold in settings.'}
          </div>
        )}

        {/* High Alert Banner */}
        {hasHighAlert && (
          <div className="bg-red-900/20 border-l-4 border-red-500 p-4 rounded">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-red-300">
                <span className="font-medium">Extreme funding rate alert:</span> Some rates exceed {(alertThreshold * 100).toFixed(2)}% hourly (~{toAPY(alertThreshold).toFixed(0)}% APY).
              </p>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-purple-600/5 rounded-2xl"></div>
          <div className="relative">
            <Search className="absolute left-3 lg:left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 lg:w-5 lg:h-5" />
          <input
            type="text"
              placeholder="Search exchanges or symbols (e.g. BTC, Hyperliquid)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 lg:pl-12 pr-4 py-3 lg:py-4 bg-gray-950/80 border border-gray-800 rounded-2xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500/50 transition-all duration-200 text-base lg:text-lg"
          />
          </div>
        </div>

        {/* Rates Table */}
        <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="bg-gradient-to-r from-gray-900 to-gray-950 px-6 py-4 border-b border-gray-800">
            <h2 className="text-xl font-bold text-white flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-400" />
              </div>
              Live Funding Rates
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Real-time funding rates across all supported exchanges
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900/50 text-left">
                <tr>
                  <th 
                    className="px-6 py-4 text-xs font-bold text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort('exchange')}
                  >
                    <div className="flex items-center gap-2">
                    Exchange {getSortIcon('exchange')}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-xs font-bold text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort('symbol')}
                  >
                    <div className="flex items-center gap-2">
                    Symbol {getSortIcon('symbol')}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-right text-xs font-bold text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort('rate')}
                  >
                    <div className="flex items-center justify-end gap-2">
                    Hourly Rate {getSortIcon('rate')}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-right text-xs font-bold text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort('apy')}
                  >
                    <div className="flex items-center justify-end gap-2">
                    APY {getSortIcon('apy')}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-right text-xs font-bold text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                    onClick={() => handleSort('openInterest')}
                  >
                    <div className="flex items-center justify-end gap-2">
                      Open Interest {getSortIcon('openInterest')}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-5 py-8 text-center text-gray-500">
                      Loading live funding rates...
                    </td>
                  </tr>
                ) : filteredAndSortedRates.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-5 py-8 text-center text-gray-500">
                      No matching data
                    </td>
                  </tr>
                ) : (
                  displayedRates.map((rate, idx) => {
                    const isPositive = rate.rate > 0;
                    const isExtreme = Math.abs(rate.rate || 0) > alertThreshold;
                    return (
                      <tr key={idx} className="hover:bg-gray-800/30 transition-all duration-200 border-b border-gray-800/30">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${
                              rate.exchange === 'Hyperliquid' ? 'bg-blue-400' :
                              rate.exchange === 'Lighter' ? 'bg-purple-400' :
                              rate.exchange === 'Binance' ? 'bg-yellow-400' :
                              rate.exchange === 'Bybit' ? 'bg-orange-400' :
                              rate.exchange === 'edgeX' ? 'bg-cyan-400' : 'bg-gray-400'
                            }`}></div>
                            <span className="font-semibold text-white">{rate.exchange || 'N/A'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-medium text-gray-200">{rate.symbol || 'N/A'}</span>
                        </td>
                        <td className={`px-6 py-4 text-right font-mono font-bold ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {isPositive ? '+' : ''}{(rate.rate * 100).toFixed(4)}%
                        </td>
                        <td className={`px-6 py-4 text-right font-bold text-lg ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {isPositive ? '+' : ''}{(rate.apy || 0).toFixed(1)}%
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-medium ${
                            rate.openInterest ? 'text-gray-200' : 'text-gray-500'
                          }`}>
                            {formatOpenInterest(rate.openInterest)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className={`p-1.5 rounded-lg ${
                              isPositive ? 'bg-emerald-500/20' : 'bg-rose-500/20'
                            }`}>
                            {isPositive ? (
                              <TrendingUp className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <TrendingDown className="w-4 h-4 text-rose-400" />
                            )}
                            </div>
                            <div className="text-left">
                              <div className={`text-sm font-semibold ${
                              isPositive ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                              {isPositive ? 'Receiving' : 'Paying'}
                              </div>
                            {isExtreme && (
                                <div className="text-xs text-rose-400 font-medium">
                                Extreme
                                </div>
                            )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && filteredAndSortedRates.length > 0 && (
            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-gray-800">
              <div className="text-sm text-gray-400">
                Showing {(currentPage - 1) * rowsPerPage + 1}–
                {Math.min(currentPage * rowsPerPage, filteredAndSortedRates.length)} of {filteredAndSortedRates.length} entries
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm rounded border border-gray-800 bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800"
                >
                  Prev
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-300">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1.5 text-sm rounded border border-gray-800 bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Manual Arb Modal */}
        {showManualModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-950 border border-gray-800 rounded-xl w-full max-w-md">
              <div className="p-5 border-b border-gray-800 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-white">Manual Arbitrage Calculator</h3>
                <button 
                  onClick={() => setShowManualModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Token Symbol</label>
                  <input
                    type="text"
                    value={manualInputs.symbol}
                    onChange={(e) => handleManualChange('symbol', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded text-white"
                    placeholder="e.g. BTC"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-sm text-emerald-400 mb-1">Long Exchange</label>
                    <input
                      type="text"
                      value={manualInputs.longExchange}
                      onChange={(e) => handleManualChange('longExchange', e.target.value)}
                      className="w-full px-2 py-2 bg-gray-900 border border-gray-800 rounded text-white text-sm"
                      placeholder="e.g. Hyperliquid"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-emerald-400 mb-1">Rate (%)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={manualInputs.longRate}
                      onChange={(e) => handleManualChange('longRate', e.target.value)}
                      className="w-full px-2 py-2 bg-gray-900 border border-gray-800 rounded text-white text-sm"
                      placeholder="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-emerald-400 mb-1">Every (hrs)</label>
                    <select
                      value={manualInputs.longInterval}
                      onChange={(e) => handleManualChange('longInterval', Number(e.target.value))}
                      className="w-full px-2 py-2 bg-gray-900 border border-gray-800 rounded text-white text-sm"
                    >
                      <option value={1}>1h</option>
                      <option value={4}>4h</option>
                      <option value={8}>8h</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-sm text-rose-400 mb-1">Short Exchange</label>
                    <input
                      type="text"
                      value={manualInputs.shortExchange}
                      onChange={(e) => handleManualChange('shortExchange', e.target.value)}
                      className="w-full px-2 py-2 bg-gray-900 border border-gray-800 rounded text-white text-sm"
                      placeholder="e.g. Drift"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-rose-400 mb-1">Rate (%)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={manualInputs.shortRate}
                      onChange={(e) => handleManualChange('shortRate', e.target.value)}
                      className="w-full px-2 py-2 bg-gray-900 border border-gray-800 rounded text-white text-sm"
                      placeholder="-0.015"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-rose-400 mb-1">Every (hrs)</label>
                    <select
                      value={manualInputs.shortInterval}
                      onChange={(e) => handleManualChange('shortInterval', Number(e.target.value))}
                      className="w-full px-2 py-2 bg-gray-900 border border-gray-800 rounded text-white text-sm"
                    >
                      <option value={1}>1h</option>
                      <option value={4}>4h</option>
                      <option value={8}>8h</option>
                    </select>
                  </div>
                </div>
                {manualArb && (
                  <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-4 mt-2">
                    <div className="text-center">
                      <p className="text-emerald-400 font-medium">{manualInputs.symbol} Arbitrage</p>
                      <p className="text-2xl font-bold text-emerald-400 mt-1">
                        {manualArb.combined.toFixed(1)}% APY
                      </p>
                      <div className="text-sm text-gray-300 mt-2">
                        <p>+{manualArb.longAPY.toFixed(1)}% (Long) + {manualArb.shortAPY.toFixed(1)}% (Short)</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-5 border-t border-gray-800 flex justify-end">
                <button
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 bg-gray-900 hover:bg-gray-800 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Market Sentiment Modal */}
        {showSentimentModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-950 border border-gray-800 rounded-xl w-full max-w-lg">
              <div className="p-5 border-b border-gray-800 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span className="text-lg">{sentimentAnalyzer.getSentimentIcon(sentiment.sentiment)}</span>
                  Market Sentiment Analysis
                </h3>
                <button 
                  onClick={() => setShowSentimentModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="p-5 space-y-6">
                {/* Main Sentiment Display */}
                <div className="text-center">
                  <div className="text-4xl font-bold text-white mb-2">{sentiment.score}</div>
                  <div className="text-sm text-gray-400 mb-4">Sentiment Score</div>
                  <div className={`text-2xl font-bold ${sentimentAnalyzer.getSentimentColor(sentiment.sentiment)}`}>
                    {sentimentAnalyzer.getSentimentDescription(sentiment.sentiment, sentiment.score)}
                  </div>
                  <div className="text-sm text-gray-500 mt-2">
                    Confidence: {sentiment.confidence}%
                  </div>
                </div>

                {/* Breakdown */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                    <div className="text-2xl font-bold text-emerald-400">{sentiment.bullishRatio}%</div>
                    <div className="text-sm text-gray-400">Bullish Rates</div>
                    <div className="text-xs text-gray-500 mt-1">Positive funding</div>
                  </div>
                  <div className="text-center p-4 bg-rose-500/10 rounded-lg border border-rose-500/20">
                    <div className="text-2xl font-bold text-rose-400">{sentiment.bearishRatio}%</div>
                    <div className="text-sm text-gray-400">Bearish Rates</div>
                    <div className="text-xs text-gray-500 mt-1">Negative funding</div>
                  </div>
                  <div className="text-center p-4 bg-orange-500/10 rounded-lg border border-orange-500/20">
                    <div className="text-2xl font-bold text-orange-400">{sentiment.extremeRatio}%</div>
                    <div className="text-sm text-gray-400">Extreme Rates</div>
                    <div className="text-xs text-gray-500 mt-1">&gt;1% funding</div>
                  </div>
                </div>

                {/* How it works */}
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-300 mb-2">How Sentiment is Calculated</h4>
                  <ul className="text-xs text-gray-400 space-y-1">
                    <li>• Analyzes all funding rates across exchanges</li>
                    <li>• Weights by open interest (higher OI = more influence)</li>
                    <li>• Bullish: rates &gt; 0.5% (longs pay shorts)</li>
                    <li>• Bearish: rates &lt; -0.5% (shorts pay longs)</li>
                    <li>• Extreme: rates &gt; 1% (high volatility)</li>
                    <li>• Score: -100 (very bearish) to +100 (very bullish)</li>
                  </ul>
                </div>
              </div>
              <div className="p-5 border-t border-gray-800 flex justify-end">
                <button
                  onClick={() => setShowSentimentModal(false)}
                  className="px-4 py-2 bg-gray-900 hover:bg-gray-800 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 pt-2">
          {error ? '⚠️ Using mock data — check API configuration' : '✅ Connected to live funding rate feeds'}
        </div>
      </div>
    </div>
  );
}

// 'use client';

// import React, { useState, useEffect, useMemo } from 'react';
// import { 
//   AlertCircle, 
//   TrendingUp, 
//   TrendingDown, 
//   RefreshCw, 
//   Zap, 
//   Settings, 
//   Search,
//   Plus,
//   Target,
//   ChevronDown,
//   ChevronUp
// } from 'lucide-react';

// // Utils
// const toAPY = (hourlyRate) => {
//   return (Math.pow(1 + hourlyRate / 100, 24 * 365) - 1) * 100;
// };

// const findAllArbs = (rates, minSpread = 0) => {
//   const symbols = [...new Set(rates.map(r => r.symbol.replace('-PERP', '')))];
//   const opportunities = [];
  
//   for (const sym of symbols) {
//     const symRates = rates.filter(r => r.symbol === `${sym}-PERP`);
//     const longs = symRates.filter(r => r.rate > 0).sort((a, b) => b.apy - a.apy);
//     const shorts = symRates.filter(r => r.rate < 0).sort((a, b) => a.apy - b.apy);
    
//     if (longs.length > 0 && shorts.length > 0) {
//       const combinedAPY = longs[0].apy + Math.abs(shorts[0].apy);
      
//       if (combinedAPY >= minSpread) {
//         opportunities.push({
//           symbol: sym,
//           longExchange: longs[0].exchange,
//           longRate: longs[0].rate,
//           longAPY: longs[0].apy,
//           shortExchange: shorts[0].exchange,
//           shortRate: shorts[0].rate,
//           shortAPY: Math.abs(shorts[0].apy),
//           combinedAPY,
//           alternativeLongs: longs.slice(1, 3),
//           alternativeShorts: shorts.slice(1, 3)
//         });
//       }
//     }
//   }
  
//   return opportunities.sort((a, b) => b.combinedAPY - a.combinedAPY);
// };

// export default function FundingRateDashboard() {
//   const [rates, setRates] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [lastUpdate, setLastUpdate] = useState(new Date());
//   const [alertThreshold, setAlertThreshold] = useState(0.02);
//   const [spreadThreshold, setSpreadThreshold] = useState(50);
//   const [error, setError] = useState(null);
//   const [showSettings, setShowSettings] = useState(false);
//   const [searchQuery, setSearchQuery] = useState('');
//   const [sortConfig, setSortConfig] = useState({ key: null, direction: 'desc' });
//   const [currentPage, setCurrentPage] = useState(1);
//   const [expandedArbs, setExpandedArbs] = useState({});
//   const [showArbsSection, setShowArbsSection] = useState(true);
//   const [showManualModal, setShowManualModal] = useState(false);
//   const rowsPerPage = 20;

//   const [manualInputs, setManualInputs] = useState({
//     symbol: 'BTC',
//     longExchange: '',
//     longRate: '',
//     longInterval: 8,
//     shortExchange: '',
//     shortRate: '',
//     shortInterval: 8
//   });

//   const manualArb = useMemo(() => {
//     const { longRate, shortRate, longInterval, shortInterval } = manualInputs;
//     const longRateNum = parseFloat(longRate) || 0;
//     const shortRateNum = parseFloat(shortRate) || 0;

//     if (longRateNum <= 0 || shortRateNum >= 0) return null;

//     const longHourly = (Math.pow(1 + longRateNum / 100, 1 / longInterval) - 1) * 100;
//     const shortHourly = (Math.pow(1 + Math.abs(shortRateNum) / 100, 1 / shortInterval) - 1) * 100;

//     const longAPY = toAPY(longHourly);
//     const shortAPY = toAPY(shortHourly);
//     const combined = longAPY + shortAPY;

//     return { longAPY, shortAPY, combined };
//   }, [manualInputs]);

//   const fetchRates = async () => {
//     setLoading(true);
//     setError(null);
//     try {
//       const res = await fetch('/api/rates', { cache: 'no-store' });
//       if (!res.ok) throw new Error('Failed to fetch rates');
//       const data = await res.json();
//       if (data.error) throw new Error(data.error);
//       setRates(data);
//       setLastUpdate(new Date());
//     } catch (err) {
//       console.error('Error fetching rates:', err);
//       setError(err.message);
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchRates();
//     const interval = setInterval(fetchRates, 60000);
//     return () => clearInterval(interval);
//   }, []);

//   useEffect(() => {
//     setCurrentPage(1);
//   }, [searchQuery, sortConfig]);

//   const handleSort = (key) => {
//     let direction = 'desc';
//     if (sortConfig.key === key && sortConfig.direction === 'desc') {
//       direction = 'asc';
//     }
//     setSortConfig({ key, direction });
//   };

//   const handleManualChange = (field, value) => {
//     setManualInputs(prev => ({ ...prev, [field]: value }));
//   };

//   const filteredAndSortedRates = useMemo(() => {
//     let result = [...rates];
//     if (searchQuery) {
//       const q = searchQuery.toLowerCase();
//       result = result.filter(rate => 
//         rate.exchange.toLowerCase().includes(q) || 
//         rate.symbol.toLowerCase().includes(q)
//       );
//     }
//     if (sortConfig.key) {
//       result.sort((a, b) => {
//         let aValue = a[sortConfig.key];
//         let bValue = b[sortConfig.key];
//         if (typeof aValue === 'string') {
//           aValue = aValue.toLowerCase();
//           bValue = bValue.toLowerCase();
//           return sortConfig.direction === 'asc' 
//             ? aValue.localeCompare(bValue) 
//             : bValue.localeCompare(aValue);
//         } else {
//           return sortConfig.direction === 'asc' 
//             ? aValue - bValue 
//             : bValue - aValue;
//         }
//       });
//     }
//     return result;
//   }, [rates, searchQuery, sortConfig]);

//   const allArbs = useMemo(() => findAllArbs(rates, spreadThreshold), [rates, spreadThreshold]);
//   const hasHighAlert = rates.some(r => Math.abs(r.rate) > alertThreshold);

//   const getSortIcon = (column) => {
//     if (sortConfig.key !== column) return null;
//     return sortConfig.direction === 'asc' ? '↑' : '↓';
//   };

//   const totalPages = Math.ceil(filteredAndSortedRates.length / rowsPerPage);
//   const displayedRates = filteredAndSortedRates.slice(
//     (currentPage - 1) * rowsPerPage,
//     currentPage * rowsPerPage
//   );

//   const toggleArbExpansion = (symbol) => {
//     setExpandedArbs(prev => ({
//       ...prev,
//       [symbol]: !prev[symbol]
//     }));
//   };

//   return (
//     <div className="min-h-screen bg-gray-950 text-gray-100 p-4 sm:p-6">
//       <div className="max-w-7xl mx-auto space-y-6">
//         {/* Header */}
//         <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
//           <div>
//             <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
//               <Zap className="text-blue-400" size={28} />
//               Funding Rate Arbitrage Dashboard
//             </h1>
//             <p className="text-gray-400 text-sm mt-1">
//               Last updated: {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
//             </p>
//           </div>
//           <div className="flex gap-3">
//             <button
//               onClick={() => setShowManualModal(true)}
//               className="flex items-center gap-2 px-3 py-2 bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors"
//             >
//               <Plus className="w-4 h-4" />
//               <span className="hidden sm:inline">Manual Arb</span>
//             </button>
//             <button
//               onClick={() => setShowSettings(!showSettings)}
//               className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
//             >
//               <Settings className="w-4 h-4" />
//               <span className="hidden sm:inline">Settings</span>
//             </button>
//             <button
//               onClick={fetchRates}
//               disabled={loading}
//               className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
//             >
//               <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
//               Refresh
//             </button>
//           </div>
//         </header>

//         {/* Error Alert */}
//         {error && (
//           <div className="bg-yellow-900/30 border-l-4 border-yellow-500 p-4 rounded">
//             <div className="flex items-start gap-3">
//               <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
//               <p className="text-yellow-300 text-sm">
//                 <span className="font-medium">Data Warning:</span> {error}. Showing fallback data.
//               </p>
//             </div>
//           </div>
//         )}

//         {/* Settings Panel */}
//         {showSettings && (
//           <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
//             <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
//               <Settings className="w-5 h-5" />
//               Alert Thresholds
//             </h3>
//             <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
//               <div>
//                 <label className="block text-sm text-gray-400 mb-2">
//                   Extreme Rate Alert (hourly %)
//                 </label>
//                 <input
//                   type="number"
//                   step="0.001"
//                   min="0"
//                   value={alertThreshold}
//                   onChange={(e) => setAlertThreshold(parseFloat(e.target.value) || 0)}
//                   className="w-full px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                 />
//                 <p className="text-xs text-gray-500 mt-2">
//                   Current: {(alertThreshold * 100).toFixed(2)}% hourly ≈ {toAPY(alertThreshold).toFixed(0)}% APY
//                 </p>
//               </div>
//               <div>
//                 <label className="block text-sm text-gray-400 mb-2">
//                   Minimum Arb Spread (Combined APY %)
//                 </label>
//                 <input
//                   type="number"
//                   step="1"
//                   min="0"
//                   value={spreadThreshold}
//                   onChange={(e) => setSpreadThreshold(parseFloat(e.target.value) || 0)}
//                   className="w-full px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                 />
//                 <p className="text-xs text-gray-500 mt-2">
//                   Show opportunities with combined APY ≥ {spreadThreshold}%
//                 </p>
//               </div>
//             </div>
//           </div>
//         )}

//         {/* Arbitrage Opportunities Section */}
//         {allArbs.length > 0 && (
//           <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
//             <div 
//               className="flex items-center justify-between p-5 cursor-pointer hover:bg-gray-850/60"
//               onClick={() => setShowArbsSection(!showArbsSection)}
//             >

//               <div className="flex items-center gap-3">
//                 <Target className="w-6 h-6 text-emerald-400" />
//                 <div>
//                   <h2 className="text-xl font-bold text-white">
//                     Active Arbitrage Opportunities
//                   </h2>
//                   <p className="text-sm text-gray-400 mt-0.5">
//                     {allArbs.length} {allArbs.length === 1 ? 'opportunity' : 'opportunities'} found above {spreadThreshold}% APY
//                   </p>
//                 </div>
//               </div>
//               {showArbsSection ? <ChevronUp className="text-gray-400" /> : <ChevronDown className="text-gray-400" />}
//             </div>

//             {showArbsSection && (
//               <div className="space-y-3 p-5 pt-0">
//                 {allArbs.map((arb, idx) => (
//                   <div 
//                     key={arb.symbol}
//                     className="bg-gradient-to-r from-emerald-900/20 to-cyan-900/20 border border-emerald-700/50 rounded-lg overflow-hidden"
//                   >
//                     <div className="p-4">
//                       <div className="flex flex-col lg:flex-row lg:items-center gap-4">
//                         <div className="flex-shrink-0">
//                           <div className="bg-emerald-500/20 px-3 py-2 rounded-lg text-center">
//                             <div className="text-2xl font-bold text-emerald-400">#{idx + 1}</div>
//                             <div className="text-xs text-emerald-300">{arb.symbol}</div>
//                           </div>
//                         </div>
//                         <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
//                           <div>
//                             <p className="text-xs text-gray-400 mb-1">Long Position</p>
//                             <p className="font-semibold text-white">{arb.longExchange}</p>
//                             <p className="text-emerald-400 font-medium">+{arb.longAPY.toFixed(1)}% APY</p>
//                             <p className="text-xs text-gray-500">{(arb.longRate * 100).toFixed(4)}% / period</p>
//                           </div>
//                           <div>
//                             <p className="text-xs text-gray-400 mb-1">Short Position</p>
//                             <p className="font-semibold text-white">{arb.shortExchange}</p>
//                             <p className="text-emerald-400 font-medium">+{arb.shortAPY.toFixed(1)}% APY</p>
//                             <p className="text-xs text-gray-500">{(arb.shortRate * 100).toFixed(4)}% / period</p>
//                           </div>
//                           <div className="bg-emerald-900/40 rounded-lg p-3 flex flex-col justify-center">
//                             <p className="text-xs text-gray-400">Total Profit</p>
//                             <p className="text-3xl font-bold text-emerald-400">{arb.combinedAPY.toFixed(1)}%</p>
//                             <p className="text-xs text-emerald-300">Combined APY</p>
//                           </div>
//                         </div>
//                         {(arb.alternativeLongs.length > 0 || arb.alternativeShorts.length > 0) && (
//                           <button
//                             onClick={() => toggleArbExpansion(arb.symbol)}
//                             className="flex-shrink-0 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm flex items-center gap-2"
//                           >
//                             Alternatives
//                             {expandedArbs[arb.symbol] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
//                           </button>
//                         )}
//                       </div>
//                       {expandedArbs[arb.symbol] && (
//                         <div className="mt-4 pt-4 border-t border-emerald-700/30 grid grid-cols-1 sm:grid-cols-2 gap-4">
//                           {arb.alternativeLongs.length > 0 && (
//                             <div>
//                               <p className="text-xs text-gray-400 mb-2 font-semibold">Alternative Long Exchanges:</p>
//                               <div className="space-y-1">
//                                 {arb.alternativeLongs.map((alt, i) => (
//                                   <div key={i} className="flex justify-between text-sm bg-gray-900/50 px-3 py-1.5 rounded">
//                                     <span className="text-gray-300">{alt.exchange}</span>
//                                     <span className="text-emerald-400">+{alt.apy.toFixed(1)}%</span>
//                                   </div>
//                                 ))}
//                               </div>
//                             </div>
//                           )}
//                           {arb.alternativeShorts.length > 0 && (
//                             <div>
//                               <p className="text-xs text-gray-400 mb-2 font-semibold">Alternative Short Exchanges:</p>
//                               <div className="space-y-1">
//                                 {arb.alternativeShorts.map((alt, i) => (
//                                   <div key={i} className="flex justify-between text-sm bg-gray-900/50 px-3 py-1.5 rounded">
//                                     <span className="text-gray-300">{alt.exchange}</span>
//                                     <span className="text-emerald-400">+{Math.abs(alt.apy).toFixed(1)}%</span>
//                                   </div>
//                                 ))}
//                               </div>
//                             </div>
//                           )}
//                         </div>
//                       )}
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             )}
//           </div>
//         )}

//         {/* High Alert Banner */}
//         {hasHighAlert && (
//           <div className="bg-red-900/20 border-l-4 border-red-500 p-4 rounded">
//             <div className="flex items-start gap-3">
//               <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
//               <p className="text-red-300">
//                 <span className="font-medium">Extreme funding rate alert:</span> Some rates exceed {(alertThreshold * 100).toFixed(2)}% hourly (~{toAPY(alertThreshold).toFixed(0)}% APY).
//               </p>
//             </div>
//           </div>
//         )}

//         {/* Search Bar */}
//         <div className="relative">
//           <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
//           <input
//             type="text"
//             placeholder="Search exchanges or symbols (e.g. BTC, Drift)..."
//             value={searchQuery}
//             onChange={(e) => setSearchQuery(e.target.value)}
//             className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//           />
//         </div>

//         {/* Rates Table */}
//         <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
//           <div className="overflow-x-auto">
//             <table className="w-full">
//               <thead className="bg-gray-850 text-left">
//                 <tr>
//                   <th 
//                     className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200"
//                     onClick={() => handleSort('exchange')}
//                   >
//                     Exchange {getSortIcon('exchange')}
//                   </th>
//                   <th 
//                     className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200"
//                     onClick={() => handleSort('symbol')}
//                   >
//                     Symbol {getSortIcon('symbol')}
//                   </th>
//                   <th 
//                     className="px-5 py-3.5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200"
//                     onClick={() => handleSort('rate')}
//                   >
//                     Hourly Rate {getSortIcon('rate')}
//                   </th>
//                   <th 
//                     className="px-5 py-3.5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200"
//                     onClick={() => handleSort('apy')}
//                   >
//                     APY {getSortIcon('apy')}
//                   </th>
//                   <th className="px-5 py-3.5 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
//                     Status
//                   </th>
//                 </tr>
//               </thead>
//               <tbody className="divide-y divide-gray-800/50">
//                 {loading ? (
//                   <tr>
//                     <td colSpan="5" className="px-5 py-8 text-center text-gray-500">
//                       Loading live funding rates...
//                     </td>
//                   </tr>
//                 ) : filteredAndSortedRates.length === 0 ? (
//                   <tr>
//                     <td colSpan="5" className="px-5 py-8 text-center text-gray-500">
//                       No matching data
//                     </td>
//                   </tr>
//                 ) : (
//                   displayedRates.map((rate, idx) => {
//                     const isPositive = rate.rate > 0;
//                     const isExtreme = Math.abs(rate.rate) > alertThreshold;
//                     return (
//                       <tr key={idx} className="hover:bg-gray-850/60 transition-colors">
//                         <td className="px-5 py-4">
//                           <span className="font-medium text-white">{rate.exchange}</span>
//                         </td>
//                         <td className="px-5 py-4 text-gray-300">{rate.symbol}</td>
//                         <td className={`px-5 py-4 text-right font-mono font-medium ${
//                           isPositive ? 'text-emerald-400' : 'text-rose-400'
//                         }`}>
//                           {isPositive ? '+' : ''}{(rate.rate * 100).toFixed(4)}%
//                         </td>
//                         <td className={`px-5 py-4 text-right font-semibold ${
//                           isPositive ? 'text-emerald-400' : 'text-rose-400'
//                         }`}>
//                           {isPositive ? '+' : ''}{rate.apy.toFixed(1)}%
//                         </td>
//                         <td className="px-5 py-4 text-center">
//                           <div className="flex items-center justify-center gap-2">
//                             {isPositive ? (
//                               <TrendingUp className="w-4 h-4 text-emerald-400" />
//                             ) : (
//                               <TrendingDown className="w-4 h-4 text-rose-400" />
//                             )}
//                             <span className={`text-xs font-medium ${
//                               isPositive ? 'text-emerald-400' : 'text-rose-400'
//                             }`}>
//                               {isPositive ? 'Receiving' : 'Paying'}
//                             </span>
//                             {isExtreme && (
//                               <span className="px-2 py-0.5 bg-rose-900/40 text-rose-400 text-xs rounded-full font-medium">
//                                 Extreme
//                               </span>
//                             )}
//                           </div>
//                         </td>
//                       </tr>
//                     );
//                   })
//                 )}
//               </tbody>
//             </table>
//           </div>

//           {/* Pagination */}
//           {!loading && filteredAndSortedRates.length > 0 && (
//             <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-gray-800">
//               <div className="text-sm text-gray-400">
//                 Showing {(currentPage - 1) * rowsPerPage + 1}–
//                 {Math.min(currentPage * rowsPerPage, filteredAndSortedRates.length)} of {filteredAndSortedRates.length} entries
//               </div>
//               <div className="flex items-center gap-2">
//                 <button
//                   onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
//                   disabled={currentPage === 1}
//                   className="px-3 py-1.5 text-sm rounded border border-gray-800 bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800"
//                 >
//                   Prev
//                 </button>
//                 <span className="px-3 py-1.5 text-sm text-gray-300">
//                   Page {currentPage} of {totalPages}
//                 </span>
//                 <button
//                   onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
//                   disabled={currentPage >= totalPages}
//                   className="px-3 py-1.5 text-sm rounded border border-gray-800 bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800"
//                 >
//                   Next
//                 </button>
//               </div>
//             </div>
//           )}
//         </div>

//         {/* Manual Arb Modal */}
//         {showManualModal && (
//           <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
//             <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md">
//               <div className="p-5 border-b border-gray-800 flex justify-between items-center">
//                 <h3 className="text-lg font-semibold text-white">Manual Arbitrage Calculator</h3>
//                 <button 
//                   onClick={() => setShowManualModal(false)}
//                   className="text-gray-400 hover:text-white"
//                 >
//                   ✕
//                 </button>
//               </div>
//               <div className="p-5 space-y-4">
//                 <div>
//                   <label className="block text-sm text-gray-400 mb-1">Token Symbol</label>
//                   <input
//                     type="text"
//                     value={manualInputs.symbol}
//                     onChange={(e) => handleManualChange('symbol', e.target.value)}
//                     className="w-full px-3 py-2 bg-gray-900 border border-gray-800 rounded text-white"
//                     placeholder="e.g. BTC"
//                   />
//                 </div>
//                 <div className="grid grid-cols-3 gap-2">
//                   <div>
//                     <label className="block text-sm text-emerald-400 mb-1">Long Exchange</label>
//                     <input
//                       type="text"
//                       value={manualInputs.longExchange}
//                       onChange={(e) => handleManualChange('longExchange', e.target.value)}
//                       className="w-full px-2 py-2 bg-gray-900 border border-gray-800 rounded text-white text-sm"
//                       placeholder="e.g. Hyperliquid"
//                     />
//                   </div>
//                   <div>
//                     <label className="block text-sm text-emerald-400 mb-1">Rate (%)</label>
//                     <input
//                       type="number"
//                       step="0.0001"
//                       value={manualInputs.longRate}
//                       onChange={(e) => handleManualChange('longRate', e.target.value)}
//                       className="w-full px-2 py-2 bg-gray-900 border border-gray-800 rounded text-white text-sm"
//                       placeholder="0.01"
//                     />
//                   </div>
//                   <div>
//                     <label className="block text-sm text-emerald-400 mb-1">Every (hrs)</label>
//                     <select
//                       value={manualInputs.longInterval}
//                       onChange={(e) => handleManualChange('longInterval', Number(e.target.value))}
//                       className="w-full px-2 py-2 bg-gray-900 border border-gray-800 rounded text-white text-sm"
//                     >
//                       <option value={1}>1h</option>
//                       <option value={4}>4h</option>
//                       <option value={8}>8h</option>
//                     </select>
//                   </div>
//                 </div>
//                 <div className="grid grid-cols-3 gap-2">
//                   <div>
//                     <label className="block text-sm text-rose-400 mb-1">Short Exchange</label>
//                     <input
//                       type="text"
//                       value={manualInputs.shortExchange}
//                       onChange={(e) => handleManualChange('shortExchange', e.target.value)}
//                       className="w-full px-2 py-2 bg-gray-900 border border-gray-800 rounded text-white text-sm"
//                       placeholder="e.g. Drift"
//                     />
//                   </div>
//                   <div>
//                     <label className="block text-sm text-rose-400 mb-1">Rate (%)</label>
//                     <input
//                       type="number"
//                       step="0.0001"
//                       value={manualInputs.shortRate}
//                       onChange={(e) => handleManualChange('shortRate', e.target.value)}
//                       className="w-full px-2 py-2 bg-gray-900 border border-gray-800 rounded text-white text-sm"
//                       placeholder="-0.015"
//                     />
//                   </div>
//                   <div>
//                     <label className="block text-sm text-rose-400 mb-1">Every (hrs)</label>
//                     <select
//                       value={manualInputs.shortInterval}
//                       onChange={(e) => handleManualChange('shortInterval', Number(e.target.value))}
//                       className="w-full px-2 py-2 bg-gray-900 border border-gray-800 rounded text-white text-sm"
//                     >
//                       <option value={1}>1h</option>
//                       <option value={4}>4h</option>
//                       <option value={8}>8h</option>
//                     </select>
//                   </div>
//                 </div>
//                 {manualArb && (
//                   <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-4 mt-2">
//                     <div className="text-center">
//                       <p className="text-emerald-400 font-medium">{manualInputs.symbol} Arbitrage</p>
//                       <p className="text-2xl font-bold text-emerald-400 mt-1">
//                         {manualArb.combined.toFixed(1)}% APY
//                       </p>
//                       <div className="text-sm text-gray-300 mt-2">
//                         <p>+{manualArb.longAPY.toFixed(1)}% (Long) + {manualArb.shortAPY.toFixed(1)}% (Short)</p>
//                       </div>
//                     </div>
//                   </div>
//                 )}
//               </div>
//               <div className="p-5 border-t border-gray-800 flex justify-end">
//                 <button
//                   onClick={() => setShowManualModal(false)}
//                   className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
//                 >
//                   Close
//                 </button>
//               </div>
//             </div>
//           </div>
//         )}

//         {/* Footer */}
//         <div className="text-center text-sm text-gray-500 pt-2">
//           {error ? '⚠️ Using mock data — check API configuration' : '✅ Connected to live funding rate feeds'}
//         </div>
//       </div>
//     </div>
//   );
// }


