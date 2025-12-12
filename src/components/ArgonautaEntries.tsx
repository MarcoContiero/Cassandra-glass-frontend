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
  ai?: boolean; // true se confermato anche da StrategiaAI
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
      {/* header: label + tag AI + score */}
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-2">
          <div className="font-semibold">{item.label}</div>
          {item.ai && (
            <span className="inline-flex items-center justify-center rounded-full border border-emerald-400/70 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
              AI
            </span>
          )}
        </div>
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
  onlyAI?: boolean;
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

// helper per scandire in profondità il risultato Cassandra e trovare array di "entries"
function gp(obj: any, path: string[]) {
  return path.reduce(
    (o, k) => (o && typeof o === 'object' ? (o as any)[k] : undefined),
    obj,
  );
}

function quickExtractEntries(result: any): any[] {
  const basePaths: string[][] = [
    ['strategia_ai', 'entries'],
    ['strategia_ai', 'candidati'],
    ['strategia_ai', 'segnali'],
    ['strategia_ai', 'levels'],
    ['strategia_ai', 'liquidity'],

    ['risposte', 'strategia_ai', 'entries'],
    ['risposte', 'strategia_ai', 'candidati'],
    ['risposte', 'strategia_ai', 'levels'],
    ['risposte', 'strategia_ai', 'liquidity'],

    ['risposte', 'entries'],
    ['entries'],
    ['segnali'],
    ['setups'],
  ];

  // 1) proviamo i path "standard"
  for (const p of basePaths) {
    const arr = gp(result, p);
    if (Array.isArray(arr) && arr.length) return arr;
  }

  // 2) fallback: scan profonda con euristica
  const out: any[] = [];
  const seen = new WeakSet();

  const looksLikeEntryObj = (x: any) => {
    if (!x || typeof x !== 'object') return false;
    const keys = Object.keys(x).map((k) => k.toLowerCase());
    const has = (k: string) => keys.includes(k);
    const anyOf = (...kk: string[]) => kk.some(has);
    const hasEntry = anyOf('entry', 'price', 'range', 'range_min', 'range_max', 'zona', 'level', 'livello');
    const hasStop = anyOf('stop', 'sl', 'invalid', 'invalidation');
    const hasTp = anyOf('tp', 'tp1', 'target', 'target1');
    const hasDir = anyOf('dir', 'direction', 'side', 'tipo');
    return hasEntry && (hasStop || hasTp || hasDir);
  };

  const walk = (node: any) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      const looks = node.filter(looksLikeEntryObj);
      if (looks.length) { looks.forEach((e) => out.push(e)); return; }
      node.forEach(walk);
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (
        Array.isArray(v) &&
        /entr(y|ies)|candidati|strategie|setup|segnali|levels|liquidity/i.test(k) &&
        (v as any[]).some(looksLikeEntryObj)
      ) {
        (v as any[]).filter(looksLikeEntryObj).forEach((e) => out.push(e));
      } else {
        walk(v);
      }
    }
  };

  walk(result);
  return out;
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

  // normalizzazione permissiva: usa quickExtractEntries che scava in profondità
  for (const cat of ['scalping', 'reattivo', 'swing', 'positional'] as CategoryKey[]) {
    const res = results[cat];
    if (!res) continue;

    const arr = quickExtractEntries(res);

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
  alertThresholdPct,
  onlyAI
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

  // 1bis) Entry Cassandra per confronto (serve per tag "AI")
  const cassandraItems = useMemo(
    () => collectItemsFromResults(symbol, results),
    [symbol, results],
  );

  const withAiFlag: EntryItem[] = useMemo(() => {
    if (!cassandraItems.length) return itemsBase;

    const isMatch = (a: EntryItem, b: EntryItem): boolean => {
      // direzione coerente (se entrambe definite)
      if (a.dir && b.dir && a.dir !== b.dir) return false;

      const ma = mid(a.entry);
      const mb = mid(b.entry);
      if (!Number.isFinite(ma as number) || !Number.isFinite(mb as number)) return false;

      // entry abbastanza vicine (±0.1%)
      const entryClose =
        Math.abs((ma as number) - (mb as number)) / Math.abs(mb as number) <= 0.001;

      return entryClose;
    };

    return itemsBase.map((it) => {
      const matched = cassandraItems.some((base) => isMatch(it, base));
      return matched ? { ...it, ai: true } : it;
    });
  }, [itemsBase, cassandraItems]);

  // 2) Distanza dal prezzo come prima
  const price = readPriceHint(results, priceHint);
  const items = useMemo(() => {
    return withAiFlag.map((it) => {
      const midEntry = mid(it.entry);
      const distancePct =
        Number.isFinite(price) && Number.isFinite(midEntry)
          ? (Math.abs((midEntry as number) - (price as number)) / (price as number)) * 100
          : undefined;
      return { ...it, distancePct };
    });
  }, [withAiFlag, price]);

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

  const itemsVisible = useMemo(() => {
    if (!onlyAI) return itemsSorted;
    return itemsSorted.filter((it) => it.ai === true);
  }, [itemsSorted, onlyAI]);

  return (
    <div className="space-y-3">
      {itemsVisible.map((it, idx) => (
        <EntryCard key={idx} item={it} alertThresholdPct={alertThresholdPct} />
      ))}
    </div>
  );
}
