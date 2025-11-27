export function normalizeTimeToDate(t: number | string | null | undefined): Date | null {
  if (t == null) return null;
  if (typeof t === "number") {
    const ms = t < 1_000_000_000_000 ? t * 1000 : t; // sec → ms
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  // stringa: ISO o numero
  const d1 = new Date(t);
  if (!isNaN(d1.getTime())) return d1;
  const num = Number(t);
  if (!isNaN(num)) {
    const ms = num < 1_000_000_000_000 ? num * 1000 : num;
    const d2 = new Date(ms);
    return isNaN(d2.getTime()) ? null : d2;
  }
  return null;
}
