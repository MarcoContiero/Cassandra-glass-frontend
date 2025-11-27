// src/components/strategia/utils/safe.ts
export function ensureArray<T = unknown>(val: any, fallback: T[] = []): T[] {
  return Array.isArray(val) ? (val as T[]) : fallback;
}

export function safeTFList(maybe: any): string[] {
  // default coerente con la tua UI
  const fallback = ['15m', '1h', '4h', '1d'];
  return ensureArray<string>(maybe, fallback);
}
