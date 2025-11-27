"use client";

import { OverlayShell } from "./OverlayShell";

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

/* ----------------- Helpers comuni ----------------- */

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

function formatScenario(c: {
  scenario?: string | null;
  scenario_label?: string | null;
}): string {
  const sl = (c.scenario_label ?? "").trim();
  if (sl) return sl;

  const s = (c.scenario ?? "").trim();
  if (!s || s === "nessuno" || s === "n.d.") return "";
  return s;
}

/* ----------------- Weighting TF (come backend) ----------------- */

function tfToMinutes(tf: string): number {
  if (!tf) return 0;
  const s = tf.trim().toLowerCase();
  let num = "";
  let unit = "";
  for (const ch of s) {
    if (ch >= "0" && ch <= "9") num += ch;
    else unit += ch;
  }
  if (!num) return 0;
  const n = parseInt(num, 10);
  const u = unit || "m";
  if (u === "m") return n;
  if (u === "h") return n * 60;
  if (u === "d") return n * 60 * 24;
  if (u === "w") return n * 60 * 24 * 7;
  return 0;
}

function weightForTf(tf: string): number {
  const minutes = tfToMinutes(tf);
  if (minutes === 0) return 1.0;
  if (minutes <= 30) return 0.3;     // brevi
  if (minutes <= 240) return 0.4;    // medi (fino 4h)
  return 0.3;                        // lunghi
}

/* ----------------- CompositionBar ----------------- */

function CompositionBar({ entry }: { entry: TrendTfEntry | undefined | null }) {
  const e: any = entry || {};
  const tot =
    typeof e.tot === "number" && !Number.isNaN(e.tot) ? e.tot : 0;

  const longVal =
    typeof e.long === "number" && !Number.isNaN(e.long) ? e.long : 0;
  const shortVal =
    typeof e.short === "number" && !Number.isNaN(e.short) ? e.short : 0;
  const neutroVal =
    typeof e.neutro === "number" && !Number.isNaN(e.neutro) ? e.neutro : 0;

  const total = tot || longVal + shortVal + neutroVal || 0;

  const l = total > 0 ? (longVal / total) * 100 : 0;
  const s = total > 0 ? (shortVal / total) * 100 : 0;
  const n = total > 0 ? (neutroVal / total) * 100 : 0;

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex justify-between text-[10px] text-zinc-400">
        <span>Componenti</span>
        <span>Tot: {total.toFixed(1)}</span>
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
        <span>Long: {longVal.toFixed(1)}</span>
        <span>Short: {shortVal.toFixed(1)}</span>
        <span>Neutro: {neutroVal.toFixed(1)}</span>
      </div>
    </div>
  );
}

/* ----------------- Overlay principale ----------------- */

export default function LongShortOverlay({
  trendPerTf,
  longshort,
  timeframes,
  onClose,
}: LongShortOverlayProps) {
  /* righe per TF (dati locali) */
  const rows = useMemo(() => {
    const tfList =
      timeframes && timeframes.length > 0
        ? timeframes
        : (Object.keys(trendPerTf) as Timeframe[]);

    const lsPerTf =
      ((longshort as any)?.per_tf_map as
        | Record<string, { score?: number; direction?: string }>
        | undefined) || {};

    return tfList.map((tf) => {
      const ls = lsPerTf[String(tf)] || {};
      const trend = (trendPerTf[String(tf)] as any) || {};

      const baseScore: number =
        typeof ls.score === "number"
          ? ls.score
          : typeof trend.score === "number"
            ? trend.score
            : 0;

      const dir: string =
        (ls.direction as string) ||
        (trend.direction as string) ||
        (trend.bias as string) ||
        "NEUTRO";

      const data: any = {
        ...trend,
        score: baseScore,
        bias: dir,
        direction: dir,
        tot:
          typeof trend.tot === "number" && !Number.isNaN(trend.tot)
            ? trend.tot
            : baseScore,
        long:
          typeof trend.long === "number" && !Number.isNaN(trend.long)
            ? trend.long
            : dir === "LONG"
              ? baseScore
              : 0,
        short:
          typeof trend.short === "number" && !Number.isNaN(trend.short)
            ? trend.short
            : dir === "SHORT"
              ? baseScore
              : 0,
        neutro:
          typeof trend.neutro === "number" && !Number.isNaN(trend.neutro)
            ? trend.neutro
            : dir === "NEUTRO"
              ? baseScore
              : 0,
        components: trend.components || {},
      };

      return { tf, data: data as TrendTfEntry };
    });
  }, [trendPerTf, longshort, timeframes]);

  /* bias complessivo ricalcolato dal FE */
  const { globalBias, globalScore } = useMemo(() => {
    const lsPerTf =
      ((longshort as any)?.per_tf_map as
        | Record<string, { score?: number; direction?: string }>
        | undefined) || {};

    let sumLong = 0;
    let sumShort = 0;

    for (const [tf, row] of Object.entries(lsPerTf)) {
      const w = weightForTf(tf);
      const s = (row.score ?? 0) * w;
      const dir = (row.direction || "").toUpperCase();
      if (dir === "LONG") sumLong += s;
      else if (dir === "SHORT") sumShort += s;
    }

    let dir: "LONG" | "SHORT" | "NEUTRO" = "NEUTRO";
    let score = 0;

    if (sumLong > sumShort) {
      dir = "LONG";
      score = Math.min(100, sumLong - sumShort);
    } else if (sumShort > sumLong) {
      dir = "SHORT";
      score = Math.min(100, sumShort - sumLong);
    } else {
      dir = "NEUTRO";
      score = 0;
    }

    // fallback se per_tf_map non esiste
    if (!Object.keys(lsPerTf).length && longshort) {
      dir = (longshort.direzione as any) || "NEUTRO";
      score =
        typeof longshort.score === "number" ? longshort.score : 0;
    }

    return { globalBias: dir, globalScore: score };
  }, [longshort]);

  return (
    <OverlayShell>
      <div className="flex flex-col gap-4 p-4 text-sm text-zinc-100">
        {/* HEADER */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="text-xs uppercase tracking-wide text-zinc-400">
              Bias Multi-Timeframe
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-lg font-semibold ${biasColorClass(globalBias)}`}
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
            const d: any = data || {};
            const bias = d.bias || d.direction;
            const score =
              typeof d.score === "number" && !Number.isNaN(d.score)
                ? d.score
                : 0;
            const tot =
              typeof d.tot === "number" && !Number.isNaN(d.tot) ? d.tot : score;

            // componenti provenienti dal backend
            const compsLong = (d.components?.long as any[]) ?? [];
            const compsShort = (d.components?.short as any[]) ?? [];
            const compsNeutro = (d.components?.neutro as any[]) ?? [];

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
                      Score: {score.toFixed(1)} (tot {tot.toFixed(1)})
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

                <CompositionBar entry={d} />

                {/* componenti principali: TUTTI i contributi */}
                <div className="mt-2 rounded-xl bg-zinc-950/60 p-2 text-[11px] text-zinc-300 max-h-32 overflow-y-auto">
                  <div className="mb-1 text-[10px] font-semibold text-zinc-400">
                    Componenti principali
                  </div>
                  <div className="space-y-0.5">
                    {compsLong.map((c, i) => {
                      const label = formatScenario(c);
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

                    {compsShort.map((c, i) => {
                      const label = formatScenario(c);
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

                    {compsNeutro.map((c, i) => {
                      const label = formatScenario(c);
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

                    {compsLong.length === 0 &&
                      compsShort.length === 0 &&
                      compsNeutro.length === 0 && (
                        <div className="text-[10px] text-zinc-500">
                          Nessun dettaglio disponibile per questo timeframe.
                        </div>
                      )}
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
    </OverlayShell>
  );
}