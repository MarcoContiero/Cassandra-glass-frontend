import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * TYPES (single source of truth, no duplicates)
 */

type CiclicaWindow = {
  direction?: string;       // "LONG" | "SHORT"
  tf_ciclo?: string;        // es "1h"
  entry_from_bars?: number;
  entry_to_bars?: number;
  countdown_bars?: number;  // bars to entry window / pivot
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

  // server-only helper (non esce nel payload)
  etaHours?: number | null;
};

type AgemaRow = {
  coin: string;                          // "LINKUSDT"
  price?: number | null;                 // current price
  score?: number | null;                 // agema score 0-100
  direction?: 'LONG' | 'SHORT' | string; // prevalent direction

  ciclica_label?: string | null;         // optional
  reentry_label?: string | null;         // optional
  eta_reentry_hours?: number;            // min ETA among top3 (undefined if unknown)

  best?: StrategiaAIItem[];              // top 3 setups
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
const DEFAULT_SYMBOLS = (process.env.AGEMA_SYMBOLS ||
  'BTCUSDT,ETHUSDT,SOLUSDT,LINKUSDT,LTCUSDT,AVAXUSDT,TAOUSDT')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const DEFAULT_THRESHOLD = Number(process.env.AGEMA_THRESHOLD || 70);
const DEFAULT_MAX_HOURS = Number(process.env.AGEMA_MAX_HOURS || 0);

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

// score ciclica: semplice ma stabile (puoi raffinarlo dopo)
function scoreAgemaFromCiclica(ciclica: any): number {
  if (!ciclica || typeof ciclica !== 'object') return 0;

  const reentry = ciclica.reentry_path || {};
  const archetipo = String(reentry.archetipo || '');
  const direzione = String(reentry.direzione_reentry || '').toUpperCase();

  let score = 0;

  // se parla di re-entry / bottom / pivot → bonus importante
  if (
    archetipo.includes('bottom') ||
    archetipo.includes('reentry') ||
    archetipo.includes('premin') ||
    archetipo.includes('premax')
  ) {
    score += 35;
  }

  if (direzione === 'LONG' || direzione === 'SHORT') score += 5;

  // micro bonus se abbiamo timing nel meta
  const meta = reentry.meta_timing || {};
  const barsToPivot = safeNumber(meta.bars_to_pivot_1h, NaN);
  if (Number.isFinite(barsToPivot)) {
    if (barsToPivot <= 30) score += 5;
    if (barsToPivot <= 15) score += 5;
  }

  return clamp(score, 0, 50);
}

// score strategia: usa un setup (best top3) e premia distanza/rr/score
function scoreAgemaFromStrategia(best: StrategiaAIItem | null): number {
  if (!best) return 0;

  const dist = Math.abs(safeNumber(best.dist_pct, 9999)); // %
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
 * MAIN
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // query params
  const symbolsParam = url.searchParams.get('symbols');
  const minScoreParam = Number(url.searchParams.get('min_score') || DEFAULT_THRESHOLD);
  const maxHoursParam = Number(url.searchParams.get('max_hours') || DEFAULT_MAX_HOURS);
  const dirParam = normalizeDirection(url.searchParams.get('direction')); // LONG/SHORT/''

  const symbols = (symbolsParam ? symbolsParam.split(',') : DEFAULT_SYMBOLS)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const origin = url.origin;
  const rows: AgemaRow[] = [];

  for (const symbol of symbols) {
    try {
      // chiamiamo /api/analisi_light interno (che già parla col FastAPI)
      const q = new URLSearchParams();
      q.set('coin', symbol);
      q.set('timeframes_csv', '15m,1h,4h,12h,1d');
      q.set('programma', 'cassandra');
      q.set('tipo', 'riepilogo_totale');
      q.set('limit', '300');

      const analisiUrl = `${origin}/api/analisi_light?${q.toString()}`;
      const res = await fetch(analisiUrl, { cache: 'no-store' });
      if (!res.ok) continue;

      const json: any = await res.json();

      // prezzo
      const price = safeNumber(json.prezzo, NaN);
      if (!Number.isFinite(price)) continue;

      // ciclica labels (optional)
      const ciclica = json.ciclica || {};
      const reentryPath = ciclica.reentry_path || {};
      const faseAttuale = String(reentryPath.fase_attuale || '') || null;

      const zoneOperative = reentryPath.zone_operative || {};
      const zonaReentryLong = zoneOperative.zona_reentry_long || null;
      const reentryLabel = formatZonaReentry(zonaReentryLong);

      // strategia ai
      const rawStrategia: any[] = Array.isArray(json.strategia_ai) ? json.strategia_ai : [];

      // top3 stable
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
          const ad = Math.abs(safeNumber(a.dist_pct, 9e9));
          const bd = Math.abs(safeNumber(b.dist_pct, 9e9));
          return ad - bd;
        })
        .slice(0, 3);

      if (top3.length === 0) continue;

      // ETA per top3
      const top3WithETA: StrategiaAIItem[] = top3.map((s) => {
        const cw = s.ciclica_window || null;
        const eta = cw ? barsToHours(cw.countdown_bars, cw.tf_ciclo) : null;
        return { ...s, etaHours: eta };
      });

      // filtro direzione: passa se almeno 1 tra top3 matcha
      if (dirParam) {
        const hasDir = top3WithETA.some((s) => normalizeDirection(s.direction) === dirParam);
        if (!hasDir) continue;
      }

      // filtro tempo: passa se almeno 1 ha etaHours <= maxHoursParam
      if (Number.isFinite(maxHoursParam) && maxHoursParam > 0) {
        const hasValidTime = top3WithETA.some(
          (s) => s.etaHours !== null && Number.isFinite(s.etaHours) && (s.etaHours as number) <= maxHoursParam
        );
        if (!hasValidTime) continue;
      }

      // best = top3[0]
      const best = top3WithETA[0];
      const bestDir = normalizeDirection(best.direction) || 'LONG';

      // eta min tra top3
      const etaMin = (() => {
        const vals = top3WithETA
          .map((s) => s.etaHours)
          .filter((h): h is number => h !== null && Number.isFinite(h));
        return vals.length ? Math.min(...vals) : null;
      })();

      // scoring
      const scoreC = scoreAgemaFromCiclica(ciclica);
      const scoreS = scoreAgemaFromStrategia(best);
      let scoreAgema = scoreC + scoreS;

      // bonus: ciclica forte + strategia buona + (se maxHours attivo) almeno una entry presto
      if (scoreC >= 35 && scoreS >= 20) {
        if (!maxHoursParam || maxHoursParam <= 0) {
          scoreAgema += 5;
        } else {
          const presto = top3WithETA.some(
            (s) => s.etaHours !== null && Number.isFinite(s.etaHours) && (s.etaHours as number) <= maxHoursParam
          );
          if (presto) scoreAgema += 5;
        }
      }

      scoreAgema = clamp(Math.round(scoreAgema), 0, 100);

      // soglia score
      if (scoreAgema < minScoreParam) continue;

      // row output
      const row: AgemaRow = {
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

      rows.push(row);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[Agema] errore per symbol', symbol, e);
      continue;
    }
  }

  // sort: score desc, poi eta asc se presente
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