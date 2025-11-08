'use client';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Activity,
  BarChart3,
  Zap,
  TrendingUpIcon,
  Flame,
  X,
  ExternalLink,
  Sparkles,
  Bot,
  Star,
  StarOff,
  Bell,
  Scale,
  Percent,
  LayoutGrid,
  List,
  Filter,
  Settings2,
  Globe2
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ComposedChart,
  Area
} from 'recharts';

import LiquidationWatch from './components/LiquidationWatch';
import MarketCardGrid from './components/MarketCardGrid';
import MarketTableView from './components/MarketTableView';

const extractPrice = (entry) => {
  const candidates = [entry?.price, entry?.markPrice, entry?.indexPrice, entry?.lastPrice];
  const price = candidates.find(value => Number.isFinite(value) && value > 0);
  return price ?? 0;
};

const calculateAverageFundingRate = (item) => {
  if (!item?.exchangeBreakdown?.length) return Number.isFinite(item?.fundingRateWeighted)
    ? item.fundingRateWeighted
    : Number.isFinite(item?.fundingRate)
    ? item.fundingRate
    : 0;
  const sum = item.exchangeBreakdown.reduce(
    (acc, entry) => acc + (entry.fundingRate ?? 0),
    0
  );
  return sum / item.exchangeBreakdown.length;
};

const calculateAveragePrice = (item) => {
  if (!item?.exchangeBreakdown?.length) {
    return Number.isFinite(item?.avgPrice) && item.avgPrice > 0 ? item.avgPrice : 0;
  }
  const prices = item.exchangeBreakdown
    .map(entry => extractPrice(entry))
    .filter(price => price > 0);
  if (!prices.length) return Number.isFinite(item?.avgPrice) ? item.avgPrice : 0;
  return prices.reduce((acc, price) => acc + price, 0) / prices.length;
};

const calculateWeightedPrice = (item) => {
  if (!item?.exchangeBreakdown?.length) {
    return Number.isFinite(item?.weightedPrice) && item.weightedPrice > 0
      ? item.weightedPrice
      : calculateAveragePrice(item);
  }
  let weightedSum = 0;
  let totalWeight = 0;
  item.exchangeBreakdown.forEach(entry => {
    const price = extractPrice(entry);
    const weight = entry.openInterest || 0;
    if (price > 0 && weight > 0) {
      weightedSum += price * weight;
      totalWeight += weight;
    }
  });
  if (totalWeight === 0) return calculateAveragePrice(item);
  return weightedSum / totalWeight;
};

const formatValue = (value) => {
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(2)}B`;
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const formatPrice = (price) => {
  if (!Number.isFinite(price) || price <= 0) return 'N/A';
  if (price >= 1000) return `$${price.toFixed(2)}`;
  if (price >= 100) return `$${price.toFixed(2)}`;
  if (price >= 10) return `$${price.toFixed(3)}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  if (price >= 0.01) return `$${price.toFixed(5)}`;
  return `$${price.toPrecision(2)}`;
};

const formatSigned = (value, formatter) => {
  if (!Number.isFinite(value) || value === 0) return '0';
  const formatted = formatter(Math.abs(value));
  return `${value > 0 ? '+' : '-'}${formatted}`;
};

const formatTimestamp = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const formatCVD = (cvd) => {
  if (cvd === null || cvd === undefined || isNaN(cvd)) return '0';
  const numCvd = typeof cvd === 'string' ? parseFloat(cvd) : cvd;
  if (isNaN(numCvd)) return '0';
  if (Math.abs(numCvd) >= 1000000) return `${(numCvd / 1000000).toFixed(2)}M`;
  if (Math.abs(numCvd) >= 1000) return `${(numCvd / 1000).toFixed(0)}K`;
  return numCvd.toFixed(0);
};

const SENTIMENT_TABS = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'watchlist', label: 'Watchlist', icon: Star },
  { key: 'signals', label: 'Signals', icon: Flame },
  { key: 'markets', label: 'Markets', icon: Globe2 },
];

export default function FundingSentimentDashboard() {
  const [data, setData] = useState([]);
  const [signals, setSignals] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [selectedItem, setSelectedItem] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'desc' });
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiMode, setAiMode] = useState(null);
  const [aiModalTitle, setAiModalTitle] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiDisplayedText, setAiDisplayedText] = useState('');
  const [aiError, setAiError] = useState('');
  const aiPayloadRef = useRef(null);
  const typewriterIntervalRef = useRef(null);
  const [tokenAi, setTokenAi] = useState({ loading: false, text: '', error: '' });
  const previousDataRef = useRef([]);
  const [watchlist, setWatchlist] = useState([]);
  const [compareSelection, setCompareSelection] = useState({ base: '', quote: '' });
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [viewMode, setViewMode] = useState('table');
  const [fundingBiasFilter, setFundingBiasFilter] = useState('all');
  const [momentumStateFilter, setMomentumStateFilter] = useState('all');
  const [cvdBiasFilter, setCvdBiasFilter] = useState('all');
  const [selectedExchanges, setSelectedExchanges] = useState([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [signalTypeFilter, setSignalTypeFilter] = useState('all');

  const ROWS_PER_PAGE = 15;

  const resetMarketFilters = useCallback(() => {
    setFundingBiasFilter('all');
    setMomentumStateFilter('all');
    setCvdBiasFilter('all');
    setSelectedExchanges([]);
    setShowAdvancedFilters(false);
    setShowWatchlistOnly(false);
  }, []);

  const toggleExchangeSelection = useCallback((exchange) => {
    setSelectedExchanges(prev => {
      if (prev.includes(exchange)) {
        return prev.filter(ex => ex !== exchange);
      }
      return [...prev, exchange];
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('sentiment-watchlist');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setWatchlist(parsed.filter(Boolean));
        }
      }
    } catch (error) {
      console.warn('Failed to restore watchlist from storage:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('sentiment-watchlist', JSON.stringify(watchlist));
    } catch (error) {
      console.warn('Failed to persist watchlist:', error);
    }
  }, [watchlist]);

  const enrichedData = useMemo(
    () =>
      data.map(item => {
        const avgFundingRate = calculateAverageFundingRate(item);
        const avgPrice = Number.isFinite(item.avgPrice) && item.avgPrice > 0
          ? item.avgPrice
          : calculateAveragePrice(item);
        const weightedPrice = Number.isFinite(item.weightedPrice) && item.weightedPrice > 0
          ? item.weightedPrice
          : calculateWeightedPrice(item);

        const prev = previousDataRef.current.find(prevItem => prevItem.symbol === item.symbol);
        const fundingRateChange = prev
          ? avgFundingRate - (prev.avgFundingRate ?? prev.fundingRateWeighted ?? 0)
          : null;
        const openInterestChange = prev
          ? (item.openInterest || 0) - (prev.openInterest || 0)
          : null;
        const priceChange = prev
          ? weightedPrice - (prev.weightedPrice || prev.avgPrice || 0)
          : null;
        const momentum = Number.isFinite(item.momentum) ? item.momentum : 0;
        const isAccelerating = Boolean(item.isAccelerating);
        const prevMomentum = prev ? prev.momentum ?? 0 : null;
        const momentumChange = prevMomentum !== null ? momentum - prevMomentum : null;
        const momentumFlipped = prev ? (prev.isAccelerating ?? false) !== isAccelerating : false;
        const momentumState = isAccelerating
          ? 'accelerating'
          : momentum === 0
          ? 'neutral'
          : 'decelerating';
        const fundingSpread = Number.isFinite(item.fundingSpread) ? item.fundingSpread : 0;
        const exchangeFunding = Array.isArray(item.exchangeFunding) ? item.exchangeFunding : [];

        const prices = item.exchangeBreakdown
          ?.map(entry => extractPrice(entry))
          .filter(price => price > 0) || [];
        const minPrice = prices.length ? Math.min(...prices) : 0;
        const maxPrice = prices.length ? Math.max(...prices) : 0;

        return {
          ...item,
          avgFundingRate,
          avgPrice,
          weightedPrice,
          priceRange: { min: minPrice, max: maxPrice },
          fundingRateChange,
          openInterestChange,
          priceChange,
           momentum,
           isAccelerating,
           momentumChange,
           momentumFlipped,
           momentumState,
           fundingSpread,
           exchangeFunding,
          liquidationBands: item.liquidationBands || [],
          liquidationSeverity: Number.isFinite(item.liquidationSeverity) ? item.liquidationSeverity : 0,
        };
      }),
    [data]
  );

  useEffect(() => {
    if (!enrichedData.length) return;
    setCompareSelection(prev => {
      const symbols = enrichedData.map(entry => entry.symbol);
      if (!symbols.length) return prev;
      const baseValid = symbols.includes(prev.base);
      const quoteValid = symbols.includes(prev.quote) && prev.quote !== prev.base;
      const base = baseValid ? prev.base : symbols[0] || '';
      const fallbackQuote = symbols.find(sym => sym !== base) || base;
      const quote = quoteValid ? prev.quote : fallbackQuote;
      if (prev.base === base && prev.quote === quote) {
        return prev;
      }
      return { base, quote };
    });
  }, [enrichedData]);

  const fetchSentimentData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sentiment', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch sentiment data');
      const result = await res.json();
      if (result.error) throw new Error(result.error);
     
      previousDataRef.current = data;
      setData(result.data || []);
      setSignals(result.signals || []);
      setMeta(result.meta || null);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Error fetching sentiment data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    fetchSentimentData();
    const interval = setInterval(fetchSentimentData, 60000);
    return () => clearInterval(interval);
  }, [fetchSentimentData]);

  const handleSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (column) => {
    if (sortConfig.key !== column) return null;
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const clearAiState = () => {
    setAiText('');
    setAiDisplayedText('');
    setAiError('');
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }
  };

  const closeAiModal = () => {
    setShowAiModal(false);
    clearAiState();
  };

  const buildMarketAiPayload = () => {
    const totalAssets = enrichedData.length;
    const totalOI = enrichedData.reduce((sum, item) => sum + (item.openInterest || 0), 0);
    const avgFundingRate =
      totalAssets > 0
        ? Number(
            (
              (enrichedData.reduce((sum, item) => sum + (item.avgFundingRate || 0), 0) /
                totalAssets) *
              100
            ).toFixed(4)
          )
        : 0;
    const avgPrice =
      totalAssets > 0
        ? Number(
            (
              enrichedData.reduce((sum, item) => sum + (item.avgPrice || 0), 0) /
              totalAssets
            ).toFixed(4)
          )
        : 0;

    const positiveFunding = [...enrichedData]
      .filter(item => item.avgFundingRate > 0)
      .sort((a, b) => b.avgFundingRate - a.avgFundingRate)
      .slice(0, 5)
      .map(item => ({
        symbol: item.symbol,
        fundingRate: Number((item.avgFundingRate * 100).toFixed(4)),
        price: Number((item.avgPrice || 0).toFixed(4)),
        openInterest: item.openInterest,
        cvd: Number((item.cvd || 0).toFixed(2)),
      }));

    const negativeFunding = [...enrichedData]
      .filter(item => item.avgFundingRate < 0)
      .sort((a, b) => a.avgFundingRate - b.avgFundingRate)
      .slice(0, 5)
      .map(item => ({
        symbol: item.symbol,
        fundingRate: Number((item.avgFundingRate * 100).toFixed(4)),
        price: Number((item.avgPrice || 0).toFixed(4)),
        openInterest: item.openInterest,
        cvd: Number((item.cvd || 0).toFixed(2)),
      }));

    const strongestSignals = signals.slice(0, 5).map(signal => ({
      type: signal.type,
      symbol: signal.symbol,
      strength: signal.strength,
      message: signal.message,
      indicators: signal.indicators,
    }));

    const cvdLeaders = [...enrichedData]
      .sort((a, b) => Math.abs(b.cvd || 0) - Math.abs(a.cvd || 0))
      .slice(0, 5)
      .map(item => ({
        symbol: item.symbol,
        cvd: Number((item.cvd || 0).toFixed(2)),
        fundingRate: Number((item.avgFundingRate * 100).toFixed(4)),
        price: Number((item.avgPrice || 0).toFixed(4)),
        openInterest: item.openInterest,
      }));

    const aggregatesView = meta?.aggregates || {};
    const breadth = {
      positiveFundingPct: Number(((aggregatesView.positiveFundingPercentage ?? 0)).toFixed(2)),
      positiveFundingCount: aggregatesView.positiveFundingCount ?? 0,
      negativeFundingCount: aggregatesView.negativeFundingCount ?? 0,
      acceleratingCount: aggregatesView.acceleratingCount ?? 0,
      deceleratingCount: aggregatesView.deceleratingCount ?? 0,
      totalOIPositiveFunding: aggregatesView.totalOIPositiveFunding ?? 0,
      totalOINegativeFunding: aggregatesView.totalOINegativeFunding ?? 0,
    };

    return {
      timestamp: meta?.timestamp || new Date().toISOString(),
      totals: {
        totalAssets,
        avgFundingRate,
        avgPrice,
        totalOpenInterest: totalOI,
        signalsDetected: signals.length,
        positiveFundingPct: breadth.positiveFundingPct,
      },
      positiveFunding,
      negativeFunding,
      cvdLeaders,
      strongestSignals,
      breadth,
    };
  };

  const buildSignalAiPayload = (signal) => {
    const symbolData = enrichedData.find(item => item.symbol === signal.symbol) || null;
    const breakdown = symbolData?.exchangeBreakdown
      ?.slice(0, 5)
      .map(entry => ({
        exchange: entry.exchange,
        fundingRate: Number((entry.fundingRate * 100).toFixed(4)),
        price: Number((extractPrice(entry) || 0).toFixed(4)),
        openInterest: entry.openInterest,
        cvd: Number((entry.cvd || 0).toFixed(2)),
        interval: entry.interval,
        timestamp: entry.timestamp,
      })) || [];

    return {
      timestamp: meta?.timestamp || new Date().toISOString(),
      signal: {
        type: signal.type,
        symbol: signal.symbol,
        strength: signal.strength,
        message: signal.message,
        indicators: signal.indicators,
      },
      marketSnapshot: {
        fundingRate: symbolData ? Number((symbolData.avgFundingRate * 100).toFixed(4)) : null,
        price: symbolData ? Number((symbolData.avgPrice || 0).toFixed(4)) : null,
        openInterest: symbolData?.openInterest || null,
        cvd: symbolData ? Number((symbolData.cvd || 0).toFixed(2)) : null,
        momentum: symbolData ? Number((symbolData.momentum || 0).toFixed(2)) : null,
        isAccelerating: symbolData?.isAccelerating ?? null,
        fundingSpread:
          symbolData && Number.isFinite(symbolData.fundingSpread)
            ? Number(symbolData.fundingSpread.toFixed(3))
            : null,
        priceRange: symbolData?.priceRange
          ? {
              min: Number((symbolData.priceRange.min || 0).toFixed(4)),
              max: Number((symbolData.priceRange.max || 0).toFixed(4)),
            }
          : null,
      },
      breakdown,
    };
  };

  const buildComparisonAiPayload = (baseSymbol, quoteSymbol) => {
    if (!baseSymbol || !quoteSymbol) return null;
    if (baseSymbol === quoteSymbol) return null;
    const baseItem = enrichedData.find(item => item.symbol === baseSymbol);
    const quoteItem = enrichedData.find(item => item.symbol === quoteSymbol);
    if (!baseItem || !quoteItem) return null;

    const formatToken = (item) => ({
      symbol: item.symbol,
      fundingRate: item.avgFundingRate,
      fundingRateWeighted: item.fundingRateWeighted ?? item.avgFundingRate,
      weightedFundingRate: item.fundingRateWeighted ?? item.avgFundingRate,
      fundingSpread: item.fundingSpread ?? 0,
      price: item.weightedPrice || item.avgPrice || 0,
      openInterest: item.openInterest || 0,
      cvd: item.cvd || 0,
      momentum: item.momentum || 0,
      isAccelerating: Boolean(item.isAccelerating),
      exchangeFunding: item.exchangeFunding || [],
    });

    return {
      timestamp: meta?.timestamp || new Date().toISOString(),
      baseToken: formatToken(baseItem),
      quoteToken: formatToken(quoteItem),
    };
  };

  const triggerAiGeneration = async (mode, payload, title, { skipModal = false } = {}) => {
    setAiMode(mode);
    setAiModalTitle(title);
    if (!skipModal) {
      setShowAiModal(true);
    }
    setAiLoading(true);
    setAiError('');
    setAiText('');
    setAiDisplayedText('');
    aiPayloadRef.current = payload;

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode, payload }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to generate AI insight');
      }

      const content = (json.text || '').trim();
      setAiText(content || 'No insight generated.');
    } catch (err) {
      console.error('AI insight error:', err);
      setAiError(err.message || 'Unable to generate AI insight at this time.');
    } finally {
      setAiLoading(false);
    }
  };

  const openMarketAiModal = () => {
    const payload = buildMarketAiPayload();
    triggerAiGeneration('market', payload, 'AI Market Pulse');
  };

  const openSignalAiModal = (signal) => {
    const payload = buildSignalAiPayload(signal);
    triggerAiGeneration(
      'signal',
      payload,
      `AI Insight · ${signal.symbol} · ${signal.type}`
    );
  };

  const regenerateAi = () => {
    if (aiMode && aiPayloadRef.current) {
      triggerAiGeneration(aiMode, aiPayloadRef.current, aiModalTitle || 'AI Insight');
    }
  };

  const generateTokenAiInsight = async () => {
    if (!selectedItem) return;
    setTokenAi({ loading: true, text: '', error: '' });

    const pseudoSignal = {
      type: 'TOKEN SNAPSHOT',
      symbol: selectedItem.symbol,
      strength: selectedItem.exchangeBreakdown?.length || 0,
      message: 'Provide a concise funding/oi opportunity summary.',
      indicators: {
        fundingRate: Number((selectedAverageFundingRate * 100).toFixed(4)),
        openInterest: selectedItem.openInterest || 0,
        price: Number((selectedAveragePrice || 0).toFixed(4)),
        cvd: Number((selectedItem.cvd || 0).toFixed(2)),
      },
    };

    const payload = buildSignalAiPayload(pseudoSignal);
    payload.constraints = { maxSentences: 2, focus: 'opportunity' };

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'signal', payload }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to generate insight');
      }

      const content = (json.text || '').trim();
      setTokenAi({ loading: false, text: content, error: '' });
    } catch (error) {
      console.error('Token AI insight error:', error);
      setTokenAi({
        loading: false,
        text: '',
        error: error.message || 'Unable to generate token insight.',
      });
    }
  };

  useEffect(() => {
    if (typewriterIntervalRef.current) {
      clearInterval(typewriterIntervalRef.current);
      typewriterIntervalRef.current = null;
    }

  if (!aiText) {
    setAiDisplayedText('');
    return undefined;
  }

    const tokens = aiText.match(/(\S+\s*)/g) || [aiText];
    let index = 0;
    setAiDisplayedText('');

    typewriterIntervalRef.current = setInterval(() => {
      setAiDisplayedText(prev => prev + tokens.slice(index, index + 5).join(''));
      index += 5;

      if (index >= tokens.length && typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
        typewriterIntervalRef.current = null;
      }
    }, 50);

    return () => {
      if (typewriterIntervalRef.current) {
        clearInterval(typewriterIntervalRef.current);
        typewriterIntervalRef.current = null;
      }
    };
  }, [aiText]);

  const selectedAverageFundingRate = useMemo(
    () => calculateAverageFundingRate(selectedItem),
    [selectedItem]
  );

  const selectedAveragePrice = useMemo(() => {
    if (!selectedItem) return 0;
    if (Number.isFinite(selectedItem.avgPrice) && selectedItem.avgPrice > 0) {
      return selectedItem.avgPrice;
    }
    return calculateAveragePrice(selectedItem);
  }, [selectedItem]);

  const selectedWeightedPrice = useMemo(() => {
    if (!selectedItem) return 0;
    if (Number.isFinite(selectedItem.weightedPrice) && selectedItem.weightedPrice > 0) {
      return selectedItem.weightedPrice;
    }
    return calculateWeightedPrice(selectedItem);
  }, [selectedItem]);

  useEffect(() => {
    if (!showDetailsModal) {
      setTokenAi({ loading: false, text: '', error: '' });
    }
  }, [showDetailsModal]);

  const filteredData = useMemo(() => {
    let result = [...enrichedData];
    const symbolFilter = selectedSymbol?.toLowerCase();

    if (symbolFilter) {
      result = result.filter(item =>
        item.symbol?.toLowerCase().includes(symbolFilter)
      );
    }

    if (showWatchlistOnly && watchlist.length) {
      const watchlistSetLocal = new Set(watchlist);
      result = result.filter(item => watchlistSetLocal.has(item.symbol));
    }

    if (fundingBiasFilter !== 'all') {
      result = result.filter(item =>
        fundingBiasFilter === 'positive'
          ? item.avgFundingRate > 0
          : item.avgFundingRate < 0
      );
    }

    if (momentumStateFilter !== 'all') {
      result = result.filter(item =>
        momentumStateFilter === 'accelerating'
          ? item.isAccelerating
          : !item.isAccelerating && (item.momentum || 0) !== 0
      );
    }

    if (cvdBiasFilter !== 'all') {
      result = result.filter(item =>
        cvdBiasFilter === 'positive' ? (item.cvd || 0) > 0 : (item.cvd || 0) < 0
      );
    }

    if (selectedExchanges.length > 0) {
      result = result.filter(item =>
        item.exchanges?.some(ex => selectedExchanges.includes(ex))
      );
    }
   
    if (sortConfig.key) {
      result.sort((a, b) => {
        let aValue = sortConfig.key === 'fundingRate' ? a.avgFundingRate : a[sortConfig.key];
        let bValue = sortConfig.key === 'fundingRate' ? b.avgFundingRate : b[sortConfig.key];
       
        if (sortConfig.key === 'symbol') {
          aValue = (aValue || '').toLowerCase();
          bValue = (bValue || '').toLowerCase();
          return sortConfig.direction === 'asc'
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }
       
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          return sortConfig.direction === 'asc'
            ? aValue - bValue
            : bValue - aValue;
        }
       
        if (Array.isArray(aValue) && Array.isArray(bValue)) {
          return sortConfig.direction === 'asc'
            ? aValue.length - bValue.length
            : bValue.length - aValue.length;
        }
       
        return 0;
      });
    } else {
      result.sort((a, b) => {
        const aStrength = Math.abs(a.avgFundingRate) * (a.openInterest / 1000000) * Math.abs(a.cvd || 0);
        const bStrength = Math.abs(b.avgFundingRate) * (b.openInterest / 1000000) * Math.abs(b.cvd || 0);
        return bStrength - aStrength;
      });
    }
   
    return result;
  }, [
    enrichedData,
    selectedSymbol,
    sortConfig,
    showWatchlistOnly,
    watchlist,
    fundingBiasFilter,
    momentumStateFilter,
    cvdBiasFilter,
    selectedExchanges,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedSymbol,
    sortConfig,
    enrichedData.length,
    fundingBiasFilter,
    momentumStateFilter,
    cvdBiasFilter,
    selectedExchanges.length,
    showWatchlistOnly,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / ROWS_PER_PAGE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return filteredData.slice(start, start + ROWS_PER_PAGE);
  }, [filteredData, currentPage]);

  const signalsByType = useMemo(() => {
    const grouped = {
      'LOCAL TOP': [],
      'LOCAL BOTTOM': [],
      'SHORT SQUEEZE': [],
      'BUILDING LONG PRESSURE': [],
      'BUILDING SHORT PRESSURE': []
    };
   
    signals.forEach(signal => {
      if (grouped[signal.type]) {
        grouped[signal.type].push(signal);
      }
    });
   
    return grouped;
  }, [signals]);

  const scatterChartData = useMemo(() => {
    return filteredData.slice(0, 30).map(item => ({
      symbol: item.symbol,
      fundingRate: Number((item.avgFundingRate * 100).toFixed(3)),
      cvd: item.cvd,
      openInterest: item.openInterest / 1000000,
      strength: Math.abs(item.avgFundingRate * 100) * Math.abs(item.cvd)
    }));
  }, [filteredData]);

  const topSignalsChartData = useMemo(() => {
    return signals.slice(0, 10).map(signal => ({
      symbol: signal.symbol,
      strength: signal.strength || 0,
      type: signal.type,
      fundingRate: parseFloat(signal.indicators.fundingRate) || 0,
      cvd: signal.indicators.cvd || 0
    }));
  }, [signals]);

  const cvdDistributionData = useMemo(() => {
    return filteredData.slice(0, 15).map(item => ({
      symbol: item.symbol,
      cvd: item.cvd,
      fundingRate: Number((item.avgFundingRate * 100).toFixed(3))
    }));
  }, [filteredData]);

  const priceFundingScatterData = useMemo(() => {
    return filteredData.slice(0, 40).map(item => ({
      symbol: item.symbol,
      fundingRatePct: Number((item.avgFundingRate * 100).toFixed(3)),
      price: Number((item.weightedPrice || item.avgPrice || 0).toFixed(4)),
      openInterest: item.openInterest,
      exchangeCount: item.exchanges?.length || 0,
      sign: item.avgFundingRate >= 0 ? 'positive' : 'negative',
    }));
  }, [filteredData]);

  const acceleratingLeaders = useMemo(() => {
    return enrichedData
      .filter(item => item.isAccelerating && (item.momentum || 0) > 0)
      .sort((a, b) => Math.abs(b.momentum) - Math.abs(a.momentum))
      .slice(0, 8);
  }, [enrichedData]);

  const deceleratingLeaders = useMemo(() => {
    return enrichedData
      .filter(item => !item.isAccelerating && (item.momentum || 0) < 0)
      .sort((a, b) => Math.abs(b.momentum) - Math.abs(a.momentum))
      .slice(0, 8);
  }, [enrichedData]);

  const heatmapData = useMemo(() => {
    const exchangesSet = new Set();
    const rows = [...enrichedData]
      .sort((a, b) => (b.openInterest || 0) - (a.openInterest || 0))
      .slice(0, 12)
      .map(item => {
        const valueMap = {};
        (item.exchangeFunding || []).forEach(entry => {
          exchangesSet.add(entry.exchange);
          const fundingDecimal = Number.isFinite(entry.weightedFunding)
            ? entry.weightedFunding
            : Number.isFinite(entry.avgFunding)
            ? entry.avgFunding
            : 0;
          valueMap[entry.exchange] = fundingDecimal * 100;
        });
        return {
          symbol: item.symbol,
          values: valueMap,
          openInterest: item.openInterest || 0,
        };
      });
    const exchanges = Array.from(exchangesSet).sort();
    return { exchanges, rows };
  }, [enrichedData]);

  const watchlistData = useMemo(() => {
    const buildBadges = (item) => {
      const badges = [];
      if (!item) return badges;
      const fundingPct = (item.avgFundingRate || 0) * 100;
      const spreadPct = item.fundingSpread || 0;
      if (Math.abs(fundingPct) >= 0.06) {
        badges.push({
          key: 'funding',
          label: `${fundingPct.toFixed(2)}% funding`,
          tone: fundingPct > 0 ? 'bear' : 'bull',
        });
      }
      if (Math.abs(spreadPct) >= 0.15) {
        badges.push({
          key: 'spread',
          label: `Spread ${spreadPct.toFixed(2)}%`,
          tone: 'neutral',
        });
      }
      if (item.momentumFlipped) {
        badges.push({
          key: 'momentum',
          label: item.isAccelerating ? 'Momentum ↑' : 'Momentum ↓',
          tone: item.isAccelerating ? 'bull' : 'bear',
        });
      } else if (Math.abs(item.momentum || 0) >= 5) {
        badges.push({
          key: 'momentumState',
          label: item.isAccelerating ? 'Accelerating' : 'Decelerating',
          tone: item.isAccelerating ? 'bull' : 'bear',
        });
      }
      return badges;
    };

    return watchlist
      .map(symbol => {
        const item = enrichedData.find(entry => entry.symbol === symbol);
        return {
          symbol,
          item: item || null,
          badges: buildBadges(item),
          missing: !item,
        };
      })
      .filter(Boolean);
  }, [watchlist, enrichedData]);

  const watchlistStatusMap = useMemo(() => {
    const map = new Map();
    watchlistData.forEach(entry => {
      map.set(entry.symbol, entry);
    });
    return map;
  }, [watchlistData]);

  const watchlistSet = useMemo(() => new Set(watchlist), [watchlist]);
  const displayedWatchlist = useMemo(() => {
    if (selectedTab === 'watchlist') return watchlistData;
    return watchlistData.slice(0, 3);
  }, [watchlistData, selectedTab]);
  const watchlistMarkets = useMemo(
    () => filteredData.filter(item => watchlistSet.has(item.symbol)),
    [filteredData, watchlistSet]
  );
  const filteredSignalsList = useMemo(
    () => (signalTypeFilter === 'all' ? signals : signals.filter(signal => signal.type === signalTypeFilter)),
    [signals, signalTypeFilter]
  );


  const aggregates = meta?.aggregates || {};
  const comparisonDisabled =
    !compareSelection.base || !compareSelection.quote || compareSelection.base === compareSelection.quote;
  const positiveFundingPct = Number.isFinite(aggregates.positiveFundingPercentage)
    ? aggregates.positiveFundingPercentage
    : 0;
  const oiPositiveFunding = aggregates.totalOIPositiveFunding || 0;
  const oiNegativeFunding = aggregates.totalOINegativeFunding || 0;
  const acceleratingCountTotal = aggregates.acceleratingCount || 0;
  const deceleratingCountTotal = aggregates.deceleratingCount || 0;
  const availableExchanges = useMemo(() => {
    const set = new Set();
    enrichedData.forEach(item => {
      (item.exchanges || []).forEach(ex => set.add(ex));
    });
    return Array.from(set).sort();
  }, [enrichedData]);

  const getSignalColor = (type) => {
    switch (type) {
      case 'LOCAL TOP': return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'LOCAL BOTTOM': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'SHORT SQUEEZE': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'BUILDING LONG PRESSURE': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'BUILDING SHORT PRESSURE': return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
      default: return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  };

  const getSignalIcon = (type) => {
    switch (type) {
      case 'LOCAL TOP': return <ArrowDown className="w-4 h-4" />;
      case 'LOCAL BOTTOM': return <ArrowUp className="w-4 h-4" />;
      case 'SHORT SQUEEZE': return <Zap className="w-4 h-4" />;
      case 'BUILDING LONG PRESSURE': return <TrendingUp className="w-4 h-4" />;
      case 'BUILDING SHORT PRESSURE': return <TrendingDown className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getWatchlistBadgeClass = (tone) => {
    switch (tone) {
      case 'bull':
        return 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20';
      case 'bear':
        return 'bg-red-500/10 text-red-300 border border-red-500/20';
      case 'neutral':
      default:
        return 'bg-blue-500/10 text-blue-200 border border-blue-500/20';
    }
  };

  const getHeatmapStyle = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return {
        backgroundColor: 'rgba(31, 41, 55, 0.6)',
        color: '#9CA3AF'
      };
    }
    const intensity = Math.min(1, Math.abs(value) / 0.18);
    const alpha = 0.18 + intensity * 0.45;
    if (value >= 0) {
      return {
        backgroundColor: `rgba(16, 185, 129, ${alpha})`,
        color: '#D1FAE5'
      };
    }
    return {
      backgroundColor: `rgba(239, 68, 68, ${alpha})`,
      color: '#FEE2E2'
    };
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
          <p className="font-bold text-white mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const openDetailsModal = (item) => {
    setSelectedItem(item);
    setTokenAi({ loading: false, text: '', error: '' });
    setShowDetailsModal(true);
  };

  const toggleWatchlist = (symbol) => {
    setWatchlist(prev => {
      if (prev.includes(symbol)) {
        return prev.filter(item => item !== symbol);
      }
      return [...prev, symbol];
    });
  };

  const openTokenAiFromCard = (item) => {
    if (!item) return;
    const pseudoSignal = {
      type: 'TOKEN SNAPSHOT',
      symbol: item.symbol,
      strength: item.exchangeBreakdown?.length || 0,
      message: 'Provide a concise funding/oi opportunity summary.',
      indicators: {
        fundingRate: Number(((item.avgFundingRate || 0) * 100).toFixed(4)),
        openInterest: item.openInterest || 0,
        price: Number(((item.weightedPrice || item.avgPrice || 0)).toFixed(4)),
        cvd: Number((item.cvd || 0).toFixed(2)),
      },
    };
    const payload = buildSignalAiPayload(pseudoSignal);
    if (!payload) return;
    triggerAiGeneration(
      'signal',
      payload,
      `AI Insight · ${item.symbol} · Snapshot`
    );
  };

  const buildChartUrl = (item) => {
    if (!item) return null;
    const primary = item.exchangeBreakdown?.[0];
    const exchange = primary?.exchange || item.exchanges?.[0] || '';
    const rawSymbol = primary?.symbol || `${item.symbol}USDT`;
    const cleaned = rawSymbol
      .replace(/-PERP$/i, 'USDT')
      .replace(/-PERPETUAL$/i, 'USDT')
      .replace(/[-:]/g, '')
      .toUpperCase();
    const base = cleaned.replace(/USDT$/, '');
    switch (exchange.toLowerCase()) {
      case 'binance':
        return `https://www.tradingview.com/chart/?symbol=BINANCE:${cleaned}`;
      case 'bybit':
        return `https://www.tradingview.com/chart/?symbol=BYBIT:${cleaned}`;
      case 'okx':
      case 'okex':
        return `https://www.tradingview.com/chart/?symbol=OKX:${cleaned}`;
      case 'hyperliquid':
        return `https://app.hyperliquid.xyz/perps/${base}`;
      case 'bitmex':
        return `https://www.tradingview.com/chart/?symbol=BITMEX:${cleaned}`;
      default:
        return `https://www.tradingview.com/chart/?symbol=${cleaned}`;
    }
  };

  const openChartForItem = (item) => {
    const url = buildChartUrl(item);
    if (!url) return;
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCompareAi = () => {
    const { base, quote } = compareSelection;
    if (!base || !quote || base === quote) return;
    const payload = buildComparisonAiPayload(base, quote);
    if (!payload) return;
    triggerAiGeneration(
      'comparison',
      payload,
      `AI Compare · ${base} vs ${quote}`
    );
  };

  if (loading && data.length === 0) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-gray-400">Loading sentiment data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-gray-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 via-blue-600/10 to-emerald-600/10 rounded-2xl"></div>
          <div className="relative bg-gray-950/80 backdrop-blur-sm border border-gray-800 rounded-2xl p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl">
                    <BarChart3 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl lg:text-3xl font-bold text-white">
                      Funding Sentiment Dashboard
                    </h1>
                    <p className="text-gray-400 text-sm">
                      Real-time market sentiment using Funding Rate, OI, and CVD
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-400 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                    <span>Live Data</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4" />
                    <span>Updated: {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {meta && (
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      <span>{meta.cvdTimeframe || '15min candles'}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={fetchSentimentData}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl transition-all duration-200 shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="font-medium">Refresh</span>
                </button>
                <button
                  onClick={openMarketAiModal}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 rounded-xl transition-all duration-200 shadow-lg hover:shadow-purple-500/25 text-white cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="font-medium">AI Market Insight</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="bg-gray-950/70 border border-gray-800 rounded-2xl px-3 py-3 flex flex-wrap items-center gap-2">
          {SENTIMENT_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = selectedTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setSelectedTab(tab.key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-900/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                <span>{tab.label}</span>
                {tab.key === 'watchlist' && watchlist.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-200 border border-yellow-500/30">
                    {watchlist.length}
                  </span>
                )}
                {tab.key === 'signals' && signals.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-200 border border-red-500/30">
                    {signals.length}
                  </span>
                )}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
            <Filter className="w-4 h-4" />
            <span>
              {filteredData.length} of {enrichedData.length} markets shown
              {showWatchlistOnly ? ' • watchlist focus' : ''}
            </span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-yellow-900/30 border-l-4 border-yellow-500 p-4 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              <p className="text-yellow-300 text-sm">
                <span className="font-medium">Warning:</span> {error}
              </p>
            </div>
          </div>
        )}

        {selectedTab === 'overview' && (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-400 text-sm font-medium">Active Signals</p>
                  <AlertTriangle className="w-5 h-5 text-orange-400" />
                </div>
                <p className="text-3xl font-bold text-white">{signals.length}</p>
                <p className="text-xs text-gray-500 mt-1">Reversal opportunities</p>
              </div>
             
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-400 text-sm font-medium">Tracked Assets</p>
                  <Activity className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-3xl font-bold text-white">{data.length}</p>
                <p className="text-xs text-gray-500 mt-1">Symbols monitored</p>
              </div>
             
              <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-400 text-sm font-medium">Signal Quality</p>
                  <Zap className="w-5 h-5 text-yellow-400" />
                </div>
                <p className="text-3xl font-bold text-white">
                  {signals.length > 0
                    ? (signals.reduce((sum, s) => sum + (s.strength || 0), 0) / signals.length).toFixed(1)
                    : '0.0'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  High conviction: {signals.filter(s => s.strength && s.strength > 5).length}
                </p>
              </div>

              <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-400 text-sm font-medium">% Positive Funding</p>
                  <Percent className="w-5 h-5 text-purple-400" />
                </div>
                <p className="text-3xl font-bold text-white">
                  {positiveFundingPct ? `${positiveFundingPct.toFixed(1)}%` : '0.0%'}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {aggregates.positiveFundingCount || 0} of {meta?.totalSymbols || data.length} symbols
                </p>
              </div>

              <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-400 text-sm font-medium">OI at Risk</p>
                  <Scale className="w-5 h-5 text-blue-400" />
                </div>
                <p className="text-3xl font-bold text-white">
                  {formatValue(oiPositiveFunding + oiNegativeFunding)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Longs: <span className="text-emerald-300">{formatValue(oiPositiveFunding)}</span> • Shorts:{' '}
                  <span className="text-red-300">{formatValue(oiNegativeFunding)}</span>
                </p>
              </div>

              <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-400 text-sm font-medium">Momentum Split</p>
                  <Activity className="w-5 h-5 text-emerald-400" />
                </div>
                <p className="text-3xl font-bold text-white">
                  {acceleratingCountTotal}
                  <span className="text-sm text-gray-500 ml-1">↑</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Accelerating vs decelerating: {acceleratingCountTotal} / {deceleratingCountTotal}
                </p>
              </div>
            </div>
          </>
        )}

        {(selectedTab === 'overview') && (
          <LiquidationWatch
            markets={filteredData}
            selectedTab={selectedTab}
            onOpenChart={openChartForItem}
            onOpenTokenAi={openTokenAiFromCard}
            formatValue={formatValue}
          />
        )}

        {(selectedTab === 'overview' || selectedTab === 'watchlist') && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-yellow-500/20 rounded-xl border border-yellow-500/40">
                  <Bell className="w-5 h-5 text-yellow-300" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Watchlist & Alerts</h3>
                  <p className="text-xs text-gray-500">
                    {selectedTab === 'watchlist'
                      ? 'Manage your pinned markets, alerts, and AI comparisons in one place.'
                      : 'Pin tokens via the star icon to track funding spikes and CVD momentum flips.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowWatchlistOnly(prev => !prev)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                  showWatchlistOnly
                    ? 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10'
                    : 'border-gray-700 text-gray-300 hover:text-white hover:border-gray-500'
                }`}
              >
                {showWatchlistOnly ? 'Showing watchlist' : 'Filter watchlist'}
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {displayedWatchlist.length > 0 ? (
                displayedWatchlist.map(entry => (
                  <div
                    key={entry.symbol}
                    className="border border-gray-800 rounded-xl p-3 bg-gray-900/40 flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-white font-semibold">{entry.symbol}</p>
                          <button
                            onClick={() => toggleWatchlist(entry.symbol)}
                            className="text-yellow-400 hover:text-yellow-200 transition-colors cursor-pointer"
                            title="Remove from watchlist"
                          >
                            <Star className="w-4 h-4" fill="currentColor" />
                          </button>
                        </div>
                        {entry.item ? (
                          <p className="text-[11px] text-gray-500 mt-1">
                            Funding {(((entry.item?.avgFundingRate ?? 0) * 100)).toFixed(3)}% · OI{' '}
                            {formatValue(entry.item?.openInterest || 0)} · Momentum{' '}
                            {(entry.item?.momentum ?? 0).toFixed(2)}
                          </p>
                        ) : (
                          <p className="text-[11px] text-red-300 mt-1">
                            Symbol temporarily unavailable in feed.
                          </p>
                        )}
                      </div>
                      {entry.badges.length > 0 && (
                        <div className="flex flex-col items-end gap-1">
                          {entry.badges.map(badge => (
                            <span
                              key={`${entry.symbol}-${badge.key}`}
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-lg ${getWatchlistBadgeClass(
                                badge.tone
                              )}`}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="border border-dashed border-gray-700 rounded-xl p-4 text-xs text-gray-500">
                  {watchlistData.length === 0
                    ? 'No symbols pinned yet. Add tokens from the market table to receive funding and momentum alerts here.'
                    : 'No watchlist symbols match the current filters.'}
                </div>
              )}
            </div>

            {selectedTab !== 'watchlist' && watchlistData.length > displayedWatchlist.length && (
              <div className="mt-4">
                <button
                  onClick={() => setSelectedTab('watchlist')}
                  className="text-xs px-3 py-2 rounded-lg border border-yellow-500/40 text-yellow-200 hover:bg-yellow-500/10 transition-colors cursor-pointer"
                >
                  View all watchlist alerts →
                </button>
              </div>
            )}

            <div className="mt-6 border-t border-gray-800 pt-4">
              <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2">
                <Bot className="w-4 h-4 text-purple-300" />
                AI Pair Comparison
              </h4>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={compareSelection.base}
                  onChange={e =>
                    setCompareSelection(prev => ({ ...prev, base: e.target.value }))
                  }
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                  {enrichedData.map(item => (
                    <option key={`base-${item.symbol}`} value={item.symbol}>
                      {item.symbol}
                    </option>
                  ))}
                </select>
                <select
                  value={compareSelection.quote}
                  onChange={e =>
                    setCompareSelection(prev => ({ ...prev, quote: e.target.value }))
                  }
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                >
                  {enrichedData.map(item => (
                    <option key={`quote-${item.symbol}`} value={item.symbol}>
                      {item.symbol}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleCompareAi}
                  disabled={comparisonDisabled}
                  className="px-3 py-2 text-sm rounded-lg bg-purple-600 hover:bg-purple-700 transition-colors text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Ask AI
                </button>
              </div>
              {comparisonDisabled && (
                <p className="text-[11px] text-gray-500 mt-2">
                  Select two distinct tokens to run a relative-value comparison.
                </p>
              )}
            </div>
          </div>
          
          <div className="xl:col-span-2 bg-gray-950 border border-gray-800 rounded-2xl p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-500/40">
                  <TrendingUpIcon className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">CVD Momentum Monitor</h3>
                  <p className="text-xs text-gray-500">
                    Spot which symbols have accelerating order flow versus decelerating pressure.
                  </p>
                </div>
              </div>
              <span className="text-[11px] text-gray-500">
                {meta?.cvdTimeframe || '15min candles, 100 periods'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div>
                <h4 className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
                  <ArrowUp className="w-4 h-4" />
                  Accelerating (Top 8)
                </h4>
                <div className="mt-3 space-y-2">
                  {acceleratingLeaders.length > 0 ? (
                    acceleratingLeaders.map(item => (
                      <div
                        key={`acc-${item.symbol}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-gray-800 bg-gray-900/50"
                      >
                        <div>
                          <p className="text-white font-semibold text-sm">{item.symbol}</p>
                          <p className="text-[11px] text-gray-500">
                            Momentum {item.momentum.toFixed(2)} · Funding {(item.avgFundingRate * 100).toFixed(2)}%
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={`text-xs font-mono ${
                              item.avgFundingRate >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {(item.avgFundingRate * 100).toFixed(2)}%
                          </p>
                          <p className="text-[10px] text-gray-500">
                            OI {formatValue(item.openInterest)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-gray-500">
                      No accelerating symbols detected in the current sample.
                    </p>
                  )}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-red-300 flex items-center gap-2">
                  <ArrowDown className="w-4 h-4" />
                  Decelerating (Top 8)
                </h4>
                <div className="mt-3 space-y-2">
                  {deceleratingLeaders.length > 0 ? (
                    deceleratingLeaders.map(item => (
                      <div
                        key={`dec-${item.symbol}`}
                        className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-gray-800 bg-gray-900/50"
                      >
                        <div>
                          <p className="text-white font-semibold text-sm">{item.symbol}</p>
                          <p className="text-[11px] text-gray-500">
                            Momentum {item.momentum.toFixed(2)} · Funding {(item.avgFundingRate * 100).toFixed(2)}%
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={`text-xs font-mono ${
                              item.avgFundingRate >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {(item.avgFundingRate * 100).toFixed(2)}%
                          </p>
                          <p className="text-[10px] text-gray-500">
                            OI {formatValue(item.openInterest)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-gray-500">
                      No decelerating symbols detected in the current sample.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {selectedTab === 'markets' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-500/20 rounded-xl border border-blue-500/40">
                  <BarChart3 className="w-5 h-5 text-blue-300" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Exchange Spread Heatmap</h3>
                  <p className="text-xs text-gray-500">
                    Compare funding differentials across exchanges for the most liquid symbols.
                  </p>
                </div>
              </div>
            </div>
            {heatmapData.rows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-left pb-3">Symbol</th>
                      {heatmapData.exchanges.map(exchange => (
                        <th key={`hm-head-${exchange}`} className="text-center pb-3 px-2">
                          {exchange}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {heatmapData.rows.map(row => (
                      <tr key={`hm-row-${row.symbol}`}>
                        <td className="py-2 pr-2 text-sm font-semibold text-white">
                          <div>
                            {row.symbol}
                            <p className="text-[10px] text-gray-500">
                              OI {formatValue(row.openInterest)}
                            </p>
                          </div>
                        </td>
                        {heatmapData.exchanges.map(exchange => {
                          const value = row.values[exchange];
                          const cellStyle = getHeatmapStyle(value);
                          const isValid = Number.isFinite(value);
                          return (
                            <td key={`hm-cell-${row.symbol}-${exchange}`} className="py-1 px-2">
                              <div
                                className="rounded-lg px-2 py-2 text-center font-mono text-[11px]"
                                style={cellStyle}
                              >
                                {isValid
                                  ? `${Number(value).toFixed(3)}%`
                                  : '—'}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                Not enough exchange-level data yet to render the heatmap.
              </p>
            )}
          </div>

          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 bg-purple-500/20 rounded-xl border border-purple-500/40">
                <Scale className="w-5 h-5 text-purple-300" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Price vs Funding Scatter</h3>
                <p className="text-xs text-gray-500">
                  Identify if higher-priced coins carry heavier funding burdens across venues.
                </p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  type="number"
                  dataKey="price"
                  name="Price"
                  stroke="#9CA3AF"
                  tickFormatter={formatPrice}
                  label={{ value: 'Weighted Price', position: 'insideBottom', offset: -10, fill: '#9CA3AF' }}
                />
                <YAxis
                  type="number"
                  dataKey="fundingRatePct"
                  name="Funding Rate (%)"
                  stroke="#9CA3AF"
                  label={{ value: 'Funding Rate (%)', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Scatter name="Markets" data={priceFundingScatterData}>
                  {priceFundingScatterData.map((point, index) => (
                    <Cell
                      key={`pf-cell-${index}`}
                      fill={point.sign === 'positive' ? '#10b981' : '#ef4444'}
                      opacity={0.85}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
        )}

        {selectedTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CVD vs Funding Rate Scatter */}
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" />
              CVD vs Funding Rate
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  type="number"
                  dataKey="fundingRate"
                  name="Funding Rate"
                  stroke="#9CA3AF"
                  label={{ value: 'Funding Rate (%)', position: 'insideBottom', offset: -10, fill: '#9CA3AF' }}
                />
                <YAxis
                  type="number"
                  dataKey="cvd"
                  name="CVD"
                  stroke="#9CA3AF"
                  label={{ value: 'CVD', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Scatter name="Assets" data={scatterChartData} fill="#8b5cf6">
                  {scatterChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.cvd > 0 ? '#10b981' : '#ef4444'}
                      opacity={0.8}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Top Signals Strength */}
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-400" />
              Top Signals by Strength
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topSignalsChartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="symbol"
                  stroke="#9CA3AF"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis stroke="#9CA3AF" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="strength" name="Strength" radius={[8, 8, 0, 0]}>
                  {topSignalsChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.type === 'LOCAL TOP' ? '#ef4444' :
                        entry.type === 'LOCAL BOTTOM' ? '#10b981' :
                        entry.type === 'SHORT SQUEEZE' ? '#f97316' :
                        entry.type === 'BUILDING LONG PRESSURE' ? '#3b82f6' :
                        '#8b5cf6'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* CVD Distribution */}
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <TrendingUpIcon className="w-5 h-5 text-emerald-400" />
              CVD Distribution (Top 15)
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cvdDistributionData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="symbol"
                  stroke="#9CA3AF"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis stroke="#9CA3AF" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="cvd" name="CVD" radius={[8, 8, 0, 0]}>
                  {cvdDistributionData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.cvd > 0 ? '#10b981' : '#ef4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Signal Type Distribution */}
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              Signal Type Distribution
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={Object.entries(signalsByType).map(([type, sigs]) => ({
                  type: type.replace('_', ' '),
                  count: sigs.length,
                  avgStrength: sigs.length > 0 ? sigs.reduce((sum, s) => sum + (s.strength || 0), 0) / sigs.length : 0
                }))}
                margin={{ top: 20, right: 20, bottom: 80, left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="type"
                  stroke="#9CA3AF"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  interval={0}
                />
                <YAxis stroke="#9CA3AF" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Count" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        )}

        {/* Reversal Signals */}
        {signals.length > 0 && (selectedTab === 'overview' || selectedTab === 'signals') && (
          <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-orange-600/10 to-red-600/10 px-6 py-4 border-b border-gray-800">
              <h2 className="text-xl font-bold text-white flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 text-orange-400" />
                {selectedTab === 'signals' ? 'Signals & Edge Cases' : 'Active Signals & Opportunities'}
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                {selectedTab === 'signals'
                  ? `${filteredSignalsList.length} signals match the current filters.`
                  : `${signals.length} signals detected across ${meta?.totalSymbols || data.length} symbols`}
              </p>
            </div>
            {selectedTab === 'signals' && (
              <div className="px-6 pt-4 pb-2 flex flex-wrap gap-2">
                {['all', ...Object.keys(signalsByType)].map(type => {
                  const isActive = signalTypeFilter === type;
                  const label = type === 'all' ? 'All signals' : type;
                  return (
                    <button
                      key={`signal-filter-${type}`}
                      onClick={() => setSignalTypeFilter(type)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-orange-500/20 border-orange-500/40 text-orange-200'
                          : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {Object.entries(signalsByType).map(([type, typeSignals]) =>
                typeSignals.length > 0 && (
                  <div
                    key={type}
                    className={`p-4 rounded-xl border ${getSignalColor(type)} ${
                      selectedTab === 'signals' && signalTypeFilter !== 'all' && signalTypeFilter !== type ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      {getSignalIcon(type)}
                      <h3 className="font-bold text-sm">{type}</h3>
                    <button
                      onClick={() => openSignalAiModal(typeSignals[0])}
                      className="ml-auto flex items-center gap-1 text-xs text-purple-300 hover:text-purple-100 transition-colors cursor-pointer"
                      title="Get AI insight for this opportunity"
                    >
                      <Bot className="w-3 h-3" />
                      <span>AI view</span>
                    </button>
                    </div>
                    <p className="text-2xl font-bold mb-1">{typeSignals.length}</p>
                    <p className="text-xs opacity-75">
                      Avg: {typeSignals.length > 0
                        ? (typeSignals.reduce((sum, s) => sum + (s.strength || 0), 0) / typeSignals.length).toFixed(1)
                        : '0.0'}
                    </p>
                  </div>
                )
              )}
            </div>
            <div className="p-6 space-y-3">
              {(selectedTab === 'signals' ? filteredSignalsList : signals.slice(0, 12)).map((signal, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border ${getSignalColor(signal.type)}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {getSignalIcon(signal.type)}
                        <span className="font-bold text-white">{signal.symbol}</span>
                        <span className="text-xs px-2 py-0.5 bg-gray-800/50 rounded">{signal.type}</span>
                        {signal.strength && (
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            signal.strength > 7 ? 'bg-red-500/20 text-red-400' :
                            signal.strength > 5 ? 'bg-orange-500/20 text-orange-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            Strength {signal.strength.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-300 mb-2">{signal.message}</p>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <p className="text-gray-500">Funding Rate</p>
                          <p className="font-mono font-bold text-red-400">{signal.indicators.fundingRate}%</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Open Interest</p>
                          <p className="font-mono">{formatValue(signal.indicators.openInterest)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">CVD</p>
                          <p className="font-mono font-bold">{formatCVD(signal.indicators.cvd)}</p>
                        </div>
                        {Number.isFinite(signal.indicators.price) && (
                          <div>
                            <p className="text-gray-500">Price</p>
                            <p className="font-mono">{formatPrice(signal.indicators.price)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => openSignalAiModal(signal)}
                      className="flex items-center gap-1 text-xs text-purple-300 hover:text-purple-100 transition-colors cursor-pointer"
                      title="Ask AI for deeper context"
                    >
                      <Bot className="w-4 h-4" />
                      <span>AI insight</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {selectedTab === 'signals' && filteredSignalsList.length === 0 && (
              <div className="px-6 pb-6 text-sm text-gray-500">
                No signals match the current filters. Adjust the signal type above or reset filters to widen your scope.
              </div>
            )}
          </div>
        )}

        {selectedTab !== 'overview' && (
          <div className="relative">
            <input
              type="text"
              placeholder="Search by symbol (e.g. BTC, ETH, SOL)..."
              value={selectedSymbol || ''}
              onChange={(e) => setSelectedSymbol(e.target.value || null)}
              className="w-full pl-12 pr-4 py-4 bg-gray-950/80 border border-gray-800 rounded-2xl text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500/50 transition-all duration-200"
            />
            <Activity className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          </div>
        )}

        {selectedTab === 'watchlist' && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-300">Pinned markets overview</h3>
              {watchlistMarkets.length > 0 && (
                <span className="text-[11px] text-gray-500">
                  {watchlistMarkets.length} symbols • funding & momentum filters applied
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <MarketCardGrid
                data={watchlistMarkets}
                signals={signals}
                watchlistSet={watchlistSet}
                watchlistStatusMap={watchlistStatusMap}
                onToggleWatchlist={toggleWatchlist}
                onOpenDetails={openDetailsModal}
                onOpenMarketAi={openMarketAiModal}
                onOpenTokenAi={openTokenAiFromCard}
                onOpenChart={openChartForItem}
                formatValue={formatValue}
                formatPrice={formatPrice}
                formatCVD={formatCVD}
                emptyMessage="No pinned symbols match the current filters. Adjust the funding, momentum, or venue filters above to widen your view."
              />
            </div>
          </div>
        )}

        {selectedTab === 'markets' && (
          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'all', label: 'All funding' },
                  { value: 'positive', label: 'Longs paying' },
                  { value: 'negative', label: 'Shorts paying' },
                ].map(option => (
                  <button
                    key={`funding-${option.value}`}
                    onClick={() => setFundingBiasFilter(option.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                      fundingBiasFilter === option.value
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-200'
                        : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'all', label: 'All momentum' },
                  { value: 'accelerating', label: 'Accelerating' },
                  { value: 'decelerating', label: 'Decelerating' },
                ].map(option => (
                  <button
                    key={`momentum-${option.value}`}
                    onClick={() => setMomentumStateFilter(option.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                      momentumStateFilter === option.value
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                        : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'all', label: 'All CVD' },
                  { value: 'positive', label: 'Buy pressure' },
                  { value: 'negative', label: 'Sell pressure' },
                ].map(option => (
                  <button
                    key={`cvd-${option.value}`}
                    onClick={() => setCvdBiasFilter(option.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                      cvdBiasFilter === option.value
                        ? 'bg-purple-500/20 border-purple-500/40 text-purple-200'
                        : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowWatchlistOnly(prev => !prev)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                  showWatchlistOnly
                    ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-200'
                    : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                Watchlist focus
              </button>
              <button
                onClick={() => setShowAdvancedFilters(prev => !prev)}
                className="px-3 py-1.5 rounded-full text-xs font-medium border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors cursor-pointer"
              >
                {showAdvancedFilters ? 'Hide venues' : 'Venue filters'}
              </button>
              <button
                onClick={resetMarketFilters}
                className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors cursor-pointer"
              >
                <Settings2 className="w-3 h-3" />
                <span>Reset</span>
              </button>
              <div className="flex items-center gap-1 border border-gray-700 rounded-full p-1">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    viewMode === 'table'
                      ? 'bg-blue-500/20 text-blue-200'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <List className="w-3 h-3" />
                  Table
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    viewMode === 'cards'
                      ? 'bg-blue-500/20 text-blue-200'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <LayoutGrid className="w-3 h-3" />
                  Cards
                </button>
              </div>
            </div>
            {showAdvancedFilters && availableExchanges.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {availableExchanges.map(exchange => {
                  const active = selectedExchanges.includes(exchange);
                  return (
                    <button
                      key={`exchange-${exchange}`}
                      onClick={() => toggleExchangeSelection(exchange)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                        active
                          ? 'bg-teal-500/20 border-teal-500/40 text-teal-200'
                          : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
                      }`}
                    >
                      {exchange}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Main Data Table */}
        {(selectedTab === 'markets' && viewMode === 'table') && (
          <MarketTableView
            data={paginatedData}
            signals={signals}
            watchlistSet={watchlistSet}
            watchlistStatusMap={watchlistStatusMap}
            onToggleWatchlist={toggleWatchlist}
            onOpenDetails={openDetailsModal}
            onOpenChart={openChartForItem}
            formatPrice={formatPrice}
            formatValue={formatValue}
            formatSigned={formatSigned}
            formatCVD={formatCVD}
            handleSort={handleSort}
            getSortIcon={getSortIcon}
            subtitle={`${filteredData.length} assets • CVD calculated over ${meta?.cvdTimeframe || '15min timeframe'}`}
          />
        )}

        {(selectedTab === 'markets' && viewMode === 'cards') && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <MarketCardGrid
              data={paginatedData}
              signals={signals}
              watchlistSet={watchlistSet}
              watchlistStatusMap={watchlistStatusMap}
              onToggleWatchlist={toggleWatchlist}
              onOpenDetails={openDetailsModal}
              onOpenMarketAi={openMarketAiModal}
              onOpenTokenAi={openTokenAiFromCard}
              onOpenChart={openChartForItem}
              formatValue={formatValue}
              formatPrice={formatPrice}
              formatCVD={formatCVD}
            />
          </div>
        )}

        {(selectedTab === 'markets') && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-4 gap-3 text-xs text-gray-400">
          <p>
            Showing {filteredData.length === 0 ? 0 : (currentPage - 1) * ROWS_PER_PAGE + 1}–
            {Math.min(filteredData.length, currentPage * ROWS_PER_PAGE)} of {filteredData.length} symbols
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-gray-500">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
        )}
      </div>

      {/* Exchange Breakdown Modal */}
      {showDetailsModal && selectedItem && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 cursor-pointer" onClick={() => setShowDetailsModal(false)}>
          <div className="bg-gray-950 border border-gray-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto cursor-default" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-gray-950 border-b border-gray-800 p-6 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white flex items-center gap-3">
                <Activity className="w-6 h-6 text-blue-400" />
                {selectedItem.symbol} Exchange Breakdown
              </h3>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex justify-end mb-4">
                <button
                  onClick={generateTokenAiInsight}
                  disabled={tokenAi.loading}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-purple-500/40 hover:bg-purple-500/10 text-purple-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{tokenAi.loading ? 'Generating…' : '2-line AI insight'}</span>
                </button>
              </div>
              {tokenAi.error && (
                <div className="mb-4 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {tokenAi.error}
                </div>
              )}
              {tokenAi.text && !tokenAi.error && (
                <div className="mb-4 text-sm text-gray-200 bg-purple-500/5 border border-purple-500/20 rounded-lg px-3 py-2">
                  {tokenAi.text}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-gray-900/50 rounded-xl p-4">
                  <p className="text-sm text-gray-400 mb-1">Avg Funding Rate</p>
                  <p className={`text-2xl font-bold ${selectedAverageFundingRate > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(selectedAverageFundingRate * 100).toFixed(3)}%
                  </p>
                </div>
                <div className="bg-gray-900/50 rounded-xl p-4">
                  <p className="text-sm text-gray-400 mb-1">Total Open Interest</p>
                  <p className="text-2xl font-bold text-white">
                    {formatValue(selectedItem.openInterest)}
                  </p>
                </div>
                <div className="bg-gray-900/50 rounded-xl p-4">
                  <p className="text-sm text-gray-400 mb-1">Weighted Price</p>
                  <p className="text-2xl font-bold text-white">
                    {formatPrice(selectedWeightedPrice)}
                  </p>
                  {selectedItem.priceRange && selectedItem.priceRange.max > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Range {formatPrice(selectedItem.priceRange.min)} – {formatPrice(selectedItem.priceRange.max)}
                    </p>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-800">
                      <th className="pb-3">Exchange</th>
                      <th className="pb-3 text-right">Symbol</th>
                      <th className="pb-3 text-right">Funding Rate</th>
                      <th className="pb-3 text-right">Price</th>
                      <th className="pb-3 text-right">OI (USD)</th>
                      <th className="pb-3 text-right">CVD</th>
                      <th className="pb-3 text-right">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {selectedItem.exchangeBreakdown.map((bd, i) => (
                      <tr key={i} className="text-sm">
                        <td className="py-3 font-medium text-white">{bd.exchange}</td>
                        <td className="py-3 text-right font-mono text-gray-400">{bd.symbol}</td>
                        <td className={`py-3 text-right font-mono ${bd.fundingRate > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {(bd.fundingRate * 100).toFixed(3)}%
                        </td>
                        <td
                          className="py-3 text-right font-mono text-gray-300"
                          title={`mark: ${formatPrice(bd.markPrice || 0)} | index: ${formatPrice(bd.indexPrice || 0)} | last: ${formatPrice(bd.lastPrice || 0)}${bd.oraclePrice ? ` | oracle: ${formatPrice(bd.oraclePrice)}` : ''}${bd.impactPrice ? ` | impact: ${formatPrice(bd.impactPrice)}` : ''}`}
                        >
                          {formatPrice(extractPrice(bd))}
                        </td>
                        <td className="py-3 text-right font-mono text-gray-300">
                          <span>{formatValue(bd.openInterest)}</span>
                          {bd.openInterestContracts && bd.openInterestContracts > 0 && (
                            <p className="text-[10px] text-gray-500 mt-1">
                              Contracts: {formatValue(bd.openInterestContracts)}
                            </p>
                          )}
                        </td>
                        <td className={`py-3 text-right font-mono ${bd.cvd > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatCVD(bd.cvd)}
                        </td>
                        <td className="py-3 text-right font-mono text-gray-400">
                          {formatTimestamp(bd.timestamp)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {showAiModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 cursor-pointer"
          onClick={closeAiModal}
        >
          <div
            className="bg-gray-950 border border-gray-800 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {aiModalTitle || 'AI Insight'}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Generated with your latest funding, OI, and CVD data
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={regenerateAi}
                  disabled={aiLoading}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-purple-500/40 hover:bg-purple-500/10 text-purple-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${aiLoading ? 'animate-spin' : ''}`} />
                  <span>{aiLoading ? 'Generating…' : 'Regenerate'}</span>
                </button>
                <button
                  onClick={closeAiModal}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                  aria-label="Close AI insight"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {aiError ? (
                <div className="bg-red-500/10 border border-red-500/30 text-red-200 px-4 py-3 rounded-lg">
                  <p className="font-semibold mb-1">Unable to fetch insight</p>
                  <p className="text-sm">{aiError}</p>
                </div>
              ) : aiLoading ? (
                <div className="flex items-center gap-3 text-gray-300">
                  <RefreshCw className="w-5 h-5 animate-spin text-purple-300" />
                  <p className="text-sm">Synthesizing derivatives insight…</p>
                </div>
              ) : (
                <div className="text-sm leading-relaxed text-gray-200 whitespace-pre-wrap">
                  {aiDisplayedText || 'No insight generated.'}
                </div>
              )}
            </div>
            <div className="border-t border-gray-800 px-6 py-3 text-xs text-gray-500">
              <p>
                AI commentary is experimental. Cross-check important decisions with your own analysis.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

