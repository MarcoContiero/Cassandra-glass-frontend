// src/components/strategia/StrategiaAIOverlay.tsx
import React, { useMemo, useState } from "react";

const sanitizeDir = (text: string) =>
  text.replace(/\bLONG\b/g, "rialzista").replace(/\bSHORT\b/g, "ribassista");
import { X, ChevronDown, ChevronRight, GitBranch } from "lucide-react";
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

  ciclica_window?: {
    tf_ciclo?: string;
    entry_from_bars?: number | null;
    entry_to_bars?: number | null;
    exit_from_bars?: number | null;
    exit_to_bars?: number | null;
    countdown_bars?: number | null;
    timing_grade?: string | null;
    label?: string | null;
    direction?: "LONG" | "SHORT" | null;
  };
  ciclica_pivot?: {
    timeframe?: string | null;
    window?: string | null;
    probability?: number | null;
    cluster_macro?: {
      id?: string | null;
      timeframe?: string | null;
      window_min?: number | null;
      window_max?: number | null;
      descrizione?: string | null;
      impatto?: string | null;
    } | null;
  };
};

type Props = {
  data: StrategiaAIStrategy[] | null | undefined;
  onClose: () => void;
  supporti?: any[];
  resistenze?: any[];
};

// ─────────────────────────────────────────────────────────────────
// Bivi map types & logic
// ─────────────────────────────────────────────────────────────────

type BiviPosizione = 'primo' | 'intermedio' | 'tp1' | 'ultimo_pre_tp2' | 'tp2';

type BiviNode = {
  id: string;
  mid: number;
  zona?: string;
  forza: number;
  natura: string;
  posizione: BiviPosizione;
  prevMid: number;
  nextMid?: number;
};

function srMid(it: any): number | null {
  for (const key of ['mid', 'valore', 'value', 'price', 'level']) {
    const n = Number(it?.[key]);
    if (isFinite(n) && n > 0) return n;
  }
  const zona = String(it?.zona || '');
  if (zona) {
    const parts = zona.split(/[-–—]/);
    if (parts.length >= 2) {
      const a = parseFloat(parts[0]);
      const b = parseFloat(parts[1]);
      if (isFinite(a) && isFinite(b)) return (a + b) / 2;
    }
    const single = parseFloat(zona);
    if (isFinite(single) && single > 0) return single;
  }
  return null;
}

function srForza(it: any): number {
  for (const key of ['forza', 'punteggio', 'strength', 'score', 'livelli']) {
    const n = Number(it?.[key]);
    if (isFinite(n) && n > 0) return n;
  }
  return 1;
}

function srNatura(it: any): string {
  return String(it?.natura || it?.scenario || it?.type || 'Tecnico');
}

function buildBiviNodes(
  s: StrategiaAIStrategy,
  supporti: any[],
  resistenze: any[],
): BiviNode[] {
  const entry = s.entry;
  const tp2Raw = s.tp2_price ?? s.tp2 ?? null;
  const tp1Raw = s.tp1_price ?? s.tp1 ?? null;

  if (!entry || !isFinite(entry) || tp2Raw == null || !isFinite(Number(tp2Raw))) return [];
  const tp2 = Number(tp2Raw);
  const tp1 = typeof tp1Raw === 'number' && isFinite(tp1Raw) && tp1Raw !== 0 ? tp1Raw : null;
  const dir: 'LONG' | 'SHORT' = s.direction?.toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';

  type Raw = { mid: number; forza: number; natura: string; zona?: string; isTp?: boolean };

  // Raccoglie candidati S/R nel range (entry, tp2) con forza >= 5
  const candidates: Raw[] = [...(supporti || []), ...(resistenze || [])]
    .map(it => {
      const mid = srMid(it);
      if (mid == null) return null;
      return { mid, forza: srForza(it), natura: srNatura(it), zona: it?.zona ? String(it.zona) : undefined };
    })
    .filter((n): n is Raw => n !== null && n.forza >= 5)
    .filter(n => dir === 'LONG' ? (n.mid > entry && n.mid < tp2) : (n.mid < entry && n.mid > tp2));

  // Sort per prossimità all'entry
  candidates.sort((a, b) => dir === 'LONG' ? a.mid - b.mid : b.mid - a.mid);

  // Dedup entro 0.5%
  const deduped: Raw[] = [];
  for (const n of candidates) {
    const last = deduped[deduped.length - 1];
    if (last && Math.abs(n.mid - last.mid) / Math.max(last.mid, 0.0001) < 0.005) {
      if (n.forza > last.forza) deduped[deduped.length - 1] = n;
    } else {
      deduped.push(n);
    }
  }

  // Cap a 4 nodi intermedi (più forti se troppi)
  let intermediates = deduped;
  if (intermediates.length > 4) {
    intermediates = [...intermediates]
      .sort((a, b) => b.forza - a.forza)
      .slice(0, 4)
      .sort((a, b) => dir === 'LONG' ? a.mid - b.mid : b.mid - a.mid);
  }

  const nodes: Raw[] = [...intermediates];

  // Aggiungi TP1 esplicito se non già coperto
  if (tp1 != null) {
    const hasIt = nodes.some(n => Math.abs(n.mid - tp1) / Math.max(tp1, 0.0001) < 0.008);
    if (!hasIt) {
      const tp1Node: Raw = { mid: tp1, forza: 10, natura: 'TP1', isTp: true };
      const insertIdx = dir === 'LONG'
        ? nodes.findIndex(n => n.mid > tp1)
        : nodes.findIndex(n => n.mid < tp1);
      if (insertIdx === -1) nodes.push(tp1Node);
      else nodes.splice(insertIdx, 0, tp1Node);
    } else {
      const idx = nodes.findIndex(n => Math.abs(n.mid - tp1) / Math.max(tp1, 0.0001) < 0.008);
      nodes[idx] = { ...nodes[idx], natura: 'TP1', isTp: true };
    }
  }

  // Aggiungi sempre TP2 in fondo
  nodes.push({ mid: tp2, forza: 10, natura: 'TP2', isTp: true });

  const tp1Idx = tp1 != null ? nodes.findIndex(n => n.natura === 'TP1') : -1;
  const tp2Idx = nodes.length - 1;

  return nodes.map((n, i) => {
    let posizione: BiviPosizione;
    if (i === tp2Idx) posizione = 'tp2';
    else if (tp1Idx >= 0 && i === tp1Idx) posizione = 'tp1';
    else if (i === 0) posizione = 'primo';
    else if (i === tp2Idx - 1) posizione = 'ultimo_pre_tp2';
    else posizione = 'intermedio';

    return {
      id: `bivi-${i}-${n.mid.toFixed(8)}`,
      mid: n.mid,
      zona: n.zona,
      forza: n.forza,
      natura: n.natura,
      posizione,
      prevMid: i > 0 ? nodes[i - 1].mid : entry,
      nextMid: i < nodes.length - 1 ? nodes[i + 1].mid : undefined,
    };
  });
}

function getBiviActions(posizione: BiviPosizione, prevLabel: string): { rompe: string; rimbalza: string } {
  switch (posizione) {
    case 'primo':
      return {
        rompe: 'Consolida a breakeven',
        rimbalza: 'Considera riduzione — aspetta stabilizzazione',
      };
    case 'intermedio':
      return {
        rompe: `Livello di riferimento: ${prevLabel}`,
        rimbalza: 'Chiudi parzialmente, mantieni esposizione residua',
      };
    case 'tp1':
      return {
        rompe: 'Chiudi parzialmente, consolida',
        rimbalza: 'Chiudi esposizione',
      };
    case 'ultimo_pre_tp2':
      return {
        rompe: 'Mantieni — obiettivo punto critico 2',
        rimbalza: 'Chiudi esposizione residua',
      };
    case 'tp2':
      return {
        rompe: 'Chiudi tutto ✓',
        rimbalza: 'Chiudi tutto ✓',
      };
  }
}

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

export function StrategiaAIOverlay({ data, onClose, supporti = [], resistenze = [] }: Props) {
  const [maxDistanceBps, setMaxDistanceBps] = useState<number | null>(null);
  const [minScore, setMinScore] = useState<number>(0);
  const [minRR1, setMinRR1] = useState<number>(0);
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
  const [openBivi, setOpenBivi] = useState<Record<string, boolean>>({});
  // quale nodo è espanso all'interno di ogni sezione bivi (default: 0 = primo)
  const [openBiviNode, setOpenBiviNode] = useState<Record<string, number>>({});

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

          const cardId = `${s.tf}-${s.mode}-${s.source}-${s.entry}-${idx}`;
          const isOpen = !!openDetails[cardId];

          // Usiamo solo i prezzi, niente fallback su tp1/tp2 (che sono gli RR)
          const tp1 = (s as any).tp1_price ?? null;
          const tp2 = (s as any).tp2_price ?? null;
          const hasTp2 =
            typeof tp2 === "number" && isFinite(tp2) && tp2 !== 0;

          const nodes = buildBiviNodes(s, supporti, resistenze);
          const hasBivi = nodes.length > 0;
          const biviOpen = !!openBivi[cardId];
          const activeNodeIdx = openBiviNode[cardId] ?? 0;

          const hasDetails =
            !!s.explanation ||
            !!(s.conditions?.confirm && s.conditions.confirm.length) ||
            !!(s.conditions?.invalidate && s.conditions.invalidate.length) ||
            !!(s.tags && s.tags.length) ||
            !!s.note;

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
                  {dir === "LONG" ? "RIALZISTA" : "RIBASSISTA"}
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
                      {s.source === "rimbalzo"
                        ? "Punto di rimbalzo"
                        : s.source === "rottura"
                        ? "Punto di rottura"
                        : "Punto di ingresso"}
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
                      Punto critico 1 / 2
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

              {/* Sviluppo ipotetico del trade — nascosto */}
              {false && hasBivi && null}

              {false && hasBivi && biviOpen && (
                <div className="mt-3 space-y-1.5">
                  <div className="text-[9px] uppercase tracking-widest text-zinc-500 mb-2">
                    Mappa bivio · entry→obiettivo 2 ({nodes.length} nodi · forza ≥ 5)
                  </div>
                  {nodes.map((node, nIdx) => {
                    const isNodeOpen = activeNodeIdx === nIdx;
                    const actions = getBiviActions(node.posizione, formatPrice(node.prevMid));
                    const isTP = node.posizione === 'tp1' || node.posizione === 'tp2';
                    const nodeLabel =
                      node.posizione === 'tp2' ? 'Punto critico 2' :
                      node.posizione === 'tp1' ? 'Punto critico 1' :
                      node.posizione === 'primo' ? `Nodo ${nIdx + 1} — PIÙ VICINO` :
                      `Nodo ${nIdx + 1}`;

                    return (
                      <div
                        key={node.id}
                        className="rounded-lg overflow-hidden ring-1 ring-white/5"
                        style={{ background: 'var(--color-deep)' }}
                      >
                        {/* Header nodo */}
                        <button
                          type="button"
                          onClick={() =>
                            setOpenBiviNode(prev => ({ ...prev, [cardId]: isNodeOpen ? -1 : nIdx }))
                          }
                          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-[9px] font-semibold uppercase tracking-wide shrink-0 ${isTP ? 'text-amber-400/80' : 'text-zinc-400'}`}>
                              {nodeLabel}
                            </span>
                            <span className="font-mono text-[11px] text-white/90 shrink-0">
                              {formatPrice(node.mid)}
                            </span>
                            <span className="text-[10px] text-zinc-500 truncate">
                              {node.natura} · F{node.forza}
                            </span>
                          </div>
                          {isNodeOpen
                            ? <ChevronDown size={12} className="text-zinc-400 shrink-0" />
                            : <ChevronRight size={12} className="text-zinc-500 shrink-0" />
                          }
                        </button>

                        {/* Contenuto nodo espanso */}
                        {isNodeOpen && (
                          <div className="px-3 pb-3 space-y-2 text-[11px]">
                            {/* Rami ROMPE / RIMBALZA */}
                            {node.posizione === 'tp2' ? (
                              <div className="flex items-start gap-2">
                                <span className="text-amber-400/70 shrink-0 mt-0.5">→</span>
                                <span className="text-zinc-200">
                                  <span className="font-semibold text-amber-300/90">RAGGIUNTO</span>
                                  {' — '}{actions.rompe}
                                </span>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="flex items-start gap-2">
                                  <span className="text-emerald-400/70 shrink-0 mt-0.5 font-mono text-[10px]">↑</span>
                                  <span className="text-zinc-200">
                                    <span className="font-semibold text-emerald-300/90">ROMPE</span>
                                    {' — '}{actions.rompe}
                                    {node.nextMid != null && node.posizione !== 'ultimo_pre_tp2' && (
                                      <span className="ml-1 text-zinc-500">
                                        · prossimo bivio {formatPrice(node.nextMid)}
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <div className="flex items-start gap-2">
                                  <span className="text-red-400/70 shrink-0 mt-0.5 font-mono text-[10px]">↓</span>
                                  <span className="text-zinc-200">
                                    <span className="font-semibold text-red-300/90">RIMBALZA</span>
                                    {' — '}{actions.rimbalza}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Placeholder Tre Moire */}
                            {node.posizione !== 'tp2' && (
                              <div className="flex gap-3 text-[10px] text-zinc-600 border-t border-white/5 pt-2">
                                <span>Prob. rottura: <span className="text-zinc-500">[--]%</span></span>
                                <span>Prob. rimbalzo: <span className="text-zinc-500">[--]%</span></span>
                                <span className="text-zinc-700 italic">← Atropo</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Dettagli (spiegazione + conferme/invalidazioni + ciclica + tag/note) */}
              {hasDetails && isOpen && (
                <div className="mt-3 space-y-2 text-[11px] leading-tight">
                  {s.explanation && (
                    <div className="rounded-lg bg-white/5 p-2 text-[11px] text-zinc-100">
                      {sanitizeDir(s.explanation)}
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
                                    <span className="flex-1">{sanitizeDir(c.label)}</span>
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
                              Cosa invalida lo scenario
                            </div>
                            <ul className="mt-1 space-y-1">
                              {s.conditions?.invalidate?.map(
                                (c: StrategiaAICondition, i: number) => (
                                  <li
                                    key={c.id ?? i}
                                    className="flex items-start justify-between gap-2 text-[11px] text-red-100"
                                  >
                                    <span className="flex-1">{sanitizeDir(c.label)}</span>
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

                  {/* Finestra ciclica operativa */}
                  {s.ciclica_window && (
                    <div className="mt-2 rounded-lg bg-indigo-950/40 p-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-200">
                          Finestra ciclica
                        </div>

                        {s.ciclica_window.direction && (
                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-[9px] font-semibold tracking-wide",
                              s.ciclica_window.direction === "LONG"
                                ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/40"
                                : "bg-red-500/20 text-red-200 border border-red-400/40",
                            ].join(" ")}
                          >
                            Fascia ciclica{" "}
                            {s.ciclica_window.direction === "LONG" ? "rialzista" : "ribassista"}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 text-[10px] text-indigo-100">
                        {s.ciclica_window.label ? (
                          <span>{s.ciclica_window.label}</span>
                        ) : (
                          <span>
                            TF ciclo: {s.ciclica_window.tf_ciclo ?? "-"} · ingresso{" "}
                            {s.ciclica_window.entry_from_bars ?? "-"}–
                            {s.ciclica_window.entry_to_bars ?? "-"} barre · validità{" "}
                            {s.ciclica_window.exit_from_bars ?? "-"}–
                            {s.ciclica_window.exit_to_bars ?? "-"} barre
                          </span>
                        )}
                      </div>

                      {/* Countdown + giudizio timing */}
                      {(s.ciclica_window.countdown_bars != null ||
                        s.ciclica_window.timing_grade) && (
                          <div className="mt-1 text-[10px] text-indigo-200/80">
                            {s.ciclica_window.countdown_bars != null && (
                              <span>
                                ⏳ Tempo residuo finestra ≈{" "}
                                {s.ciclica_window.countdown_bars} barre
                              </span>
                            )}
                            {s.ciclica_window.timing_grade && (
                              <span>
                                {" "}
                                · Timing:{" "}
                                {s.ciclica_window.timing_grade === "sweetspot"
                                  ? "sweetspot"
                                  : s.ciclica_window.timing_grade === "tardi"
                                    ? "in ritardo"
                                    : s.ciclica_window.timing_grade === "molto_lontano"
                                      ? "molto anticipato"
                                      : "neutro"}
                              </span>
                            )}
                          </div>
                        )}
                    </div>
                  )}
                  {/* Pivot ciclico previsto */}
                  {s.ciclica_pivot && (
                    <div className="mt-2 rounded-lg bg-fuchsia-950/40 p-2">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-fuchsia-200">
                        Pivot ciclico
                      </div>
                      <div className="mt-1 text-[10px] text-fuchsia-100">
                        {s.ciclica_pivot.timeframe && s.ciclica_pivot.window ? (
                          <span>
                            Pivot atteso su {s.ciclica_pivot.timeframe} fra{" "}
                            {s.ciclica_pivot.window}
                            {s.ciclica_pivot.probability != null &&
                              ` (p≈${Math.round(
                                s.ciclica_pivot.probability * 100
                              )}%)`}
                          </span>
                        ) : (
                          <span>Pivot ciclico rilevante in avvicinamento.</span>
                        )}
                      </div>
                      {s.ciclica_pivot.cluster_macro && (
                        <div className="mt-1 text-[10px] text-fuchsia-100/80">
                          Nodo macro {s.ciclica_pivot.cluster_macro.timeframe}{" "}
                          ({s.ciclica_pivot.cluster_macro.window_min ?? "-"}–
                          {s.ciclica_pivot.cluster_macro.window_max ?? "-"} barre):{" "}
                          {s.ciclica_pivot.cluster_macro.descrizione ??
                            s.ciclica_pivot.cluster_macro.impatto}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tag + note */}
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
