// src/ts/get1m.ts
const API = process.env.NEXT_PUBLIC_CASSANDRA_API?.replace(/\/+$/,'');
const EX  = (process.env.NEXT_PUBLIC_ORIONE_EX ?? 'binance').toLowerCase();

function fromCache(symbol: string): { closes:number[]; times?:number[] } | null {
  try {
    const cache = (globalThis as any).__CASSANDRA_CACHE__;
    const arr = cache?.[symbol]?.series1m ?? cache?.[symbol]?.closes1m;
    if (Array.isArray(arr) && arr.length >= 30) return { closes: arr.slice(-200) };
  } catch {}
  return null;
}

export async function getSeries1m(symbol: string): Promise<{ closes:number[]; times:number[] }> {
  const sym = symbol.toUpperCase();

  // 1) cache (se presente)
  const cached = fromCache(sym);
  if (cached) return { closes: cached.closes, times: cached.times ?? [] };

  // 2) backend Cassandra (se disponibile)
  if (API) {
    try {
      const r = await fetch(`${API}/series?symbol=${encodeURIComponent(sym)}&tf=1m&limit=200`, { cache: 'no-store' });
      const j = await r.json();
      if (Array.isArray(j.closes)) {
        return { closes: j.closes, times: Array.isArray(j.times) ? j.times : [] };
      }
      if (Array.isArray(j.ohlc)) {
        const closes = j.ohlc.map((k:any) => +k[4]).filter(Number.isFinite);
        const times  = j.ohlc.map((k:any) => +k[0]).filter(Number.isFinite);
        return { closes, times };
      }
    } catch {}
  }

  // 3) fallback: nostra route (no CORS, no key)
  try {
    const r = await fetch(`/api/klines?symbol=${encodeURIComponent(sym)}&interval=1m&limit=200&ex=${EX}`, { cache: 'no-store' });
    const j = await r.json();
    if (Array.isArray(j.closes)) {
      return { closes: j.closes, times: Array.isArray(j.times) ? j.times : [] };
    }
  } catch {}

  return { closes: [], times: [] };
}

// compat: vecchia funzione che ritorna solo i close
export async function getCloses1m(symbol: string): Promise<number[]> {
  const { closes } = await getSeries1m(symbol);
  return closes;
}
