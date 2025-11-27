"use client";

import * as React from "react";
import { OverlayShell } from "./OverlayShell";


type AlertItem = {
  tf?: string | null;
  code: string;
  title?: string | null;
  condition?: string | null;
  score?: number | null;
  price?: number | null;
  time?: string | null;
  scenario_tag?: string | null;
  sources?: string[];
  extra?: any;
};

type Props = {
  title: string;
  data: any;           // risultato di analisi_light
  timeframes?: string[];
};

function fmtPrice(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "-";
  if (Math.abs(v) >= 1000) return v.toFixed(2);
  if (Math.abs(v) >= 1) return v.toFixed(3);
  return v.toFixed(4);
}

export default function AlertOverlay({ title, data, timeframes }: Props) {
  const alerts: AlertItem[] = Array.isArray(data?.alerts) ? data.alerts : [];
  const motivazioni: string[] = Array.isArray(data?.motivazioni)
    ? data.motivazioni
    : [];

  const tfSet = React.useMemo(
    () => new Set((timeframes || data?.timeframes || []) as string[]),
    [timeframes, data]
  );

  const filtered = React.useMemo(() => {
    if (!alerts.length) return [] as AlertItem[];
    if (!tfSet.size) return alerts;
    return alerts.filter((a) => !a.tf || tfSet.has(a.tf));
  }, [alerts, tfSet]);

  const hasAnything = filtered.length > 0 || motivazioni.length > 0;

  return (
    <OverlayShell>
      <div className="w-full max-w-5xl mx-auto text-sm text-white">
        {/* Header */}
        <div className="mb-4">
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">
            Alert
          </div>
          <h2 className="text-xl font-semibold mt-1">{title}</h2>
        </div>

        {/* Hero: Perché Cassandra sta squillando? */}
        <div className="mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 px-4 py-3">
          <div className="font-semibold text-amber-200">
            Perché Cassandra sta squillando?
          </div>
          {motivazioni.length > 0 ? (
            <ul className="mt-2 list-disc list-inside space-y-1 text-amber-100/90 text-xs">
              {motivazioni.map((m, idx) => (
                <li key={idx}>{m}</li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 text-xs text-amber-100/70">
              Nessuna motivazione particolare rilevata nei timeframe selezionati.
            </div>
          )}
        </div>

        {/* Lista alert */}
        <div className="space-y-2">
          {filtered.map((a, idx) => (
            <div
              key={idx}
              className="rounded-xl bg-zinc-900/70 border border-zinc-700/60 px-4 py-3 flex justify-between items-center gap-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border border-amber-400/70 text-amber-200 uppercase tracking-wide">
                    {a.code || "ALERT"}
                  </span>
                  {a.tf && (
                    <span className="text-[10px] text-zinc-400 uppercase">
                      TF: {a.tf}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm font-medium">
                  {a.title || "Segnale rilevante"}
                </div>
                {a.condition && (
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {a.condition}
                    {a.score != null && !Number.isNaN(a.score) && (
                      <> — punteggio {a.score.toFixed(2)}</>
                    )}
                  </div>
                )}
                {a.sources && a.sources.length > 0 && (
                  <div className="mt-1 text-[10px] text-zinc-500">
                    Sorgente: {a.sources.join(", ")}
                  </div>
                )}
              </div>
              {a.price != null && !Number.isNaN(a.price) && (
                <div className="text-right">
                  <div className="text-[10px] text-zinc-400">Livello</div>
                  <div className="text-xs font-semibold">
                    @{fmtPrice(a.price)}
                  </div>
                </div>
              )}
            </div>
          ))}

          {!hasAnything && (
            <div className="text-sm opacity-50">
              Nessun alert rilevato nei timeframe selezionati.
            </div>
          )}
        </div>
      </div>
    </OverlayShell>
  );
}
