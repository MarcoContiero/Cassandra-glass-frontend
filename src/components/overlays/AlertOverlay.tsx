"use client";

import * as React from "react";
import { OverlayShell } from "./OverlayShell";

const sanitizeDir = (text: string) =>
  text.replace(/\bLONG\b/g, "rialzista").replace(/\bSHORT\b/g, "ribassista");


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
      <div className="w-full max-w-5xl mx-auto text-sm" style={{ color: 'var(--color-text)' }}>
        {/* Header */}
        <div className="mb-4">
          <div className="text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--color-text-dim)' }}>
            Avvisi
          </div>
          <h2 className="text-xl font-semibold mt-1">{title}</h2>
        </div>

        {/* Hero: Perché Cassandra sta squillando? */}
        <div className="mb-4 rounded-2xl px-4 py-3" style={{
          background: 'var(--color-gold, #d4a84b)18',
          border: '1px solid var(--color-gold, #d4a84b)44',
        }}>
          <div className="font-semibold" style={{ color: 'var(--color-gold, #d4a84b)' }}>
            Perché Cassandra sta squillando?
          </div>
          {motivazioni.length > 0 ? (
            <ul className="mt-2 list-disc list-inside space-y-1 text-xs" style={{ color: 'var(--color-text)' }}>
              {motivazioni.map((m, idx) => (
                <li key={idx}>{m}</li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 text-xs" style={{ color: 'var(--color-text-dim)' }}>
              Nessuna motivazione particolare rilevata nei timeframe selezionati.
            </div>
          )}
        </div>

        {/* Lista alert */}
        <div className="space-y-2">
          {filtered.map((a, idx) => (
            <div
              key={idx}
              className="rounded-xl px-4 py-3 flex justify-between items-center gap-4"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      border: '1px solid var(--color-gold, #d4a84b)99',
                      color: 'var(--color-gold, #d4a84b)',
                    }}
                  >
                    {a.code || "AVVISO"}
                  </span>
                  {a.tf && (
                    <span className="text-[10px] uppercase" style={{ color: 'var(--color-text-dim)' }}>
                      TF: {a.tf}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm font-medium">
                  {sanitizeDir(a.title || "Segnale rilevante")}
                </div>
                {a.condition && (
                  <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-dim)' }}>
                    {sanitizeDir(a.condition)}
                    {a.score != null && !Number.isNaN(a.score) && (
                      <> — punteggio {a.score.toFixed(2)}</>
                    )}
                  </div>
                )}
                {a.sources && a.sources.length > 0 && (
                  <div className="mt-1 text-[10px]" style={{ color: 'var(--color-text-dim)' }}>
                    Sorgente: {a.sources.join(", ")}
                  </div>
                )}
              </div>
              {a.price != null && !Number.isNaN(a.price) && (
                <div className="text-right">
                  <div className="text-[10px]" style={{ color: 'var(--color-text-dim)' }}>Livello</div>
                  <div className="text-xs font-semibold">
                    @{fmtPrice(a.price)}
                  </div>
                </div>
              )}
            </div>
          ))}

          {!hasAnything && (
            <div className="text-sm opacity-50">
              Nessun avviso rilevato nei timeframe selezionati.
            </div>
          )}
        </div>
      </div>
    </OverlayShell>
  );
}
