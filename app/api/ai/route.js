import { NextResponse } from 'next/server';

const MODEL = 'gpt-4.1-mini';

const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function formatPercent(value, decimals = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  return `${Number(value).toFixed(decimals)}%`;
}

function formatUsd(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return usdFormatter.format(value);
}

function formatPriceValue(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  const abs = Math.abs(value);
  if (abs >= 1000) return `$${value.toFixed(2)}`;
  if (abs >= 100) return `$${value.toFixed(2)}`;
  if (abs >= 10) return `$${value.toFixed(3)}`;
  if (abs >= 1) return `$${value.toFixed(4)}`;
  if (abs >= 0.01) return `$${value.toFixed(6)}`;
  return `$${value.toPrecision(3)}`;
}

function buildMarketPrompt(payload) {
  const { timestamp, totals, positiveFunding, negativeFunding, cvdLeaders, strongestSignals, breadth } =
    payload || {};

  const lines = [];
  lines.push(
    `Timestamp: ${timestamp || 'Unknown'}`,
    `Assets tracked: ${totals?.totalAssets ?? 'N/A'}`,
    `Average hourly funding rate: ${formatPercent(totals?.avgFundingRate, 4)}`,
    `Average price: ${formatPriceValue(totals?.avgPrice)}`,
    `Total open interest: ${formatUsd(totals?.totalOpenInterest || 0)}`,
    `Signals detected: ${totals?.signalsDetected ?? 0}`
  );

  if (breadth) {
    lines.push(
      '\nMarket breadth:',
      `- Positive funding share: ${formatPercent(breadth.positiveFundingPct ?? 0, 2)} (${breadth.positiveFundingCount ?? 0} symbols)`,
      `- Negative funding symbols: ${breadth.negativeFundingCount ?? 0}`,
      `- OI at risk (longs paying): ${formatUsd(breadth.totalOIPositiveFunding || 0)}`,
      `- OI at risk (shorts paying): ${formatUsd(breadth.totalOINegativeFunding || 0)}`,
      `- CVD momentum: ${breadth.acceleratingCount ?? 0} accelerating vs ${breadth.deceleratingCount ?? 0} decelerating`
    );
  }

  if (positiveFunding?.length) {
    lines.push('\nTop positive funding (potential short crowd at risk):');
    positiveFunding.forEach(item => {
      lines.push(
        `- ${item.symbol}: funding ${formatPercent(item.fundingRate, 4)}, price ${formatPriceValue(
          item.price
        )}, OI ${formatUsd(
          item.openInterest || 0
        )}, CVD ${numberFormatter.format(item.cvd)}`
      );
    });
  }

  if (negativeFunding?.length) {
    lines.push('\nTop negative funding (potential squeeze setups):');
    negativeFunding.forEach(item => {
      lines.push(
        `- ${item.symbol}: funding ${formatPercent(item.fundingRate, 4)}, price ${formatPriceValue(
          item.price
        )}, OI ${formatUsd(
          item.openInterest || 0
        )}, CVD ${numberFormatter.format(item.cvd)}`
      );
    });
  }

  if (cvdLeaders?.length) {
    lines.push('\nBiggest CVD imbalances (sustained order flow):');
    cvdLeaders.forEach(item => {
      lines.push(
        `- ${item.symbol}: CVD ${numberFormatter.format(item.cvd)}M, funding ${formatPercent(
          item.fundingRate,
          4
        )}, price ${formatPriceValue(item.price)}, OI ${formatUsd(item.openInterest || 0)}`
      );
    });
  }

  if (strongestSignals?.length) {
    lines.push('\nActive signals:');
    strongestSignals.forEach(sig => {
      lines.push(
        `- ${sig.symbol} (${sig.type} • strength ${sig.strength?.toFixed?.(1) ?? 'N/A'}): ${
          sig.message
        } | Indicators: funding ${sig.indicators?.fundingRate ?? '?' }%, OI ${
          sig.indicators?.openInterest
            ? formatUsd(sig.indicators.openInterest)
            : 'N/A'
        }, CVD ${numberFormatter.format(sig.indicators?.cvd ?? 0)}`
      );
    });
  }

  return [
    'You are an experienced crypto derivatives strategist. You analyze funding rates, open interest and CVD to understand crowd positioning, potential squeezes and market sentiment.',
    'Provide a concise but insightful market briefing for a professional trader. Mention key imbalances, risk factors and actionable observations.',
    'Avoid generic advice, focus on derivative data. Do not restate raw numbers verbatim—interpret them.',
    'Use bullet points where helpful. Finish with a short “Watchlist” section summarizing opportunities or risks to monitor.',
    '\nData snapshot:\n',
    lines.join('\n'),
  ].join('\n');
}

function buildSignalPrompt(payload) {
  const { timestamp, signal, marketSnapshot, breakdown, constraints } = payload || {};

  const lines = [];
  lines.push(
    `Timestamp: ${timestamp || 'Unknown'}`,
    `Signal: ${signal?.type || 'N/A'}`,
    `Symbol: ${signal?.symbol || 'N/A'}`,
    `Narrative: ${signal?.message || 'N/A'}`,
    `Strength score: ${signal?.strength ?? 'N/A'}`,
    `Funding (signal indicators): ${signal?.indicators?.fundingRate ?? 'N/A'}%`,
    `Price (signal indicators): ${formatPriceValue(signal?.indicators?.price)}`,
    `Open interest (signal indicators): ${
      signal?.indicators?.openInterest ? formatUsd(signal.indicators.openInterest) : 'N/A'
    }`,
    `CVD (signal indicators): ${numberFormatter.format(signal?.indicators?.cvd ?? 0)}`
  );

  if (marketSnapshot) {
    lines.push(
      '\nAggregated market snapshot:',
      `- Funding rate: ${formatPercent(marketSnapshot.fundingRate, 4)}`,
      `- Price: ${formatPriceValue(marketSnapshot.price)}`,
      `- Total open interest: ${formatUsd(marketSnapshot.openInterest || 0)}`,
      `- CVD trend: ${numberFormatter.format(marketSnapshot.cvd ?? 0)}`
    );
    if (marketSnapshot.momentum !== null && marketSnapshot.momentum !== undefined) {
      lines.push(
        `- CVD momentum: ${numberFormatter.format(marketSnapshot.momentum)} ${
          marketSnapshot.isAccelerating === true
            ? '(accelerating)'
            : marketSnapshot.isAccelerating === false
            ? '(decelerating)'
            : ''
        }`
      );
    }
    if (marketSnapshot.fundingSpread !== null && marketSnapshot.fundingSpread !== undefined) {
      lines.push(`- Funding spread across venues: ${formatPercent(marketSnapshot.fundingSpread, 3)}`);
    }
    if (marketSnapshot.priceRange) {
      lines.push(
        `- Price range: ${formatPriceValue(marketSnapshot.priceRange.min)} → ${formatPriceValue(
          marketSnapshot.priceRange.max
        )}`
      );
    }
  }

  if (breakdown?.length) {
    lines.push('\nExchange breakdown highlights (top venues):');
    breakdown.forEach(entry => {
      lines.push(
        `- ${entry.exchange}: funding ${formatPercent(entry.fundingRate, 4)}, price ${formatPriceValue(
          entry.price
        )}, OI ${formatUsd(entry.openInterest || 0)}, CVD ${numberFormatter.format(entry.cvd ?? 0)}`
      );
    });
  }

  const instructions = [
    'You are an options and perp funding specialist. Provide a focused explanation of the highlighted opportunity.',
    'Explain why the signal matters, what positioning it implies, and how funding + CVD corroborate the hypothesis.',
    'Discuss potential catalysts, invalidation levels, and risk management considerations.',
    'Use a confident, analytical tone tailored to a professional derivatives trader.',
  ];

  if (constraints?.maxSentences) {
    instructions.push(`Limit your response to ${constraints.maxSentences} sentences.`);
  }
  if (constraints?.focus === 'opportunity') {
    instructions.push('Highlight actionable opportunities or risks directly backed by the data.');
  }

  instructions.push('\nSignal context:\n', lines.join('\n'));

  return instructions.join('\n');
}

function buildComparisonPrompt(payload) {
  const { timestamp, baseToken, quoteToken } = payload || {};

  const describeToken = (token = {}) => {
    if (!token.symbol) return 'N/A';
    const avgFundingDecimal = Number.isFinite(token.fundingRate)
      ? token.fundingRate
      : Number.isFinite(token.fundingRateWeighted)
      ? token.fundingRateWeighted
      : 0;
    const weightedFundingDecimal = Number.isFinite(token.weightedFundingRate)
      ? token.weightedFundingRate
      : Number.isFinite(token.fundingRateWeighted)
      ? token.fundingRateWeighted
      : avgFundingDecimal;
    const funding = formatPercent(avgFundingDecimal * 100, 4);
    const weightedFunding = formatPercent(weightedFundingDecimal * 100, 4);
    const spread = formatPercent(token.fundingSpread ?? 0, 4);
    const oi = formatUsd(token.openInterest || 0);
    const cvd = numberFormatter.format(token.cvd ?? 0);
    const momentum = numberFormatter.format(token.momentum ?? 0);
    const accel = token.isAccelerating ? 'accelerating (CVD momentum increasing)' : 'decelerating';

    const exchangeLines = [];
    if (Array.isArray(token.exchangeFunding) && token.exchangeFunding.length) {
      token.exchangeFunding.slice(0, 5).forEach(entry => {
        const entryFundingDecimal = Number.isFinite(entry.weightedFunding)
          ? entry.weightedFunding
          : Number.isFinite(entry.avgFunding)
          ? entry.avgFunding
          : 0;
        exchangeLines.push(
          `   • ${entry.exchange}: funding ${formatPercent(entryFundingDecimal * 100, 4)}, OI ${formatUsd(entry.totalOI || 0)}`
        );
      });
    }

    return [
      `${token.symbol}`,
      `  Funding (avg/weighted): ${funding} / ${weightedFunding}`,
      `  Funding spread: ${spread}`,
      `  Price: ${formatPriceValue(token.price)}`,
      `  Open interest: ${oi}`,
      `  CVD: ${cvd}`,
      `  Momentum: ${momentum} (${accel})`,
      exchangeLines.length ? `  Exchange skew:\n${exchangeLines.join('\n')}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  };

  const baseText = describeToken(baseToken);
  const quoteText = describeToken(quoteToken);

  const comparisonHighlights = [];
  if (baseToken && quoteToken) {
    const fundingDiff =
      (baseToken.weightedFundingRate ?? baseToken.fundingRate ?? 0) -
      (quoteToken.weightedFundingRate ?? quoteToken.fundingRate ?? 0);
    const oiDiff = (baseToken.openInterest || 0) - (quoteToken.openInterest || 0);
    const cvdDiff = (baseToken.cvd || 0) - (quoteToken.cvd || 0);

    comparisonHighlights.push(
      `Funding differential (base - quote): ${formatPercent(fundingDiff * 100, 4)}`,
      `Open interest differential: ${formatUsd(oiDiff)}`,
      `CVD differential: ${numberFormatter.format(cvdDiff)}`
    );

    if (baseToken.isAccelerating !== quoteToken.isAccelerating) {
      comparisonHighlights.push(
        `Momentum regimes diverge: ${baseToken.symbol} is ${
          baseToken.isAccelerating ? 'accelerating' : 'decelerating'
        } while ${quoteToken.symbol} is ${
          quoteToken.isAccelerating ? 'accelerating' : 'decelerating'
        }.`
      );
    }
  }

  return [
    'You are comparing two perpetual swap markets for potential relative value or spread trades.',
    'Assess relative crowd positioning, funding pressure, open interest risk and CVD momentum.',
    'Highlight which side looks crowded, where reflexivity may kick in, and how a trader could structure a compare/contrast trade.',
    'If the data is inconclusive, say so. Otherwise specify clear risks, catalysts, and actionable bias.',
    '',
    `Timestamp: ${timestamp || 'Unknown'}`,
    '',
    'Base token snapshot:',
    baseText,
    '',
    'Quote token snapshot:',
    quoteText,
    '',
    'Key differentials:',
    comparisonHighlights.join('\n'),
  ].join('\n');
}

function buildPrompt(mode, payload) {
  if (mode === 'signal') {
    return buildSignalPrompt(payload);
  }
  if (mode === 'comparison') {
    return buildComparisonPrompt(payload);
  }
  return buildMarketPrompt(payload);
}

export async function POST(req) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured on the server.' },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { mode, payload } = body || {};

    if (!mode) {
      return NextResponse.json({ error: 'Missing mode for AI request.' }, { status: 400 });
    }

    const prompt = buildPrompt(mode, payload);

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input: prompt,
        max_output_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      console.error('OpenAI API error:', errorPayload);
      return NextResponse.json(
        { error: errorPayload.error?.message || 'Failed to generate AI insight.' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const text =
      data.output_text ||
      data.output?.[0]?.content?.map?.((c) => c.text).join('\n') ||
      data.choices?.[0]?.message?.content ||
      'No response generated.';

    return NextResponse.json({ text });
  } catch (error) {
    console.error('AI route error:', error);
    return NextResponse.json(
      { error: 'Unexpected error while generating AI insight.' },
      { status: 500 }
    );
  }
}

