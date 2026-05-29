"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";

type LookbackMode = "candles" | "minutes";

type PatternKey =
  | "morning_star"
  | "evening_star"
  | "hammer"
  | "shooting_star"
  | "bullish_engulfing"
  | "bearish_engulfing"
  | "piercing_line"
  | "dark_cloud_cover"
  | "ema_cross_9_21"
  | "ema_cross_9_50"
  | "ema_alignment_trend"
  | "bb_squeeze"
  | "rsi_divergence"
  | "triple_bottom"
  | "triple_top";

type OrioneSignalStatus = "POTENZIALE" | "CONFERMATO" | "NESSUNO";

// valore speciale SOLO per la UI
const ALL_OPTION_VALUE = "__ALL__";
type PatternConfigKeyUI = PatternKey | "" | typeof ALL_OPTION_VALUE;

interface PatternConfig {
  id: string;
  key: PatternConfigKeyUI;
  required: boolean;
}

const AVAILABLE_TFS = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "12h",
  "1d",
  "1w",
];

const PATTERN_OPTIONS: { value: PatternKey; label: string }[] = [
  { value: "morning_star", label: "Morning Star (inversione rialzista)" },
  { value: "evening_star", label: "Evening Star (inversione ribassista)" },
  { value: "hammer", label: "Hammer / Hammer inverso" },
  { value: "shooting_star", label: "Shooting Star" },
  { value: "bullish_engulfing", label: "Bullish Engulfing" },
  { value: "bearish_engulfing", label: "Bearish Engulfing" },
  { value: "piercing_line", label: "Piercing Line" },
  { value: "dark_cloud_cover", label: "Dark Cloud Cover" },
  { value: "ema_cross_9_21", label: "Incrocio EMA 9 / 21" },
  { value: "ema_cross_9_50", label: "Incrocio EMA 9 / 50" },
  { value: "ema_alignment_trend", label: "Allineamento EMA (trend pulito)" },
  { value: "bb_squeeze", label: "Bollinger Bands squeeze" },
  { value: "rsi_divergence", label: "Divergenza RSI" },
  { value: "triple_bottom", label: "Triple Bottom" },
  { value: "triple_top", label: "Triple Top" },
];

// Mappa la direzione del pattern in una freccia visiva
function getDirectionArrow(direction?: string): string {
  if (!direction) return "·";
  const dir = direction.toUpperCase();
  if (dir === "BULL") return "↑";
  if (dir === "BEAR") return "↓";
  return "·"; // per NEUTRAL o altri casi
}

// PRESET ---------------------------------------------------------

// Nota: usiamo PatternConfigKeyUI così possiamo includere anche ALL_OPTION_VALUE
const PRESET_INVERSIONE: PatternConfigKeyUI[] = [
  "morning_star",
  "evening_star",
  "hammer",
  "shooting_star",
  "bullish_engulfing",
  "bearish_engulfing",
  "piercing_line",
  "dark_cloud_cover",
  "rsi_divergence",
];

const PRESET_TREND: PatternConfigKeyUI[] = [
  "ema_cross_9_21",
  "ema_cross_9_50",
  "ema_alignment_trend",
  "bb_squeeze",
];

// Preset completo: usa direttamente "Tutti i pattern principali"
const PRESET_COMPLETO: PatternConfigKeyUI[] = [ALL_OPTION_VALUE];

interface OrioneConfigPayload {
  coins: string[];
  timeframes: string[];
  patterns: { key: PatternKey; required: boolean }[];
  lookback: {
    mode: LookbackMode;
    candles?: number;
    minutes?: number;
  };
  scanIntervalMinutes: number;
  onlyCombo: boolean;
}

interface OrionePatternHit {
  key: PatternKey;
  status: OrioneSignalStatus;
  strength: number;
  extra: Record<string, any>;
}

interface OrioneSetup {
  coin: string;
  timeframe: string;
  status: OrioneSignalStatus;
  patterns_hit: OrionePatternHit[];
  all_required_ok: boolean;
  candle_index: number;
  timestamp?: number | null;
  price?: number | null;
  meta: Record<string, any>;
}

interface OrioneScanResponse {
  request: OrioneConfigPayload;
  setups: OrioneSetup[];
}

interface OrionePanelProps {
  onConfigure?: (payload: OrioneConfigPayload) => void;
}

const formatTimestamp = (ts?: number | null): string => {
  if (!ts || Number.isNaN(ts)) return "—";

  const d = new Date(ts);

  try {
    return new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    // fallback nel caso il browser non supporti la timeZone
    return d.toLocaleString("it-IT");
  }
};

const OrionePanel: React.FC<OrionePanelProps> = ({ onConfigure }) => {
  const [coinsInput, setCoinsInput] = useState<string>("BTC, ETH, SOL");
  const [selectedTfs, setSelectedTfs] = useState<string[]>(["1m", "3m", "5m"]);
  const [patterns, setPatterns] = useState<PatternConfig[]>([
    { id: "pattern-1", key: "" as PatternConfigKeyUI, required: true },
  ]);

  const [lookbackMode, setLookbackMode] = useState<LookbackMode>("candles");
  const [lookbackCandles, setLookbackCandles] = useState<number>(5);
  const [lookbackMinutes, setLookbackMinutes] = useState<number>(45);
  const [onlyCombo, setOnlyCombo] = useState(false);
  const [scanIntervalMinutes, setScanIntervalMinutes] = useState<number>(3);

  const [autoLoop, setAutoLoop] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OrioneSetup[] | null>(null);
  const [debugResponse, setDebugResponse] = useState<OrioneScanResponse | null>(null);

  const hasAtLeastOnePattern = useMemo(
    () => patterns.some((p) => p.key !== ""),
    [patterns]
  );

  const toggleTf = (tf: string) => {
    setSelectedTfs((prev) =>
      prev.includes(tf) ? prev.filter((x) => x !== tf) : [...prev, tf]
    );
  };

  const addPatternRow = () => {
    setPatterns((prev) => [
      ...prev,
      {
        id: `pattern-${Date.now()}-${prev.length}`,
        key: "" as PatternConfigKeyUI,
        required: false,
      },
    ]);
  };

  const updatePatternKey = (id: string, key: PatternConfigKeyUI) => {
    setPatterns((prev) =>
      prev.map((p) => (p.id === id ? { ...p, key } : p))
    );
  };

  const updatePatternRequired = (id: string, required: boolean) => {
    setPatterns((prev) =>
      prev.map((p) => (p.id === id ? { ...p, required } : p))
    );
  };

  const removePatternRow = (id: string) => {
    setPatterns((prev) => prev.filter((p) => p.id !== id));
  };

  // Applica preset ------------------------------------------------
  const applyPreset = (keys: PatternConfigKeyUI[], required: boolean) => {
    const uniqueKeys = Array.from(new Set(keys));
    const rows: PatternConfig[] = uniqueKeys.map((k, idx) => ({
      id: `preset-${k || "vuoto"}-${idx}`,
      key: k,
      required,
    }));
    setPatterns(
      rows.length
        ? rows
        : [{ id: "pattern-1", key: "" as PatternConfigKeyUI, required: true }]
    );
  };

  const buildPayload = (): OrioneConfigPayload => {
    const coins = coinsInput
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);

    // Merge pattern rows, gestendo "Tutti i pattern"
    const merged = new Map<PatternKey, boolean>(); // key -> required

    for (const row of patterns) {
      if (!row.key) continue;

      if (row.key === ALL_OPTION_VALUE) {
        // espandi in tutti i pattern principali
        for (const opt of PATTERN_OPTIONS) {
          const prevReq = merged.get(opt.value) ?? false;
          merged.set(opt.value, prevReq || row.required);
        }
      } else {
        const key = row.key as PatternKey;
        const prevReq = merged.get(key) ?? false;
        merged.set(key, prevReq || row.required);
      }
    }

    const finalPatterns = Array.from(merged.entries()).map(
      ([key, required]) => ({
        key,
        required,
      })
    );

    return {
      coins,
      timeframes: selectedTfs.sort(),
      patterns: finalPatterns,
      lookback:
        lookbackMode === "candles"
          ? { mode: "candles", candles: lookbackCandles || 1 }
          : { mode: "minutes", minutes: lookbackMinutes || 1 },
      scanIntervalMinutes: scanIntervalMinutes || 1,
      onlyCombo,
    };
  };

  const handleSubmit = async () => {
    const payload = buildPayload();

    if (payload.patterns.length === 0) {
      setError("Seleziona almeno un pattern.");
      return;
    }

    if (onConfigure) {
      onConfigure(payload);
    }

    try {
      setLoading(true);
      setError(null);
      setResults(null);
      setDebugResponse(null);

      const res = await fetch("/api/orione/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const errJson = await res.json();
          throw new Error(
            (errJson as any).detail ||
            JSON.stringify(errJson).slice(0, 200)
          );
        } else {
          const text = await res.text();
          throw new Error(
            `HTTP ${res.status}: ${text.slice(0, 200)}...`
          );
        }
      }

      const data: OrioneScanResponse = await res.json();
      setDebugResponse(data);

      const setups: OrioneSetup[] = (data.setups ?? []) as OrioneSetup[];
      setResults(setups);
    } catch (err: any) {
      console.error("[Orione] errore scan:", err);
      setError(
        err?.message ?? "Errore imprevisto durante la scansione di Orione."
      );
      setResults(null);
      setDebugResponse(null);
    } finally {
      setLoading(false);
    }
  };

  // Loop continuo mentre la pagina è aperta ------------------------
  useEffect(() => {
    if (!autoLoop) return;

    const minutes = Math.max(scanIntervalMinutes || 1, 1);
    const ms = minutes * 60 * 1000;

    // primo run immediato quando attivi il loop
    handleSubmit();

    const id = setInterval(() => {
      handleSubmit();
    }, ms);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoop, scanIntervalMinutes]);

  const canRun =
    coinsInput.trim().length > 0 &&
    selectedTfs.length > 0 &&
    hasAtLeastOnePattern;

  const glassInput = "w-full rounded-lg border border-white/[0.10] bg-white/[0.04] text-sm p-2 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/30 focus:border-cyan-400/40 resize-none";
  const glassInputSm = "w-24 rounded-lg border border-white/[0.10] bg-white/[0.04] text-xs p-1.5 text-white focus:outline-none focus:ring-1 focus:ring-cyan-400/30";

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 text-white">
      {/* ── Main card ──────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border border-white/[0.08] space-y-6 p-6"
        style={{
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-cyan-400/60 text-lg">✦</span>
            <span className="font-semibold text-white/90">Orione · Scanner di Pattern</span>
          </div>
          <span
            className="text-[11px] px-2.5 py-0.5 rounded-full border font-mono uppercase tracking-wider"
            style={{
              borderColor: 'rgba(6,182,212,0.35)',
              color: 'rgba(103,232,249,0.8)',
              background: 'rgba(6,182,212,0.07)',
            }}
          >
            Scanner
          </span>
        </div>

        {/* COIN */}
        <section className="space-y-2">
          <label className="text-xs text-white/50 uppercase tracking-wider">Universe · Coin da scansionare</label>
          <textarea
            className={glassInput}
            rows={2}
            placeholder="BTC, ETH, SOL, AVAX..."
            value={coinsInput}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCoinsInput(e.target.value)}
          />
          <p className="text-xs text-white/35">Simboli separati da virgola. Orione li scansionerà ogni N minuti.</p>
        </section>

        {/* TIMEFRAME */}
        <section className="space-y-2">
          <label className="text-xs text-white/50 uppercase tracking-wider">Timeframe</label>
          <div className="flex flex-wrap gap-1.5">
            {AVAILABLE_TFS.map((tf) => {
              const active = selectedTfs.includes(tf);
              return (
                <button
                  key={tf}
                  type="button"
                  className={['tf-pill', active ? 'tf-pill-active' : ''].join(' ')}
                  onClick={() => toggleTf(tf)}
                >
                  {tf.toUpperCase()}
                </button>
              );
            })}
          </div>
        </section>

        {/* PRESET + PATTERN */}
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <label className="text-xs text-white/50 uppercase tracking-wider">Pattern / Condizioni</label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Inversione', action: () => applyPreset(PRESET_INVERSIONE, false), color: 'rgba(251,191,36,0.6)' },
                { label: 'EMA / Trend', action: () => applyPreset(PRESET_TREND, false), color: 'rgba(6,182,212,0.6)' },
                { label: 'Completo', action: () => applyPreset(PRESET_COMPLETO, false), color: 'rgba(6,182,212,0.6)' },
              ].map(({ label, action, color }) => (
                <button
                  key={label}
                  type="button"
                  onClick={action}
                  className="text-xs px-3 py-1 rounded-lg border transition-all hover:bg-white/[0.05]"
                  style={{ borderColor: color, color }}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={addPatternRow}
                className="text-xs px-3 py-1 rounded-lg border border-cyan-400/40 text-cyan-400/80 transition-all hover:bg-cyan-400/[0.08] flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Aggiungi
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {patterns.map((p, idx) => (
              <div
                key={p.id}
                className="flex flex-col sm:flex-row gap-2 sm:items-center rounded-xl p-3 border border-white/[0.06] bg-white/[0.02]"
              >
                <div className="flex-1">
                  <label className="text-[11px] text-white/40 block mb-1">Pattern #{idx + 1}</label>
                  <select
                    className="w-full rounded-lg border border-white/[0.10] bg-[#0a0e1a] text-xs p-2 text-white focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
                    value={p.key || ""}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                      updatePatternKey(p.id, e.target.value as PatternConfigKeyUI)
                    }
                  >
                    <option value="">Seleziona un pattern</option>
                    <option value={ALL_OPTION_VALUE}>Tutti i pattern principali</option>
                    {PATTERN_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-3 min-w-[190px]">
                  <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="accent-cyan-400"
                      checked={p.required}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updatePatternRequired(p.id, e.target.checked)
                      }
                    />
                    Obbligatorio
                  </label>

                  {patterns.length > 1 && (
                    <button
                      type="button"
                      className="text-red-400/70 hover:text-red-300 hover:bg-red-500/10 rounded p-1 transition-colors"
                      onClick={() => removePatternRow(p.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="orione-only-combo"
                    type="checkbox"
                    className="accent-cyan-400 h-3.5 w-3.5"
                    checked={onlyCombo}
                    onChange={(e) => setOnlyCombo(e.target.checked)}
                  />
                  <label htmlFor="orione-only-combo" className="text-xs text-white/50 select-none cursor-pointer">
                    Solo confluenza (COMBO)
                  </label>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-white/30">
            Flag <span className="text-white/50">Obbligatorio</span> = il pattern deve essere presente.{' '}
            <span className="text-white/50">Tutti i pattern</span> usa l&apos;intero set principale.
          </p>
        </section>

        {/* LOOKBACK + FREQUENZA */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs text-white/50 uppercase tracking-wider">Finestra di lookback</label>
            <div className="flex gap-2">
              {(['candles', 'minutes'] as LookbackMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={['tf-pill text-xs', lookbackMode === mode ? 'tf-pill-active' : ''].join(' ')}
                  onClick={() => setLookbackMode(mode)}
                >
                  {mode === 'candles' ? 'Per candele' : 'Per minuti'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min={1}
                className={glassInputSm}
                value={lookbackMode === 'candles' ? lookbackCandles : lookbackMinutes}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const v = Number(e.target.value) || 1;
                  lookbackMode === 'candles' ? setLookbackCandles(v) : setLookbackMinutes(v);
                }}
              />
              <span className="text-xs text-white/40">
                {lookbackMode === 'candles' ? 'candele' : 'minuti'}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-white/50 uppercase tracking-wider">Frequenza scansione</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                className={glassInputSm}
                value={scanIntervalMinutes}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setScanIntervalMinutes(Number(e.target.value) || 1)
                }
              />
              <span className="text-xs text-white/40">minuti</span>
            </div>
            <label className="flex items-center gap-2 text-xs text-white/50 mt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-cyan-400"
                checked={autoLoop}
                onChange={(e) => setAutoLoop(e.target.checked)}
              />
              Ciclo continuo (auto-refresh)
            </label>
          </div>
        </section>

        {/* ACTION BAR */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-white/[0.06]">
          <div className="text-xs">
            <span className="text-white/40">Stato: </span>
            {canRun
              ? <span className="text-cyan-300">pronto a partire</span>
              : <span className="text-red-400/80">mancano coin, TF o almeno un pattern</span>
            }
          </div>

          <button
            type="button"
            disabled={!canRun || loading}
            onClick={handleSubmit}
            className="flex items-center gap-2 rounded-xl px-6 py-2 text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, rgba(6,182,212,0.22) 0%, rgba(99,102,241,0.16) 100%)',
              border: '1px solid rgba(6,182,212,0.38)',
              boxShadow: '0 0 16px rgba(6,182,212,0.14)',
              color: '#67e8f9',
            }}
          >
            <span className="text-xs">{loading ? '⟳' : '▶'}</span>
            {loading ? 'Analisi in corso...' : 'Avvia scan'}
          </button>
        </div>

        {/* RISULTATI */}
        <section className="space-y-2">
          {error && (
            <div className="text-xs text-red-300 bg-red-900/20 border border-red-600/30 rounded-xl p-3">
              {error}
            </div>
          )}

          {results && !error && (
            <div className="text-xs space-y-3">
              {results.length === 0 ? (
                <div className="text-white/40 py-4 text-center">Nessun setup trovato con i criteri selezionati.</div>
              ) : (
                <>
                  <div className="text-white/50">
                    Trovati <span className="text-cyan-300 font-semibold">{results.length}</span> setup.
                  </div>
                  <div className="max-h-72 overflow-auto pr-1">
                    {(() => {
                      const up: OrioneSetup[] = [];
                      const down: OrioneSetup[] = [];
                      const neutral: OrioneSetup[] = [];

                      results.forEach((s: OrioneSetup) => {
                        const directions = s.patterns_hit.map((p: OrionePatternHit) =>
                          ((p.extra?.direction as string | undefined) ?? "").toUpperCase()
                        );
                        if (directions.includes("BULL")) up.push(s);
                        else if (directions.includes("BEAR")) down.push(s);
                        else neutral.push(s);
                      });

                      const renderBlock = (title: string, arr: OrioneSetup[], accent: string) => (
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-semibold text-white/60 mb-2">{title}</div>
                          {arr.length === 0 && (
                            <div className="text-white/25 text-xs py-2">—</div>
                          )}
                          {arr.map((s: OrioneSetup, idx: number) => (
                            <div
                              key={`${s.coin}-${s.timeframe}-${idx}`}
                              className="rounded-xl px-3 py-2 border border-white/[0.06] bg-white/[0.02]"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-semibold text-white/90 text-xs">
                                  {s.coin} · {s.timeframe.toUpperCase()}
                                </span>
                                <span className="text-[10px] uppercase tracking-wide font-medium" style={{ color: accent }}>
                                  {s.status}
                                </span>
                              </div>
                              <div className="text-[10px] text-white/40 mt-0.5">
                                {formatTimestamp(s.timestamp)} · #{s.candle_index} · {s.price != null ? s.price.toFixed(4) : '—'}
                              </div>
                              <div className="text-[10px] text-white/50 mt-0.5 flex flex-wrap gap-x-2">
                                {s.patterns_hit.map((p: OrionePatternHit, i: number) => {
                                  const extra = p.extra || {};
                                  const dir = (extra.direction as string | undefined) ?? "";
                                  const arrow = getDirectionArrow(dir);
                                  const name = (extra.name as string | undefined) ?? p.key;
                                  return (
                                    <span key={`${p.key}-${i}`} className="inline-flex items-center gap-0.5">
                                      <span className="font-bold">{arrow}</span>
                                      <span>{name}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );

                      return (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {renderBlock('↑ UP', up, '#86efac')}
                          {renderBlock('↓ DOWN', down, '#fca5a5')}
                          {renderBlock('· NEUTRAL', neutral, '#94a3b8')}
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          )}

          {debugResponse && (
            <details className="text-[10px] text-white/30">
              <summary className="cursor-pointer hover:text-white/50 transition-colors">Debug JSON Orione</summary>
              <pre className="mt-2 p-3 rounded-xl bg-black/40 border border-white/[0.06] overflow-auto max-h-64 text-white/40">
                {JSON.stringify(debugResponse, null, 2)}
              </pre>
            </details>
          )}
        </section>
      </div>
    </div>
  );
};

export default OrionePanel;