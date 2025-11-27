// ts/orione.ts — compat v2 (complete)
// - Input compat: number[] OR { closes:number[]; times?:number[] }
// - Doppio segnale: incrocio EMA9 con EMA21 e con SMA20 (BB mid)
// - Stati: 'idle' | 'watch' | 'imminent' | 'cross' | 'error'
// - Config: soglie separate per watch/imminent + min_bars

export type Series1mInput = number[] | { closes: number[]; times?: number[] };

export type OrioneDirection = 'bullish' | 'bearish' | null;
export type OrioneState = 'idle' | 'watch' | 'imminent' | 'cross' | 'error';

export type OrioneResult = {
  symbol: string;
  when: number;              // Date.now()
  state: OrioneState;
  direction: OrioneDirection;// direzione dell'incrocio
  dist_bps?: number;         // |EMA9-EMA21| in bps relativi al last price
  t_est?: number;            // stima #barre al cross E9/E21 (se non ancora avvenuto)
  notes?: string;            // diagnostica human-friendly
  tag_e21_ts?: number; // timestamp ultimo incrocio EMA9↔EMA21
  tag_bb_ts?: number;  // timestamp ultimo incrocio EMA9↔SMA20 (BB mid)
};

export type OrioneConfig = {
  watch_bps: number;         // distanza max per passare in "watch"
  imminent_bps: number;      // distanza max per "imminent"
  min_bars: number;          // barre minime per calcolare ema/sma sensate
};

const DEF_CFG: OrioneConfig = {
  watch_bps: 8,              // 0.08%
  imminent_bps: 3,           // 0.03%
  min_bars: 30,
};

// =============== Helpers interni ===============
function emaSeries(closes: number[], p: number): number[] {
  const n = closes.length;
  const out = new Array<number>(n).fill(NaN);
  if (n < p) return out;
  const k = 2 / (p + 1);
  // seed con media semplice dei primi p
  let s = 0;
  for (let i = 0; i < p; i++) s += closes[i];
  out[p - 1] = s / p;
  for (let i = p; i < n; i++) out[i] = closes[i] * k + out[i - 1] * (1 - k);
  return out;
}

function smaSeries(closes: number[], p: number): number[] {
  const n = closes.length;
  const out = new Array<number>(n).fill(NaN);
  if (n < p) return out;
  let sum = 0;
  for (let i = 0; i < p; i++) sum += closes[i];
  out[p - 1] = sum / p;
  for (let i = p; i < n; i++) {
    sum += closes[i] - closes[i - p];
    out[i] = sum / p;
  }
  return out;
}

const bps = (x: number) => Math.abs(x) * 10_000; // 1 bp = 0.01%

function normalizeSeries(input: Series1mInput): { closes: number[]; times: number[] } {
  if (Array.isArray(input)) return { closes: input, times: [] };
  const closes = Array.isArray(input?.closes) ? input.closes : [];
  const times  = Array.isArray(input?.times)  ? input.times  : [];
  const n = Math.min(closes.length, times.length || closes.length);
  return { closes: closes.slice(-n), times: times.slice(-n) };
}

function lastSignChangeIndex(arr: number[]): number | null {
  for (let i = arr.length - 1; i > 0; i--) {
    const a = arr[i - 1];
    const b = arr[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if ((a <= 0 && b > 0) || (a >= 0 && b < 0)) return i; // cambio segno a i
  }
  return null;
}

function dirFromDelta(d: number): OrioneDirection {
  if (!Number.isFinite(d)) return null;
  return d > 0 ? 'bullish' : d < 0 ? 'bearish' : null;
}

// =============== Core ===============
export function analyzeCross1m(
  symbol: string,
  series: Series1mInput,
  cfg?: Partial<OrioneConfig>
): OrioneResult {
  const { closes, times } = normalizeSeries(series);
  const C = { ...DEF_CFG, ...(cfg || {}) } as OrioneConfig;
  const when = Date.now();

  if (!closes || closes.length < Math.max(22, C.min_bars)) {
    return { symbol, when, state: 'idle', direction: null, notes: 'few-bars' };
  }

  const e9  = emaSeries(closes, 9);
  const e21 = emaSeries(closes, 21);
  const m20 = smaSeries(closes, 20);
  const n = closes.length - 1;

  const p = closes[n];
  const d21 = e9[n] - e21[n];
  const d20 = e9[n] - m20[n];
  const d21_prev = e9[n - 1] - e21[n - 1];
  const d20_prev = e9[n - 1] - m20[n - 1];

  const dir21 = dirFromDelta(d21);
  const dir20 = dirFromDelta(d20);

  const dist_bps = Number.isFinite(d21) && Number.isFinite(p) && p !== 0 ? bps(d21 / p) : undefined;

  // stima barre a cross di E9 vs E21
  let t_est: number | undefined;
  if (Number.isFinite(d21) && Number.isFinite(d21_prev)) {
    const slope = d21 - d21_prev; // delta per barra
    if (slope !== 0) {
      const est = -d21 / slope; // barre per portare d21 a 0
      if (est > 0 && Number.isFinite(est)) t_est = Math.min(120, Math.ceil(est));
    }
  }

  // serie dei delta per cercare gli ultimi cross
  const d21_series: number[] = [];
  const d20_series: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    d21_series.push(e9[i] - e21[i]);
    d20_series.push(e9[i] - m20[i]);
  }
  const ix21 = lastSignChangeIndex(d21_series);
  const ix20 = lastSignChangeIndex(d20_series);

  const tsAt = (ix: number | null) => {
    if (ix == null) return undefined;
    if (times && times.length === closes.length && Number.isFinite(times[ix]!)) return times[ix]!;
    // fallback: indice → timestamp ~minutario
    const lastTs = times?.[times.length - 1] ?? when;
    const diff = (closes.length - 1) - ix;
    return lastTs - diff * 60_000;
  };

  const tagE21 = tsAt(ix21);
  const tagM20 = tsAt(ix20);

  const tag_e21_ts = tagE21;
  const tag_bb_ts  = tagM20;

  // Stato
  let state: OrioneState = 'idle';
  let direction: OrioneDirection = null;

  if (dir21 && dir20 && dir21 === dir20 && ix21 !== null && ix20 !== null) {
    direction = dir21;
    const lastIx = Math.max(ix21, ix20);
    if ((closes.length - 1) - lastIx <= 3) state = 'cross';
    else if (dist_bps !== undefined && dist_bps <= C.imminent_bps) state = 'imminent';
    else state = 'watch';
  } else if (dist_bps !== undefined) {
    if (dist_bps <= C.imminent_bps) state = 'imminent';
    else if (dist_bps <= C.watch_bps) state = 'watch';
    else state = 'idle';
  }

  const fmt = (t?: number) => (t ? new Date(t).toLocaleTimeString() : '—');
  const notes = `xE21: ${fmt(tagE21)} · xBB: ${fmt(tagM20)} · d21=${Number.isFinite(d21)?d21.toFixed(6):'NaN'} · d20=${Number.isFinite(d20)?d20.toFixed(6):'NaN'}`;

  return { symbol, when, state, direction, dist_bps, t_est, notes, tag_e21_ts, tag_bb_ts };
}
