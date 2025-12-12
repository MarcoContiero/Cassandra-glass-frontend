import { NextRequest, NextResponse } from 'next/server';

type Direzione = 'LONG' | 'SHORT';

interface AgemaRow {
  symbol: string;
  coin: string;
  prezzo: number;
  punteggio: number;
  faseCiclica: string;
  zonaReentry: string;
  tpSintetico?: string;
  tempoCiclico?: string;
  direzione: Direzione;
  bestEntryDistance?: string;
  bestEntryPrice?: number;
  bestEntryTf?: string;
  bestEntryScore?: number;
}

interface AgemaResponse {
  updated_at: string;
  threshold: number;
  rows: AgemaRow[];
}

// --- CONFIG ---
// Lista di default: meglio spostarla in .env come AGEMA_SYMBOLS
const DEFAULT_SYMBOLS = (process.env.AGEMA_SYMBOLS || 'BTCUSDT,ETHUSDT,SOLUSDT,LINKUSDT,LTCUSDT,AVAXUSDT,TAOUSDT')
  .split(',')
  .map(s => s.trim().toUpperCase())
  .filter(Boolean);

// Soglia minima di score per essere mostrati
const DEFAULT_THRESHOLD = Number(process.env.AGEMA_THRESHOLD || 70);

// --- HELPERS ---

function safeNumber(v: any, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function formatZonaReentry(zone: any): string {
  if (!zone || typeof zone !== 'object') return '—';
  const vmin = safeNumber(zone.valore_min, NaN);
  const vmax = safeNumber(zone.valore_max, NaN);
  if (!Number.isFinite(vmin) || !Number.isFinite(vmax)) return '—';
  // tipo "≈ 13.5–13.6"
  const d = vmax - vmin;
  const digits = d < 0.1 ? 3 : d < 1 ? 2 : 1;
  return `≈ ${vmin.toFixed(digits)}–${vmax.toFixed(digits)}`;
}

function scoreAgemaFromCiclica(ciclica: any): number {
  if (!ciclica || typeof ciclica !== 'object') return 0;

  const reentry = ciclica.reentry_path || {};
  const archetipo = String(reentry.archetipo || '');
  const direzione = String(reentry.direzione_reentry || '').toUpperCase();

  let score = 0;

  // Bonus se stiamo proprio parlando di re-entry
  if (archetipo.includes('bottom') || archetipo.includes('reentry')) {
    score += 35;
  }

  if (direzione === 'LONG' || direzione === 'SHORT') {
    score += 5;
  }

  const metaTiming = reentry.meta_timing || {};
  const barsToPivot = safeNumber(metaTiming.bars_to_pivot_1h, NaN);
  const durataResidua = safeNumber(metaTiming.durata_residua_1h, NaN);

  // più vicini = meglio (ma senza farlo impazzire)
  if (Number.isFinite(barsToPivot)) {
    if (barsToPivot <= 30) score += 5;
    if (barsToPivot <= 15) score += 5;
  }

  if (Number.isFinite(durataResidua)) {
    if (durataResidua <= 12) score += 3;
  }

  return Math.max(0, Math.min(50, score));
}

function pickBestSetup(strategia_ai: any[]): any | null {
  if (!Array.isArray(strategia_ai) || strategia_ai.length === 0) return null;

  // prendo solo quelli con una distanza definita
  const valid = strategia_ai
    .filter(s => s && typeof s === 'object')
    .map(s => ({
      ...s,
      dist_pct: Math.abs(safeNumber(s.dist_pct, 9999)),
      score: safeNumber(s.score, 0),
    }));

  if (!valid.length) return null;

  // Ordino: prima score più alto, a parità di score, dist_pct più vicino
  valid.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.dist_pct - b.dist_pct;
  });

  return valid[0];
}

function scoreAgemaFromStrategia(best: any | null): number {
  if (!best) return 0;
  let score = 0;

  const dist = Math.abs(safeNumber(best.dist_pct, 9999)); // in %
  const rr1 = safeNumber(best.rr1, 0);
  const rr2 = safeNumber(best.rr2, 0);
  const setupScore = safeNumber(best.score, 0);

  // distanza dal prezzo (più vicino = meglio)
  if (dist < 0.5) score += 22;
  else if (dist < 1) score += 18;
  else if (dist < 2) score += 12;
  else if (dist < 3) score += 6;
  else if (dist < 5) score += 3;

  // RR medio
  const rrMean = (rr1 + rr2) / 2 || rr1 || rr2;
  if (rrMean >= 2.5) score += 10;
  else if (rrMean >= 2) score += 7;
  else if (rrMean >= 1.5) score += 4;

  // forza interna del setup
  if (setupScore >= 9) score += 8;
  else if (setupScore >= 7) score += 5;
  else if (setupScore >= 5) score += 3;

  return Math.max(0, Math.min(40, score));
}

function directionFromSetup(best: any | null): Direzione {
  const dir = String(best?.direction || '').toUpperCase();
  return dir === 'SHORT' ? 'SHORT' : 'LONG';
}

// --- MAIN HANDLER ---

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const symbolsParam = url.searchParams.get('symbols');

  const symbols = symbolsParam
    ? symbolsParam
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
    : DEFAULT_SYMBOLS;

  if (!symbols.length) {
    return NextResponse.json(
      {
        updated_at: new Date().toISOString(),
        threshold: DEFAULT_THRESHOLD,
        rows: [],
      } satisfies AgemaResponse,
    );
  }

  const origin = url.origin;

  const rows: AgemaRow[] = [];

  for (const symbol of symbols) {
    try {
      const q = new URLSearchParams();
      q.set('coin', symbol);
      q.set('timeframes_csv', '1h'); // per Agema basta il 1h come base ciclica
      q.set('programma', 'cassandra');
      q.set('tipo', 'riepilogo_totale');
      q.set('limit', '300');

      // 🔗 Richiamiamo il nostro stesso /api/analisi_light (che a sua volta chiama il BE FastAPI)
      const analisiUrl = `${origin}/api/analisi_light?${q.toString()}`;
      const res = await fetch(analisiUrl, { cache: 'no-store' });

      if (!res.ok) {
        // se una coin fallisce, la saltiamo
        // eslint-disable-next-line no-console
        console.warn('[Agema] errore analisi_light per', symbol, res.status);
        continue;
      }

      const json: any = await res.json();

      // --- PREZZO ---
      const prezzo = safeNumber(json.prezzo, NaN);
      if (!Number.isFinite(prezzo)) continue;

      // --- CICLICA ---
      const ciclica = json.ciclica || {};
      const reentryPath = ciclica.reentry_path || {};
      const faseAttuale: string = reentryPath.fase_attuale || '';

      const zoneOperative = reentryPath.zone_operative || {};
      const zonaReentryLong = zoneOperative.zona_reentry_long || null;
      const zonaReentry = formatZonaReentry(zonaReentryLong);

      const metaTiming = reentryPath.meta_timing || {};
      let tempoCiclico = '';
      if (Number.isFinite(metaTiming.base_residuo_1h) || Number.isFinite(metaTiming.durata_residua_1h)) {
        const base = safeNumber(metaTiming.base_residuo_1h, NaN);
        const dur = safeNumber(metaTiming.durata_residua_1h, NaN);
        const chunks: string[] = [];
        if (Number.isFinite(base)) chunks.push(`base ~${base}h`);
        if (Number.isFinite(dur)) chunks.push(`residuo ~${dur}h`);
        tempoCiclico = chunks.join(' · ');
      }

      // --- STRATEGIA AI ---
      const strategia_ai: any[] = Array.isArray(json.strategia_ai) ? json.strategia_ai : [];
      const best = pickBestSetup(strategia_ai);
      const bestDir = directionFromSetup(best);
      const bestEntryPrice = best ? safeNumber(best.entry, NaN) : NaN;
      const bestEntryScore = best ? safeNumber(best.score, NaN) : NaN;
      const bestEntryTf = best ? `${best.tf || ''} · ${best.mode || ''}`.trim() : undefined;
      let bestEntryDistanceText: string | undefined;

      if (best && Number.isFinite(bestEntryPrice)) {
        const diffAbs = Math.abs(prezzo - bestEntryPrice);
        bestEntryDistanceText = `≈ ${diffAbs.toFixed(4)} dal best setup (${Math.abs(
          safeNumber(best.dist_pct, 0),
        ).toFixed(2)}%)`;
      }

      // --- SCORE ---
      const scoreC = scoreAgemaFromCiclica(ciclica);
      const scoreS = scoreAgemaFromStrategia(best);
      let punteggio = scoreC + scoreS;

      // piccolo bonus se sia ciclica che strategia sono entrambe "buone"
      if (scoreC >= 35 && scoreS >= 20) {
        punteggio += 5;
      }

      // clamp 0–100
      punteggio = Math.max(0, Math.min(100, Math.round(punteggio)));

      // Se sotto threshold non la includiamo proprio
      if (punteggio < DEFAULT_THRESHOLD) {
        continue;
      }

      const row: AgemaRow = {
        symbol,
        coin: symbol.replace('USDT', ''),
        prezzo,
        punteggio,
        faseCiclica: faseAttuale || 'Ciclica non disponibile',
        zonaReentry: zonaReentry,
        tempoCiclico: tempoCiclico || undefined,
        direzione: bestDir,
        bestEntryPrice: Number.isFinite(bestEntryPrice) ? bestEntryPrice : undefined,
        bestEntryScore: Number.isFinite(bestEntryScore) ? bestEntryScore : undefined,
        bestEntryTf: bestEntryTf || undefined,
        bestEntryDistance: bestEntryDistanceText,
        tpSintetico: best
          ? (() => {
            const tp1p = safeNumber(best.tp1_price, NaN);
            const tp2p = safeNumber(best.tp2_price, NaN);
            if (Number.isFinite(tp1p) && Number.isFinite(tp2p)) {
              return `TP1 ${tp1p.toFixed(4)} · TP2 ${tp2p.toFixed(4)}`;
            }
            if (Number.isFinite(tp1p)) return `TP1 ${tp1p.toFixed(4)}`;
            if (Number.isFinite(tp2p)) return `TP2 ${tp2p.toFixed(4)}`;
            return undefined;
          })()
          : undefined,
      };

      rows.push(row);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[Agema] errore generico per symbol', symbol, e);
      continue;
    }
  }

  // Ordiniamo per punteggio decrescente
  rows.sort((a, b) => b.punteggio - a.punteggio);

  const payload: AgemaResponse = {
    updated_at: new Date().toISOString(),
    threshold: DEFAULT_THRESHOLD,
    rows,
  };

  return NextResponse.json(payload);
}