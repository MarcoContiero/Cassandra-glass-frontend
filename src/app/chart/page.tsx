'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { API } from '@/lib/api';
import { useEffect, useMemo, useState } from 'react';
import ChartWithTrendlines from '@/components/ui/ChartWithTrendlines';

type ChartResponse = {
  coin: string;
  timeframe: string;
  ohlcv: any[];
  trendlines: { uptrend: any[]; downtrend: any[] };
};

function ChartInner() {
  const sp = useSearchParams();
  const router = useRouter();

  const coin = (sp?.get('coin') || 'btc').toLowerCase();
  const tfParam = sp?.get('tf') || '1h,15m,4h,1d';
  const timeframes = useMemo(
    () => tfParam.split(',').map((s) => s.trim()).filter(Boolean),
    [tfParam],
  );

  const [dataByTf, setDataByTf] = useState<Record<string, ChartResponse | null>>({});
  const [loading, setLoading] = useState(true);

  // ⚠️ vedi punto 2 sotto: niente doppio /api
  const base = API;

  async function fetchSafeJSON<T = any>(url: string, init?: RequestInit): Promise<T | null> {
    try {
      const res = await fetch(url, init);
      const raw = await res.text();
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  }

  function normalizeChartResponse(j: any, coin: string, tf: string): ChartResponse | null {
    if (!j) return null;
    if (Array.isArray(j.ohlcv)) {
      return {
        coin: j.coin ?? coin,
        timeframe: j.timeframe ?? tf,
        ohlcv: j.ohlcv,
        trendlines: j.trendlines ?? { uptrend: [], downtrend: [] },
      };
    }
    if (Array.isArray(j)) {
      return { coin, timeframe: tf, ohlcv: j, trendlines: { uptrend: [], downtrend: [] } };
    }
    return null;
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);

    (async () => {
      const pairs = await Promise.all(
        timeframes.map(async (tf) => {
          // ⬅️ usa `${base}/chart` (vedi punto 2)
          const url = `${base}/chart?coin=${encodeURIComponent(coin)}&timeframe=${encodeURIComponent(
            tf,
          )}&bars=800`;
          const j = await fetchSafeJSON<any>(url, { cache: 'no-store' });
          const norm = normalizeChartResponse(j, coin, tf);
          return [tf, norm] as const;
        }),
      );

      if (!alive) return;
      const obj: Record<string, ChartResponse | null> = {};
      for (const [tf, j] of pairs) obj[tf] = j;
      setDataByTf(obj);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [base, coin, timeframes]);

  return (
    <main style={{ minHeight: '100vh', background: '#02020e', color: '#c8c8e8' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '16px 20px' }}>

        {/* Header */}
        <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(201,168,76,0.08)', paddingBottom: '12px' }}>
          <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: '15px', letterSpacing: '0.15em', color: '#c9a84c', fontWeight: 400 }}>
            {coin.toUpperCase()} <span style={{ color: '#5a5a8a' }}>·</span> {timeframes.join(' · ')}
          </h1>
          <button
            onClick={() => router.push('/')}
            style={{
              background: 'transparent',
              border: '1px solid #1a1a3a',
              color: '#5a5a8a',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9px',
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              padding: '6px 14px',
              cursor: 'pointer',
            }}
            onMouseEnter={e => {
              (e.target as HTMLElement).style.borderColor = 'rgba(201,168,76,0.4)';
              (e.target as HTMLElement).style.color = '#c9a84c';
            }}
            onMouseLeave={e => {
              (e.target as HTMLElement).style.borderColor = '#1a1a3a';
              (e.target as HTMLElement).style.color = '#5a5a8a';
            }}
          >
            ← Home
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '64px 0', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#5a5a8a', letterSpacing: '0.2em' }}>
            CARICAMENTO…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {timeframes.map((tf) => {
              const d = dataByTf[tf];
              const ok = d && Array.isArray(d.ohlcv) && d.ohlcv.length > 0;
              return (
                <div key={tf} style={{ background: '#06060f', border: '1px solid rgba(201,168,76,0.12)' }}>
                  {/* Panel header */}
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(201,168,76,0.08)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '0.25em', color: '#c9a84c', textTransform: 'uppercase' }}>
                      {tf}
                    </span>
                    {ok && (
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: '#5a5a8a' }}>
                        {d!.ohlcv.length} bars
                      </span>
                    )}
                  </div>
                  {ok ? (
                    <ChartWithTrendlines
                      data={{ ohlcv: d!.ohlcv, trendlines: d!.trendlines ?? { uptrend: [], downtrend: [] } }}
                      height={360}
                    />
                  ) : (
                    <div style={{ padding: '48px 16px', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#5a5a8a', letterSpacing: '0.2em' }}>
                      NO DATA
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

export default function ChartPage() {
  return (
    <Suspense fallback={<div />}>
      <ChartInner />
    </Suspense>
  );
}

// (opzionale, se vuoi evitare prerender del tutto)
// export const dynamic = 'force-dynamic';
