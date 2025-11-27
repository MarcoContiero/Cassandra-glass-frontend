// src/components/strategia/StrategiaAIOverlay.tsx
import React, { useMemo, useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { OverlayShell } from "../overlays/OverlayShell";

// Tipo locale: modelliamo solo ciò che usiamo qui dentro
type StrategiaAICondition = {
  id?: string | number;
  label: string;
  weight?: number;
};

type StrategiaAIStrategy = {
  tf: string;
  mode: string;
  source?: string;
  direction?: string;

  entry: number;
  stop?: number | null;

  tp1?: number | null;
  tp2?: number | null;
  tp1_price?: number | null;
  tp2_price?: number | null;

  rr1?: number | null;
  rr2?: number | null;

  score?: number | null;
  distance_bps?: number | null;

  explanation?: string;
  conditions?: {
    confirm?: StrategiaAICondition[];
    invalidate?: StrategiaAICondition[];
  };

  tags?: string[];
  note?: string | null;
};

type Props = {
  data: StrategiaAIStrategy[] | null | undefined;
  onClose: () => void;
};

function formatModeLabel(mode: string): string {
  switch (mode) {
    case "breve":
      return "BREVE";
    case "medio":
      return "MEDIO";
    case "lungo":
      return "LUNGO";
    default:
      return mode?.toUpperCase?.() || "-";
  }
}

function formatTfLabel(tf: string): string {
  return `TF ${tf?.toUpperCase?.()}`;
}

function formatPrice(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "-";
  if (v >= 1000) return v.toFixed(2);
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

function formatRR(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "-";
  return v.toFixed(2);
}

function formatDistanceBps(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "-";
  return v.toFixed(1);
}

export function StrategiaAIOverlay({ data, onClose }: Props) {
  const [maxDistanceBps, setMaxDistanceBps] = useState<number | null>(null);
  const [minScore, setMinScore] = useState<number>(0);
  const [minRR1, setMinRR1] = useState<number>(0);
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});

  const ordered = useMemo(() => {
    if (!data) return [];
    return [...data].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [data]);

  const filtered = useMemo(() => {
    return ordered.filter((s) => {
      const score = s.score ?? 0;
      const rr1 = s.rr1 ?? 0;
      const dist = s.distance_bps;

      if (score < minScore) return false;
      if (rr1 < minRR1) return false;
      if (
        maxDistanceBps != null &&
        dist != null &&
        isFinite(dist) &&
        dist > maxDistanceBps
      ) {
        return false;
      }
      return true;
    });
  }, [ordered, maxDistanceBps, minScore, minRR1]);

  const total = filtered.length;

  return (
    <OverlayShell>
      <div className="flex items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Strategia AI – Setup
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Setup multi-timeframe generati da Cassandra 2.0. Ordinati per
            punteggio.
          </p>
        </div>
        <button
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <X size={16} />
        </button>
      </div>

      {/* Filtri rapidi */}
      <div className="mt-4 grid gap-3 text-[11px] text-zinc-200 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-zinc-400">
            Distanza max (bps)
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              className="h-7 w-20 rounded bg-white/5 px-2 text-xs text-white outline-none"
              value={maxDistanceBps ?? ""}
              placeholder="-"
              onChange={(e) => {
                const v = e.target.value;
                if (!v) {
                  setMaxDistanceBps(null);
                } else {
                  const n = Number(v);
                  setMaxDistanceBps(isNaN(n) ? null : n);
                }
              }}
            />
            <span className="text-[10px] text-zinc-400">
              (vuoto = nessun limite)
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-zinc-400">
            Score minimo
          </span>
          <input
            type="number"
            className="h-7 w-20 rounded bg-white/5 px-2 text-xs text-white outline-none"
            value={minScore}
            min={0}
            onChange={(e) => {
              const n = Number(e.target.value || 0);
              setMinScore(isNaN(n) ? 0 : n);
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-zinc-400">
            RR1 minimo
          </span>
          <input
            type="number"
            step="0.1"
            className="h-7 w-20 rounded bg-white/5 px-2 text-xs text-white outline-none"
            value={minRR1}
            min={0}
            onChange={(e) => {
              const n = Number(e.target.value || 0);
              setMinRR1(isNaN(n) ? 0 : n);
            }}
          />
        </div>
      </div>

      {/* Totale */}
      <div className="mt-3 text-right text-[11px] text-zinc-400">
        Totale setup:{" "}
        <span className="font-semibold text-zinc-100">{total}</span>
      </div>

      {/* Lista card */}
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((s, idx) => {
          const tfLabel = formatTfLabel(s.tf);
          const modeLabel = formatModeLabel(s.mode);
          const distance = s.distance_bps;
          const dir =
            s.direction?.toUpperCase?.() === "SHORT" ? "SHORT" : "LONG";

          // Usiamo solo i prezzi, niente fallback su tp1/tp2 (che sono gli RR)
          const tp1 = (s as any).tp1_price ?? null;
          const tp2 = (s as any).tp2_price ?? null;
          const hasTp2 =
            typeof tp2 === "number" && isFinite(tp2) && tp2 !== 0;

          const hasDetails =
            !!s.explanation ||
            !!(s.conditions?.confirm && s.conditions.confirm.length) ||
            !!(s.conditions?.invalidate && s.conditions.invalidate.length) ||
            !!(s.tags && s.tags.length) ||
            !!s.note;

          const cardId = `${s.tf}-${s.mode}-${s.source}-${s.entry}-${idx}`;
          const isOpen = !!openDetails[cardId];

          return (
            <div
              key={cardId}
              className="flex flex-col rounded-2xl bg-black/40 p-4 shadow-lg shadow-black/40 ring-1 ring-white/5"
            >
              {/* Header TF / mode / direzione */}
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-100">
                    {tfLabel} · {modeLabel}
                  </span>
                  <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-300">
                    {s.source || "levels"}
                  </span>
                  {typeof distance === "number" && isFinite(distance) && (
                    <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-zinc-200">
                      Distanza:{" "}
                      <span className="font-semibold">
                        {formatDistanceBps(distance)} bps
                      </span>
                    </span>
                  )}
                </div>

                <div
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold ${dir === "LONG"
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-red-500/10 text-red-300"
                    }`}
                >
                  {dir}
                  {s.score != null && (
                    <span className="ml-1 text-[9px] text-zinc-300">
                      Score {s.score}
                    </span>
                  )}
                </div>
              </div>

              {/* Prezzi & RR */}
              <div className="grid grid-cols-2 gap-3 text-[11px] text-zinc-200">
                <div className="space-y-1">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-zinc-400">
                      Entry
                    </div>
                    <div className="font-mono text-sm text-white">
                      {formatPrice(s.entry)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-zinc-400">
                      Stop
                    </div>
                    <div className="font-mono text-sm text-white">
                      {formatPrice(s.stop ?? null)}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-zinc-400">
                      TP1 / TP2
                    </div>
                    <div className="font-mono text-sm text-white">
                      {formatPrice(tp1)}{" "}
                      <span className="mx-1 text-zinc-500">/</span>
                      {hasTp2 ? formatPrice(tp2) : "-"}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-zinc-400">
                      Rischio/Rendimento 1 / 2
                    </div>
                    <div className="font-mono text-sm text-white">
                      R{formatRR(s.rr1)}{" "}
                      <span className="mx-1 text-zinc-500">/</span>
                      R{formatRR(s.rr2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Toggle dettagli */}
              {hasDetails && (
                <button
                  type="button"
                  onClick={() =>
                    setOpenDetails((prev) => ({
                      ...prev,
                      [cardId]: !prev[cardId],
                    }))
                  }
                  className="mt-3 inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white"
                >
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${isOpen ? "rotate-180" : "rotate-0"
                      }`}
                  />
                  <span>
                    {isOpen ? "Nascondi dettagli" : "Mostra dettagli"}
                  </span>
                </button>
              )}

              {/* Dettagli (spiegazione + conferme/invalidazioni + tag/note) */}
              {hasDetails && isOpen && (
                <div className="mt-3 space-y-2 text-[11px] leading-tight">
                  {s.explanation && (
                    <div className="rounded-lg bg-white/5 p-2 text-[11px] text-zinc-100">
                      {s.explanation}
                    </div>
                  )}

                  {(s.conditions?.confirm?.length ||
                    s.conditions?.invalidate?.length) && (
                      <div className="grid gap-2 md:grid-cols-2">
                        {s.conditions?.confirm?.length ? (
                          <div className="rounded-lg bg-emerald-950/40 p-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                              Conferme richieste
                            </div>
                            <ul className="mt-1 space-y-1">
                              {s.conditions?.confirm?.map(
                                (c: StrategiaAICondition, i: number) => (
                                  <li
                                    key={c.id ?? i}
                                    className="flex items-start justify-between gap-2 text-[11px] text-emerald-100"
                                  >
                                    <span className="flex-1">{c.label}</span>
                                    {c.weight != null && isFinite(c.weight) && (
                                      <span className="ml-2 text-[10px] text-emerald-300/80">
                                        peso {c.weight.toFixed(1)}
                                      </span>
                                    )}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        ) : null}

                        {s.conditions?.invalidate?.length ? (
                          <div className="rounded-lg bg-red-950/40 p-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-red-300">
                              Cosa invalida il setup
                            </div>
                            <ul className="mt-1 space-y-1">
                              {s.conditions?.invalidate?.map(
                                (c: StrategiaAICondition, i: number) => (
                                  <li
                                    key={c.id ?? i}
                                    className="flex items-start justify-between gap-2 text-[11px] text-red-100"
                                  >
                                    <span className="flex-1">{c.label}</span>
                                    {c.weight != null && isFinite(c.weight) && (
                                      <span className="ml-2 text-[10px] text-red-300/80">
                                        peso {c.weight.toFixed(1)}
                                      </span>
                                    )}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    )}

                  {(s.tags?.length || s.note) && (
                    <div className="mt-1 text-[10px] text-zinc-300">
                      {s.tags?.length ? (
                        <span className="flex flex-wrap gap-1">
                          {s.tags?.map((t: string, i: number) => (
                            <span
                              key={i}
                              className="rounded-full bg-white/5 px-2 py-0.5 text-[10px]"
                            >
                              {t}
                            </span>
                          ))}
                        </span>
                      ) : null}
                      {s.note && (
                        <span className="mt-1 block text-[10px] text-zinc-400">
                          {s.note}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </OverlayShell>
  );
}

export default StrategiaAIOverlay;
