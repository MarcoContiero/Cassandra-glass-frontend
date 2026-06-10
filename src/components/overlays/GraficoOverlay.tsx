'use client';

import React, { useEffect, useState } from 'react';
import ChartWithTrendlines from '@/components/ui/ChartWithTrendlines';

type OHLC = { time: number; open: number; high: number; low: number; close: number };
type TrendlinesPayload = { uptrend: any[]; downtrend: any[] };
type ChartData = { ohlcv: OHLC[]; trendlines: TrendlinesPayload };

export default function GraficoOverlay({
  symbol = 'BTC',
  timeframes = ['15m', '1h', '4h', '1d'],
}: {
  symbol?: string;
  timeframes?: string[];
}) {
  const tfs = timeframes.length > 0 ? timeframes : ['1h'];
  const [activeTf, setActiveTf] = useState(tfs[0]);
  const [cache, setCache] = useState<Record<string, ChartData | null>>({});
  const [loading, setLoading] = useState(false);

  const coin = symbol.replace(/USDT$/i, '').toLowerCase();

  useEffect(() => {
    setActiveTf(tfs[0]);
    setCache({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    if (cache[activeTf] !== undefined) return;

    let alive = true;
    setLoading(true);

    fetch(
      `/api/chart?coin=${encodeURIComponent(coin)}&timeframe=${encodeURIComponent(activeTf)}&bars=300`,
      { cache: 'no-store' },
    )
      .then(r => r.json())
      .then((j: any) => {
        if (!alive) return;
        setCache(prev => ({
          ...prev,
          [activeTf]: {
            ohlcv: Array.isArray(j?.ohlcv) ? j.ohlcv : [],
            trendlines: j?.trendlines ?? { uptrend: [], downtrend: [] },
          },
        }));
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setCache(prev => ({ ...prev, [activeTf]: null }));
        setLoading(false);
      });

    return () => { alive = false; };
  }, [activeTf, coin, cache]);

  const data = cache[activeTf];
  const hasData = data != null && Array.isArray(data.ohlcv) && data.ohlcv.length > 0;

  const nUp   = data?.trendlines?.uptrend?.length   ?? 0;
  const nDown = data?.trendlines?.downtrend?.length ?? 0;

  return (
    <div className="flex flex-col gap-3">

      {/* TF tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {tfs.map(tf => (
          <button
            key={tf}
            onClick={() => setActiveTf(tf)}
            className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
              activeTf === tf
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-white/40 hover:text-white/70 border border-white/10'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* Chart area */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {loading && (
          <div className="h-80 flex items-center justify-center text-white/30 text-sm font-mono">
            Carico grafico…
          </div>
        )}
        {!loading && hasData && (
          <ChartWithTrendlines data={data!} height={420} />
        )}
        {!loading && !hasData && data !== undefined && (
          <div className="h-80 flex items-center justify-center text-white/30 text-sm">
            Nessun dato disponibile per {activeTf}
          </div>
        )}
      </div>

      {/* Legend */}
      {hasData && (
        <div className="flex items-center gap-5 text-[11px] text-white/40 px-1 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-[2px] bg-[#26a69a] rounded" />
            Supporto attivo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-[2px] bg-[#ef5350] rounded" />
            Resistenza attiva
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-5 h-[1px] border-t border-dotted border-white/25" />
            Storica
          </span>
          <span className="ml-auto font-mono text-white/25">
            {nUp}↑ · {nDown}↓ trendline
          </span>
        </div>
      )}
    </div>
  );
}
