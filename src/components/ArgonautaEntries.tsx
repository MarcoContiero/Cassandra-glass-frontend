'use client';

import React, { useMemo, useState } from 'react';
import StrategiaAIOverlay from './overlays/StrategiaAIOverlay';
import type { Suggestion } from '@/ts/argonauta/extract';
import { Dialog } from '@/components/ui/dialog';

/* =================== Categorie + tipi esportati =================== */
// formatter numerico locale (fallback semplice)
function fmtN(n?: number | null) {
  if (!Number.isFinite(n as number)) return '—';
  return (n as number).toLocaleString('it-IT');
}

export type CategoryKey = 'scalping' | 'reattivo' | 'swing' | 'positional';

export type ResultsByCategory = Partial<Record<CategoryKey, any>>;

export function ArgonautaLegendButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        'inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 ' +
        (props.className ?? '')
      }
    />
  );
}

/* =================== Tipi interni =================== */

export type EntryItem = {
  source: 'cassandra' | 'argonauta';
  label: string;
  symbol: string;
  cat?: CategoryKey;
  dir?: 'long' | 'short';
  entry?: number | [number, number];
  stop?: number;
  tp1?: number;
  tp2?: number;
  strengthVal?: number;
  distancePct?: number;
  // extra
  description?: string;
  tfs?: string[];
  confidence?: number;
  horizon?: string;
  trigger_text?: string;
  invalidation_text?: string;
  trigger_zone?: string;
  invalidation_zone?: string;
};

/* =================== Helpers =================== */

const mid = (x?: number | [number, number]): number | undefined =>
  Array.isArray(x) ? (Number(x[0]) + Number(x[1])) / 2 : (Number.isFinite(Number(x)) ? Number(x as number) : undefined);

function overlayDataForSingleItem(it: EntryItem) {
  const strat = {
    id: `${it.symbol}-${it.label}`,
    titolo: it.label,
    direzione: (it.dir ?? 'neutro') as any,
    descrizione: it.description,
    tfs: it.tfs,
    confidence: typeof it.confidence === 'number' ? it.confidence : undefined,
    orizzonte: it.horizon,
    trigger: it.trigger_text,
    trigger_zone: it.trigger_zone,
    invalidazione: it.invalidation_text,
    invalidazione_zone: it.invalidation_zone,
    entry: Array.isArray(it.entry) ? (it.entry[0] + it.entry[1]) / 2 : (it.entry as any),
    stop: it.stop,
    tp1: it.tp1,
    tp2: it.tp2,
    targets: [it.tp1, it.tp2].filter((x) => Number.isFinite(Number(x))) as any[],
  };
  return { items: [strat] };
}

function fromSuggestion(symbol: string, s: Suggestion): EntryItem {
  return {
    source: 'argonauta',
    label: `${s.dir} · ${s.kind}${s.tag === 'forte' ? ' · forte' : ''}`,
    symbol,
    dir: s.dir.toLowerCase() as any,
    entry: s.entry,
    stop: s.stop,
    tp1: s.tp1,
    tp2: s.tp2,
    tfs: s.tf ? [s.tf] : undefined,
    confidence: s.score ?? undefined,
    description: s.desc,
  };
}

/* =================== Card =================== */

const numCell =
  "rounded-lg bg-white/5 border border-white/10 px-2 py-1 " +
  "font-mono tabular-nums text-right min-w-[10ch]";

function EntryCard({ item, alertThresholdPct }: { item: EntryItem; alertThresholdPct?: number }) {
  const alert =
    typeof item.distancePct === 'number' &&
    typeof alertThresholdPct === 'number' &&
    item.distancePct <= alertThresholdPct;

  return (
    <div
      className={[
        "rounded-xl p-3 transition border",
        "min-w-[380px] md:min-w-[440px]",           // ← card più larga
        alert ? "border-red-500/60 bg-red-500/10" : "border-white/10 bg-white/5"
      ].join(" ")}
    >
      {/* header: label + score */}
      <div className="flex items-center justify-between mb-0.5">
        <div className="font-semibold">{item.label}</div>
        {typeof item.confidence === 'number' && (
          <span className="text-xs px-2 py-0.5 rounded bg-white/10 border border-white/15">
            {item.confidence}%
          </span>
        )}
      </div>

      {/* descrizione sotto (al posto del tipo ripetuto) */}
      {item.description && (
        <div className="text-xs text-white/60 mb-1">{item.description}</div>
      )}

      {/* numeri: celle larghe e stabili */}
      <div className="mt-2 grid grid-cols-2 xl:grid-cols-4 gap-2 text-sm">
        <div className="space-y-0.5">
          <div className="text-[10px] opacity-70">Entry</div>
          <div className={numCell}>
            {Array.isArray(item.entry)
              ? `${fmtN(item.entry[0])} – ${fmtN(item.entry[1])}`
              : fmtN(item.entry)}
          </div>
        </div>
        <div className="space-y-0.5">
          <div className="text-[10px] opacity-70">Stop</div>
          <div className={numCell}>{fmtN(item.stop)}</div>
        </div>
        <div className="space-y-0.5">
          <div className="text-[10px] opacity-70">TP1</div>
          <div className={numCell}>{fmtN(item.tp1)}</div>
        </div>
        <div className="space-y-0.5">
          <div className="text-[10px] opacity-70">TP2</div>
          <div className={numCell}>{fmtN(item.tp2)}</div>
        </div>
      </div>

      {/* footer: distanza/alert info */}
      <div className="mt-2 text-xs text-white/60 flex justify-between">
        <span>Distanza: {fmtN(item.distancePct)}%</span>
        {typeof alertThresholdPct === 'number' && (
          <span>Alert &le; {alertThresholdPct}%</span>
        )}
      </div>
    </div>
  );
}

/* =================== List =================== */

type ListProps = {
  symbol: string;
  results: ResultsByCategory;
  priceHint?: number;
  argonautaIdea?: any | null;
  alertThresholdPct?: number;
};

function readPriceHint(results: ResultsByCategory, fallback?: number): number | undefined {
  // molto tollerante
  const tryPaths: string[][] = [
    ['price'],
    ['ticker', 'last'],
    ['now', 'price'],
    ['summary', 'price'],
  ];
  const gp = (obj: any, path: string[]) => path.reduce((o, k) => (o ? o[k] : undefined), obj);
  for (const k of Object.keys(results) as CategoryKey[]) {
    const r = results[k];
    for (const p of tryPaths) {
      const v = Number(gp(r, p));
      if (Number.isFinite(v)) return v;
    }
  }
  return fallback;
}

function collectItemsFromResults(symbol: string, results: ResultsByCategory): EntryItem[] {
  const items: EntryItem[] = [];
  const push = (it: Partial<EntryItem> & { label: string }) =>
    items.push({
      source: 'cassandra',
      symbol,
      dir: 'long',
      entry: undefined,
      stop: undefined,
      tp1: undefined,
      tp2: undefined,
      ...it,
    });

  // normalizzazione permissiva: cerca array “ovvi”
  for (const cat of ['scalping', 'reattivo', 'swing', 'positional'] as CategoryKey[]) {
    const res = results[cat];
    if (!res) continue;
    const arr =
      (Array.isArray((res as any).entries) && (res as any).entries) ||
      (Array.isArray((res as any).items) && (res as any).items) ||
      (Array.isArray((res as any).setup) && (res as any).setup) ||
      [];
    arr.forEach((raw: any, idx: number) => {
      const entry =
        Array.isArray(raw?.entry) && raw.entry.length >= 2
          ? [Number(raw.entry[0]), Number(raw.entry[1])] as [number, number]
          : (Number.isFinite(Number(raw?.entry)) ? Number(raw.entry) : undefined);
      push({
        label: raw?.label ?? raw?.titolo ?? `${cat.toUpperCase()} #${idx + 1}`,
        cat,
        dir: (raw?.dir ?? raw?.direzione ?? 'long').toLowerCase() as any,
        entry,
        stop: Number.isFinite(Number(raw?.stop)) ? Number(raw.stop) : undefined,
        tp1: Number.isFinite(Number(raw?.tp1)) ? Number(raw.tp1) : undefined,
        tp2: Number.isFinite(Number(raw?.tp2)) ? Number(raw.tp2) : undefined,
        strengthVal: Number.isFinite(Number(raw?.forza)) ? Number(raw.forza) : undefined,
        description: raw?.descrizione ?? raw?.desc,
        tfs: Array.isArray(raw?.tfs) ? raw.tfs : undefined,
        confidence: Number.isFinite(Number(raw?.confidenza)) ? Number(raw.confidenza) : undefined,
        horizon: raw?.orizzonte,
        trigger_text: raw?.trigger,
        invalidation_text: raw?.invalidazione,
        trigger_zone: raw?.trigger_zone,
        invalidation_zone: raw?.invalidazione_zone,
      });
    });
  }

  return items;
}

export default function ArgonautaEntriesList({
  symbol,
  results,
  argonautaIdea,
  priceHint,
  alertThresholdPct
}: ListProps) {
  // 1) Se Argonauta ha già calcolato le 4 proposte, usiamo quelle.
  //    Altrimenti, fallback: collectItemsFromResults.
  const itemsBase = useMemo(() => {
    const sugg: Suggestion[] | undefined = argonautaIdea?.suggestions;
    if (Array.isArray(sugg) && sugg.length) {
      return sugg.map((s) => fromSuggestion(symbol, s));
    }
    return collectItemsFromResults(symbol, results);
  }, [symbol, results, argonautaIdea]);

  // 2) Distanza dal prezzo come prima
  const price = readPriceHint(results, priceHint);
  const items = useMemo(() => {
    return itemsBase.map((it) => {
      const midEntry = mid(it.entry);
      const distancePct =
        Number.isFinite(price) && Number.isFinite(midEntry)
          ? (Math.abs((midEntry as number) - (price as number)) / (price as number)) * 100
          : undefined;
      return { ...it, distancePct };
    });
  }, [itemsBase, price]);

  if (!items.length) {
    return (
      <div className="rounded-xl border border-white/10 p-4 text-sm text-white/50">
        Nessuna entry disponibile per {symbol}.
      </div>
    );
  }

  // dopo il useMemo che crea `items`
  const itemsSorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const sa = typeof a.confidence === 'number' ? a.confidence : -1;
      const sb = typeof b.confidence === 'number' ? b.confidence : -1;
      if (sb !== sa) return sb - sa; // punteggio desc
      const da = Number.isFinite(a.distancePct) ? (a.distancePct as number) : Infinity;
      const db = Number.isFinite(b.distancePct) ? (b.distancePct as number) : Infinity;
      return da - db; // tie-break: più vicino prima
    });
  }, [items]);

  return (
    <div className="space-y-3">
      {itemsSorted.map((it, idx) => (
        <EntryCard key={idx} item={it} alertThresholdPct={alertThresholdPct} />
      ))}
    </div>
  );
}
