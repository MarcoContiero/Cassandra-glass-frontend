"use client";

import { OverlayShell } from "./OverlayShell";

import React, { useMemo, useState, useEffect } from "react";

import type {
  TrendTfEntry,
  LongShortGlobal,
  Timeframe,
} from "@/types/analisiLight";

interface LongShortOverlayProps {
  trendPerTf: Record<string, TrendTfEntry>;
  longshort?: LongShortGlobal | null;
  timeframes: Timeframe[];
  spiegazione?: any;
  onClose?: () => void;
  coin?: string;
}

interface NetflowData {
  netflow_today: number | null;
  netflow_7d_avg: number | null;
  signal: string | null;
  label: string | null;
  stale: boolean;
  updated_at: string | null;
}

function useNetflow(coin?: string) {
  const [data, setData] = useState<NetflowData | null>(null);
  useEffect(() => {
    if (!coin || coin.toUpperCase() !== 'BTC') return;
    fetch('/api/netflow/btc')
      .then(r => r.json())
      .then(j => { if (j.ok && j.data) setData(j.data); })
      .catch(() => {});
  }, [coin]);
  return data;
}

function netflowColor(signal: string | null): string {
  if (!signal) return 'var(--color-text-dim)';
  if (signal === 'accumulo_forte' || signal === 'accumulo') return 'var(--color-cyan)';
  if (signal === 'pressione_forte' || signal === 'pressione') return '#E87B30';
  return 'var(--color-text-dim)';
}

function fmtBtc(val: number | null): string {
  if (val == null) return '';
  const abs = Math.abs(val);
  const sign = val >= 0 ? '+' : '−';
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}K BTC`;
  return `${sign}${abs.toFixed(0)} BTC`;
}

function biasColor(bias: string | undefined): string {
  const b = (bias || "").toLowerCase();
  if (b === "long") return "var(--color-long-bright)";
  if (b === "short") return "var(--color-short-bright)";
  return "var(--color-neutral)";
}

function biasBg(bias: string | undefined): React.CSSProperties {
  const b = (bias || "").toLowerCase();
  if (b === "long") return {
    background: 'var(--color-long-faint)',
    color: 'var(--color-long-bright)',
    border: '1px solid rgba(45,122,79,0.35)',
  };
  if (b === "short") return {
    background: 'var(--color-short-faint)',
    color: 'var(--color-short-bright)',
    border: '1px solid rgba(122,45,45,0.35)',
  };
  return {
    background: 'rgba(90,90,138,0.15)',
    color: 'var(--color-neutral)',
    border: '1px solid rgba(90,90,138,0.3)',
  };
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
  if (minutes <= 30) return 0.3;
  if (minutes <= 240) return 0.4;
  return 0.3;
}

function CompositionBar({ entry }: { entry: TrendTfEntry | undefined | null }) {
  const e: any = entry || {};
  const tot = typeof e.tot === "number" && !Number.isNaN(e.tot) ? e.tot : 0;
  const longVal = typeof e.long === "number" && !Number.isNaN(e.long) ? e.long : 0;
  const shortVal = typeof e.short === "number" && !Number.isNaN(e.short) ? e.short : 0;
  const neutroVal = typeof e.neutro === "number" && !Number.isNaN(e.neutro) ? e.neutro : 0;
  const total = tot || longVal + shortVal + neutroVal || 0;
  const l = total > 0 ? (longVal / total) * 100 : 0;
  const s = total > 0 ? (shortVal / total) * 100 : 0;
  const n = total > 0 ? (neutroVal / total) * 100 : 0;

  return (
    <div className="mt-2 flex flex-col gap-1">
      <div className="flex justify-between text-[10px]" style={{ color: 'var(--color-text-dim)' }}>
        <span>Componenti</span>
        <span>Tot: {total.toFixed(1)}</span>
      </div>
      <div
        className="relative h-2.5 overflow-hidden rounded-full"
        style={{ background: 'var(--color-text-faint)' }}
      >
        {l > 0 && (
          <div
            className="absolute left-0 top-0 h-full"
            style={{ width: `${l}%`, background: 'var(--color-long-bright)', opacity: 0.8 }}
          />
        )}
        {s > 0 && (
          <div
            className="absolute top-0 h-full"
            style={{ left: `${l}%`, width: `${s}%`, background: 'var(--color-short-bright)', opacity: 0.8 }}
          />
        )}
        {n > 0 && (
          <div
            className="absolute top-0 h-full"
            style={{ left: `${l + s}%`, width: `${n}%`, background: 'var(--color-neutral)', opacity: 0.7 }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[10px]" style={{ color: 'var(--color-text-dim)' }}>
        <span>Rialzista: {longVal.toFixed(1)}</span>
        <span>Ribassista: {shortVal.toFixed(1)}</span>
        <span>Neutro: {neutroVal.toFixed(1)}</span>
      </div>
    </div>
  );
}

export default function LongShortOverlay({
  trendPerTf,
  longshort,
  timeframes,
  spiegazione,
  onClose,
  coin,
}: LongShortOverlayProps) {
  const netflow = useNetflow(coin);
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
        typeof ls.score === "number" ? ls.score
        : typeof trend.score === "number" ? trend.score : 0;
      const dir: string =
        (ls.direction as string) || (trend.direction as string) ||
        (trend.bias as string) || "NEUTRO";
      const data: any = {
        ...trend,
        score: baseScore,
        bias: dir,
        direction: dir,
        tot: typeof trend.tot === "number" && !Number.isNaN(trend.tot) ? trend.tot : baseScore,
        long: typeof trend.long === "number" && !Number.isNaN(trend.long) ? trend.long : dir === "LONG" ? baseScore : 0,
        short: typeof trend.short === "number" && !Number.isNaN(trend.short) ? trend.short : dir === "SHORT" ? baseScore : 0,
        neutro: typeof trend.neutro === "number" && !Number.isNaN(trend.neutro) ? trend.neutro : dir === "NEUTRO" ? baseScore : 0,
        components: trend.components || {},
      };
      return { tf, data: data as TrendTfEntry };
    });
  }, [trendPerTf, longshort, timeframes]);

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
    if (sumLong > sumShort) { dir = "LONG"; score = Math.min(100, sumLong - sumShort); }
    else if (sumShort > sumLong) { dir = "SHORT"; score = Math.min(100, sumShort - sumLong); }
    if (!Object.keys(lsPerTf).length && longshort) {
      dir = (longshort.direzione as any) || "NEUTRO";
      score = typeof longshort.score === "number" ? longshort.score : 0;
    }
    return { globalBias: dir, globalScore: score };
  }, [longshort]);

  return (
    <OverlayShell>
      <div className="flex flex-col gap-4 p-4 text-sm" style={{ color: 'var(--color-text)' }}>

        {/* HEADER */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-dim)' }}>
              BIAS MULTI-TIMEFRAME
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold" style={{ color: biasColor(globalBias) }}>
                Bias complessivo:{" "}
                {globalBias === "LONG" ? "rialzista" : globalBias === "SHORT" ? "ribassista" : "neutro"}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
                (score {globalScore.toFixed(1)})
              </span>
            </div>
            <div className="text-[11px] max-w-xl" style={{ color: 'var(--color-text-dim)' }}>
              Direzione prevalente sui timeframe selezionati, calcolata dalla somma ponderata dei segnali rialzisti / ribassisti / neutri.
            </div>
          </div>

          {onClose && (
            <button
              className="text-xs px-2 py-1 rounded border"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-dim)' }}
              onClick={onClose}
            >
              Chiudi
            </button>
          )}
        </div>

        {/* CONTESTO */}
        {spiegazione?.testo && (
          <div
            className="rounded-2xl p-3"
            style={{
              border: '1px solid var(--color-border)',
              background: 'var(--color-overlay)',
            }}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-dim)' }}>
              Contesto di mercato
            </div>
            <div className="mt-2 text-sm leading-relaxed whitespace-pre-line">
              {String(spiegazione.testo)}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              {spiegazione.scenario_state && (
                <span className="rounded-full px-2 py-0.5" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                  {spiegazione.scenario_state}
                </span>
              )}
              {spiegazione.pressure && (
                <span className="rounded-full px-2 py-0.5" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                  {spiegazione.pressure}
                </span>
              )}
              {spiegazione.position && (
                <span className="rounded-full px-2 py-0.5" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                  {spiegazione.position}
                </span>
              )}
              {typeof spiegazione.confidence === "number" && (
                <span className="rounded-full px-2 py-0.5" style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
                  Confidenza {Math.round(spiegazione.confidence * 100)}%
                </span>
              )}
              {typeof spiegazione.trigger_down === "number" && (
                <span className="rounded-full px-2 py-0.5" style={{ border: '1px solid var(--color-short-faint)', background: 'var(--color-short-faint)', color: 'var(--color-short-bright)' }}>
                  ↓ {Math.round(spiegazione.trigger_down)}
                </span>
              )}
              {typeof spiegazione.trigger_up === "number" && (
                <span className="rounded-full px-2 py-0.5" style={{ border: '1px solid var(--color-long-faint)', background: 'var(--color-long-faint)', color: 'var(--color-long-bright)' }}>
                  ↑ {Math.round(spiegazione.trigger_up)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* RIGHE PER TF */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ tf, data }) => {
            const d: any = data || {};
            const bias = d.bias || d.direction;
            const score = typeof d.score === "number" && !Number.isNaN(d.score) ? d.score : 0;
            const tot = typeof d.tot === "number" && !Number.isNaN(d.tot) ? d.tot : score;
            const compsLong = (d.components?.long as any[]) ?? [];
            const compsShort = (d.components?.short as any[]) ?? [];
            const compsNeutro = (d.components?.neutro as any[]) ?? [];

            return (
              <div
                key={String(tf)}
                className="flex flex-col gap-2 rounded-2xl p-3"
                style={{
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-overlay)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide"
                      style={{ background: 'var(--color-surface)', color: 'var(--color-text)' }}
                    >
                      TF {String(tf)}
                    </span>
                    <span className="mt-1 text-[11px]" style={{ color: 'var(--color-text-dim)' }}>
                      Score: {score.toFixed(1)} (tot {tot.toFixed(1)})
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div
                      className="flex items-center rounded-full px-2 py-1 text-[11px] font-semibold uppercase"
                      style={biasBg(bias)}
                    >
                      {bias === 'LONG' ? 'RIALZISTA' : bias === 'SHORT' ? 'RIBASSISTA' : bias || 'NEUTRO'}
                    </div>
                    {/* Netflow badge — solo su 1D per BTC */}
                    {netflow && String(tf).toLowerCase() === '1d' && netflow.label && (
                      <div
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px]"
                        style={{
                          borderRadius: 2,
                          border: `1px solid ${netflow.stale ? 'rgba(90,90,138,0.3)' : `${netflowColor(netflow.signal)}44`}`,
                          background: netflow.stale ? 'rgba(90,90,138,0.08)' : `${netflowColor(netflow.signal)}14`,
                          color: netflow.stale ? 'var(--color-text-dim)' : netflowColor(netflow.signal),
                          fontFamily: 'var(--font-mono)',
                        }}
                        title={netflow.stale ? 'Dati non aggiornati' : `Aggiornato: ${netflow.updated_at ?? '—'}`}
                      >
                        netflow {netflow.label}
                        {netflow.netflow_7d_avg != null && (
                          <span style={{ opacity: 0.7 }}>{fmtBtc(netflow.netflow_7d_avg)}</span>
                        )}
                        {netflow.stale && <span style={{ opacity: 0.5 }}>*</span>}
                      </div>
                    )}
                  </div>
                </div>

                <CompositionBar entry={d} />

                <div
                  className="mt-2 rounded-xl p-2 text-[11px] max-h-32 overflow-y-auto"
                  style={{ background: 'var(--color-surface)', color: 'var(--color-text-dim)' }}
                >
                  <div className="mb-1 text-[10px] font-semibold" style={{ color: 'var(--color-text-dim)' }}>
                    Componenti principali
                  </div>
                  <div className="space-y-0.5">
                    {compsLong.map((c, i) => {
                      const label = formatScenario(c);
                      return (
                        <div key={`L-${i}-${c.indicatore}`} className="flex justify-between gap-2" style={{ color: 'var(--color-long-bright)' }}>
                          <span className="truncate">rialzista · {c.indicatore}{label && <> ({label})</>}</span>
                          <span className="shrink-0">{c.punteggio.toFixed(1)}</span>
                        </div>
                      );
                    })}
                    {compsShort.map((c, i) => {
                      const label = formatScenario(c);
                      return (
                        <div key={`S-${i}-${c.indicatore}`} className="flex justify-between gap-2" style={{ color: 'var(--color-short-bright)' }}>
                          <span className="truncate">ribassista · {c.indicatore}{label && <> ({label})</>}</span>
                          <span className="shrink-0">{c.punteggio.toFixed(1)}</span>
                        </div>
                      );
                    })}
                    {compsNeutro.map((c, i) => {
                      const label = formatScenario(c);
                      return (
                        <div key={`N-${i}-${c.indicatore}`} className="flex justify-between gap-2" style={{ color: 'var(--color-text-dim)' }}>
                          <span className="truncate">NEUTRO · {c.indicatore}{label && <> ({label})</>}</span>
                          <span className="shrink-0">{c.punteggio.toFixed(1)}</span>
                        </div>
                      );
                    })}
                    {compsLong.length === 0 && compsShort.length === 0 && compsNeutro.length === 0 && (
                      <div className="text-[10px]" style={{ color: 'var(--color-text-dim)' }}>
                        Nessun dettaglio disponibile per questo timeframe.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {rows.length === 0 && (
            <div
              className="col-span-full rounded-xl p-3 text-[13px]"
              style={{ border: '1px solid var(--color-border)', background: 'var(--color-overlay)', color: 'var(--color-text-dim)' }}
            >
              Nessun dato di bias disponibile per i timeframe selezionati.
            </div>
          )}
        </div>
      </div>
    </OverlayShell>
  );
}
