// Client-side chart computations: EMA, pivots, trendlines, SR zones

export type OHLCV = {
  time: number; open: number; high: number; low: number; close: number; volume?: number;
};

export type EMAPoint = { time: number; value: number };

export type Pivot = {
  index: number; time: number; price: number; kind: 'high' | 'low';
};

export type TLCalc = {
  x1: number; y1: number;
  x2: number; y2: number;
  kind: 'up' | 'down';
  touches: number;
  active: boolean;
};

export type SRZone = {
  top: number; bottom: number; center: number;
  touches: number; kind: 'support' | 'resistance';
};

export function computeEMA(data: OHLCV[], period: number): EMAPoint[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((s, d) => s + d.close, 0) / period;
  const result: EMAPoint[] = [{ time: data[period - 1].time, value: ema }];
  for (let i = period; i < data.length; i++) {
    ema = data[i].close * k + ema * (1 - k);
    result.push({ time: data[i].time, value: ema });
  }
  return result;
}

export function findPivots(data: OHLCV[], left = 6, right = 6): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = left; i < data.length - right; i++) {
    const h = data[i].high, lo = data[i].low;
    let isH = true, isL = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (data[j].high >= h) isH = false;
      if (data[j].low <= lo) isL = false;
    }
    if (isH) pivots.push({ index: i, time: data[i].time, price: h, kind: 'high' });
    if (isL) pivots.push({ index: i, time: data[i].time, price: lo, kind: 'low' });
  }
  return pivots;
}

export function buildTrendlines(
  data: OHLCV[],
  pivots: Pivot[],
  minTouches: number,
  tol = 0.0035,
): TLCalc[] {
  const lastBar = data[data.length - 1];
  if (!lastBar) return [];
  const lastTime = lastBar.time;
  const lastClose = lastBar.close;

  const highs = pivots.filter(p => p.kind === 'high').slice(-12);
  const lows  = pivots.filter(p => p.kind === 'low').slice(-12);
  const result: TLCalc[] = [];

  const processGroup = (pts: Pivot[], isDown: boolean) => {
    for (let a = 0; a < pts.length - 1; a++) {
      for (let b = a + 1; b < pts.length; b++) {
        const p1 = pts[a], p2 = pts[b];
        if (p1.time >= p2.time) continue;
        if (isDown ? p2.price >= p1.price : p2.price <= p1.price) continue;

        const slope = (p2.price - p1.price) / (p2.time - p1.time);

        // Count all same-kind pivots that lie near this line
        let touches = 0;
        for (const p of pts) {
          const lineVal = p1.price + slope * (p.time - p1.time);
          if (Math.abs(p.price - lineVal) / lineVal <= tol) touches++;
        }
        if (touches < minTouches) continue;

        const extY2 = p1.price + slope * (lastTime - p1.time);
        const active = Math.abs(lastClose - extY2) / lastClose < 0.04;

        result.push({
          x1: p1.time, y1: p1.price,
          x2: lastTime, y2: extY2,
          kind: isDown ? 'down' : 'up',
          touches,
          active,
        });
      }
    }
  };

  processGroup(highs, true);
  processGroup(lows, false);

  return result.sort((a, b) => b.touches - a.touches).slice(0, 12);
}

export function buildSRZones(data: OHLCV[], pivots: Pivot[], tol = 0.007): SRZone[] {
  const currentPrice = data[data.length - 1]?.close ?? 0;
  if (!currentPrice || pivots.length < 2) return [];

  const levels = pivots.map(p => p.price).sort((a, b) => a - b);
  const clusters: number[][] = [];

  for (const lvl of levels) {
    const last = clusters[clusters.length - 1];
    if (last) {
      const center = last.reduce((s, x) => s + x, 0) / last.length;
      if (Math.abs(lvl - center) / center <= tol) { last.push(lvl); continue; }
    }
    clusters.push([lvl]);
  }

  return clusters
    .filter(c => c.length >= 2)
    .map(c => {
      const center = c.reduce((a, b) => a + b, 0) / c.length;
      return {
        top:    Math.max(...c),
        bottom: Math.min(...c),
        center,
        touches: c.length,
        kind: (center > currentPrice ? 'resistance' : 'support') as 'support' | 'resistance',
      };
    })
    .sort((a, b) => b.touches - a.touches)
    .slice(0, 8);
}
