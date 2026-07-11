// src/lib/liquidationHeatmap.ts
// Liquidation Intelligence Fase 2 — binning e coloritura della heatmap.
// I punti arrivano GREZZI dal backend (nessun binning lato server, vedi
// cassandra-heatmap-liquidazione-spec.md): il binning in pixel-celle avviene
// qui, ad ogni draw, in base alla scala corrente del grafico — così zoom e
// bucketing restano coerenti senza ricalcoli lato server.

export function formatUsdCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export interface HeatmapPoint {
  timestamp: number;   // epoch ms (giorno, UTC 00:00)
  price_level: number;
  density: number;     // 0.0-1.0, normalizzato dal backend sul massimo del dataset richiesto
  value_usd: number;   // stima in $ NON normalizzata — per tooltip/liste leggibili
  side: 'long' | 'short';
}

export interface HeatmapResponse {
  coin: string;
  days: number;
  points: HeatmapPoint[];
  leverage_weights: Record<string, number>;
  disclaimer: string;
}

export const HEATMAP_CELL_W = 6;  // px
export const HEATMAP_CELL_H = 4;  // px
const CELL_W = HEATMAP_CELL_W;
const CELL_H = HEATMAP_CELL_H;

export interface HeatmapBucket {
  density: number;
  value_usd: number;
  side: 'long' | 'short';
}

// Scala colori standard heatmap liquidazioni (riconoscibile da chi conosce
// Coinglass): trasparente/bianco (bassa) → oro #c9a84c (media) → rosso
// #c94c4c (alta). Interpolazione lineare in RGB, non percettiva — è una
// convenzione di dominio, non un ramp sequenziale in senso stretto.
const STOP_LOW: [number, number, number] = [255, 255, 255];
const STOP_MID: [number, number, number] = [201, 168, 76];  // #c9a84c
const STOP_HIGH: [number, number, number] = [201, 76, 76];  // #c94c4c

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function densityColor(density: number): string {
  const d = Math.max(0, Math.min(1, density));
  if (d <= 0.001) return 'rgba(255,255,255,0)';
  let rgb: [number, number, number];
  let alpha: number;
  if (d < 0.5) {
    const t = d / 0.5;
    rgb = [lerp(STOP_LOW[0], STOP_MID[0], t), lerp(STOP_LOW[1], STOP_MID[1], t), lerp(STOP_LOW[2], STOP_MID[2], t)];
    alpha = lerp(0.05, 0.55, t);
  } else {
    const t = (d - 0.5) / 0.5;
    rgb = [lerp(STOP_MID[0], STOP_HIGH[0], t), lerp(STOP_MID[1], STOP_HIGH[1], t), lerp(STOP_MID[2], STOP_HIGH[2], t)];
    alpha = lerp(0.55, 0.85, t);
  }
  return `rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},${alpha.toFixed(3)})`;
}

/**
 * Trova il timestamp (secondi) della barra OHLCV più vicina a target.
 * barTimesSec DEVE essere ordinato crescente (le OHLCV lo sono già).
 *
 * Necessario perché chart.timeScale().timeToCoordinate() di Lightweight
 * Charts torna null se il tempo passato non corrisponde ESATTAMENTE a una
 * barra esistente sulla scala ("X coordinate of that time or null if no
 * time found on time scale" — non interpola su timestamp arbitrari). I
 * timestamp della heatmap (mezzanotte UTC calcolata lato backend) quasi
 * mai coincidono esattamente con l'apertura delle barre reali, specie su
 * timeframe diversi da 1d — senza lo snap, timeToCoordinate torna sempre
 * null e la heatmap risulta invisibile pur con dati corretti.
 */
// maxDist evita l'artefatto "muro di colore ai bordi": senza un limite,
// i punti heatmap più vecchi/nuovi delle barre effettivamente caricate
// (es. 365gg di storico OI contro le ~300 barre OHLCV fetchate) si
// accumulerebbero tutti sulla prima/ultima barra invece di essere esclusi.
function nearestBarTime(barTimesSec: number[], target: number, maxDist: number): number | null {
  if (barTimesSec.length === 0) return null;
  let lo = 0;
  let hi = barTimesSec.length - 1;
  let nearest: number;
  if (target <= barTimesSec[lo]) {
    nearest = barTimesSec[lo];
  } else if (target >= barTimesSec[hi]) {
    nearest = barTimesSec[hi];
  } else {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (barTimesSec[mid] <= target) lo = mid; else hi = mid;
    }
    nearest = (target - barTimesSec[lo] <= barTimesSec[hi] - target) ? barTimesSec[lo] : barTimesSec[hi];
  }
  return Math.abs(nearest - target) <= maxDist ? nearest : null;
}

// Spaziatura mediana tra barre consecutive — usata come base per maxDist.
function medianBarSpacing(barTimesSec: number[]): number {
  if (barTimesSec.length < 2) return Infinity;
  const gaps: number[] = [];
  for (let i = 1; i < barTimesSec.length; i++) gaps.push(barTimesSec[i] - barTimesSec[i - 1]);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/**
 * Disegna la heatmap sul canvas dato. timeToX/priceToY convertono
 * timestamp (secondi, UTCTimestamp) e prezzo in coordinate pixel — passare
 * chart.timeScale().timeToCoordinate / series.priceToCoordinate. barTimesSec
 * sono i tempi (secondi) delle barre OHLCV realmente presenti sul grafico,
 * ordinati crescente — usati per lo snap (vedi nearestBarTime).
 *
 * Binning: bucket pixel (CELL_W x CELL_H), Math.max() sulla densità per i
 * bucket con più punti sovrapposti — MAI sommare, altrimenti i bucket con
 * molti punti (es. giorni con OI alto su più leve) saturano al rosso anche
 * quando la densità reale di ciascun punto è media.
 */
export interface DrawHeatmapDebug {
  pointsIn: number;
  barsIn: number;
  snappedOk: number;
  coordsOk: number;
  inBounds: number;
  bucketsDrawn: number;
}

export function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  points: HeatmapPoint[],
  width: number,
  height: number,
  barTimesSec: number[],
  timeToX: (timeSec: number) => number | null,
  priceToY: (price: number) => number | null,
): { debug: DrawHeatmapDebug; buckets: Map<string, HeatmapBucket> } {
  const debug: DrawHeatmapDebug = {
    pointsIn: points.length, barsIn: barTimesSec.length,
    snappedOk: 0, coordsOk: 0, inBounds: 0, bucketsDrawn: 0,
  };
  ctx.clearRect(0, 0, width, height);
  const buckets = new Map<string, HeatmapBucket>();
  if (!points.length || !barTimesSec.length) return { debug, buckets };

  const maxSnapDist = medianBarSpacing(barTimesSec) * 1.5;
  for (const p of points) {
    const snappedTime = nearestBarTime(barTimesSec, Math.floor(p.timestamp / 1000), maxSnapDist);
    if (snappedTime === null) continue;
    debug.snappedOk++;
    const x = timeToX(snappedTime);
    const y = priceToY(p.price_level);
    if (x === null || y === null) continue;
    debug.coordsOk++;
    if (x < -CELL_W || x > width + CELL_W || y < -CELL_H || y > height + CELL_H) continue;
    debug.inBounds++;
    const cx = Math.floor(x / CELL_W);
    const cy = Math.floor(y / CELL_H);
    const key = `${cx},${cy}`;
    const prev = buckets.get(key);
    if (!prev || p.density > prev.density) {
      buckets.set(key, { density: p.density, value_usd: p.value_usd, side: p.side });
    }
  }

  for (const [key, bucket] of buckets) {
    const [cx, cy] = key.split(',').map(Number);
    ctx.fillStyle = densityColor(bucket.density);
    ctx.fillRect(cx * CELL_W, cy * CELL_H, CELL_W, CELL_H);
  }
  debug.bucketsDrawn = buckets.size;
  return { debug, buckets };
}

/** Hit-test: dato un punto (px,py) relativo al canvas, ritorna il bucket
 * sotto quel punto, se presente — per il tooltip on-hover. */
export function hitTestBucket(buckets: Map<string, HeatmapBucket>, px: number, py: number): HeatmapBucket | null {
  const cx = Math.floor(px / CELL_W);
  const cy = Math.floor(py / CELL_H);
  return buckets.get(`${cx},${cy}`) ?? null;
}

export interface ClusterLevel {
  price: number;
  valueToday: number;      // value_usd del giorno più recente disponibile a questo prezzo
  valueMax: number;        // value_usd più alto tra i singoli giorni storici a questo prezzo
  side: 'long' | 'short';  // lato dominante nel giorno più recente
  distancePct: number;     // distanza % dal prezzo corrente, con segno
  probability?: number;    // 0-1, solo se calcolato dal backend (Fase 3 — vedi fetchSweepProbability)
  confidence?: number;     // 0-1, idem
}

/**
 * Aggrega i punti grezzi della heatmap (su TUTTO il periodo richiesto, non
 * solo le barre visibili — a differenza del canvas, questa è una vista
 * "storica complessiva") in bande di prezzo, e ritorna i top N cluster
 * sopra e sotto il prezzo corrente. Bozza dell'output di Fase 3 (lì userà
 * anche Sweep Probability, qui solo densità/valore) — vedi
 * cassandra-heatmap-liquidazione-spec.md.
 *
 * Attenzione: value_usd per punto è già una stima per-giorno (OI di quel
 * giorno × peso leva, vedi backend/liquidation_heatmap.py). Sommarlo
 * direttamente su più giorni che cadono nella stessa banda di prezzo (com'era
 * prima) accumula tante istantanee giornaliere in un totale senza senso
 * economico — un prezzo su cui il mercato è rimasto per settimane arriva a
 * sommare l'OI di ogni singolo giorno, gonfiando il valore ben oltre l'OI
 * reale dell'exchange. Per questo il primo passo raggruppa PER GIORNO prima
 * di aggregare per banda, e la banda espone due numeri distinti invece di un
 * value_usd unico: valueToday (ultimo giorno disponibile — "rischio adesso")
 * e valueMax (il singolo giorno più alto nello storico — "picco storico").
 */
export function computeTopClusters(
  points: HeatmapPoint[],
  currentPrice: number,
  topN = 10,
  bucketPct = 0.003,
): { above: ClusterLevel[]; below: ClusterLevel[] } {
  if (!points.length || currentPrice <= 0) return { above: [], below: [] };
  const bucketSize = currentPrice * bucketPct;
  if (bucketSize <= 0) return { above: [], below: [] };

  const MS_PER_DAY = 86_400_000;

  // Passo 1: totale per (banda di prezzo, giorno) — long+short di quel
  // giorno sommati tra loro (leve diverse nello stesso giorno), MAI tra
  // giorni diversi.
  const dayBuckets = new Map<string, {
    idx: number; day: number; priceSum: number; count: number; longUsd: number; shortUsd: number;
  }>();
  for (const p of points) {
    const idx = Math.round(p.price_level / bucketSize);
    const day = Math.floor(p.timestamp / MS_PER_DAY);
    const key = `${idx}:${day}`;
    const entry = dayBuckets.get(key) ?? { idx, day, priceSum: 0, count: 0, longUsd: 0, shortUsd: 0 };
    entry.priceSum += p.price_level;
    entry.count += 1;
    if (p.side === 'long') entry.longUsd += p.value_usd; else entry.shortUsd += p.value_usd;
    dayBuckets.set(key, entry);
  }

  // Passo 2: per ogni banda di prezzo, isola il giorno più recente
  // (valueToday) e il giorno con il totale più alto (valueMax) tra i
  // totali giornalieri calcolati sopra.
  interface Agg {
    priceSum: number; count: number;
    latestDay: number; latestUsd: number; latestSide: 'long' | 'short';
    maxUsd: number;
  }
  const buckets = new Map<number, Agg>();
  for (const { idx, day, priceSum, count, longUsd, shortUsd } of dayBuckets.values()) {
    const dayUsd = longUsd + shortUsd;
    const daySide: 'long' | 'short' = longUsd >= shortUsd ? 'long' : 'short';
    const entry = buckets.get(idx);
    if (!entry) {
      buckets.set(idx, { priceSum, count, latestDay: day, latestUsd: dayUsd, latestSide: daySide, maxUsd: dayUsd });
      continue;
    }
    entry.priceSum += priceSum;
    entry.count += count;
    if (day > entry.latestDay) {
      entry.latestDay = day;
      entry.latestUsd = dayUsd;
      entry.latestSide = daySide;
    }
    if (dayUsd > entry.maxUsd) entry.maxUsd = dayUsd;
  }

  const levels: ClusterLevel[] = Array.from(buckets.values()).map(b => {
    const price = b.priceSum / b.count;
    return {
      price,
      valueToday: b.latestUsd,
      valueMax: b.maxUsd,
      side: b.latestSide,
      distancePct: ((price - currentPrice) / currentPrice) * 100,
    };
  });

  const above = levels.filter(l => l.price > currentPrice).sort((a, b) => b.valueToday - a.valueToday).slice(0, topN);
  const below = levels.filter(l => l.price < currentPrice).sort((a, b) => b.valueToday - a.valueToday).slice(0, topN);
  above.sort((a, b) => a.price - b.price);
  below.sort((a, b) => b.price - a.price);
  return { above, below };
}

// ──────────────────────────────
//  Sweep Probability (Fase 3) — fetch backend, con fallback a
//  computeTopClusters() locale (senza probability/confidence) se il
//  backend non risponde. Vedi backend/sweep_probability.py.
// ──────────────────────────────

interface RawSweepLevel {
  price: number;
  side: 'long' | 'short';
  distance_pct: number;
  value_today: number;
  value_max: number;
  probability: number;
  confidence: number;
}

export interface SweepProbabilityResponse {
  above: ClusterLevel[];
  below: ClusterLevel[];
  disclaimer: string;
}

function toClusterLevel(raw: RawSweepLevel): ClusterLevel {
  return {
    price: raw.price,
    valueToday: raw.value_today,
    valueMax: raw.value_max,
    side: raw.side,
    distancePct: raw.distance_pct,
    probability: raw.probability,
    confidence: raw.confidence,
  };
}

/** Ritorna null se il backend non risponde o i dati non sono disponibili —
 * il chiamante deve fare fallback su computeTopClusters() locale. */
export async function fetchSweepProbability(
  apiBase: string,
  coin: string,
  days: number,
): Promise<SweepProbabilityResponse | null> {
  try {
    const r = await fetch(`${apiBase}/api/oi/sweep-probability?coin=${coin}&days=${days}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const json = await r.json();
    if (!Array.isArray(json?.above) || !Array.isArray(json?.below)) return null;
    return {
      above: (json.above as RawSweepLevel[]).map(toClusterLevel),
      below: (json.below as RawSweepLevel[]).map(toClusterLevel),
      disclaimer: String(json.disclaimer ?? ''),
    };
  } catch {
    return null;
  }
}
