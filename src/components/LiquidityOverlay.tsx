'use client';

import { useEffect, useMemo, useState } from "react";

type SR = {
  livello: number;     // prezzo
  timeframe?: string;  // es. "1h"
  forza?: number;
  source?: string;     // "SR_SUP" | "SR_RES" | "FVG_*" ...
  indicatore?: string; // "Supporto" | "Resistenza"
  scenario?: string;
};

type LiquidityPayload = {
  sopra: SR[];
  sotto: SR[];
};

export default function LiquidityOverlay({
  liquidity,
  minForza,
  onChangeMinForza,
  onRefresh,
  onClose,
  title = '💧 Livelli di liquidità',
}: {
  liquidity: LiquidityPayload | null;
  minForza: number;
  onChangeMinForza: (v: number) => void;
  onRefresh: () => void;        // rifà la chiamata al BE con il nuovo valore
  onClose: () => void;
  title?: string;
}) {
  const [localMin, setLocalMin] = useState(minForza);

  useEffect(() => setLocalMin(minForza), [minForza]);

  const above = useMemo(() => liquidity?.sopra ?? [], [liquidity]);
  const below = useMemo(() => liquidity?.sotto ?? [], [liquidity]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-3xl rounded-2xl bg-zinc-900 text-white shadow-xl border border-white/10">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20">
            Chiudi
          </button>
        </div>

        {/* Barra controlli live */}
        <div className="p-4 border-b border-white/10 space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-sm opacity-80">Forza minima (solo SR):</div>
            <input
              type="range" min={0} max={13} step={1}
              value={localMin}
              onChange={e => setLocalMin(Number(e.target.value))}
              className="w-56"
            />
            <div className="tabular-nums w-8 text-center">{localMin}</div>
            <button
              onClick={() => { onChangeMinForza(localMin); onRefresh(); }}
              className="px-3 py-1.5 rounded bg-emerald-500/90 hover:bg-emerald-500 text-black"
            >
              Applica
            </button>
          </div>
          <p className="text-xs opacity-70">
            Il filtro si applica ai soli livelli <span className="font-semibold">SR_RES / SR_SUP</span>.
            FVG, Swing e Round restano invariati (coerente con la logica del backend).
          </p>
        </div>

        {/* Tabelle sopra / sotto */}
        <div className="p-4 grid grid-cols-2 gap-6">
          {/* SOPRA */}
          <div>
            <div className="text-sm mb-2 opacity-80">Sopra</div>
            <div className="grid grid-cols-4 text-[11px] uppercase opacity-60 px-2">
              <div>Prezzo</div><div>TF</div><div>Forza</div><div>Fonte</div>
            </div>
            <div className="divide-y divide-white/10">
              {above.length === 0 && (
                <div className="px-2 py-3 text-sm opacity-60">—</div>
              )}
              {above.map((l, i) => (
                <div key={i} className="grid grid-cols-4 items-center px-2 py-2 text-sm">
                  <div className="tabular-nums">{Number(l.livello).toLocaleString()}</div>
                  <div className="opacity-80">{l.timeframe ?? '-'}</div>
                  <div className="tabular-nums">{l.forza ?? '-'}</div>
                  <div className="opacity-80">{l.source ?? '-'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* SOTTO */}
          <div>
            <div className="text-sm mb-2 opacity-80">Sotto</div>
            <div className="grid grid-cols-4 text-[11px] uppercase opacity-60 px-2">
              <div>Prezzo</div><div>TF</div><div>Forza</div><div>Fonte</div>
            </div>
            <div className="divide-y divide-white/10">
              {below.length === 0 && (
                <div className="px-2 py-3 text-sm opacity-60">—</div>
              )}
              {below.map((l, i) => (
                <div key={i} className="grid grid-cols-4 items-center px-2 py-2 text-sm">
                  <div className="tabular-nums">{Number(l.livello).toLocaleString()}</div>
                  <div className="opacity-80">{l.timeframe ?? '-'}</div>
                  <div className="tabular-nums">{l.forza ?? '-'}</div>
                  <div className="opacity-80">{l.source ?? '-'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
