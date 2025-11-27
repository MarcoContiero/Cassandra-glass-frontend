// src/components/ArgonautaPanel.tsx
'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import ArgonautaEntriesList from '@/components/ArgonautaEntries';
import { buildSuggestions, winnerDirection, Suggestion } from '@/ts/argonauta/extract';


/* =========================== Tipi minimi locali =========================== */

type CategoryKey = 'scalping' | 'reattivo' | 'swing' | 'positional';
type ResultsByCategory = Partial<Record<CategoryKey, any>>;

/* ================================ Fetch ================================== */

async function fetchJSON(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[${res.status}] ${url} -> ${text || 'fetch error'}`);
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchLightAnalysis(symbol: string, tfs: string[]) {
  const qs = new URLSearchParams({
    coin: symbol,
    timeframes: (tfs.length ? tfs : ['15m', '1h', '4h']).join(','), // fallback sensato
    tipo: 'riepilogo_totale',
  });
  return await fetchJSON(`/api/analisi_light?${qs.toString()}`);
}

/* ============================== Helpers ================================== */

function gp(obj: any, path: string[]) {
  return path.reduce(
    (o, k) => (o && typeof o === 'object' ? (o as any)[k] : undefined),
    obj,
  );
}

function mid(entry: any): number | undefined {
  if (typeof entry === 'number') return entry;
  if (Array.isArray(entry) && entry.length === 2) {
    const a = Number(entry[0]), b = Number(entry[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
  }
  const n = Number(entry);
  return Number.isFinite(n) ? n : undefined;
}

/** Estrae oggetti "entry" credibili da un result Cassandra. */
function quickExtractEntries(result: any): any[] {
  const basePaths: string[][] = [
    ['strategia_ai', 'entries'],
    ['strategia_ai', 'candidati'],
    ['strategia_ai', 'segnali'],
    ['risposte', 'strategia_ai', 'entries'],
    ['risposte', 'strategia_ai', 'candidati'],
    ['risposte', 'entries'],
    ['entries'],
    ['segnali'],
    ['setups'],
  ];
  for (const p of basePaths) {
    const arr = gp(result, p);
    if (Array.isArray(arr) && arr.length) return arr;
  }

  const out: any[] = [];
  const seen = new WeakSet();
  const looksLikeEntryObj = (x: any) => {
    if (!x || typeof x !== 'object') return false;
    const keys = Object.keys(x).map((k) => k.toLowerCase());
    const has = (k: string) => keys.includes(k);
    const anyOf = (...kk: string[]) => kk.some(has);
    const hasEntry = anyOf('entry', 'price', 'range', 'range_min', 'range_max', 'zona', 'level', 'livello');
    const hasStop = anyOf('stop', 'sl', 'invalid', 'invalidation');
    const hasTp = anyOf('tp', 'tp1', 'target', 'target1');
    const hasDir = anyOf('dir', 'direction', 'side', 'tipo');
    return hasEntry && (hasStop || hasTp || hasDir);
  };
  const walk = (node: any) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      const looks = node.filter(looksLikeEntryObj);
      if (looks.length) { looks.forEach((e) => out.push(e)); return; }
      node.forEach(walk);
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (
        Array.isArray(v) &&
        /entr(y|ies)|candidati|strategie|setup|segnali/i.test(k) &&
        (v as any[]).some(looksLikeEntryObj)
      ) {
        (v as any[]).filter(looksLikeEntryObj).forEach((e) => out.push(e));
      } else {
        walk(v);
      }
    }
  };
  walk(result);
  return out;
}

function collectEntryMidsFromResults(results: ResultsByCategory): number[] {
  const mids: number[] = [];
  (['scalping', 'reattivo', 'swing', 'positional'] as CategoryKey[]).forEach((k) => {
    const r = results[k]; if (!r) return;
    quickExtractEntries(r).forEach((raw) => {
      const m = mid(
        raw?.entry ??
        raw?.price ??
        (raw?.range_min != null && raw?.range_max != null
          ? [Number(raw.range_min), Number(raw.range_max)]
          : raw?.range ?? raw?.zona ?? raw?.level)
      );
      if (Number.isFinite(m)) mids.push(m as number);
    });
  });
  return mids;
}

function median(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  const arr = nums.slice().sort((a, b) => a - b);
  const n = arr.length;
  return n % 2 ? arr[(n - 1) / 2] : (arr[n / 2 - 1] + arr[n / 2]) / 2;
}

/** Prova a dedurre il prezzo attuale evitando i 'price' delle singole entry. */
function findCurrentPrice(results: ResultsByCategory): number | undefined {
  const prefPaths: string[][] = [
    ['ticker', 'last'], ['ticker', 'price'], ['now', 'price'], ['now', 'close'],
    ['latest', 'price'], ['summary', 'price'], ['summary', 'close'],
    ['current_price'], ['prezzo_attuale'],
  ];

  // 1) tentativi diretti
  for (const k of ['reattivo', 'swing', 'scalping', 'positional'] as CategoryKey[]) {
    const r = results[k]; if (!r) continue;
    for (const p of prefPaths) {
      const v = Number(gp(r, p));
      if (Number.isFinite(v)) return v;
    }
  }

  // 2) deep scan con scoring e coerenza con la mediana dei livelli
  const mids = collectEntryMidsFromResults(results);
  const med = median(mids);

  type Cand = { val: number; path: string[]; score: number };
  const cands: Cand[] = [];
  const seen = new WeakSet();

  const goodCtx = ['ticker', 'now', 'latest', 'summary', 'current', 'quote', 'market', 'spot', 'ohlc', 'candle', 'candles'];
  const goodKeys = ['last', 'price', 'close', 'markprice', 'index_price', 'mark'];
  const banned = ['entries', 'entry', 'segnali', 'setups', 'candidati', 'targets', 'target', 'tp', 'stop', 'level', 'livello', 'zona', 'range'];

  const walk = (node: any, path: string[]) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, path.concat(String(i)))); return; }
    for (const [k, v] of Object.entries(node)) {
      const kl = k.toLowerCase();
      const next = path.concat(kl);
      if (typeof v === 'number' && Number.isFinite(v)) {
        const inBanned = banned.some((b) => next.includes(b));
        const hasCtx = goodCtx.some((g) => next.includes(g));
        const isGoodKey = goodKeys.includes(kl);
        if (!inBanned && (hasCtx || isGoodKey)) {
          let score = 0;
          if (next.includes('ticker')) score += 60;
          if (next.includes('now')) score += 50;
          if (next.includes('latest')) score += 45;
          if (next.includes('summary')) score += 40;
          if (next.includes('current')) score += 35;
          if (next.includes('candle') || next.includes('candles') || next.includes('ohlc')) score += 20;
          if (kl === 'last' || kl === 'close') score += 10;
          if (Number.isFinite(med)) {
            const within = v >= (med as number) / 3 && v <= (med as number) * 3;
            score += within ? 20 : -30;
          }
          cands.push({ val: v, path: next, score });
        }
      } else if (typeof v === 'object') {
        walk(v, next);
      }
    }
  };

  for (const k of ['reattivo', 'swing', 'scalping', 'positional'] as CategoryKey[]) {
    const r = results[k]; if (r) walk(r, [k]);
  }

  cands.sort((a, b) => b.score - a.score);
  return cands.length ? cands[0].val : undefined;
}

/** Flatten ResultsByCategory -> array singolo di strategie/entries */
function flattenEntries(results: any): any[] {
  const out: any[] = [];
  const r = results ?? {};
  Object.keys(r).forEach((k) => {
    const v = (r as any)[k];
    if (Array.isArray(v)) out.push(...v);
    else if (v && Array.isArray(v.items)) out.push(...v.items);
    else if (v && Array.isArray(v.list)) out.push(...v.list);
  });
  return out;
}

/* =============================== Componente =============================== */

type ScanStats = { running: boolean; startedAt: number | null; lastScanAt: number | null; };
type BySymbolState = Record<string, {
  results: ResultsByCategory;
  argIdea?: any | null;
  lastHitAt?: number | null;
  priceHint?: number | undefined;
}>;

export default function ArgonautaPanel() {
  // Controls
  const [freqMin, setFreqMin] = useState<number>(15);
  const [cooldownMin, setCooldownMin] = useState<number>(90);
  const [watchlistRaw, setWatchlistRaw] = useState<string>('BTC, ETH, SOL, SUI, AVAX');

  const symbols = useMemo(
    () => watchlistRaw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
    [watchlistRaw],
  );

  // Scan state
  const [started, setStarted] = useState(false);
  const [stats, setStats] = useState<ScanStats>({ running: false, startedAt: null, lastScanAt: null });
  const [bySymbol, setBySymbol] = useState<BySymbolState>({});
  const timerRef = useRef<any>(null);

  const fmtTime = (t: number | null) => (!t ? '—' : new Date(t).toLocaleTimeString());

  /* ------------------------------ SCAN LOGIC ------------------------------ */
  //const [tfsSelected, setTfsSelected] = useState<string[]>(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '3h', '4h', '6h', '8h', '12h', '1d', '2d', '3d', '1w', '1M']);

  const [alertPct, setAlertPct] = useState<number>(0.20); // es. 0.20% default
  const TF_OPTIONS = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "3h", "4h", "6h", "8h", "12h", "1d", "2d", "3d", "1w", "1M"] as const;
  const [tfsSelected, setTfsSelected] = useState<string[]>(["15m", "1h", "4h"]);
  const toggleTf = (tf: string) =>
    setTfsSelected(prev => prev.includes(tf) ? prev.filter(x => x !== tf) : [...prev, tf]);

  const scanSymbol = useCallback(
    async (sym: string) => {
      const last = bySymbol[sym]?.lastHitAt ?? null;
      if (last && Date.now() - last < cooldownMin * 60 * 1000) return;

      try {
        // 👉 usa i TF selezionati dall’UI
        const light = await fetchLightAnalysis(sym, tfsSelected);

        // suggerimenti Cassandra-style (4 card: 2 bias, 1 opposta, 1 forte)
        const suggestions: Suggestion[] = buildSuggestions(light);

        // hint prezzo (fallback al precedente se non trovato)
        const priceHint =
          findCurrentPrice({
            scalping: light,
            reattivo: light,
            swing: light,
            positional: light,
          }) ?? bySymbol[sym]?.priceHint ?? undefined;

        const results: ResultsByCategory = {
          scalping: light,
          reattivo: light,
          swing: light,
          positional: light,
        };

        setBySymbol((prev) => ({
          ...prev,
          [sym]: {
            results,
            argIdea: { bias: winnerDirection(light), suggestions },
            lastHitAt: Date.now(),
            priceHint,
          },
        }));
      } catch (e) {
        console.error('[Argonauta] fetch error', sym, e);
      }
    },
    // 👇 aggiungi tfsSelected alle dipendenze
    [bySymbol, cooldownMin, tfsSelected],
  );


  const runScan = useCallback(async () => {
    if (!symbols.length) return;
    for (const s of symbols) await scanSymbol(s); // sequenziale = meno pressione
    setStats((st) => ({ ...st, lastScanAt: Date.now() }));
  }, [symbols, scanSymbol]);

  const handleStart = useCallback(async () => {
    if (started) return;
    setStarted(true);
    setStats({ running: true, startedAt: Date.now(), lastScanAt: null });
    await runScan();
    const ms = Math.max(15_000, freqMin * 60 * 1000);
    timerRef.current = setInterval(runScan, ms);
  }, [started, freqMin, runScan]);

  const handleStop = useCallback(() => {
    setStarted(false);
    setStats((st) => ({ ...st, running: false }));
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  /* --------------------------- RIEPILOGO DISTANZE ------------------------- */

  const summaryRows = useMemo(() => {
    return symbols.map((sym) => {
      const data = bySymbol[sym];
      if (!data) return null;

      const price = data.priceHint ?? findCurrentPrice(data.results);
      if (!Number.isFinite(price)) return null;

      const allRaw: any[] = [];
      (['scalping', 'reattivo', 'swing', 'positional'] as CategoryKey[]).forEach((k) => {
        const r = data.results[k]; if (!r) return;
        allRaw.push(...quickExtractEntries(r));
      });
      if (!allRaw.length) return null;

      const items = allRaw
        .map((raw) => {
          const dirRaw = raw?.dir ?? raw?.direction ?? raw?.side ?? raw?.tipo;
          const dir = typeof dirRaw === 'string'
            ? (dirRaw.toLowerCase().includes('short') ? 'SHORT' : 'LONG')
            : '-';
          const entry = raw?.entry ?? raw?.price ??
            (raw?.range_min != null && raw?.range_max != null
              ? [Number(raw.range_min), Number(raw.range_max)]
              : raw?.range ?? raw?.zona ?? raw?.level);
          const m = mid(entry);
          const dpct = Number.isFinite(m)
            ? Math.abs((m as number) - (price as number)) / (price as number) * 100
            : undefined;
          return { dir, entry: m, dpct };
        })
        .filter((x) => x.dpct != null);

      if (!items.length) return null;
      const nearest = items.slice().sort((a, b) => a.dpct! - b.dpct!)[0];

      return {
        symbol: sym,
        dir: nearest.dir,
        pct: nearest.dpct!.toFixed(2),
        current: price as number,
        entry: nearest.entry as number,
      };
    }).filter(Boolean) as Array<{ symbol: string; dir: string; pct: string; current: number; entry: number }>;
  }, [symbols, bySymbol]);

  /* --------------------------------- UI ---------------------------------- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white/90">
          🧭 Argonauta — Entrate vicine valide
        </h2>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* Frequenza */}
        <div>
          <label className="mb-1 block text-xs text-white/60">Frequenza (min)</label>
          <div className="relative">
            <input
              type="number"
              min={1}
              value={freqMin}
              onChange={(e) =>
                setFreqMin(Number((e.target as HTMLInputElement).value || 1))
              }
              disabled={started}
              className="w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40 pr-10"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/40">
              ⏱
            </span>
          </div>
        </div>

        {/* Cooldown */}
        <div>
          <label className="mb-1 block text-xs text-white/60">Cooldown per simbolo (min)</label>
          <div className="relative">
            <input
              type="number"
              min={0}
              value={cooldownMin}
              onChange={(e) =>
                setCooldownMin(Number((e.target as HTMLInputElement).value || 0))
              }
              disabled={started}
              className="w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/40">
              🧊
            </span>
          </div>
        </div>

        {/* Watchlist */}
        <div>
          <label className="mb-1 block text-xs text-white/60">Watchlist (comma)</label>
          <input
            type="text"
            value={watchlistRaw}
            onChange={(e) => setWatchlistRaw((e.target as HTMLInputElement).value)}
            disabled={started}
            className="w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40"
          />
        </div>

        {/* Soglia alert */}
        <div>
          <label className="mb-1 block text-xs text-white/60">Soglia prezzo alert %</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={alertPct}
            onChange={(e) => setAlertPct(Number(e.target.value))}
            className="w-full rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm text-white placeholder:text-white/40"
            placeholder="0.20"
          />
        </div>
      </div>

      {/* Timeframe selector */}
      <div className="mt-1">
        <div className="text-sm text-white/60 mb-1">Timeframe</div>
        <div className="flex flex-wrap gap-2">
          {TF_OPTIONS.map((tf) => {
            const active = tfsSelected.includes(tf);
            return (
              <button
                key={tf}
                onClick={() => toggleTf(tf)}
                className={`px-3 py-1.5 rounded-md border text-sm transition ${active
                  ? "bg-white/15 border-white/30 text-white"
                  : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10"
                  }`}
                aria-pressed={active}
              >
                {tf.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Start / Stop + info */}
      <div className="flex items-center gap-3">
        {!started ? (
          <Button variant="default" onClick={handleStart}>
            Start
          </Button>
        ) : (
          <Button variant="secondary" onClick={handleStop}>
            Stop
          </Button>
        )}
        <div className="text-sm text-white/60">
          Ultima scansione:{" "}
          <span className="text-white/80">{fmtTime(stats.lastScanAt)}</span>
          <span className="mx-2">•</span>
          Stato:{" "}
          <span className={started ? "text-emerald-300" : "text-white/60"}>
            {started ? "attivo" : "fermo"}
          </span>
        </div>
      </div>

      {/* Riepilogo distanze */}
      {summaryRows.length ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold mb-2">
            Riepilogo — distanza dall’entry più vicina
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-white/60">
                <tr className="text-left">
                  <th className="py-1 pr-4">COIN</th>
                  <th className="py-1 pr-4">DIREZIONE</th>
                  <th className="py-1 pr-4">% MANCANTE</th>
                  <th className="py-1 pr-4">PREZZO ATTUALE</th>
                  <th className="py-1">PREZZO ENTRY</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows
                  .slice()
                  .sort((a, b) => Number(a.pct) - Number(b.pct))
                  .map((r) => (
                    <tr key={r.symbol} className="border-t border-white/10">
                      <td className="py-1 pr-4">{r.symbol}</td>
                      <td className="py-1 pr-4">{r.dir}</td>
                      <td className="py-1 pr-4">{r.pct}%</td>
                      <td className="py-1 pr-4">{r.current}</td>
                      <td className="py-1">{r.entry}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Griglia risultati */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(440px,1fr))] gap-5">
        {symbols.map((sym) => {
          const data = bySymbol[sym];
          return (
            <div key={sym} className="rounded-2xl border border-white/10 p-4 bg-white/5">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">{sym}</div>
              </div>

              {data ? (
                <ArgonautaEntriesList
                  symbol={sym}
                  results={data.results}
                  priceHint={data?.priceHint}
                  argonautaIdea={data?.argIdea}
                  alertThresholdPct={alertPct}
                />
              ) : (
                <div className="rounded-xl border border-white/10 p-4 text-sm text-white/50">
                  Nessun dato (ancora).
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
} 