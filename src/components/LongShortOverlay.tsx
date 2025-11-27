"use client";

import React, { useMemo } from "react";
import type {
  TrendTfEntry,
  LongShortGlobal,
  Timeframe,
} from "@/types/analisiLight";

interface LongShortOverlayProps {
  trendPerTf: Record<string, TrendTfEntry>;
  longshort?: LongShortGlobal | null;
  timeframes: Timeframe[];
  onClose?: () => void;
}

/**
 * Helpers per colori e label
 */
function biasColorClass(bias: string | undefined): string {
  const b = (bias || "").toLowerCase();
  if (b === "long") return "text-emerald-300";
  if (b === "short") return "text-red-300";
  if (b === "neutro") return "text-zinc-300";
  return "text-zinc-200";
}

function biasBadgeClass(bias: string | undefined): string {
  const b = (bias || "").toLowerCase();
  if (b === "long")
    return "bg-emerald-900/40 text-emerald-200 border-emerald-400/50";
  if (b === "short")
    return "bg-red-900/40 text-red-200 border-red-400/50";
  if (b === "neutro")
    return "bg-zinc-800/80 text-zinc-200 border-zinc-500/60";
  return "bg-zinc-800/80 text-zinc-200 border-zinc-500/60";
}

function formatScenarioLabel(c: { scenario?: string | null; scenario_label?: string | null }): string {
  const sl = (c.scenario_label ?? "").trim();
  if (sl) return sl;

  const s = (c.scenario ?? "").trim();
  if (!s || s === "nessuno" || s === "n.d.") return "";

  return s;
}

/**
 * Barra di composizione LONG / SHORT / NEUTRO
 */
function CompositionBar({ entry }: { entry: TrendTfEntry }) {
  const total = entry.tot || 0;
  const l = total > 0 ? (entry.long / total) * 100 : 0;
  const s = total > 0 ? (entry.short / total) * 100 : 0;
  const n = total > 0 ? (entry.neutro / total) * 100 : 0;

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex justify-between text-[10px] text-zinc-400">
        <span>Componenti</span>
        <span>Tot: {entry.tot.toFixed(1)}</span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-zinc-800/80">
        {l > 0 && (
          <div
            className="absolute left-0 top-0 h-full bg-emerald-500/80"
            style={{ width: `${l}%` }}
          />
        )}
        {s > 0 && (
          <div
            className="absolute top-0 h-full bg-red-500/80"
            style={{ left: `${l}%`, width: `${s}%` }}
          />
        )}
        {n > 0 && (
          <div
            className="absolute top-0 h-full bg-zinc-400/70"
            style={{ left: `${l + s}%`, width: `${n}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
        <span>Long: {entry.long.toFixed(1)}</span>
        <span>Short: {entry.short.toFixed(1)}</span>
        <span>Neutro: {entry.neutro.toFixed(1)}</span>
      </div>
    </div>
  );
}

/**
 * Overlay LONG / SHORT (Bias TF)
 * Usa:
 *  - trend_tf_score (trendPerTf)
 *  - longshort (bias complessivo)
 *  - timeframes (ordine dei TF)
 */
export default function LongShortOverlay({
  trendPerTf,
  longshort,
  timeframes,
  onClose,
}: LongShortOverlayProps) {
  const rows = useMemo(() => {
    const tfList =
      timeframes && timeframes.length > 0
        ? timeframes
        : (Object.keys(trendPerTf) as Timeframe[]);

    return tfList
      .map((tf) => ({
        tf,
        data: trendPerTf[tf],
      }))
      .filter((r) => !!r.data);
  }, [trendPerTf, timeframes]);

  const globalBias = longshort?.direzione ?? "NEUTRO";
  const globalScore = longshort?.score ?? 0;

  return (
    <div className="flex flex-col gap-4 p-4 text-sm text-zinc-100">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="text-xs uppercase tracking-wide text-zinc-400">
            Bias Multi-Timeframe
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-lg font-semibold ${biasColorClass(
                globalBias,
              )}`}
            >
              Bias complessivo: {globalBias}
            </span>
            <span className="text-[11px] text-zinc-400">
              (score {globalScore.toFixed(1)})
            </span>
          </div>
          <div className="text-[11px] text-zinc-400 max-w-xl">
            Direzione prevalente sui timeframe selezionati, calcolata dalla
            somma ponderata dei segnali LONG / SHORT / NEUTRO.
          </div>
        </div>

        {onClose && (
          <button
            className="text-xs px-2 py-1 rounded border border-white/20 hover:bg-white/10"
            onClick={onClose}
          >
            Chiudi
          </button>
        )}
      </div>

      {/* RIGHE PER TF */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ tf, data }) => {
          const bias = data.bias;

          return (
            <div
              key={String(tf)}
              className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-zinc-900/70 p-3 shadow-lg shadow-black/40"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-zinc-200">
                    TF {String(tf)}
                  </span>
                  <span className="mt-1 text-[11px] text-zinc-400">
                    Score: {data.score.toFixed(1)} (tot {data.tot.toFixed(1)})
                  </span>
                </div>
                <div
                  className={`flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold uppercase ${biasBadgeClass(
                    bias,
                  )}`}
                >
                  {bias || "NEUTRO"}
                </div>
              </div>

              <CompositionBar entry={data} />

              {/* componenti principali */}
              <div className="mt-2 rounded-xl bg-zinc-950/60 p-2 text-[11px] text-zinc-300">
                <div className="mb-1 text-[10px] font-semibold text-zinc-400">
                  Componenti principali
                </div>
                <div className="space-y-0.5">
                  {data.components.long.slice(0, 2).map((c, i) => {
                    const label = formatScenarioLabel(c);
                    return (
                      <div
                        key={`L-${i}-${c.indicatore}`}
                        className="flex justify-between gap-2 text-emerald-200/90"
                      >
                        <span className="truncate">
                          LONG · {c.indicatore}
                          {label && <> ({label})</>}
                        </span>
                        <span className="shrink-0">
                          {c.punteggio.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}

                  {data.components.short.slice(0, 2).map((c, i) => {
                    const label = formatScenarioLabel(c);
                    return (
                      <div
                        key={`S-${i}-${c.indicatore}`}
                        className="flex justify-between gap-2 text-red-200/90"
                      >
                        <span className="truncate">
                          SHORT · {c.indicatore}
                          {label && <> ({label})</>}
                        </span>
                        <span className="shrink-0">
                          {c.punteggio.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}

                  {data.components.neutro.slice(0, 1).map((c, i) => {
                    const label = formatScenarioLabel(c);
                    return (
                      <div
                        key={`N-${i}-${c.indicatore}`}
                        className="flex justify-between gap-2 text-zinc-200/90"
                      >
                        <span className="truncate">
                          NEUTRO · {c.indicatore}
                          {label && <> ({label})</>}
                        </span>
                        <span className="shrink-0">
                          {c.punteggio.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {rows.length === 0 && (
          <div className="col-span-full rounded-xl border border-white/10 bg-zinc-900/70 p-3 text-[13px] text-zinc-300">
            Nessun dato di bias disponibile per i timeframe selezionati.
          </div>
        )}
      </div>
    </div>
  );
}





