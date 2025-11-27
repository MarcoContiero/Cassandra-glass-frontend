'use client';

import { useMemo, useState } from 'react';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import SafeDialogContent from '@/components/ui/SafeDialogContent';

export type MiddleType =
  | 'bb_mid' | 'inside_mid' | 'mother_mid' | 'fvg_mid' | 'ob_mt'
  | 'donchian_mid' | 'kijun' | 'tenkan' | 'session_mid' | 'ib_mid'
  | 'vwap';

export type MiddlePoint = {
  type: MiddleType;
  label: string;
  price: number | null;
  distance_pct?: number | null;
  position?: 'above' | 'below' | 'on' | null;
  slope?: number | null;
  reclaim?: boolean | null;
  reject?: boolean | null;
  crossed_at?: string | null;
  note?: string | null;
};

export type MiddlesPayload = {
  symbol?: string;
  last_ts?: string;
  tf_order?: string[];
  per_tf: Record<string, { last: number | null; items: MiddlePoint[] }>;
};

const TYPE_META: Record<MiddleType, { short: string; hint: string; emoji: string }> = {
  bb_mid: { short: 'BB mid', hint: 'SMA/EMA n (base Bollinger)', emoji: '〰️' },
  inside_mid: { short: 'Inside 50%', hint: 'Metà range candela inside', emoji: '➗' },
  mother_mid: { short: 'Mother 50%', hint: 'Metà range della mother bar', emoji: '🧬' },
  fvg_mid: { short: 'FVG mid', hint: 'Consequent Encroachment (ICT)', emoji: '🕳️' },
  ob_mt: { short: 'OB mean', hint: 'Mean Threshold dell’Order Block', emoji: '🏦' },
  donchian_mid: { short: 'Donchian', hint: '(HH+LL)/2 finestra n', emoji: '📦' },
  kijun: { short: 'Kijun', hint: 'Ichimoku (HH26+LL26)/2', emoji: '🧭' },
  tenkan: { short: 'Tenkan', hint: 'Ichimoku (HH9+LL9)/2', emoji: '🧭' },
  session_mid: { short: 'Session 50%', hint: 'Metà range della sessione', emoji: '🗓️' },
  ib_mid: { short: 'IB 50%', hint: 'Metà Initial Balance', emoji: '🕒' },
  vwap: { short: 'VWAP', hint: 'Prezzo medio ponderato volumi', emoji: '⚖️' },
};

function tfSort(keys: string[], order?: string[]) {
  if (!order?.length) return keys.sort((a, b) => a.localeCompare(b));
  const idx = (k: string) => order.indexOf(k);
  return [...keys].sort((a, b) => (idx(a) !== -1 ? idx(a) : 999) - (idx(b) !== -1 ? idx(b) : 999) || a.localeCompare(b));
}

function badge(v?: boolean | null, txt?: string) {
  if (v === true) return <span className="px-2 py-0.5 text-[10px] rounded bg-green-500/20 text-green-300 border border-green-500/30">{txt ?? 'reclaim'}</span>;
  if (v === false) return <span className="px-2 py-0.5 text-[10px] rounded bg-red-500/20 text-red-300 border border-red-500/30">{txt ?? 'reject'}</span>;
  return null;
}

export default function MiddleOverlay({ data }: { data: MiddlesPayload | undefined }) {
  const tfs = useMemo(() => tfSort(Object.keys(data?.per_tf ?? {}), data?.tf_order), [data]);
  const [activeTf, setActiveTf] = useState<string>(tfs[0] ?? '');
  const [filter, setFilter] = useState<MiddleType[] | null>(null);

  const rows = useMemo(() => {
    // PATCH: se arriva una lista piatta `data.middles`, usala
    if (Array.isArray((data as any)?.middles)) {
      const items = (data as any).middles as any[];
      return (filter && filter.length) ? items.filter(i => filter.includes(i.type as any)) : items;
    }
    // altrimenti comportamento attuale (items del TF attivo)
    const block = data?.per_tf?.[activeTf];
    if (!block) return [];
    const items = block.items ?? [];
    return (filter && filter.length) ? items.filter(i => filter.includes(i.type)) : items;
  }, [data, activeTf, filter]);

  if (!data || tfs.length === 0) {
    const overlayTitle = "🧭 Middles";
    return (
      <SafeDialogContent
        title={overlayTitle}
        description="Pannello Middles: riepilogo e dettagli. Nessun dato disponibile."
        className="max-w-3xl w-[96vw] p-0 bg-zinc-900/95 text-white"
      >
        <DialogHeader className="p-4 border-b border-white/10">
          <DialogTitle>{overlayTitle}</DialogTitle>
        </DialogHeader>
        <div className="p-6 text-zinc-400">Nessun dato disponibile.</div>
      </SafeDialogContent>
    );
  }

  const block = data.per_tf[activeTf];
  const last = block?.last ?? null;
  const availableTypes = Array.from(new Set(block.items?.map(i => i.type)));

  const overlayTitle = `🧭 Middles · ${data.symbol ?? ""}`;

  return (
    <SafeDialogContent
      title={overlayTitle}
      description="Pannello Middles: livelli medi, ultimi valori e tipi disponibili."
      className="max-w-4xl w-[96vw] p-0 bg-zinc-900/95 text-white"
    >
      <DialogHeader className="p-4 border-b border-white/10 flex items-center justify-between">
        <DialogTitle className="text-xl">{overlayTitle}</DialogTitle>
        <div className="text-xs text-zinc-400">Last {activeTf}: {last ?? "—"}</div>
      </DialogHeader>
      <div className="p-4 space-y-4">
        {/* TF tabs */}
        <div className="flex gap-2 flex-wrap">
          {tfs.map(tf => (
            <button
              key={tf}
              className={`px-3 py-1 text-xs rounded-md border ${tf === activeTf ? 'bg-white/10 border-white/30' : 'border-white/10 hover:border-white/30 text-white/80'}`}
              onClick={() => setActiveTf(tf)}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 flex-wrap">
          {availableTypes.map(t => (
            <button
              key={t}
              className={`px-2 py-1 text-[11px] rounded border ${filter?.includes(t) ? 'bg-white/10 border-white/40' : 'border-white/10 hover:border-white/30 text-white/80'}`}
              onClick={() => {
                setFilter(prev => {
                  if (!prev) return [t];
                  return prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t];
                });
              }}
              title={TYPE_META[t as MiddleType]?.hint}
            >
              <span className="mr-1">{TYPE_META[t as MiddleType]?.emoji ?? '•'}</span>
              {TYPE_META[t as MiddleType]?.short ?? t}
            </button>
          ))}
          {filter?.length ? (
            <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setFilter(null)}>Reset</Button>
          ) : null}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="grid grid-cols-11 bg-white/5 text-xs font-semibold px-3 py-2">
            <div>Tipo</div><div>Prezzo</div><div>Posizione</div><div>∆% dal last</div><div>Slope</div><div>Segnale</div>
            <div>Confl. SR</div><div>Confl. Liq</div><div>Score</div>
            <div>Ultimo cross</div><div>Note</div>
          </div>

          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-11 px-3 py-2 border-t border-white/5 text-sm items-center">
              <div className="truncate"><span className="mr-1">{TYPE_META[r.type as MiddleType]?.emoji ?? '•'}</span>{r.label}</div>
              <div>{r.price ?? '—'}</div>
              <div className={`capitalize ${r.position === 'above' ? 'text-green-300' : r.position === 'below' ? 'text-red-300' : 'text-zinc-300'}`}>{r.position ?? '—'}</div>
              <div>{r.distance_pct != null ? `${r.distance_pct.toFixed(2)}%` : '—'}</div>
              <div>{r.slope != null ? r.slope.toFixed(5) : '—'}</div>
              <div className="flex gap-2">
                {badge(r.reclaim, 'reclaim')}
                {badge(r.reject, 'reject')}
              </div>
              <div className="text-right tabular-nums">{r.confl_sr ?? 0}</div>
              <div className="text-right tabular-nums">{r.confl_liq ?? 0}</div>
              <div className="text-right tabular-nums">{r.score ?? 0}</div>
              <div>{r.crossed_at ?? '—'}</div>
              <div className="text-xs text-zinc-300 truncate">{r.note ?? ''}</div>
            </div>
          ))}

          {!rows.length && (
            <div className="px-3 py-4 text-zinc-400 text-sm">Nessun middle per questo TF.</div>
          )}
        </div>
      </div>
    </SafeDialogContent>
  );
}
