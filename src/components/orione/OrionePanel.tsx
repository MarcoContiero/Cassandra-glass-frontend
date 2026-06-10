"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  if (!direction) return "\xb7";
  const dir = direction.toUpperCase();
  if (dir === "BULL") return "↑";
  if (dir === "BEAR") return "↓";
  return "\xb7"; // per NEUTRAL o altri casi
}

// PRESET ---------------------------------------------------------

// Nota: usiamo PatternConfigKeyUI cosi' possiamo includere anche ALL_OPTION_VALUE
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

  // Loop continuo mentre la pagina e' aperta ------------------------
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

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4" style={{ color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>

      {/* ── Main card ──────────────────────────────────────────────── */}
      <div className="cassandra-card cassandra-card-corners space-y-0">

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-3">
            <span className="section-tag">Orione</span>
            <span
              className="font-mono text-[13px] tracking-[0.15em] uppercase"
              style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}
            >
              Scanner di Pattern
            </span>
          </div>
          <span
            className="font-mono text-[9px] tracking-[0.4em] uppercase px-3 py-1 border"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-cyan)',
              background: 'rgba(10,191,188,0.05)',
            }}
          >
            Real-time
          </span>
        </div>

        <div className="px-5 py-5 space-y-6">

          {/* COIN */}
          <section className="space-y-2">
            <label className="section-tag block">Universe &middot; Coin da scansionare</label>
            <textarea
              className="w-full px-3 py-2 text-[11px] resize-none focus:outline-none focus:border-[var(--color-border-focus)]"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
                fontFamily: 'var(--font-mono)',
                borderRadius: 0,
              }}
              rows={2}
              placeholder="BTC, ETH, SOL, AVAX..."
              value={coinsInput}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCoinsInput(e.target.value)}
            />
            <p className="font-mono text-[10px] tracking-[0.1em]" style={{ color: 'var(--color-text-dim)' }}>
              Simboli separati da virgola. Orione li scansionera' ogni N minuti.
            </p>
          </section>

          {/* TIMEFRAME */}
          <section className="space-y-2">
            <label className="section-tag block">Timeframe</label>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_TFS.map((tf) => {
                const active = selectedTfs.includes(tf);
                return (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => toggleTf(tf)}
                    className="font-mono text-[9px] tracking-[0.25em] uppercase px-3 py-1.5 border transition-all"
                    style={active ? {
                      background: 'rgba(201,168,76,0.08)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-gold)',
                      borderRadius: 0,
                    } : {
                      background: 'transparent',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-dim)',
                      borderRadius: 0,
                    }}
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
              <label className="section-tag">Pattern / Condizioni</label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Inversione', action: () => applyPreset(PRESET_INVERSIONE, false) },
                  { label: 'EMA / Trend', action: () => applyPreset(PRESET_TREND, false) },
                  { label: 'Completo', action: () => applyPreset(PRESET_COMPLETO, false) },
                ].map(({ label, action }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={action}
                    className="font-mono text-[9px] tracking-[0.25em] uppercase px-3 py-1.5 border transition-all hover:text-[var(--color-gold)] hover:border-[var(--color-gold-dim)]"
                    style={{
                      background: 'transparent',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-dim)',
                      borderRadius: 0,
                    }}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={addPatternRow}
                  className="font-mono text-[9px] tracking-[0.25em] uppercase px-3 py-1.5 border transition-colors flex items-center gap-1.5"
                  style={{
                    background: 'var(--color-cyan)',
                    borderColor: 'var(--color-cyan)',
                    color: 'var(--color-void)',
                    borderRadius: 0,
                  }}
                >
                  <Plus className="w-3 h-3" />
                  Aggiungi
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {patterns.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex flex-col sm:flex-row gap-2 sm:items-center p-3"
                  style={{
                    border: '1px solid var(--color-border-dim)',
                    background: 'rgba(201,168,76,0.02)',
                  }}
                >
                  <div className="flex-1">
                    <label
                      className="font-mono text-[9px] tracking-[0.3em] uppercase block mb-1.5"
                      style={{ color: 'var(--color-text-dim)' }}
                    >
                      Pattern #{idx + 1}
                    </label>
                    <select
                      className="w-full px-3 py-1.5 font-mono text-[11px] focus:outline-none"
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                        fontFamily: 'var(--font-mono)',
                        borderRadius: 0,
                      }}
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
                    <label
                      className="flex items-center gap-2 font-mono text-[10px] tracking-[0.1em] cursor-pointer select-none"
                      style={{ color: 'var(--color-text-dim)' }}
                    >
                      <input
                        type="checkbox"
                        className="accent-[var(--color-cyan)]"
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
                        className="p-1 transition-colors hover:bg-red-500/10"
                        style={{ color: 'rgba(248,113,113,0.7)', borderRadius: 0 }}
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
                      className="accent-[var(--color-cyan)] h-3.5 w-3.5"
                      checked={onlyCombo}
                      onChange={(e) => setOnlyCombo(e.target.checked)}
                    />
                    <label
                      htmlFor="orione-only-combo"
                      className="font-mono text-[10px] tracking-[0.1em] cursor-pointer select-none"
                      style={{ color: 'var(--color-text-dim)' }}
                    >
                      Solo confluenza (COMBO)
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <p className="font-mono text-[10px] tracking-[0.1em]" style={{ color: 'var(--color-text-dim)' }}>
              Flag{' '}
              <span style={{ color: 'var(--color-text)' }}>Obbligatorio</span>
              {' '}= il pattern deve essere presente.{' '}
              <span style={{ color: 'var(--color-text)' }}>Tutti i pattern</span>
              {' '}usa l&apos;intero set principale.
            </p>
          </section>

          {/* LOOKBACK + FREQUENZA */}
          <section className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="section-tag block">Finestra di lookback</label>
              <div className="flex gap-2">
                {(['candles', 'minutes'] as LookbackMode[]).map((mode) => {
                  const active = lookbackMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setLookbackMode(mode)}
                      className="font-mono text-[9px] tracking-[0.25em] uppercase px-3 py-1.5 border transition-all"
                      style={active ? {
                        background: 'rgba(201,168,76,0.08)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-gold)',
                        borderRadius: 0,
                      } : {
                        background: 'transparent',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text-dim)',
                        borderRadius: 0,
                      }}
                    >
                      {mode === 'candles' ? 'Per candele' : 'Per minuti'}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  min={1}
                  className="w-24 px-3 py-1.5 font-mono text-[11px] focus:outline-none"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    fontFamily: 'var(--font-mono)',
                    borderRadius: 0,
                  }}
                  value={lookbackMode === 'candles' ? lookbackCandles : lookbackMinutes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const v = Number(e.target.value) || 1;
                    lookbackMode === 'candles' ? setLookbackCandles(v) : setLookbackMinutes(v);
                  }}
                />
                <span className="font-mono text-[10px] tracking-[0.1em]" style={{ color: 'var(--color-text-dim)' }}>
                  {lookbackMode === 'candles' ? 'candele' : 'minuti'}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="section-tag block">Frequenza scansione</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  className="w-24 px-3 py-1.5 font-mono text-[11px] focus:outline-none"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    fontFamily: 'var(--font-mono)',
                    borderRadius: 0,
                  }}
                  value={scanIntervalMinutes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setScanIntervalMinutes(Number(e.target.value) || 1)
                  }
                />
                <span className="font-mono text-[10px] tracking-[0.1em]" style={{ color: 'var(--color-text-dim)' }}>
                  minuti
                </span>
              </div>
              <label
                className="flex items-center gap-2 font-mono text-[10px] tracking-[0.1em] mt-1 cursor-pointer select-none"
                style={{ color: 'var(--color-text-dim)' }}
              >
                <input
                  type="checkbox"
                  className="accent-[var(--color-cyan)]"
                  checked={autoLoop}
                  onChange={(e) => setAutoLoop(e.target.checked)}
                />
                Ciclo continuo (auto-refresh)
              </label>
            </div>
          </section>

          {/* ACTION BAR */}
          <div
            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4"
            style={{ borderTop: '1px solid var(--color-border)' }}
          >
            <div className="font-mono text-[10px] tracking-[0.1em]">
              <span style={{ color: 'var(--color-text-dim)' }}>Stato: </span>
              {canRun
                ? <span style={{ color: 'var(--color-cyan)' }}>pronto a partire</span>
                : <span style={{ color: 'rgba(248,113,113,0.8)' }}>mancano coin, TF o almeno un pattern</span>
              }
            </div>

            <button
              type="button"
              disabled={!canRun || loading}
              onClick={handleSubmit}
              className="flex items-center gap-2 font-mono text-[10px] tracking-[0.25em] uppercase px-6 py-2 border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'var(--color-cyan)',
                borderColor: 'var(--color-cyan)',
                color: 'var(--color-void)',
                borderRadius: 0,
              }}
            >
              <span>{loading ? '⟳' : '▶'}</span>
              {loading ? 'Analisi in corso...' : 'Avvia scan'}
            </button>
          </div>

          {/* RISULTATI */}
          <section className="space-y-2">
            {error && (
              <div
                className="font-mono text-[10px] tracking-[0.1em] p-3"
                style={{
                  color: 'rgba(248,113,113,0.9)',
                  background: 'rgba(153,27,27,0.15)',
                  border: '1px solid rgba(248,113,113,0.25)',
                }}
              >
                {error}
              </div>
            )}

            {loading && !results && (
              <div className="space-y-2 pt-2">
                <div className="shimmer h-8 w-full" />
                <div className="shimmer h-8 w-4/5" />
                <div className="shimmer h-8 w-3/5" />
              </div>
            )}

            {results && !error && (
              <div className="space-y-3">
                {results.length === 0 ? (
                  <div
                    className="font-mono text-[11px] tracking-[0.2em] text-center py-12"
                    style={{ color: 'var(--color-text-dim)' }}
                  >
                    NESSUN SETUP TROVATO
                  </div>
                ) : (
                  <>
                    <div
                      className="font-mono text-[10px] tracking-[0.15em] pt-1"
                      style={{ color: 'var(--color-text-dim)' }}
                    >
                      Trovati{' '}
                      <span style={{ color: 'var(--color-cyan)', fontWeight: 600 }}>
                        {results.length}
                      </span>
                      {' '}setup.
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

                        const renderBlock = (title: string, arr: OrioneSetup[], colorVar: string) => (
                          <div className="space-y-1.5">
                            <div
                              className="font-mono text-[9px] tracking-[0.4em] uppercase mb-2"
                              style={{ color: 'var(--color-text-dim)' }}
                            >
                              {title}
                            </div>
                            {arr.length === 0 && (
                              <div
                                className="font-mono text-[10px] py-2"
                                style={{ color: 'var(--color-text-faint)' }}
                              >
                                &mdash;
                              </div>
                            )}
                            {arr.map((s: OrioneSetup, idx: number) => (
                              <div
                                key={`${s.coin}-${s.timeframe}-${idx}`}
                                className="px-3 py-2 transition-colors"
                                style={{
                                  borderBottom: '1px solid var(--color-text-faint)',
                                  cursor: 'default',
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLDivElement).style.background = 'rgba(201,168,76,0.02)';
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                                }}
                              >
                                {/* Row: timestamp | coin | TF | pattern | dir | score */}
                                <div className="flex items-center gap-3 flex-wrap">
                                  {/* timestamp */}
                                  <span
                                    className="font-mono text-[9px] tracking-[0.1em] tabular-nums"
                                    style={{ color: 'var(--color-text-dim)', minWidth: '120px' }}
                                  >
                                    {formatTimestamp(s.timestamp)}
                                  </span>
                                  {/* coin */}
                                  <span
                                    className="font-mono text-[13px]"
                                    style={{ color: 'var(--color-gold)', fontFamily: 'var(--font-display)' }}
                                  >
                                    {s.coin}
                                  </span>
                                  {/* TF badge */}
                                  <span
                                    className="font-mono text-[9px] border px-2 py-0.5"
                                    style={{
                                      borderColor: 'var(--color-border-dim)',
                                      color: 'var(--color-text-dim)',
                                    }}
                                  >
                                    {s.timeframe.toUpperCase()}
                                  </span>
                                  {/* patterns */}
                                  <span className="font-mono text-[10px] flex flex-wrap gap-x-2" style={{ color: 'var(--color-text-dim)', flex: 1 }}>
                                    {s.patterns_hit.map((p: OrionePatternHit, i: number) => {
                                      const extra = p.extra || {};
                                      const dir = (extra.direction as string | undefined) ?? "";
                                      const arrow = getDirectionArrow(dir);
                                      const name = (extra.name as string | undefined) ?? p.key;
                                      return (
                                        <span key={`${p.key}-${i}`} className="inline-flex items-center gap-0.5">
                                          <span style={{ fontWeight: 700 }}>{arrow}</span>
                                          <span>{name}</span>
                                        </span>
                                      );
                                    })}
                                  </span>
                                  {/* dir badge */}
                                  <span
                                    className="font-mono text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 border"
                                    style={{
                                      color: colorVar === 'long' ? 'var(--color-long-bright)' : colorVar === 'short' ? 'var(--color-short-bright)' : 'var(--color-text-dim)',
                                      borderColor: colorVar === 'long' ? 'rgba(61,168,102,0.25)' : colorVar === 'short' ? 'rgba(168,61,61,0.25)' : 'var(--color-border-dim)',
                                      background: colorVar === 'long' ? 'rgba(61,168,102,0.06)' : colorVar === 'short' ? 'rgba(168,61,61,0.06)' : 'transparent',
                                    }}
                                  >
                                    {s.status}
                                  </span>
                                  {/* score */}
                                  <span
                                    className="font-mono text-[11px] tabular-nums"
                                    style={{ color: 'var(--color-gold)' }}
                                  >
                                    #{s.candle_index}
                                    {s.price != null ? ` · ${s.price.toFixed(4)}` : ''}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        );

                        return (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {renderBlock('↑ UP', up, 'long')}
                            {renderBlock('↓ DOWN', down, 'short')}
                            {renderBlock('\xb7 NEUTRAL', neutral, 'neutral')}
                          </div>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>
            )}

            {debugResponse && (
              <details className="font-mono text-[10px]" style={{ color: 'var(--color-text-dim)' }}>
                <summary
                  className="cursor-pointer transition-colors"
                  style={{ color: 'var(--color-text-dim)' }}
                >
                  Debug JSON Orione
                </summary>
                <pre
                  className="mt-2 p-3 overflow-auto max-h-64"
                  style={{
                    background: 'var(--color-deep)',
                    border: '1px solid var(--color-border-dim)',
                    color: 'var(--color-text-dim)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                  }}
                >
                  {JSON.stringify(debugResponse, null, 2)}
                </pre>
              </details>
            )}
          </section>

        </div>
      </div>
    </div>
  );
};

export default OrionePanel;
