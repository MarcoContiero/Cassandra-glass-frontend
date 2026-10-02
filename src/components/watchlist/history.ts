import type { CoinSnapshots, Snapshot } from './WatchlistSnapshot';

export function biasState(value?: string | null): 'long' | 'short' | 'neutral' | 'missing' {
  const key = value?.toUpperCase();
  if (key === 'LONG') return 'long';
  if (key === 'SHORT') return 'short';
  if (['NEUTRO', 'NEUTRAL', 'NEUTRALE'].includes(key ?? '')) return 'neutral';
  return 'missing';
}
export const biasText = (value?: string | null) => ({ long: 'Rialzista', short: 'Ribassista', neutral: 'Neutrale', missing: 'Non disponibile' }[biasState(value)]);
export function priceChange(before: number | null, after: number | null): number | null {
  return before !== null && after !== null && Number.isFinite(before) && Number.isFinite(after) && before > 0 && after > 0
    ? (after / before - 1) * 100 : null;
}
export function chronologicalHistory(data: CoinSnapshots): Snapshot[] {
  const unique = new Map<number, Snapshot>();
  for (const snapshot of [...data.history, ...(data.latest ? [data.latest] : [])]) {
    if (Number.isFinite(snapshot.captured_at)) unique.set(snapshot.captured_at, snapshot);
  }
  return [...unique.values()].sort((a, b) => a.captured_at - b.captured_at).slice(-12);
}
export function compareSnapshots(before: Snapshot, after: Snapshot): NonNullable<Snapshot['changes']> {
  const previous = new Map(before.scenarios.map(s => [s.key, s]));
  const current = new Map(after.scenarios.map(s => [s.key, s]));
  const fields = ['name', 'tf', 'direction', 'score', 'entry', 'stop', 'tp1'] as const;
  return {
    price_pct: priceChange(before.price, after.price),
    bias: [...new Set([...Object.keys(before.bias), ...Object.keys(after.bias)])]
      .filter(tf => biasState(before.bias[tf]) !== biasState(after.bias[tf]))
      .map(tf => ({ tf, before: before.bias[tf] ?? 'non disponibile', after: after.bias[tf] ?? 'non disponibile' })),
    appeared: after.scenarios.filter(s => !previous.has(s.key)),
    absent: before.scenarios.filter(s => !current.has(s.key)),
    updated: after.scenarios.filter(s => { const old = previous.get(s.key); return !!old && fields.some(field => old[field] !== s[field]); }),
  };
}
export function snapshotAge(capturedAt: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - capturedAt) / 60000));
  return { stale: now - capturedAt > 7200000, label: minutes < 1 ? 'meno di un minuto fa' : minutes < 60 ? `${minutes} min fa` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''} fa` };
}
