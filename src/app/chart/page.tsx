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
    <main className="min-h-screen bg-black text-gray-200">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">
            Grafici {coin.toUpperCase()} • {timeframes.join(', ')}
          </h1>
          <button
            onClick={() => router.push('/')}
            className="rounded px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700"
          >
            ⟵ Torna alla home
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-zinc-400">Caricamento grafici…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {timeframes.map((tf) => {
              const d = dataByTf[tf];
              const ok = d && Array.isArray(d.ohlcv) && d.ohlcv.length > 0;
              return (
                <div key={tf} className="rounded-xl bg-zinc-900 p-4 ring-1 ring-zinc-800">
                  <div className="mb-2 font-medium">{tf}</div>
                  {ok ? (
                    <ChartWithTrendlines
                      data={{ ohlcv: d!.ohlcv, trendlines: d!.trendlines ?? { uptrend: [], downtrend: [] } }}
                      height={360}
                    />
                  ) : (
                    <div className="text-sm text-zinc-400">Nessun dato</div>
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
