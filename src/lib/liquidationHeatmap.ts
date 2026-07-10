// src/lib/liquidationHeatmap.ts
// Liquidation Intelligence Fase 2 — binning e coloritura della heatmap.
// I punti arrivano GREZZI dal backend (nessun binning lato server, vedi
// cassandra-heatmap-liquidazione-spec.md): il binning in pixel-celle avviene
// qui, ad ogni draw, in base alla scala corrente del grafico — così zoom e
// bucketing restano coerenti senza ricalcoli lato server.

export interface HeatmapPoint {
  timestamp: number;   // epoch ms (giorno, UTC 00:00)
  price_level: number;
  density: number;     // 0.0-1.0, normalizzato dal backend sul massimo del dataset richiesto
  side: 'long' | 'short';
}

export interface HeatmapResponse {
  coin: string;
  days: number;
  points: HeatmapPoint[];
  leverage_weights: Record<string, number>;
  disclaimer: string;
}

const CELL_W = 6;  // px
const CELL_H = 4;  // px

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
export function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  points: HeatmapPoint[],
  width: number,
  height: number,
  barTimesSec: number[],
  timeToX: (timeSec: number) => number | null,
  priceToY: (price: number) => number | null,
): void {
  ctx.clearRect(0, 0, width, height);
  if (!points.length || !barTimesSec.length) return;

  const maxSnapDist = medianBarSpacing(barTimesSec) * 1.5;
  const buckets = new Map<string, number>();
  for (const p of points) {
    const snappedTime = nearestBarTime(barTimesSec, Math.floor(p.timestamp / 1000), maxSnapDist);
    if (snappedTime === null) continue;
    const x = timeToX(snappedTime);
    const y = priceToY(p.price_level);
    if (x === null || y === null) continue;
    if (x < -CELL_W || x > width + CELL_W || y < -CELL_H || y > height + CELL_H) continue;
    const cx = Math.floor(x / CELL_W);
    const cy = Math.floor(y / CELL_H);
    const key = `${cx},${cy}`;
    const prev = buckets.get(key) ?? 0;
    if (p.density > prev) buckets.set(key, p.density);
  }

  for (const [key, density] of buckets) {
    const [cx, cy] = key.split(',').map(Number);
    ctx.fillStyle = densityColor(density);
    ctx.fillRect(cx * CELL_W, cy * CELL_H, CELL_W, CELL_H);
  }
}
