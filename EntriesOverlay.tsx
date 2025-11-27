'use client';

import React, { useMemo } from 'react';

/* ======================= Tipi ======================= */

export type EntryLike = {
  direction?: string; // "LONG" | "SHORT"
  dir?: string;       // alias
  setup?: string;
  note?: string;
  entry?: number | string;
  stop?: number | string;
  tp1?: number | string;
  tp2?: number | string;
  rr?: number | string;
};

type Row = {
  direction: 'LONG' | 'SHORT';
  entry?: number;
  stop?: number;
  tp1?: number;
  tp2?: number;
  rr?: number;
  note?: string;
};

type Props = {
  items?: EntryLike[];
  result?: any;
  price?: number | string;
  symbol?: string;
};

type SRItem = { testo?: string };
type RangeItem = { range: [number, number]; raw: string };

/* ======================= Helpers ======================= */

/** Parser numerico “smart”: capisce il separatore decimale reale (',' o '.') e rimuove l’altro come separatore migliaia. */
function parseSmartNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;

  let s = v.trim().replace(/\s+/g, '').replace(/[^\d.,-]+/g, '');
  if (!s) return undefined;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  let dec: '.' | ',' = '.';
  if (lastComma >= 0 && lastDot < 0) dec = ',';
  else if (lastDot >= 0 && lastComma < 0) dec = '.';
  else if (lastComma >= 0 && lastDot >= 0) dec = lastComma > lastDot ? ',' : '.';

  const thou = dec === ',' ? '.' : ',';

  s = s.replace(new RegExp('\\' + thou, 'g'), '');
  s = s.replace(new RegExp('\\' + dec, 'g'), '.');

  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

const num = (v: unknown) => parseSmartNumber(v);
const fmt = (v: unknown) => (num(v) == null ? '—' : (num(v) as number).toLocaleString());

function parseRange(t: unknown): [number, number] | null {
  if (typeof t !== 'string') return null;
  const m = t.match(/([\d.,]+)\s*[–-]\s*([\d.,]+)/);
  if (!m) return null;
  const a = parseSmartNumber(m[1]);
  const b = parseSmartNumber(m[2]);
  if (a == null || b == null) return null;
  return [Math.min(a, b), Math.max(a, b)];
}

function normalizeItems(items?: EntryLike[]): Row[] {
  if (!Array.isArray(items)) return [];
  return items.map<Row>((it: EntryLike) => {
    const d = (it.dir ?? it.direction ?? '').toString().toUpperCase();
    const direction: 'LONG' | 'SHORT' = d === 'SHORT' ? 'SHORT' : 'LONG';
    return {
      direction,
      entry: num(it.entry),
      stop: num(it.stop),
      tp1: num(it.tp1),
      tp2: num(it.tp2),
      rr: num(it.rr),
      note: it.note ?? it.setup ?? '',
    };
  });
}

function fallbackFromResult(result: any, price?: number): Row[] {
  const p =
    price ??
    parseSmartNumber(result?.prezzo) ??
    parseSmartNumber(result?.price) ??
    parseSmartNumber(result?.risposte?.prezzo) ??
    parseSmartNumber(result?.risposte?.price);

  const supporti = (result?.risposte?.supporti ?? result?.supporti ?? []) as SRItem[];
  const resistenze = (result?.risposte?.resistenze ?? result?.resistenze ?? []) as SRItem[];

  const S: RangeItem[] = supporti
    .map((x: SRItem): RangeItem | null => {
      const r = parseRange(x?.testo ?? '');
      return r ? { range: r, raw: x?.testo ?? '' } : null;
    })
    .filter((x: RangeItem | null): x is RangeItem => x !== null);

  const R: RangeItem[] = resistenze
    .map((x: SRItem): RangeItem | null => {
      const r = parseRange(x?.testo ?? '');
      return r ? { range: r, raw: x?.testo ?? '' } : null;
    })
    .filter((x: RangeItem | null): x is RangeItem => x !== null);

  if (p == null) {
    return [
      { direction: 'LONG', note: 'Manca il prezzo' },
      { direction: 'SHORT', note: 'Manca il prezzo' },
    ];
  }

  // supporto più vicino sotto al prezzo (scegli quello con high < p e high più vicino)
  const sup = S.filter((s: RangeItem) => p > s.range[1]).sort(
    (a: RangeItem, b: RangeItem) => b.range[1] - a.range[1]
  )[0];

  // resistenza più vicina sopra al prezzo (scegli quella con low > p e low più vicino)
  const res = R.filter((r: RangeItem) => p < r.range[0]).sort(
    (a: RangeItem, b: RangeItem) => a.range[0] - b.range[0]
  )[0];

  // LONG
  const long: Row = sup
    ? {
        direction: 'LONG',
        entry: (sup.range[0] + sup.range[1]) / 2,
        stop: sup.range[0],
        tp1: res?.range?.[0],
        note: 'Rimbalzo su supporto (mid zona)',
      }
    : {
        direction: 'LONG',
        entry: p * 1.002,
        stop: p * 0.995,
        tp1: res?.range?.[0] ?? p * 1.01,
        note: 'Breakout dell’ultimo H (fallback)',
      };

  // SHORT
  const short: Row = res
    ? {
        direction: 'SHORT',
        entry: (res.range[0] + res.range[1]) / 2,
        stop: res.range[1],
        tp1: sup?.range?.[1],
        note: 'Reazione su resistenza (mid zona)',
      }
    : {
        direction: 'SHORT',
        entry: p * 0.998,
        stop: p * 1.005,
        tp1: sup?.range?.[1] ?? p * 0.99,
        note: 'Breakdown dell’ultimo L (fallback)',
      };

  return [long, short];
}

function dedupeAndComplete(rows: Row[], result: any, pMaybe?: number): Row[] {
  const hasLong = rows.some((r: Row) => r.direction === 'LONG');
  const hasShort = rows.some((r: Row) => r.direction === 'SHORT');
  if (hasLong && hasShort) return rows;

  const p =
    pMaybe ??
    parseSmartNumber(result?.prezzo) ??
    parseSmartNumber(result?.price) ??
    parseSmartNumber(result?.risposte?.prezzo) ??
    parseSmartNumber(result?.risposte?.price) ??
    undefined;

  const fallback = fallbackFromResult(result, p);
  const want: 'LONG' | 'SHORT' = hasLong ? 'SHORT' : 'LONG';
  const add = fallback.find((r: Row) => r.direction === want);
  return add ? [...rows, add] : rows;
}

/* ======================= Componente ======================= */

export default function EntriesOverlay({ items, result, price, symbol }: Props) {
  const p =
    parseSmartNumber(price) ??
    parseSmartNumber(result?.prezzo) ??
    parseSmartNumber(result?.price) ??
    parseSmartNumber(result?.risposte?.prezzo) ??
    parseSmartNumber(result?.risposte?.price);

  const rows: Row[] = useMemo((): Row[] => {
    const norm: Row[] = normalizeItems(items) ?? [];

    // items presenti ma tutti zero/undefined? Trattali come “vuoti”
    const allEmpty =
      norm.length > 0 &&
      norm.every((r: Row) => (r.entry ?? 0) === 0 && (r.stop ?? 0) === 0 && (r.tp1 ?? 0) === 0 && (r.tp2 ?? 0) === 0);

    const base: Row[] = norm.length && !allEmpty ? norm : fallbackFromResult(result, p);
    return dedupeAndComplete(base, result, p);
  }, [items, result, p]);

  return (
    <div className="space-y-2 text-sm">
      {(symbol || p != null) && (
        <div className="text-xs opacity-70">
          {symbol ? `${symbol} · ` : ''}{p != null ? `prezzo ${p.toLocaleString()}` : 'prezzo —'}
        </div>
      )}

      {rows.map((e: Row, i: number) => (
        <div key={i} className="rounded-md border border-white/10 bg-white/5">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="font-medium">{e.direction}</div>

            <div className="grid grid-cols-4 gap-3 text-xs sm:text-sm">
              <div>
                entry <span className="font-medium">{fmt(e.entry)}</span>
              </div>
              <div>
                stop <span className="font-medium">{fmt(e.stop)}</span>
              </div>
              <div>
                tp1 <span className="font-medium">{fmt(e.tp1)}</span>
              </div>
              <div className="hidden sm:block">
                tp2 <span className="font-medium">{fmt(e.tp2)}</span>
              </div>
            </div>

            {e.rr != null && <div className="text-xs opacity-80">R/R {fmt(e.rr)}</div>}
          </div>

          {e.note && <div className="px-3 pb-2 text-xs opacity-80">{e.note}</div>}
        </div>
      ))}

      {rows.length === 0 && <div className="text-xs opacity-70">Nessuna entrata disponibile.</div>}
    </div>
  );
}
