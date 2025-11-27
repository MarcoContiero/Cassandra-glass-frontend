'use client';

import * as React from 'react';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SafeDialogContent from '@/components/ui/SafeDialogContent';

function toNum(x: unknown): number | null {
  if (x == null) return null;
  const n = Number(String(x).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function pickPrice(v: any): number | null {
  return (
    toNum(v?.valore) ??
    toNum(v?.price) ??
    toNum(v?.livello) ??
    toNum(v?.level) ??
    null
  );
}

function nearestLevels(
  price: number,
  belowArr: any[] = [],
  aboveArr: any[] = []
) {
  const below = [...belowArr]
    .map((v) => ({ p: pickPrice(v), raw: v }))
    .filter((x) => x.p != null && (x.p as number) < price)
    .sort((a, b) => (price - (a.p as number)) - (price - (b.p as number)))[0];

  const above = [...aboveArr]
    .map((v) => ({ p: pickPrice(v), raw: v }))
    .filter((x) => x.p != null && (x.p as number) > price)
    .sort((a, b) => (a.p as number) - (b.p as number))[0];

  return { below, above };
}

export default function TriggerMapOverlay({
  title,
  data,
}: {
  title: string;
  data: any;
}) {
  const px =
    toNum(data?.prezzo ?? data?.price) ??
    (typeof window !== 'undefined'
      ? Number((window as any).__CASSANDRA__?.lastPrice)
      : null);

  // liquidity normalizzata (bridge sopra/sotto ↔ above/below) + fallback
  const liqAbove = Array.isArray(data?.liquidity?.above)
    ? data.liquidity.above
    : Array.isArray(data?.liquidity?.sopra)
      ? data.liquidity.sopra
      : [];

  const liqBelow = Array.isArray(data?.liquidity?.below)
    ? data.liquidity.below
    : Array.isArray(data?.liquidity?.sotto)
      ? data.liquidity.sotto
      : [];

  // fallback: se la liquidità è vuota, usa resistenze/supporti e livelli tondi
  const fallbackAbove = [
    ...(Array.isArray(data?.resistenze) ? data.resistenze : []),
    ...(Array.isArray(data?.round_levels?.sopra) ? data.round_levels.sopra : []),
    ...(Array.isArray(data?.fvg?.above) ? data.fvg.above : []),
    ...(Array.isArray(data?.swings?.above) ? data.swings.above : []),
  ];
  const fallbackBelow = [
    ...(Array.isArray(data?.supporti) ? data.supporti : []),
    ...(Array.isArray(data?.round_levels?.sotto) ? data.round_levels.sotto : []),
    ...(Array.isArray(data?.fvg?.below) ? data.fvg.below : []),
    ...(Array.isArray(data?.swings?.below) ? data.swings.below : []),
  ];

  const above = liqAbove.length ? liqAbove : fallbackAbove;
  const below = liqBelow.length ? liqBelow : fallbackBelow;

  const near =
    Number.isFinite(px as number) && (above.length || below.length)
      ? nearestLevels(px as number, below, above)
      : { below: null, above: null };

  const overlayTitle = `🧠🧠🧠 ${title ?? "Spiegazione"}`;

  return (
    <SafeDialogContent
      title={overlayTitle}
      description="Spiegazione dei segnali e delle decisioni del sistema."
      className="w-[min(96vw,900px)] p-0 bg-zinc-900/95 text-white border border-white/10"
    >
      <DialogHeader className="px-5 py-3 border-b border-white/10">
        <DialogTitle className="text-lg md:text-xl">{overlayTitle}</DialogTitle>
      </DialogHeader>
      <div className="p-4 text-sm space-y-6">
        <div className="opacity-80">
          Prezzo:{' '}
          {Number.isFinite(px as number)
            ? (px as number).toLocaleString('it-IT')
            : '—'}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="font-semibold mb-2">Supporti (sotto)</div>
            {near.below ? (
              <div className="rounded border border-white/10 p-3">
                <div className="text-xs opacity-70 mb-1">Più vicino</div>
                <div className="text-lg">
                  {Number(near.below.p).toLocaleString('it-IT')}
                </div>
              </div>
            ) : (
              <div className="text-white/70">—</div>
            )}
          </div>
          <div>
            <div className="font-semibold mb-2">Resistenze (sopra)</div>
            {near.above ? (
              <div className="rounded border border-white/10 p-3">
                <div className="text-xs opacity-70 mb-1">Più vicino</div>
                <div className="text-lg">
                  {Number(near.above.p).toLocaleString('it-IT')}
                </div>
              </div>
            ) : (
              <div className="text-white/70">—</div>
            )}
          </div>
        </div>
      </div>
    </SafeDialogContent>
  );
}
