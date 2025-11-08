'use client';

import React from 'react';
import { Zap, Bell, Star, StarOff, ExternalLink, Activity } from 'lucide-react';

export default function MarketTableView({
  data,
  signals,
  watchlistSet,
  watchlistStatusMap,
  onToggleWatchlist,
  onOpenDetails,
  onOpenChart,
  formatPrice,
  formatValue,
  formatSigned,
  formatCVD,
  handleSort,
  getSortIcon,
  subtitle,
}) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-gray-900 to-gray-950 px-6 py-4 border-b border-gray-800">
        <h2 className="text-xl font-bold text-white flex items-center gap-3">
          <Activity className="w-6 h-6 text-blue-400" />
          Market Sentiment Analysis
        </h2>
        {subtitle && (
          <p className="text-sm text-gray-400 mt-1">
            {subtitle}
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-900/50 text-left">
            <tr>
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
                onClick={() => handleSort('fundingRate')}
              >
                <div className="flex items-center justify-end gap-2">
                  Funding Rate {getSortIcon('fundingRate')}
                </div>
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-300 uppercase tracking-wider">
                Price
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-300 uppercase tracking-wider">
                Δ Price
              </th>
              <th
                className="px-6 py-4 text-right text-xs font-bold text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('openInterest')}
              >
                <div className="flex items-center justify-end gap-2">
                  Open Interest (USD) {getSortIcon('openInterest')}
                </div>
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-300 uppercase tracking-wider">
                Δ OI
              </th>
              <th
                className="px-6 py-4 text-right text-xs font-bold text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                onClick={() => handleSort('cvd')}
              >
                <div className="flex items-center justify-end gap-2">
                  CVD {getSortIcon('cvd')}
                </div>
              </th>
              <th className="px-6 py-4 text-center text-xs font-bold text-gray-300 uppercase tracking-wider">
                Exchanges
              </th>
              <th className="px-6 py-4 text-center text-xs font-bold text-gray-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {data.map((item, idx) => {
              const isWatchlisted = watchlistSet.has(item.symbol);
              const watchlistEntry = watchlistStatusMap.get(item.symbol);
              const activeAlerts = watchlistEntry?.badges?.length || 0;
              return (
                <tr key={idx} className="hover:bg-gray-900/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{item.symbol}</span>
                      {signals.find(s => s.symbol === item.symbol) && (
                        <Zap className="w-4 h-4 text-yellow-400" />
                      )}
                      {isWatchlisted && (
                        <div className="flex items-center gap-1">
                          <Bell
                            className={`w-3 h-3 ${
                              activeAlerts > 0 ? 'text-red-400' : 'text-yellow-400'
                            }`}
                          />
                          {activeAlerts > 0 && (
                            <span className="text-[10px] text-red-300">
                              {activeAlerts}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-mono text-sm ${item.avgFundingRate > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(item.avgFundingRate * 100).toFixed(3)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-mono text-sm text-gray-300">
                      {formatPrice(item.avgPrice)}
                    </span>
                    {item.priceRange && item.priceRange.max > 0 && (
                      <p className="text-[10px] text-gray-500 mt-1">
                        {formatPrice(item.priceRange.min)} – {formatPrice(item.priceRange.max)}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-mono text-xs ${item.priceChange > 0 ? 'text-emerald-400' : item.priceChange < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                      {item.priceChange ? formatSigned(item.priceChange, formatPrice) : '0'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-mono text-sm text-gray-300">
                      {formatValue(item.openInterest)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-mono text-xs ${item.openInterestChange > 0 ? 'text-emerald-400' : item.openInterestChange < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                      {item.openInterestChange ? formatSigned(item.openInterestChange, formatValue) : '0'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-mono text-sm ${item.cvd > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCVD(item.cvd)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center gap-1 flex-wrap">
                      {item.exchanges.map((ex, i) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-0.5 bg-gray-800/50 rounded-full text-gray-400"
                        >
                          {ex}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={() => onToggleWatchlist(item.symbol)}
                        className="text-yellow-400 hover:text-yellow-200 transition-colors cursor-pointer"
                        title={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
                      >
                        {isWatchlisted ? (
                          <Star className="w-4 h-4" fill="currentColor" />
                        ) : (
                          <StarOff className="w-4 h-4 text-gray-500" />
                        )}
                      </button>
                      <button
                        onClick={() => onOpenDetails(item)}
                        className="text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onOpenChart(item)}
                        className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                        title="Open live chart"
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

