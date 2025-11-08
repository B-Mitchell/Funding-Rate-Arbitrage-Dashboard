'use client';

import React, { useMemo } from 'react';
import { Flame, Sparkles, Activity } from 'lucide-react';

export default function LiquidationWatch({
  markets,
  selectedTab,
  onOpenChart,
  onOpenTokenAi,
  formatValue,
}) {
  const topMarkets = useMemo(() => {
    if (!Array.isArray(markets)) return [];
    return [...markets]
      .filter(item => Array.isArray(item.liquidationBands) && item.liquidationBands.length)
      .sort((a, b) => (b.liquidationSeverity || 0) - (a.liquidationSeverity || 0))
      .slice(0, selectedTab === 'markets' ? 8 : 5);
  }, [markets, selectedTab]);

  if (!topMarkets.length) {
    return null;
  }

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-red-500/20 rounded-xl border border-red-500/40">
            <Flame className="w-5 h-5 text-red-200" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Liquidation Watch</h3>
            <p className="text-xs text-gray-500">
              Estimated notional at risk if price sweeps popular liquidation bands.
            </p>
          </div>
        </div>
        <span className="text-xs text-gray-500">
          Assumes average leverage profiles from funding bias. Use as directional compass.
        </span>
      </div>

      <div className="space-y-4">
        {topMarkets.map(item => {
          const localMax = item.liquidationBands.reduce(
            (acc, band) => Math.max(acc, band.longNotional || 0, band.shortNotional || 0),
            0.0001
          );
          const dominantBand = item.liquidationBands.reduce(
            (acc, band) => {
              const bandMax = Math.max(band.longNotional || 0, band.shortNotional || 0);
              return bandMax > acc.value ? { value: bandMax, band } : acc;
            },
            { value: 0, band: null }
          );
          const dominantLabel = dominantBand.band
            ? `${dominantBand.band.longNotional >= dominantBand.band.shortNotional ? 'Long' : 'Short'} stack @ ±${dominantBand.band.movePercent}%`
            : 'Balanced risk';

          return (
            <div key={`liq-${item.symbol}`} className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{item.symbol}</span>
                    <span className="text-[11px] text-gray-400">{dominantLabel}</span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Total OI: {formatValue(item.openInterest)} • Momentum {item.momentum.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
                    <Activity className="w-3 h-3" />
                    Chart
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {item.liquidationBands.map(band => {
                  const longWidth = Math.min(100, ((band.longNotional || 0) / localMax) * 100);
                  const shortWidth = Math.min(100, ((band.shortNotional || 0) / localMax) * 100);
                  return (
                    <div key={`${item.symbol}-${band.movePercent}`} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        <span>±{band.movePercent}% move</span>
                        <span>
                          Long: {formatValue(band.longNotional || 0)} • Short: {formatValue(band.shortNotional || 0)}
                        </span>
                      </div>
                      <div className="flex items-stretch gap-1 h-3">
                        <div
                          className="rounded-l-full bg-emerald-500/50"
                          style={{ width: `${longWidth || 2}%` }}
                          title={`Long liquidation threshold ~${band.longThresholdPercent.toFixed(2)}%`}
                        />
                        <div
                          className="rounded-r-full bg-red-500/50"
                          style={{ width: `${shortWidth || 2}%` }}
                          title={`Short liquidation threshold ~${band.shortThresholdPercent.toFixed(2)}%`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

