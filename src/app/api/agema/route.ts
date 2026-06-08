import { NextRequest, NextResponse } from 'next/server';
import { callBackend } from '@/lib/proxy';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // secondi — aumenta il timeout su Render/Vercel

/**
 * TYPES
 */

type CiclicaWindow = {
  direction?: string;
  tf_ciclo?: string;
  entry_from_bars?: number;
  entry_to_bars?: number;
  countdown_bars?: number;
  timing_grade?: string;
  label?: string;
};

type StrategiaAIItem = {
  tf: string;
  mode?: string;
  direction?: string;
  entry: number;
  sl_price?: number | null;
  tp1_price?: number | null;
  tp2_price?: number | null;
  rr1?: number | null;
  rr2?: number | null;
  score?: number | null;
  dist_bps?: number | null;
  dist_pct?: number | null;
  explanation?: string;
  tags?: string[];
  ciclica_window?: CiclicaWindow | null;
  etaHours?: number | null; // server-only
};

type AgemaRow = {
  coin: string;
  price?: number | null;
  score?: number | null;
  direction?: 'LONG' | 'SHORT' | string;
  ciclica_label?: string | null;
  reentry_label?: string | null;
  eta_reentry_hours?: number;
  best?: StrategiaAIItem[];
};

type AgemaResponse = {
  updated_at: string;
  threshold: number;
  max_hours: number;
  rows: AgemaRow[];
};

/**
 * CONFIG
 */

// tutti i simboli da Lista_coin.csv (colonna BYBIT)
const ALL_SYMBOLS = [
  'BTCUSDT', 'SOLUSDT', 'ETHUSDT', 'DOGEUSDT', 'ADAUSDT', 'LTCUSDT',
  'XRPUSDT', 'HYPEUSDT', 'WIFUSDT', 'PUMPFUNUSDT', 'FARTUSDT', 'OPUSDT',
  'LINKUSDT', 'AVAXUSDT', 'APTUSDT', 'ARBUSDT', 'AAVEUSDT', 'ATOMUSDT',
  'CRVUSDT', 'TAOUSDT', 'UNIUSDT', '1000PEPEUSDT', 'SUIUSDT', 'SEIUSDT',
  'TONUSDT', 'INJUSDT', 'NEARUSDT', 'LDOUSDT', 'JUPUSDT', 'ENAUSDT',
  'ONDOUSDT', 'ZECUSDT', 'WLDUSDT',
];

const DEFAULT_SYMBOLS = (process.env.AGEMA_SYMBOLS
  ? process.env.AGEMA_SYMBOLS.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  : ALL_SYMBOLS);

const DEFAULT_THRESHOLD = Number(process.env.AGEMA_THRESHOLD || 60);
const DEFAULT_MAX_HOURS = Number(process.env.AGEMA_MAX_HOURS || 0);
const FETCH_CONCURRENCY = 8;

/**
 * HELPERS
 */

function safeNumber(v: any, fallback = NaN): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function tfToMinutes(tf?: string): number | null {
  const s = String(tf || '').trim();
  if (!s) return null;
  if (s.endsWith('m')) return Number(s.replace('m', '')) || null;
  if (s.endsWith('h')) return (Number(s.replace('h', '')) || 0) * 60 || null;
  if (s === '1d') return 24 * 60;
  if (s === '1w') return 7 * 24 * 60;
  return null;
}

function barsToHours(countdownBars: any, tfCiclo?: string): number | null {
  const bars = safeNumber(countdownBars, NaN);
  if (!Number.isFinite(bars)) return null;
  const mins = tfToMinutes(tfCiclo);
  if (!mins) return null;
  return (bars * mins) / 60;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// fetch con concorrenza limitata
async function fetchConcurrent<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<Array<{ ok: true; value: T } | { ok: false }>> {
  const results: Array<{ ok: true; value: T } | { ok: false }> = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { ok: true, value: await tasks[i]() };
      } catch {
        results[i] = { ok: false };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker),
  );
  return results;
}

// score ciclica: archetipo + direzione + timing + v3 (energy/quality/events/sync)
function scoreAgemaFromCiclica(ciclica: any): number {
  if (!ciclica || typeof ciclica !== 'object') return 0;

  let score = 0;

  // --- reentry_path (max ~45 grezzo) ---
  const reentry = ciclica.reentry_path || {};
  const archetipo = String(reentry.archetipo || '');
  const direzione = String(reentry.direzione_reentry || '').toUpperCase();

  if (
    archetipo.includes('bottom') ||
    archetipo.includes('reentry') ||
    archetipo.includes('premin') ||
    archetipo.includes('premax')
  ) {
    score += 30;
  }
  if (direzione === 'LONG' || direzione === 'SHORT') score += 5;

  const meta = reentry.meta_timing || {};
  const barsToPivot = safeNumber(meta.bars_to_pivot_1h, NaN);
  if (Number.isFinite(barsToPivot)) {
    if (barsToPivot <= 30) score += 5;
    if (barsToPivot <= 15) score += 5;
  }

  // --- ciclica_v3: segnali di qualità per TF 1h (max 15 bonus grezzo) ---
  const v3 = ciclica.ciclica_v3 || {};
  const perTf = v3.per_tf || {};
  const v3_1h = perTf['1h'] || {};

  // energy (volatilità/espansione ciclo)
  const energy = String(v3_1h.energy || '').toUpperCase();
  if (energy === 'HIGH') score += 5;
  else if (energy === 'MID') score += 3;

  // quality (forma del pivot)
  const quality = String(v3_1h.quality || '').toUpperCase();
  if (quality === 'CLEAN_TOP' || quality === 'CLEAN_BOTTOM') score += 4;

  // tier1 events presenti su 1h
  const events1h: any[] = Array.isArray(v3_1h.events) ? v3_1h.events : [];
  const hasTier1 = events1h.some(
    (e: any) => e?.tier === 1 || e?.tier === 'tier1' || e?.tier === '1',
  );
  if (hasTier1) score += 3;

  // sync multi-TF
  const sync = v3.sync || {};
  if (Object.keys(sync).length > 0) score += 3;

  // cap a 50
  return clamp(score, 0, 50);
}

// score strategia: dist/rr/score AI (max 40)
function scoreAgemaFromStrategia(best: StrategiaAIItem | null): number {
  if (!best) return 0;

  const dist = Math.abs(safeNumber(best.dist_pct, 9999));
  const rr1 = safeNumber(best.rr1, 0);
  const rr2 = safeNumber(best.rr2, 0);
  const sScore = safeNumber(best.score, 0);

  let score = 0;

  if (dist < 0.5) score += 22;
  else if (dist < 1) score += 18;
  else if (dist < 2) score += 12;
  else if (dist < 3) score += 6;
  else if (dist < 5) score += 3;

  const rrMean = (rr1 + rr2) / 2 || rr1 || rr2;
  if (rrMean >= 2.5) score += 10;
  else if (rrMean >= 2) score += 7;
  else if (rrMean >= 1.5) score += 4;

  if (sScore >= 9) score += 8;
  else if (sScore >= 7) score += 5;
  else if (sScore >= 5) score += 3;

  return clamp(score, 0, 40);
}

function normalizeDirection(d: any): 'LONG' | 'SHORT' | '' {
  const s = String(d || '').toUpperCase();
  if (s === 'SHORT') return 'SHORT';
  if (s === 'LONG') return 'LONG';
  return '';
}

function formatZonaReentry(zone: any): string | null {
  if (!zone || typeof zone !== 'object') return null;
  const vmin = safeNumber(zone.valore_min, NaN);
  const vmax = safeNumber(zone.valore_max, NaN);
  if (!Number.isFinite(vmin) || !Number.isFinite(vmax)) return null;
  const d = vmax - vmin;
  const digits = d < 0.1 ? 3 : d < 1 ? 2 : 1;
  return `≈ ${vmin.toFixed(digits)}–${vmax.toFixed(digits)}`;
}

/**
 * Processa un singolo simbolo e ritorna AgemaRow | null
 */
async function processSymbol(
  symbol: string,
  dirParam: 'LONG' | 'SHORT' | '',
  maxHoursParam: number,
  minScoreParam: number,
): Promise<AgemaRow | null> {
  const q = new URLSearchParams();
  q.set('coin', symbol);
  q.set('timeframes_csv', '15m,1h,4h,12h,1d');
  q.set('programma', 'cassandra');
  q.set('tipo', 'riepilogo_totale');
  q.set('limit', '300');

  const res = await callBackend(`/api/analisi_light?${q.toString()}`);
  if (!res.ok) return null;

  const json: any = await res.json();

  const price = safeNumber(json.prezzo, NaN);
  if (!Number.isFinite(price)) return null;

  const ciclica = json.ciclica || {};
  const reentryPath = ciclica.reentry_path || {};
  const faseAttuale = String(reentryPath.fase_attuale || '') || null;
  const reentryLabel = formatZonaReentry(
    (reentryPath.zone_operative || {}).zona_reentry_long || null,
  );

  const rawStrategia: any[] = Array.isArray(json.strategia_ai)
    ? json.strategia_ai
    : [];

  const top3: StrategiaAIItem[] = rawStrategia
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({
      tf: String(s.tf || ''),
      mode: s.mode,
      direction: s.direction,
      entry: safeNumber(s.entry, NaN),
      sl_price: s.sl_price ?? null,
      tp1_price: s.tp1_price ?? null,
      tp2_price: s.tp2_price ?? null,
      rr1: s.rr1 ?? null,
      rr2: s.rr2 ?? null,
      score: s.score ?? null,
      dist_bps: s.dist_bps ?? null,
      dist_pct: s.dist_pct ?? null,
      explanation: s.explanation,
      tags: s.tags,
      ciclica_window: s.ciclica_window ?? null,
    }))
    .filter((s) => s.tf && Number.isFinite(s.entry))
    .sort((a, b) => {
      const as = safeNumber(a.score, 0);
      const bs = safeNumber(b.score, 0);
      if (bs !== as) return bs - as;
      return (
        Math.abs(safeNumber(a.dist_pct, 9e9)) -
        Math.abs(safeNumber(b.dist_pct, 9e9))
      );
    })
    .slice(0, 3);

  if (top3.length === 0) return null;

  const top3WithETA: StrategiaAIItem[] = top3.map((s) => {
    const cw = s.ciclica_window || null;
    return {
      ...s,
      etaHours: cw ? barsToHours(cw.countdown_bars, cw.tf_ciclo) : null,
    };
  });

  // filtro direzione
  if (dirParam) {
    const hasDir = top3WithETA.some(
      (s) => normalizeDirection(s.direction) === dirParam,
    );
    if (!hasDir) return null;
  }

  // filtro tempo: applica solo se ci sono ETA valide;
  // se ciclica_window manca su tutti i setup, non filtrare (ETA sconosciuta ≠ fuori finestra)
  if (Number.isFinite(maxHoursParam) && maxHoursParam > 0) {
    const validEtas = top3WithETA
      .map((s) => s.etaHours)
      .filter((h): h is number => h !== null && Number.isFinite(h));
    if (validEtas.length > 0 && !validEtas.some((h) => h <= maxHoursParam)) {
      return null;
    }
  }

  const best = top3WithETA[0];
  const bestDir = normalizeDirection(best.direction) || 'LONG';

  const etaMin = (() => {
    const vals = top3WithETA
      .map((s) => s.etaHours)
      .filter((h): h is number => h !== null && Number.isFinite(h));
    return vals.length ? Math.min(...vals) : null;
  })();

  const scoreC = scoreAgemaFromCiclica(ciclica);
  const scoreS = scoreAgemaFromStrategia(best);
  let scoreAgema = scoreC + scoreS;

  if (scoreC >= 35 && scoreS >= 20) {
    if (!maxHoursParam || maxHoursParam <= 0) {
      scoreAgema += 5;
    } else {
      const presto = top3WithETA.some(
        (s) =>
          s.etaHours !== null &&
          Number.isFinite(s.etaHours) &&
          (s.etaHours as number) <= maxHoursParam,
      );
      if (presto) scoreAgema += 5;
    }
  }

  scoreAgema = clamp(Math.round(scoreAgema), 0, 100);
  if (scoreAgema < minScoreParam) return null;

  return {
    coin: symbol,
    price,
    score: scoreAgema,
    direction: bestDir,
    ciclica_label: faseAttuale,
    reentry_label: reentryLabel,
    eta_reentry_hours: etaMin ?? undefined,
    best: top3WithETA.map((s) => ({
      tf: s.tf,
      mode: s.mode,
      direction: s.direction,
      entry: s.entry,
      sl_price: s.sl_price ?? null,
      tp1_price: s.tp1_price ?? null,
      tp2_price: s.tp2_price ?? null,
      rr1: s.rr1 ?? null,
      rr2: s.rr2 ?? null,
      score: s.score ?? null,
      dist_bps: s.dist_bps ?? null,
      dist_pct: s.dist_pct ?? null,
      explanation: s.explanation,
      tags: s.tags,
      ciclica_window: s.ciclica_window ?? null,
    })),
  };
}

/**
 * MAIN
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const symbolsParam = url.searchParams.get('symbols');
  const minScoreParam = Number(url.searchParams.get('min_score') || DEFAULT_THRESHOLD);
  const maxHoursParam = Number(url.searchParams.get('max_hours') || DEFAULT_MAX_HOURS);
  const dirParam = normalizeDirection(url.searchParams.get('direction'));

  const symbols = (symbolsParam
    ? symbolsParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    : DEFAULT_SYMBOLS);

  const tasks = symbols.map(
    (sym) => () =>
      processSymbol(sym, dirParam, maxHoursParam, minScoreParam),
  );

  const settled = await fetchConcurrent(tasks, FETCH_CONCURRENCY);

  const rows: AgemaRow[] = settled
    .filter((r): r is { ok: true; value: AgemaRow } => r.ok && r.value !== null)
    .map((r) => r.value);

  rows.sort((a, b) => {
    const sa = safeNumber(a.score, -1);
    const sb = safeNumber(b.score, -1);
    if (sb !== sa) return sb - sa;
    const ea = safeNumber(a.eta_reentry_hours, 9e9);
    const eb = safeNumber(b.eta_reentry_hours, 9e9);
    return ea - eb;
  });

  const payload: AgemaResponse = {
    updated_at: new Date().toISOString(),
    threshold: minScoreParam,
    max_hours: Number.isFinite(maxHoursParam) ? maxHoursParam : 0,
    rows,
  };

  return NextResponse.json(payload);
}
