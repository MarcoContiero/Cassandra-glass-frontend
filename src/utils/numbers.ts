export function toFixedSafe(n: number, dp: number) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return x.toFixed(dp);
  }
  export function fmtPrice(n: number) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    if (Math.abs(x) >= 1000) return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return x.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
  export function fmtPct(n: number) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return `${x.toFixed(2)}%`;
  }
  export function clamp(n: number, lo: number, hi: number) {
    return Math.min(hi, Math.max(lo, n));
  }
  export function firstPrice(s: string | number | null | undefined): number | undefined {
    if (typeof s === 'number') return Number.isFinite(s) ? s : undefined;
    if (typeof s !== 'string') return undefined;
    const m = s.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : undefined;
  }
  