"use client";

import { OverlayShell } from "./OverlayShell";

import React, { useMemo } from "react";
import type {
  LiquidityBlock,
  LiquidityPoolEntry,
  Timeframe,
} from "@/types/analisiLight";

interface LiquidityOverlayProps {
  liquidity?: LiquidityBlock | null;
  prezzo?: number;
  timeframes?: Timeframe[];
  onClose?: () => void;
}

function fmtPrice(v: number | undefined | null): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "-";
  if (Math.abs(v) >= 1000) return v.toFixed(2);
  if (Math.abs(v) >= 1) return v.toFixed(3);
  return v.toFixed(4);
}

function fmtSize(v: number | undefined | null): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "-";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toFixed(0);
}

function fmtPct(v: number | undefined | null): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "-";
  const s = v > 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
}

function tfChip(tf: string) {
  return (
    <span className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-200">
      {tf}
    </span>
  );
}

function getEntryPrice(p: LiquidityPoolEntry): number | null {
  const val =
    (p as any).livello ??
    (p as any).price ??
    (p as any).prezzo ??
    (p as any).level ??
    (p as any).valore ??
    null;
  return typeof val === "number" ? val : null;
}

function getEntrySize(p: LiquidityPoolEntry): number {
  const val =
    (p as any).size ??
    (p as any).amount ??
    (p as any).volume ??
    (p as any).score ??
    0;
  return typeof val === "number" ? val : 0;
}

function getEntryMagnet(p: LiquidityPoolEntry): {
  score?: number;
  label?: string;
} {
  const rawScore = (p as any).magnet_score;
  const rawLabel = (p as any).magnet_label;

  const score =
    typeof rawScore === "number" && !Number.isNaN(rawScore)
      ? rawScore
      : undefined;

  const label =
    typeof rawLabel === "string" && rawLabel.trim().length > 0
      ? rawLabel
      : undefined;

  return { score, label };
}

function getEntryTf(p: LiquidityPoolEntry): string | undefined {
  const tf = (p as any).tf ?? (p as any).timeframe ?? undefined;
  return tf ? String(tf) : undefined;
}

/**
 * Overlay dei livelli di liquidità (pool sopra/sotto il prezzo)
 * legge direttamente dal blocco `liquidity` del JSON 2.0.
 */
export default function LiquidityOverlay({
  liquidity,
  prezzo,
  timeframes,
  onClose,
}: LiquidityOverlayProps) {
  const currentPrice = prezzo ?? liquidity?._meta?.price ?? null;

  const { aboveList, belowList } = useMemo(() => {
    const sopra = (liquidity?.sopra ?? []) as LiquidityPoolEntry[];
    const sotto = (liquidity?.sotto ?? []) as LiquidityPoolEntry[];

    const mapSide = (arr: LiquidityPoolEntry[], side: "sopra" | "sotto") =>
      arr
        .map((p) => {
          const price = getEntryPrice(p);
          const size = getEntrySize(p);
          let dist_pct: number | null = null;

          if (currentPrice && price) {
            dist_pct = ((price - currentPrice) / currentPrice) * 100;
          }

          // Magnet
          const { score: magnetScore, label: magnetLabel } = getEntryMagnet(p);

          // Percentuale OrderBook
          const sizeRealeRaw =
            (p as any).size_reale ??
            (p as any).wall_notional ??
            (p as any).wallNotional ??
            0;

          const sizeReale =
            typeof sizeRealeRaw === "number" && !Number.isNaN(sizeRealeRaw)
              ? sizeRealeRaw
              : 0;

          const obPercent =
            size > 0 && sizeReale > 0 ? (sizeReale / size) * 100 : null;

          return {
            raw: p,
            side,
            price,
            size,
            dist_pct,
            tf: getEntryTf(p),
            magnetScore,
            magnetLabel,
            obPercent,
          };
        })

        // ordiniamo per distanza assoluta se abbiamo il prezzo, altrimenti per size decrescente
        .sort((a, b) => {
          if (a.dist_pct != null && b.dist_pct != null) {
            return Math.abs(a.dist_pct) - Math.abs(b.dist_pct);
          }
          return b.size - a.size;
        });

    return {
      aboveList: mapSide(sopra, "sopra"),
      belowList: mapSide(sotto, "sotto"),
    };
  }, [liquidity, currentPrice]);

  const tfList: Timeframe[] =
    timeframes && timeframes.length > 0
      ? timeframes
      : (liquidity?._meta?.tfs ?? []);

  return (
    <OverlayShell>
      <div className="flex flex-col gap-4 p-4 text-sm text-zinc-100">
        {/* HEADER */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="text-xs uppercase tracking-wide text-zinc-400">
              Livelli di liquidità
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold">
                Pool sopra e sotto il prezzo
              </span>
              {currentPrice && (
                <span className="text-[11px] text-zinc-400">
                  Prezzo attuale:{" "}
                  <span className="font-semibold">
                    {fmtPrice(currentPrice)}
                  </span>
                </span>
              )}
            </div>
            <div className="text-[11px] text-zinc-400 max-w-xl">
              Zone dove si concentra liquidità (ordini, stop, posizioni
              forzate). Più la pool è vicina al prezzo e grande, più è
              probabile che agisca da “calamita”.
            </div>

            {tfList && tfList.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {tfList.map((tf) => (
                  <span
                    key={String(tf)}
                    className="rounded-full bg-zinc-900/80 px-2 py-0.5 text-[10px] text-zinc-300"
                  >
                    TF {tf}
                  </span>
                ))}
              </div>
            )}
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

        {/* DUE COLONNE: SOPRA / SOTTO */}
        <div className="grid gap-3 md:grid-cols-2">
          {/* SOPRA */}
          <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-zinc-900/70 p-3 shadow-lg shadow-black/40">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-200">
                Pool SOPRA il prezzo
              </span>
              <span className="text-[10px] text-zinc-400">
                {aboveList.length} livelli
              </span>
            </div>

            {aboveList.length === 0 ? (
              <div className="rounded-lg bg-zinc-950/60 p-2 text-[12px] text-zinc-300">
                Nessuna pool significativa sopra il prezzo.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {aboveList.slice(0, 12).map((p, idx) => (
                  <div
                    key={`above-${idx}-${p.price}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-zinc-950/70 px-2 py-1.5 text-[11px]"
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-100">
                          {fmtPrice(p.price)}
                        </span>
                        {p.tf && tfChip(p.tf)}
                      </div>
                      {p.dist_pct != null && (
                        <span className="text-[10px] text-zinc-400">
                          Distanza: {fmtPct(p.dist_pct)}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-zinc-400">Size</div>

                      <div className="text-xs font-semibold">
                        {fmtSize(p.size)}
                        {p.obPercent != null && (
                          <span className="text-[10px] text-zinc-500">
                            {" "}
                            ({p.obPercent.toFixed(0)}% OB)
                          </span>
                        )}
                      </div>

                      {p.magnetScore != null && (
                        <div className="mt-0.5 text-[10px] text-zinc-400">
                          Magnet: {p.magnetScore}
                          {p.magnetLabel && (
                            <span className="text-[10px] text-zinc-500">
                              {" "}
                              ({p.magnetLabel})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SOTTO */}
          <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-zinc-900/70 p-3 shadow-lg shadow-black/40">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-200">
                Pool SOTTO il prezzo
              </span>
              <span className="text-[10px] text-zinc-400">
                {belowList.length} livelli
              </span>
            </div>

            {belowList.length === 0 ? (
              <div className="rounded-lg bg-zinc-950/60 p-2 text-[12px] text-zinc-300">
                Nessuna pool significativa sotto il prezzo.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {belowList.slice(0, 12).map((p, idx) => (
                  <div
                    key={`below-${idx}-${p.price}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-zinc-950/70 px-2 py-1.5 text-[11px]"
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-100">
                          {fmtPrice(p.price)}
                        </span>
                        {p.tf && tfChip(p.tf)}
                      </div>
                      {p.dist_pct != null && (
                        <span className="text-[10px] text-zinc-400">
                          Distanza: {fmtPct(p.dist_pct)}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-zinc-400">Size</div>

                      <div className="text-xs font-semibold">
                        {fmtSize(p.size)}
                        {p.obPercent != null && (
                          <span className="text-[10px] text-zinc-500">
                            {" "}
                            ({p.obPercent.toFixed(0)}% OB)
                          </span>
                        )}
                      </div>

                      {p.magnetScore != null && (
                        <div className="mt-0.5 text-[10px] text-zinc-400">
                          Magnet: {p.magnetScore}
                          {p.magnetLabel && (
                            <span className="text-[10px] text-zinc-500">
                              {" "}
                              ({p.magnetLabel})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </OverlayShell>
  );
}
