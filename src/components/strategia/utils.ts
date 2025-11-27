export function unwrap(x: any) {
    if (!x) return {};
    if (x.risposte && typeof x.risposte === "object") return x.risposte;
    if (x.data && typeof x.data === "object") return x.data;
    return x;
  }
  
  export function deepGet(obj: any, path: (string | number)[]) {
    return path.reduce((acc, key) => (acc ? acc[key as any] : undefined), obj);
  }
  
  export function pickFirst<T = any>(obj: any, keys: (string | (string | number)[])[]): T | undefined {
    for (const k of keys) {
      const val = Array.isArray(k) ? deepGet(obj, k) : obj?.[k];
      if (val !== undefined && val !== null) return val as T;
    }
    return undefined;
  }
  
  export function dedupArray<T>(arr: T[]): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const it of arr) {
      const k = JSON.stringify(it);
      if (!seen.has(k)) { seen.add(k); out.push(it); }
    }
    return out;
  }
  
  export function toNum(v: any): number | null {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    const s = String(v).replace(/\s/g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  
  export const isN = (x: any): x is number => typeof x === "number" && Number.isFinite(x);
  
  export function avg(xs: number[]) { return xs.reduce((a, b) => a + b, 0) / (xs.length || 1); }
  export function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
  
  export function fmtNum(n?: number | null) {
    if (!isN(n)) return "—";
    try { return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(n); }
    catch { return String(n); }
  }
  export function fmtPct01(n?: number | null) { return isN(n) ? `${(n*100).toFixed(2)}%` : "—"; }
  export function fmtPct(n?: number | null)  { return isN(n) ? `${(n*100).toFixed(2)}%` : "—"; }

  export function fmtMaybe(n?: number | null) {
    return typeof n === "number" && Number.isFinite(n) ? fmtNum(n) : "—";
  }  
  
  export function normalizeDir(x?: string) {
    if (!x) return undefined;
    const s = String(x).toUpperCase();
    if (s.includes("LONG")) return "LONG" as const;
    if (s.includes("SHORT")) return "SHORT" as const;
    return undefined;
  }
  
  export function inferTFfromScores(r: any): string[] {
    const sc = r?.trend_tf_score || r?.trend_tf || r?.tf_score;
    if (!sc || typeof sc !== "object") return [];
    return Object.keys(sc);
  }
  
  export function inferWinningDirection(r: any) {
    const agg = r?.score_globale || r?.score || r?.punteggio_globale;
    if (agg && typeof agg === "object") {
      const L = toNum(agg.long) || 0;
      const S = toNum(agg.short) || 0;
      if (L > S) return "LONG" as const;
      if (S > L) return "SHORT" as const;
    }
    return undefined;
  }
  
  export const str = (v?: unknown) => String(v ?? '').toLowerCase();
  
  export const gapFor = (p?: number) => (isN(p) ? Math.max(p * 0.001, 1e-8) : 0);
  
  /** RR “lordo” */
  export function computeRR(entry?: number, stop?: number, tp?: number) {
    if (!isN(entry) || !isN(stop) || !isN(tp)) return undefined;
    const risk = Math.abs(entry - stop);
    if (risk === 0) return undefined;
    const reward = Math.abs((tp as number) - (entry as number));
    return +((reward / risk).toFixed(2));
  }
  
  /** RR “netto” con fee/slippage (percentuali sul notional) */
  export function computeRRNet(
    entry?: number, stop?: number, tp?: number,
    feePct = 0, slippagePct = 0
  ) {
    if (!isN(entry) || !isN(stop) || !isN(tp)) return undefined;
    const risk = Math.abs(entry - stop);
    if (risk === 0) return undefined;
    const reward = Math.abs(tp - entry);
  
    const riskPct = risk / Math.max(entry, 1e-9);
    const rewardPct = reward / Math.max(entry, 1e-9);
  
    const totalDragPct = 2 * (feePct + slippagePct); // entrata+uscita
    const netRewardPct = Math.max(0, rewardPct - totalDragPct);
  
    if (netRewardPct <= 0) return 0;
    return +((netRewardPct / riskPct).toFixed(2));
  }
  
  export function entryDistance(s?: { entry?: number | null }, price?: number) {
    if (!s || !isN(price) || !isN(s.entry as number)) return null;
    return Math.abs((s.entry as number) - (price as number));
  }
  
  /** Tick/arrotondamento */
  export function roundToTick(v?: number, tick?: number) {
    if (!isN(v)) return v;
    if (!isN(tick) || tick! <= 0) return v;
    return Math.round(v / tick!) * tick!;
  }
  
  /** ATR % (grezza): prova a estrarla dal raw; default 0.5% */
  export function pickAtrPct(raw: any, price?: number): number {
    const cands = [
      ["atr_pct"], ["atrPercent"], ["atr", "pct"], ["vola", "atr_pct"], ["volatility", "atr_pct"]
    ];
    for (const p of cands) {
      const v = Array.isArray(p) ? deepGet(raw, p) : (raw?.[p as any]);
      const n = toNum(v);
      if (isN(n)) return n as number;
    }
    // fallback “sensato”
    return 0.005; // 0.5%
  }
  
  /** Parsing TF (es. '15m','1h','4h','1d') in ms */
  export function tfToMs(tf?: string): number | undefined {
    if (!tf) return undefined;
    const m = /^(\d+)(m|h|d)$/i.exec(String(tf).trim());
    if (!m) return undefined;
    const val = Number(m[1]); const u = m[2].toLowerCase();
    if (u === "m") return val * 60_000;
    if (u === "h") return val * 3_600_000;
    if (u === "d") return val * 86_400_000;
    return undefined;
  }
  