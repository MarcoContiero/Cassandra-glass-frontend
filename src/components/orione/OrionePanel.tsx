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

// PRESET ---------------------------------------------------------

const PRESET_INVERSIONE: PatternKey[] = [
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

const PRESET_TREND: PatternKey[] = [
  "ema_cross_9_21",
  "ema_cross_9_50",
  "ema_alignment_trend",
  "bb_squeeze",
];

const PRESET_COMPLETO: PatternKey[] = [
  ...PRESET_INVERSIONE,
  ...PRESET_TREND,
  "triple_bottom",
  "triple_top",
];

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

const OrionePanel: React.FC<OrionePanelProps> = ({ onConfigure }) => {
  const [coinsInput, setCoinsInput] = useState<string>("BTC, ETH, SOL");
  const [selectedTfs, setSelectedTfs] = useState<string[]>(["1m", "3m", "5m"]);
  const [patterns, setPatterns] = useState<PatternConfig[]>([
    { id: "pattern-1", key: "" as PatternConfigKeyUI, required: true },
  ]);

  const [lookbackMode, setLookbackMode] = useState<LookbackMode>("candles");
  const [lookbackCandles, setLookbackCandles] = useState<number>(5);
  const [lookbackMinutes, setLookbackMinutes] = useState<number>(45);
  const [scanIntervalMinutes, setScanIntervalMinutes] = useState<number>(3);

  const [autoLoop, setAutoLoop] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OrioneSetup[] | null>(null);

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
  const applyPreset = (keys: PatternKey[], required: boolean) => {
    const uniqueKeys = Array.from(new Set(keys));
    const rows: PatternConfig[] = uniqueKeys.map((k, idx) => ({
      id: `preset-${k}-${idx}`,
      key: k,
      required,
    }));
    setPatterns(rows.length ? rows : [{ id: "pattern-1", key: "" as PatternConfigKeyUI, required: true }]);
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

      // Chiamiamo la route Next lato server, che a sua volta
      // contatta il backend Cassandra con API key e proxy sicuro.
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
      setResults(data.setups || []);
    } catch (err: any) {
      console.error("[Orione] errore scan:", err);
      setError(
        err?.message ?? "Errore imprevisto durante la scansione di Orione."
      );
      setResults(null);
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

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Card className="bg-black/40 border-white/10 text-white">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Orione · Scanner di Pattern</span>
            <Badge variant="outline" className="border-emerald-400/60">
              Modalità TEST / SCANNER
            </Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* COIN */}
          <section className="space-y-2">
            <label className="text-sm text-white/80">
              Universe di Orione · Coin da scansionare
            </label>
            <textarea
              className="bg-black/40 border border-white/20 text-sm rounded-md p-2 w-full resize-none"
              rows={2}
              placeholder="BTC, ETH, SOL, AVAX..."
              value={coinsInput}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setCoinsInput(e.target.value)
              }
            />
            <p className="text-xs text-white/50">
              Inserisci i simboli separati da virgola. Orione li scansionerà a
              rotazione ogni N minuti.
            </p>
          </section>

          {/* TIMEFRAME */}
          <section className="space-y-2">
            <label className="text-sm text-white/80">
              Timeframe da analizzare
            </label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TFS.map((tf) => {
                const active = selectedTfs.includes(tf);
                return (
                  <Button
                    key={tf}
                    type="button"
                    variant={active ? "default" : "outline"}
                    className={
                      active
                        ? "bg-emerald-500/80 hover:bg-emerald-500 text-black text-xs"
                        : "border-white/30 text-white/80 text-xs"
                    }
                    onClick={() => toggleTf(tf)}
                  >
                    {tf.toUpperCase()}
                  </Button>
                );
              })}
            </div>
          </section>

          {/* PRESET + PATTERN DINAMICI */}
          <section className="space-y-3">
            {/* Preset */}
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <span className="text-sm text-white/80">
                Pattern / condizioni che Orione deve cercare
              </span>
              <div className="flex flex-wrap gap-2 text-xs">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-400/60 text-amber-300"
                  onClick={() => applyPreset(PRESET_INVERSIONE, false)}
                >
                  Preset inversione
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-sky-400/60 text-sky-300"
                  onClick={() => applyPreset(PRESET_TREND, false)}
                >
                  Preset EMA / trend
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-emerald-400/60 text-emerald-300"
                  onClick={() => applyPreset(PRESET_COMPLETO, false)}
                >
                  Preset completo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-emerald-400/60 text-emerald-300"
                  onClick={addPatternRow}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Aggiungi pattern
                </Button>
              </div>
            </div>

            {/* Righe pattern */}
            <div className="space-y-2">
              {patterns.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex flex-col sm:flex-row gap-2 sm:items-center bg-white/5 rounded-xl p-3"
                >
                  <div className="flex-1">
                    <label className="text-xs text-white/60 block mb-1">
                      Pattern #{idx + 1}
                    </label>
                    <select
                      className="w-full bg-black/40 border border-white/20 rounded-md text-xs p-2"
                      value={p.key || ""}
                      onChange={(
                        e: React.ChangeEvent<HTMLSelectElement>
                      ) =>
                        updatePatternKey(
                          p.id,
                          e.target.value as PatternConfigKeyUI
                        )
                      }
                    >
                      <option value="">Seleziona un pattern</option>
                      <option value={ALL_OPTION_VALUE}>
                        Tutti i pattern principali
                      </option>
                      {PATTERN_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-3 min-w-[190px]">
                    <label className="flex items-center gap-2 text-xs text-white/70">
                      <input
                        type="checkbox"
                        checked={p.required}
                        onChange={(
                          e: React.ChangeEvent<HTMLInputElement>
                        ) =>
                          updatePatternRequired(p.id, e.target.checked)
                        }
                      />
                      Obbligatorio
                    </label>

                    {patterns.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => removePatternRow(p.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-white/50">
              Puoi aggiungere più volte lo stesso tipo di condizione (es.
              incrocio EMA). Il flag{" "}
              <span className="font-semibold">Obbligatorio</span> indica che il
              pattern deve esserci per considerare valido il setup. Con{" "}
              <span className="font-semibold">Tutti i pattern</span> Orione
              userà l&apos;intero set principale; i preset compilano
              automaticamente un pacchetto di pattern tipico.
            </p>
          </section>

          {/* LOOKBACK + FREQUENZA */}
          <section className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm text-white/80">
                Finestra di lookback per la ricerca del pattern
              </label>

              <div className="flex gap-2 text-xs">
                <Button
                  type="button"
                  variant={lookbackMode === "candles" ? "default" : "outline"}
                  className={
                    lookbackMode === "candles"
                      ? "bg-emerald-500/80 hover:bg-emerald-500 text-black"
                      : "border-white/30 text-white/70"
                  }
                  onClick={() => setLookbackMode("candles")}
                >
                  Per candele
                </Button>
                <Button
                  type="button"
                  variant={lookbackMode === "minutes" ? "default" : "outline"}
                  className={
                    lookbackMode === "minutes"
                      ? "bg-emerald-500/80 hover:bg-emerald-500 text-black"
                      : "border-white/30 text-white/70"
                  }
                  onClick={() => setLookbackMode("minutes")}
                >
                  Per tempo (minuti)
                </Button>
              </div>

              {lookbackMode === "candles" ? (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={1}
                    className="w-24 bg-black/40 border border-white/20 rounded-md text-xs p-1"
                    value={lookbackCandles}
                    onChange={(
                      e: React.ChangeEvent<HTMLInputElement>
                    ) =>
                      setLookbackCandles(Number(e.target.value) || 1)
                    }
                  />
                  <span className="text-xs text-white/70">
                    candele per TF selezionato.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="number"
                    min={1}
                    className="w-24 bg-black/40 border border-white/20 rounded-md text-xs p-1"
                    value={lookbackMinutes}
                    onChange={(
                      e: React.ChangeEvent<HTMLInputElement>
                    ) =>
                      setLookbackMinutes(Number(e.target.value) || 1)
                    }
                  />
                  <span className="text-xs text-white/70">
                    minuti di finestra temporale.
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm text-white/80">
                Frequenza di scansione (per il bot / ciclo)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  className="w-24 bg-black/40 border border-white/20 rounded-md text-xs p-1"
                  value={scanIntervalMinutes}
                  onChange={(
                    e: React.ChangeEvent<HTMLInputElement>
                  ) =>
                    setScanIntervalMinutes(Number(e.target.value) || 1)
                  }
                />
                <span className="text-xs text-white/70">minuti</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-white/70 mt-1">
                <input
                  type="checkbox"
                  checked={autoLoop}
                  onChange={(e) => setAutoLoop(e.target.checked)}
                />
                Esegui in ciclo continuo finché questa pagina rimane aperta
              </label>
              <p className="text-xs text-white/50">
                In modalità ciclo, Orione rilancia automaticamente la scansione
                ogni N minuti con questa configurazione.
              </p>
            </div>
          </section>

          {/* ACTION BAR */}
          <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-white/10">
            <div className="text-xs text-white/60 space-y-1">
              <div>
                <span className="font-semibold">Stato configurazione: </span>
                {canRun ? (
                  <span className="text-emerald-300">pronto a partire</span>
                ) : (
                  <span className="text-red-300">
                    mancano coin, TF o almeno un pattern.
                  </span>
                )}
              </div>
              <div className="text-[11px] text-white/40">
              </div>
            </div>

            <Button
              type="button"
              disabled={!canRun || loading}
              onClick={handleSubmit}
              className="bg-emerald-500/80 hover:bg-emerald-500 text-black font-semibold text-sm px-6"
            >
              {loading ? "Analisi in corso..." : "Avvia Orione (scan immediato)"}
            </Button>
          </section>

          {/* RISULTATI */}
          <section className="mt-4 space-y-2">
            {error && (
              <div className="text-xs text-red-300 bg-red-900/30 border border-red-600/40 rounded-md p-2">
                {error}
              </div>
            )}

            {results && !error && (
              <div className="text-xs space-y-2">
                {results.length === 0 ? (
                  <div className="text-white/60">
                    Nessun setup trovato con i criteri selezionati.
                  </div>
                ) : (
                  <>
                    <div className="text-white/70">
                      Trovati{" "}
                      <span className="font-semibold">
                        {results.length}
                      </span>{" "}
                      setup Orione.
                    </div>
                    <div className="space-y-1 max-h-64 overflow-auto pr-1">
                      {results.map((s, idx) => (
                        <div
                          key={`${s.coin}-${s.timeframe}-${idx}`}
                          className="border border-white/10 rounded-md px-2 py-1.5 bg-black/40"
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-semibold text-white/90">
                              {s.coin} · {s.timeframe.toUpperCase()}
                            </div>
                            <div className="text-[10px] text-emerald-300 uppercase tracking-wide">
                              {s.status}
                            </div>
                          </div>
                          <div className="text-[11px] text-white/70 mt-0.5">
                            Prezzo:{" "}
                            {s.price !== null && s.price !== undefined
                              ? s.price.toFixed(4)
                              : "—"}{" "}
                            · Candela #{s.candle_index}
                          </div>
                          <div className="text-[11px] text-white/60 mt-0.5">
                            Pattern:{" "}
                            {s.patterns_hit.map((p) => p.key).join(", ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrionePanel;