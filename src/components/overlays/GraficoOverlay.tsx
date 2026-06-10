'use client';

import React, { useEffect, useState } from 'react';
import ChartWithTrendlines from '@/components/ui/ChartWithTrendlines';

type OHLC = { time: number; open: number; high: number; low: number; close: number };
type TrendlinesPayload = { uptrend: any[]; downtrend: any[] };
type ChartData = { ohlcv: OHLC[]; trendlines: TrendlinesPayload };

const BYBIT_INTERVAL: Record<string, string> = {
  '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
  '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
  '1d': 'D', '1w': 'W',
};

async function fetchBybit(symbol: string, tf: string, bars: number): Promise<OHLC[]> {
  const interval = BYBIT_INTERVAL[tf] ?? tf;
  const sym = symbol.replace(/USDT$/i, '').toUpperCase() + 'USDT';
  const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}&interval=${interval}&limit=${bars}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Bybit ${res.status}`);
  const json = await res.json();
  return ((json?.result?.list ?? []) as any[][])
    .map(r => ({
      time: Math.floor(Number(r[0]) / 1000),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
    }))
    .reverse();
}

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

  useEffect(() => {
    setActiveTf(tfs[0]);
    setCache({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    if (cache[activeTf] !== undefined) return;

    let alive = true;
    setLoading(true);

    fetchBybit(symbol, activeTf, 300)
      .then(ohlcv => {
        if (!alive) return;
        setCache(prev => ({
          ...prev,
          [activeTf]: { ohlcv, trendlines: { uptrend: [], downtrend: [] } },
        }));
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setCache(prev => ({ ...prev, [activeTf]: null }));
        setLoading(false);
      });

    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTf, symbol, cache]);

  const data = cache[activeTf];
  const hasData = data != null && Array.isArray(data.ohlcv) && data.ohlcv.length > 0;

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
    </div>
  );
}
