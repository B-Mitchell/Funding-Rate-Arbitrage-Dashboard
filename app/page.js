'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  AlertCircle, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  Zap, 
  Settings, 
  Search,
  Plus
} from 'lucide-react';

// Utils
const toAPY = (hourlyRate) => {
  return (Math.pow(1 + hourlyRate / 100, 24 * 365) - 1) * 100;
};

const findBestArb = (rates) => {
  const symbols = [...new Set(rates.map(r => r.symbol.replace('-PERP', '')))];
  for (const sym of symbols) {
    const symRates = rates.filter(r => r.symbol === `${sym}-PERP`);
    const longs = symRates.filter(r => r.rate > 0).sort((a, b) => b.apy - a.apy);
    const shorts = symRates.filter(r => r.rate < 0).sort((a, b) => a.apy - b.apy);
    if (longs.length > 0 && shorts.length > 0) {
      return {
        symbol: sym,
        longExchange: longs[0].exchange,
        longRate: longs[0].rate,
        longAPY: longs[0].apy,
        shortExchange: shorts[0].exchange,
        shortRate: shorts[0].rate,
        shortAPY: Math.abs(shorts[0].apy),
        combinedAPY: longs[0].apy + Math.abs(shorts[0].apy)
      };
    }
  }
  return null;
};

export default function FundingRateDashboard() {
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [alertThreshold, setAlertThreshold] = useState(0.02);
  const [spreadThreshold, setSpreadThreshold] = useState(50);
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [showManualModal, setShowManualModal] = useState(false);
  const rowsPerPage = 20;

  const [manualInputs, setManualInputs] = useState({
    symbol: 'BTC',
    longExchange: '',
    longRate: '',
    longInterval: 8,
    shortExchange: '',
    shortRate: '',
    shortInterval: 8
  });

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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortConfig]);

  const fetchRates = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rates', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch rates');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRates(data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error fetching rates:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
    const interval = setInterval(fetchRates, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const filteredAndSortedRates = useMemo(() => {
    let result = [...rates];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(rate => 
        rate.exchange.toLowerCase().includes(q) || 
        rate.symbol.toLowerCase().includes(q)
      );
    }
    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
          return sortConfig.direction === 'asc' 
            ? aValue.localeCompare(bValue) 
            : bValue.localeCompare(aValue);
        } else {
          return sortConfig.direction === 'asc' 
            ? aValue - bValue 
            : bValue - aValue;
        }
      });
    }
    return result;
  }, [rates, searchQuery, sortConfig]);

  const bestArb = findBestArb(rates);
  const hasHighAlert = rates.some(r => Math.abs(r.rate) > alertThreshold);
  const showArbOpportunity = bestArb && bestArb.combinedAPY > spreadThreshold;

  const getSortIcon = (column) => {
    if (sortConfig.key !== column) return null;
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const totalPages = Math.ceil(filteredAndSortedRates.length / rowsPerPage);
  const displayedRates = filteredAndSortedRates.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const handleManualChange = (field, value) => {
    setManualInputs(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
              <Zap className="text-blue-400" size={28} />
              Funding Rate Arbitrage Dashboard
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Last updated: {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowManualModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-900 hover:bg-emerald-800 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Manual Arb</span>
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </button>
            <button
              onClick={fetchRates}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </header>

        {/* Alerts & Opportunity Banner */}
        <div className="space-y-4">
          {error && (
            <div className="bg-yellow-900/30 border-l-4 border-yellow-500 p-4 rounded">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <p className="text-yellow-300 text-sm">
                  <span className="font-medium">Data Warning:</span> {error}. Showing fallback data.
                </p>
              </div>
            </div>
          )}

          {showArbOpportunity && (
            <div className="bg-gradient-to-r from-emerald-900/40 to-cyan-900/40 border border-emerald-700 rounded-xl p-5">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-shrink-0 bg-emerald-500/20 p-3 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-emerald-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-emerald-400 mb-2">
                    🎯 {bestArb.symbol} Arbitrage Opportunity
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-gray-400">Long on</p>
                      <p className="font-semibold text-white">{bestArb.longExchange}</p>
                      <p className="text-emerald-400 font-medium">+{bestArb.longAPY.toFixed(1)}% APY</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Short on</p>
                      <p className="font-semibold text-white">{bestArb.shortExchange}</p>
                      <p className="text-emerald-400 font-medium">+{bestArb.shortAPY.toFixed(1)}% APY</p>
                    </div>
                    <div className="bg-emerald-900/30 rounded-lg p-3">
                      <p className="text-gray-400">Combined APY</p>
                      <p className="text-2xl font-bold text-emerald-400">{bestArb.combinedAPY.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {hasHighAlert && !showArbOpportunity && (
            <div className="bg-red-900/20 border-l-4 border-red-500 p-4 rounded">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-red-300">
                  <span className="font-medium">Extreme funding rate alert:</span> Rates exceed {(alertThreshold * 100).toFixed(2)}% hourly (~{toAPY(alertThreshold).toFixed(0)}% APY).
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 animate-in fade-in duration-200">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Alert Thresholds
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Current: {(alertThreshold * 100).toFixed(2)}% hourly ≈ {toAPY(alertThreshold).toFixed(0)}% APY
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Arb Spread Alert (Combined APY %)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={spreadThreshold}
                  onChange={(e) => setSpreadThreshold(parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Alert when combined APY ≥ {spreadThreshold}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search exchanges or symbols (e.g. BTC, Drift)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Rates Table with Pagination */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-850 text-left">
                <tr>
                  <th 
                    className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200"
                    onClick={() => handleSort('exchange')}
                  >
                    Exchange {getSortIcon('exchange')}
                  </th>
                  <th 
                    className="px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200"
                    onClick={() => handleSort('symbol')}
                  >
                    Symbol {getSortIcon('symbol')}
                  </th>
                  <th 
                    className="px-5 py-3.5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200"
                    onClick={() => handleSort('rate')}
                  >
                    Hourly Rate {getSortIcon('rate')}
                  </th>
                  <th 
                    className="px-5 py-3.5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200"
                    onClick={() => handleSort('apy')}
                  >
                    APY {getSortIcon('apy')}
                  </th>
                  <th className="px-5 py-3.5 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-5 py-8 text-center text-gray-500">
                      Loading live funding rates...
                    </td>
                  </tr>
                ) : filteredAndSortedRates.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-5 py-8 text-center text-gray-500">
                      No matching data
                    </td>
                  </tr>
                ) : (
                  displayedRates.map((rate, idx) => {
                    const isPositive = rate.rate > 0;
                    const isExtreme = Math.abs(rate.rate) > alertThreshold;
                    return (
                      <tr key={idx} className="hover:bg-gray-850/60 transition-colors">
                        <td className="px-5 py-4">
                          <span className="font-medium text-white">{rate.exchange}</span>
                        </td>
                        <td className="px-5 py-4 text-gray-300">{rate.symbol}</td>
                        <td className={`px-5 py-4 text-right font-mono font-medium ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {isPositive ? '+' : ''}{(rate.rate * 100).toFixed(4)}%
                        </td>
                        <td className={`px-5 py-4 text-right font-semibold ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {isPositive ? '+' : ''}{rate.apy.toFixed(1)}%
                        </td>
                        <td className="px-5 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {isPositive ? (
                              <TrendingUp className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <TrendingDown className="w-4 h-4 text-rose-400" />
                            )}
                            <span className={`text-xs font-medium ${
                              isPositive ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                              {isPositive ? 'Receiving' : 'Paying'}
                            </span>
                            {isExtreme && (
                              <span className="px-2 py-0.5 bg-rose-900/40 text-rose-400 text-xs rounded-full font-medium">
                                Extreme
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
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
                  className="px-3 py-1.5 text-sm rounded border border-gray-700 bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700"
                >
                  Prev
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-300">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1.5 text-sm rounded border border-gray-700 bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Status */}
        <div className="text-center text-sm text-gray-500 pt-2">
          {error ? '⚠️ Using mock data — check API configuration' : '✅ Connected to live funding rate feeds'}
        </div>
      </div>

      {/* ✅ Manual Arb Modal — FULLY FIXED */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md">
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
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                  placeholder="e.g. BTC"
                />
              </div>

              {/* Long Side */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm text-emerald-400 mb-1">Long Exchange</label>
                  <input
                    type="text"
                    value={manualInputs.longExchange}
                    onChange={(e) => handleManualChange('longExchange', e.target.value)}
                    className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm"
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
                    className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm"
                    placeholder="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm text-emerald-400 mb-1">Every (hrs)</label>
                  <select
                    value={manualInputs.longInterval}
                    onChange={(e) => handleManualChange('longInterval', Number(e.target.value))}
                    className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm"
                  >
                    <option value={1}>1h</option>
                    <option value={4}>4h</option>
                    <option value={8}>8h</option>
                  </select>
                </div>
              </div>

              {/* Short Side */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm text-rose-400 mb-1">Short Exchange</label>
                  <input
                    type="text"
                    value={manualInputs.shortExchange}
                    onChange={(e) => handleManualChange('shortExchange', e.target.value)}
                    className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm"
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
                    className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm"
                    placeholder="-0.015"
                  />
                </div>
                <div>
                  <label className="block text-sm text-rose-400 mb-1">Every (hrs)</label>
                  <select
                    value={manualInputs.shortInterval}
                    onChange={(e) => handleManualChange('shortInterval', Number(e.target.value))}
                    className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm"
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
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
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
//   Plus
// } from 'lucide-react';

// // Utils
// const toAPY = (hourlyRate) => {
//   return (Math.pow(1 + hourlyRate / 100, 24 * 365) - 1) * 100;
// };

// const findBestArb = (rates) => {
//   // Find all unique symbols with BTC-like pairs
//   const symbols = [...new Set(rates.map(r => r.symbol.replace('-PERP', '')))];
  
//   for (const sym of symbols) {
//     const symRates = rates.filter(r => r.symbol === `${sym}-PERP`);
//     const longs = symRates.filter(r => r.rate > 0).sort((a, b) => b.apy - a.apy);
//     const shorts = symRates.filter(r => r.rate < 0).sort((a, b) => a.apy - b.apy);
    
//     if (longs.length > 0 && shorts.length > 0) {
//       return {
//         symbol: sym,
//         longExchange: longs[0].exchange,
//         longRate: longs[0].rate,
//         longAPY: longs[0].apy,
//         shortExchange: shorts[0].exchange,
//         shortRate: shorts[0].rate,
//         shortAPY: Math.abs(shorts[0].apy),
//         combinedAPY: longs[0].apy + Math.abs(shorts[0].apy)
//       };
//     }
//   }
  
//   return null;
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
//   const [showManualModal, setShowManualModal] = useState(false);
//   const rowsPerPage = 20;

//   // Manual calculator state
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
  
//     // Convert to hourly equivalent
//     const longHourly = (Math.pow(1 + longRateNum / 100, 1 / longInterval) - 1) * 100;
//     const shortHourly = (Math.pow(1 + Math.abs(shortRateNum) / 100, 1 / shortInterval) - 1) * 100;
  
//     const longAPY = toAPY(longHourly);
//     const shortAPY = toAPY(shortHourly);
//     const combined = longAPY + shortAPY;
  
//     return { longAPY, shortAPY, combined };
//   }, [manualInputs]);

//   // Reset to page 1 when search or sort changes
//   useEffect(() => {
//     setCurrentPage(1);
//   }, [searchQuery, sortConfig]);

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

//   const handleSort = (key) => {
//     let direction = 'desc';
//     if (sortConfig.key === key && sortConfig.direction === 'desc') {
//       direction = 'asc';
//     }
//     setSortConfig({ key, direction });
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

//   const bestArb = findBestArb(rates);
//   const hasHighAlert = rates.some(r => Math.abs(r.rate) > alertThreshold);
//   const showArbOpportunity = bestArb && bestArb.combinedAPY > spreadThreshold;

//   const getSortIcon = (column) => {
//     if (sortConfig.key !== column) return null;
//     return sortConfig.direction === 'asc' ? '↑' : '↓';
//   };

//   const totalPages = Math.ceil(filteredAndSortedRates.length / rowsPerPage);
//   const displayedRates = filteredAndSortedRates.slice(
//     (currentPage - 1) * rowsPerPage,
//     currentPage * rowsPerPage
//   );

//   // Handle manual input change
//   const handleManualChange = (field, value) => {
//     setManualInputs(prev => ({ ...prev, [field]: value }));
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

//         {/* Alerts & Opportunity Banner */}
//         <div className="space-y-4">
//           {error && (
//             <div className="bg-yellow-900/30 border-l-4 border-yellow-500 p-4 rounded">
//               <div className="flex items-start gap-3">
//                 <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
//                 <p className="text-yellow-300 text-sm">
//                   <span className="font-medium">Data Warning:</span> {error}. Showing fallback data.
//                 </p>
//               </div>
//             </div>
//           )}

//           {showArbOpportunity && (
//             <div className="bg-gradient-to-r from-emerald-900/40 to-cyan-900/40 border border-emerald-700 rounded-xl p-5">
//               <div className="flex flex-col md:flex-row md:items-center gap-4">
//                 <div className="flex-shrink-0 bg-emerald-500/20 p-3 rounded-lg">
//                   <TrendingUp className="w-6 h-6 text-emerald-400" />
//                 </div>
//                 <div className="flex-1">
//                   <h3 className="text-lg font-bold text-emerald-400 mb-2">
//                     🎯 {bestArb.symbol} Arbitrage Opportunity
//                   </h3>
//                   <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
//                     <div>
//                       <p className="text-gray-400">Long on</p>
//                       <p className="font-semibold text-white">{bestArb.longExchange}</p>
//                       <p className="text-emerald-400 font-medium">+{bestArb.longAPY.toFixed(1)}% APY</p>
//                     </div>
//                     <div>
//                       <p className="text-gray-400">Short on</p>
//                       <p className="font-semibold text-white">{bestArb.shortExchange}</p>
//                       <p className="text-emerald-400 font-medium">+{bestArb.shortAPY.toFixed(1)}% APY</p>
//                     </div>
//                     <div className="bg-emerald-900/30 rounded-lg p-3">
//                       <p className="text-gray-400">Combined APY</p>
//                       <p className="text-2xl font-bold text-emerald-400">{bestArb.combinedAPY.toFixed(1)}%</p>
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             </div>
//           )}

//           {hasHighAlert && !showArbOpportunity && (
//             <div className="bg-red-900/20 border-l-4 border-red-500 p-4 rounded">
//               <div className="flex items-start gap-3">
//                 <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
//                 <p className="text-red-300">
//                   <span className="font-medium">Extreme funding rate alert:</span> Rates exceed {(alertThreshold * 100).toFixed(2)}% hourly (~{toAPY(alertThreshold).toFixed(0)}% APY).
//                 </p>
//               </div>
//             </div>
//           )}
//         </div>

//         {/* Settings Panel */}
//         {showSettings && (
//           <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 animate-in fade-in duration-200">
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
//                   className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                 />
//                 <p className="text-xs text-gray-500 mt-2">
//                   Current: {(alertThreshold * 100).toFixed(2)}% hourly ≈ {toAPY(alertThreshold).toFixed(0)}% APY
//                 </p>
//               </div>
//               <div>
//                 <label className="block text-sm text-gray-400 mb-2">
//                   Arb Spread Alert (Combined APY %)
//                 </label>
//                 <input
//                   type="number"
//                   step="1"
//                   min="0"
//                   value={spreadThreshold}
//                   onChange={(e) => setSpreadThreshold(parseFloat(e.target.value) || 0)}
//                   className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
//                 />
//                 <p className="text-xs text-gray-500 mt-2">
//                   Alert when combined APY ≥ {spreadThreshold}%
//                 </p>
//               </div>
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

//         {/* Rates Table with Pagination */}
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

//           {/* Pagination Controls */}
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
//                   className="px-3 py-1.5 text-sm rounded border border-gray-700 bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700"
//                 >
//                   Prev
//                 </button>
//                 <span className="px-3 py-1.5 text-sm text-gray-300">
//                   Page {currentPage} of {totalPages}
//                 </span>
//                 <button
//                   onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
//                   disabled={currentPage >= totalPages}
//                   className="px-3 py-1.5 text-sm rounded border border-gray-700 bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700"
//                 >
//                   Next
//                 </button>
//               </div>
//             </div>
//           )}
//         </div>

//         {/* Footer Status */}
//         <div className="text-center text-sm text-gray-500 pt-2">
//           {error ? '⚠️ Using mock data — check API configuration' : '✅ Connected to live funding rate feeds'}
//         </div>
//       </div>

//       {/* ✅ Manual Arb Modal */}
//       {showManualModal && (
//         <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
//           <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md">
//             <div className="p-5 border-b border-gray-800 flex justify-between items-center">
//               <h3 className="text-lg font-semibold text-white">Manual Arbitrage Calculator</h3>
//               <button 
//                 onClick={() => setShowManualModal(false)}
//                 className="text-gray-400 hover:text-white"
//               >
//                 ✕
//               </button>
//             </div>
//             <div className="p-5 space-y-4">
//               <div>
//                 <label className="block text-sm text-gray-400 mb-1">Token Symbol</label>
//                 <input
//                   type="text"
//                   value={manualInputs.symbol}
//                   onChange={(e) => handleManualChange('symbol', e.target.value)}
//                   className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
//                   placeholder="e.g. BTC"
//                 />
//               </div>
              
//               <div className="grid grid-cols-2 gap-3">
//                 <div>
//                   <label className="block text-sm text-emerald-400 mb-1">Long Exchange</label>
//                   <input
//                     type="text"
//                     value={manualInputs.longExchange}
//                     onChange={(e) => handleManualChange('longExchange', e.target.value)}
//                     className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
//                     placeholder="e.g. Hyperliquid"
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-sm text-emerald-400 mb-1">Hourly Rate (%)</label>
//                   <input
//                     type="number"
//                     step="0.0001"
//                     value={manualInputs.longRate}
//                     onChange={(e) => handleManualChange('longRate', e.target.value)}
//                     className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
//                     placeholder="0.01"
//                   />
//                 </div>
//               </div>
              
//               <div className="grid grid-cols-2 gap-3">
//                 <div>
//                   <label className="block text-sm text-rose-400 mb-1">Short Exchange</label>
//                   <input
//                     type="text"
//                     value={manualInputs.shortExchange}
//                     onChange={(e) => handleManualChange('shortExchange', e.target.value)}
//                     className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
//                     placeholder="e.g. Drift"
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-sm text-rose-400 mb-1">Hourly Rate (%)</label>
//                   <input
//                     type="number"
//                     step="0.0001"
//                     value={manualInputs.shortRate}
//                     onChange={(e) => handleManualChange('shortRate', e.target.value)}
//                     className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
//                     placeholder="-0.015"
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-sm text-emerald-400 mb-1">Every (hrs)</label>
//                   <select
//                     value={manualInputs.longInterval}
//                     onChange={(e) => handleManualChange('longInterval', Number(e.target.value))}
//                     className="w-full px-2 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm"
//                   >
//                     <option value={1}>1h</option>
//                     <option value={4}>4h</option>
//                     <option value={8}>8h</option>
//                   </select>
//                 </div>
//               </div>

//               {manualArb && (
//                 <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-4 mt-2">
//                   <div className="text-center">
//                     <p className="text-emerald-400 font-medium">{manualInputs.symbol} Arbitrage</p>
//                     <p className="text-2xl font-bold text-emerald-400 mt-1">
//                       {manualArb.combined.toFixed(1)}% APY
//                     </p>
//                     <div className="text-sm text-gray-300 mt-2">
//                       <p>+{manualArb.longAPY.toFixed(1)}% (Long) + {manualArb.shortAPY.toFixed(1)}% (Short)</p>
//                     </div>
//                   </div>
//                 </div>
//               )}
//             </div>
//             <div className="p-5 border-t border-gray-800 flex justify-end">
//               <button
//                 onClick={() => setShowManualModal(false)}
//                 className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
//               >
//                 Close
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }
