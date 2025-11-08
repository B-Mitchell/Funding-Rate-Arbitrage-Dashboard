'use client';

import React from 'react';
import { Zap, Sparkles, ExternalLink, Star, StarOff } from 'lucide-react';

export default function MarketCardGrid({
  data,
  signals,
  watchlistSet,
  watchlistStatusMap,
  onToggleWatchlist,
  onOpenDetails,
  onOpenMarketAi,
  onOpenTokenAi,
  onOpenChart,
  formatValue,
  formatPrice,
  formatCVD,
  emptyMessage = 'No markets match the current filters. Try widening your funding, momentum, or venue selections.',
}) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="col-span-full border border-dashed border-gray-700 rounded-xl p-6 text-sm text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  return data.map(item => {
    const isWatchlisted = watchlistSet.has(item.symbol);
    const watchlistEntry = watchlistStatusMap.get(item.symbol);
    const activeAlerts = watchlistEntry?.badges?.length || 0;
    const hasSignal = signals.some(signal => signal.symbol === item.symbol);
    return (
      <div
        key={`card-${item.symbol}`}
        className="bg-gray-950 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4 hover:border-blue-500/40 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-white">{item.symbol}</span>
              {hasSignal && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-200 border border-red-500/30">
                  Signal
                </span>
              )}
              {item.isAccelerating ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-200 border border-emerald-500/30">
                  Momentum ↑
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-200 border border-purple-500/30">
                  Momentum ↓
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Funding {(item.avgFundingRate * 100).toFixed(3)}% • OI {formatValue(item.openInterest)} • CVD {formatCVD(item.cvd)}
            </p>
          </div>
          <button
            onClick={() => onToggleWatchlist(item.symbol)}
            className="text-yellow-400 hover:text-yellow-200 transition-colors cursor-pointer"
            title={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            {isWatchlisted ? <Star className="w-4 h-4" fill="currentColor" /> : <StarOff className="w-4 h-4 text-gray-500" />}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
            <p className="text-gray-500 mb-1">Price</p>
            <p className="font-mono text-sm text-white">{formatPrice(item.weightedPrice || item.avgPrice)}</p>
            {item.priceRange && item.priceRange.max > 0 && (
              <p className="text-[10px] text-gray-500 mt-1">
                {formatPrice(item.priceRange.min)} – {formatPrice(item.priceRange.max)}
              </p>
            )}
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
            <p className="text-gray-500 mb-1">Funding Spread</p>
            <p className={`font-mono text-sm ${item.fundingSpread > 0 ? 'text-blue-300' : 'text-gray-300'}`}>
              {item.fundingSpread.toFixed(2)}%
            </p>
            <p className="text-[10px] text-gray-500 mt-1">{item.exchanges.length} exchanges</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
            <p className="text-gray-500 mb-1">Momentum</p>
            <p className="font-mono text-sm text-white">{item.momentum.toFixed(2)}</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
            <p className="text-gray-500 mb-1">Updated</p>
            <p className="font-mono text-[11px] text-gray-300">
              {item.exchangeBreakdown?.[0]?.timestamp
                ? new Date(item.exchangeBreakdown?.[0]?.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '—'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[10px]">
          {item.exchanges.map(ex => (
            <span key={`${item.symbol}-${ex}`} className="px-2 py-0.5 rounded-full bg-gray-900 border border-gray-800 text-gray-400">
              {ex}
            </span>
          ))}
          {activeAlerts > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-200">
              {activeAlerts} alert{activeAlerts > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => onOpenDetails(item)}
            className="text-xs text-blue-300 hover:text-blue-100 transition-colors cursor-pointer flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            Details
          </button>
          <button
            onClick={onOpenMarketAi}
            className="text-xs text-purple-300 hover:text-purple-100 transition-colors cursor-pointer flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            Market AI
          </button>
          <button
            onClick={() => onOpenTokenAi(item)}
            className="text-xs text-emerald-300 hover:text-emerald-100 transition-colors cursor-pointer flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            Token AI
          </button>
          <button
            onClick={() => onOpenChart(item)}
            className="text-xs text-blue-200 hover:text-blue-50 transition-colors cursor-pointer flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            Chart
          </button>
        </div>
      </div>
    );
  });
}

