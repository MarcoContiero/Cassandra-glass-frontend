"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Counters = {
  cycles?: number;
  setups?: number;
  signals?: number;
  opens?: number;
  closes?: number;
  errors?: number;

  prelive_setups?: number;
  prelive_signals?: number;

  ignored_live?: number;

  valid_pairs_found?: number;
  valid_pairs_with_third?: number;
  scenario_candidates?: number;
  scenario_valid?: number;
  scenario_rejected?: number;

  ignored_third?: number;
  ignored_third_missing?: number;
  ignored_third_too_old?: number;
  ignored_third_weak?: number;

  ignored_freshness?: number;
  ignored_signal_too_old?: number;
  ignored_ema_not_fresh?: number;

  rejected_shadow_started?: number;
  rejected_shadow_sl?: number;
  rejected_shadow_trail_armed?: number;
  rejected_shadow_trail_exit?: number;
  rejected_shadow_positive_close?: number;
  rejected_shadow_negative_close?: number;
  rejected_shadow_timeout?: number;
};

type Monitor = {
  poll_sec?: number;
  paused?: boolean;
  running?: boolean;
  uptime_ms?: number;
  subscribers_count?: number;
  orione_ready?: boolean;
  catalog_size?: number;

  post_close_delay_ms?: number;
  recent_window_ms?: number;

  slow_tf?: string;
  slow_tf_ms?: number;
};

type SignalComponent = {
  token?: string;
  ts_ms?: number;
  trigger_price?: number;
  bar_open_ts_ms?: number;
  bar_close_ts_ms?: number;
  bar_index?: number;
};

type SignalItem = {
  coin: string;
  timeframe?: string;
  tf_exec?: string;
  hybrid_reason?: string;

  side: "LONG" | "SHORT" | string;
  scenario: string;
  classe: string;
  timestamp_ms: number;
  trigger_price?: number;

  patterns_hit?: string[] | SignalComponent[];
  components?: SignalComponent[];

  third?: {
    token?: string;
    ts_ms?: number;
    trigger_price?: number;
    strength?: number;
  } | null;
};

type TradeItem = any;

type RejectedShadowItem = {
  key: string;
  coin_key?: string;
  side?: string;
  scenario?: string;
  classe?: string;
  entry_ts_ms?: number;
  entry_px?: number;
  stop_px?: number;
  lock_pct?: number;
  max_fav_pct?: number;
  reject_reason?: string;
  reject_details?: string;
  timeframe?: string | null;
  tf_exec?: string | null;
  hybrid_reason?: string | null;
  third_reason?: string | null;
};

type CoinsStatus = Record<
  string,
  {
    last_scan_ms?: number | null;
    scan_hits?: number | null;

    last_setup_ts?: number | null;
    last_setup_state?: string | null;
    last_setup_state_at_ms?: number | null;

    last_signal_ts?: number | null;
  }
>;

type TifideStatus = {
  status: "running" | "paused" | "stopped";
  started_at_ms: number | null;
  updated_at_ms: number | null;

  watchlist_count: number;

  coins?: string[];
  timeframes?: string[];
  catalog_size?: number;
  orione_ready?: boolean;

  last_sig_ts?: number | null;
  hb_last_line?: string | null;
  last_signal?: SignalItem | null;

  counters?: Counters;

  feed?: any;
  portfolio?: any;
  position?: any;

  recent_signals?: SignalItem[];
  recent_trades?: TradeItem[];

  rejected_shadow_open_count?: number;
  rejected_shadow_open?: RejectedShadowItem[];

  monitor?: Monitor;

  // debug timing
  slow_tf?: string;
  slow_tf_ms?: number;
  now_ms?: number | null;
  live_from_ms?: number | null;
  cooldown_until_ms?: number | null;

  // ✅ per-coin panel
  coins_status?: CoinsStatus;
};

type SseEnvelope =
  | { type: "status"; data: TifideStatus }
  | { type: "monitor"; data: Monitor }
  | { type: "recent"; data: { recent_signals: SignalItem[]; recent_trades: TradeItem[] } }
  | { type: "hb"; data: { line: string; counters?: Counters } }
  | { type: "signal"; data: SignalItem }
  | { type: "trade"; data: TradeItem }
  | { type: "error"; data: { where?: string; error: string; ts_ms?: number } }
  | { type: "coins"; data: { coins_status: CoinsStatus } }
  | { type: string; data: any };

// ✅ Always use same-origin Next routes (/api/...) to avoid split-brain between FE and backend
const apiUrl = (path: string) => path;

function fmtTs(ms?: number | null) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

function fmtMs(ms?: number | null) {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function toNum(v: any): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtNum(v: any, digits = 6) {
  const n = toNum(v);
  if (n == null) return "—";
  // niente super-format: tienilo leggibile e stabile
  return n.toFixed(digits).replace(/\.?0+$/, "");
}

function calcInitialSl(entry: number, direction: string, slPct = 1.0) {
  const d = String(direction || "").toUpperCase();
  if (d === "LONG") return entry * (1 - slPct / 100);
  if (d === "SHORT") return entry * (1 + slPct / 100);
  return entry * (1 - slPct / 100);
}

function extractTfFromToken(token?: string | null) {
  const t = String(token || "").trim();
  if (!t.includes("@")) return null;
  const parts = t.split("@");
  return parts[parts.length - 1] || null;
}

function signalDisplayTf(s: SignalItem): string | null {
  if (s?.tf_exec) return String(s.tf_exec);
  if (s?.timeframe) return String(s.timeframe);

  const comps = Array.isArray(s?.components)
    ? s.components
    : Array.isArray(s?.patterns_hit) && typeof s.patterns_hit[0] === "object"
      ? (s.patterns_hit as SignalComponent[])
      : [];

  const tfs = comps
    .map((c) => extractTfFromToken(c?.token))
    .filter(Boolean) as string[];

  if (!tfs.length) return null;

  const uniq = Array.from(new Set(tfs));
  return uniq.join(" + ");
}

function signalDisplayComponents(s: SignalItem): string[] {
  if (Array.isArray(s?.components) && s.components.length) {
    return s.components.map((c) => String(c?.token || "")).filter(Boolean);
  }

  if (Array.isArray(s?.patterns_hit) && s.patterns_hit.length) {
    if (typeof s.patterns_hit[0] === "string") {
      return (s.patterns_hit as string[]).filter(Boolean);
    }
    return (s.patterns_hit as SignalComponent[])
      .map((c) => String(c?.token || ""))
      .filter(Boolean);
  }

  return [];
}

function normalizeScenarioLabel(s?: string | null) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/_raw\b/g, "")
    .replace(/_confirmed\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTokenLabel(s?: string | null) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/_raw(?=@|$)/g, "")
    .replace(/_confirmed(?=@|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupSignals(items: SignalItem[]): SignalItem[] {
  const bestByKey = new Map<string, SignalItem>();

  for (const s of items || []) {
    const coin = String(s?.coin || "").trim().toUpperCase();
    const side = String(s?.side || "").trim().toUpperCase();
    const ts = Number(s?.timestamp_ms || 0);

    const comps = signalDisplayComponents(s)
      .map((x) => normalizeTokenLabel(x))
      .filter(Boolean)
      .sort();

    const scen = normalizeScenarioLabel(s?.scenario);
    const combo = comps.length ? comps.join(" + ") : scen;

    const key = `${coin}|${side}|${ts}|${combo}`;

    const prev = bestByKey.get(key);
    if (!prev) {
      bestByKey.set(key, s);
      continue;
    }

    const prevScenario = String(prev?.scenario || "");
    const curScenario = String(s?.scenario || "");

    const prevIsRaw = /_raw\b/i.test(prevScenario);
    const curIsRaw = /_raw\b/i.test(curScenario);

    // preferisci la versione NON raw
    if (prevIsRaw && !curIsRaw) {
      bestByKey.set(key, s);
      continue;
    }

    // a parità, tieni quella con tf_exec/timeframe valorizzato
    const prevScore =
      (prev?.tf_exec ? 1 : 0) +
      (prev?.timeframe ? 1 : 0) +
      (Array.isArray(prev?.components) && prev.components.length ? 1 : 0);

    const curScore =
      (s?.tf_exec ? 1 : 0) +
      (s?.timeframe ? 1 : 0) +
      (Array.isArray(s?.components) && s.components.length ? 1 : 0);

    if (curScore > prevScore) {
      bestByKey.set(key, s);
    }
  }

  return Array.from(bestByKey.values()).sort(
    (a, b) => Number(b?.timestamp_ms || 0) - Number(a?.timestamp_ms || 0),
  );
}

export default function TifidePage() {
  const [status, setStatus] = useState<TifideStatus | null>(null);
  const [hbLine, setHbLine] = useState<string | null>(null);
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);

  const running = status?.status === "running";
  const paused = status?.status === "paused";

  const counters = status?.counters ?? {};
  const monitor = status?.monitor ?? {};
  const portfolio = status?.portfolio ?? {};
  const position = status?.position ?? {};
  const coinsStatus = status?.coins_status ?? null;

  const rejectedShadowOpen = status?.rejected_shadow_open ?? [];
  const rejectedShadowOpenCount = status?.rejected_shadow_open_count ?? 0;

  // ✅ fallback UI: se lo state locale è vuoto usa i buffer arrivati nello status
  const rawSignalsView = signals.length ? signals : (status?.recent_signals ?? []);
  const signalsView = useMemo(() => dedupSignals(rawSignalsView), [rawSignalsView]);

  const tradesView = (trades.length ? trades : (status?.recent_trades ?? []));

  async function refreshStatus() {
    const j = await fetch(apiUrl("/api/tifide3/status"), { cache: "no-store" }).then(r => r.json());
    const st = (j && typeof j === "object" && j.status && typeof j.status === "object") ? j.status : j;
    setStatus(st);
    setHbLine(st?.hb_last_line ?? null);

    if (Array.isArray(st?.recent_signals)) setSignals(st.recent_signals);
    if (Array.isArray(st?.recent_trades)) setTrades(st.recent_trades);

    // reset dell’errore “SSE connection error” quando lo status torna OK
    setLastError((prev) => (prev === "SSE connection error (retrying…)" ? null : prev));
  }

  async function post(path: string) {
    setLastError(null);
    const r = await fetch(apiUrl(path), { method: "POST", cache: "no-store" });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      setLastError(`POST ${path} -> ${r.status} ${t}`);
      return;
    }
    await refreshStatus();
  }

  // SSE connect (con fallback + retry naturale di EventSource)
  useEffect(() => {
    let stopped = false;

    const handleEnvelope = (msg: SseEnvelope) => {
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "status") {
        const st = msg.data;
        setStatus(st);
        setHbLine(st?.hb_last_line ?? null);

        // ✅ IMPORTANT: copia anche i recent buffers nello state UI
        if (Array.isArray(st?.recent_signals)) setSignals(st.recent_signals);
        if (Array.isArray(st?.recent_trades)) setTrades(st.recent_trades);

        return;
      }

      if (msg.type === "monitor") {
        setStatus((prev) => (prev ? { ...prev, monitor: msg.data } : prev));
        return;
      }

      if (msg.type === "recent") {
        setSignals(Array.isArray(msg.data?.recent_signals) ? msg.data.recent_signals : []);
        setTrades(Array.isArray(msg.data?.recent_trades) ? msg.data.recent_trades : []);
        return;
      }

      if (msg.type === "coins") {
        setStatus((prev) =>
          prev ? { ...prev, coins_status: msg.data?.coins_status ?? prev.coins_status } : prev,
        );
        return;
      }

      if (msg.type === "hb") {
        setHbLine(msg.data?.line ?? null);
        if (msg.data?.counters) {
          setStatus((prev) =>
            prev ? { ...prev, counters: { ...(prev.counters ?? {}), ...msg.data.counters } } : prev,
          );
        }
        return;
      }

      if (msg.type === "signal") {
        const s = msg.data;

        setStatus((prev) =>
          prev
            ? {
              ...prev,
              last_sig_ts: s?.timestamp_ms ?? prev.last_sig_ts,
              last_signal: s,
            }
            : prev,
        );

        setSignals((prev) => [s, ...prev].slice(0, 50));
        return;
      }

      if (msg.type === "trade") {
        setTrades((prev) => [msg.data, ...prev].slice(0, 50));
        refreshStatus().catch(() => { });
        return;
      }

      if (msg.type === "error") {
        const e = msg.data?.error ?? "unknown error";
        setLastError(`[${msg.data?.where ?? "?"}] ${e}`);
        return;
      }
    };

    const connect = () => {
      if (stopped) return;

      try {
        const es = new EventSource(apiUrl("/api/tifide3/events"));
        esRef.current = es;

        es.onopen = () => {
          setLastError(null); // ✅ appena la SSE torna su, togli il banner rosso
        };

        const onTyped = (ev: MessageEvent) => {
          try {
            const parsed = JSON.parse(ev.data);
            const msg = parsed?.type ? parsed : { type: ev.type, data: parsed };
            setLastError(null);
            handleEnvelope(msg as SseEnvelope);
          } catch {
            // ignore
          }
        };

        es.addEventListener("status", onTyped);
        es.addEventListener("monitor", onTyped);
        es.addEventListener("recent", onTyped);
        es.addEventListener("hb", onTyped);
        es.addEventListener("signal", onTyped);
        es.addEventListener("trade", onTyped);
        es.addEventListener("error", onTyped);
        es.addEventListener("coins", onTyped);

        es.onerror = () => {
          setLastError((prev) => prev ?? "SSE connection error (retrying…)");
        };
      } catch (e: any) {
        setLastError(`SSE init error: ${String(e?.message ?? e)}`);
      }
    };

    refreshStatus().catch(() => { });
    connect();

    return () => {
      stopped = true;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    const st = status?.status ?? "—";
    const wl = status?.watchlist_count ?? 0;
    const cyc = counters?.cycles ?? 0;
    const sig = counters?.signals ?? 0;
    const err = counters?.errors ?? 0;
    const opens = counters?.opens ?? 0;
    const closes = counters?.closes ?? 0;
    const scenValid = counters?.scenario_valid ?? 0;
    const scenRejected = counters?.scenario_rejected ?? 0;
    return { st, wl, cyc, sig, err, opens, closes, scenValid, scenRejected };
  }, [status, counters]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">TIFI 3.5</h1>
          <div className="text-sm opacity-80">
            Status: <span className="font-mono">{summary.st}</span>
            {" · "}watchlist: <span className="font-mono">{summary.wl}</span>
            {" · "}scen_valid: <span className="font-mono">{summary.scenValid}</span>
            {" · "}scen_rejected: <span className="font-mono">{summary.scenRejected}</span>
            {" · "}rej_shadow_open: <span className="font-mono">{rejectedShadowOpenCount}</span>
            {" · "}rej_shadow_sl: <span className="font-mono">{counters?.rejected_shadow_sl ?? 0}</span>
            {" · "}rej_shadow_trail: <span className="font-mono">{counters?.rejected_shadow_trail_armed ?? 0}</span>
            {status?.catalog_size != null ? (
              <>
                {" "}
                · catalog: <span className="font-mono">{status.catalog_size}</span>
              </>
            ) : null}
            {status?.orione_ready != null ? (
              <>
                {" "}
                · orione_ready: <span className="font-mono">{String(status.orione_ready)}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button className="px-3 py-2 rounded-lg border border-white/10 hover:bg-white/5" onClick={() => refreshStatus()}>
            Refresh
          </button>

          <button
            className="px-3 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white disabled:opacity-50"
            disabled={running || paused}
            onClick={() => post("/api/tifide3/start")}
          >
            Start
          </button>

          <button
            className="px-3 py-2 rounded-lg bg-amber-600/80 hover:bg-amber-600 text-white disabled:opacity-50"
            disabled={!running}
            onClick={() => post("/api/tifide3/pause")}
          >
            Pause
          </button>

          <button
            className="px-3 py-2 rounded-lg bg-sky-600/80 hover:bg-sky-600 text-white disabled:opacity-50"
            disabled={!paused}
            onClick={() => post("/api/tifide3/resume")}
          >
            Resume
          </button>

          <button
            className="px-3 py-2 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white disabled:opacity-50"
            disabled={!running && !paused}
            onClick={() => post("/api/tifide3/stop")}
          >
            Stop
          </button>
        </div>
      </div>

      {lastError ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm">
          <div className="font-semibold">Error</div>
          <div className="font-mono whitespace-pre-wrap">{lastError}</div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-2">
          <div className="text-sm font-semibold">Monitor</div>
          <div className="text-sm opacity-90">
            poll_sec: <span className="font-mono">{monitor?.poll_sec ?? "—"}</span>
            <br />
            subscribers: <span className="font-mono">{monitor?.subscribers_count ?? "—"}</span>
            <br />
            uptime: <span className="font-mono">{fmtMs(monitor?.uptime_ms ?? null)}</span>
            <br />
            orione_ready:{" "}
            <span className="font-mono">{String(status?.orione_ready ?? monitor?.orione_ready ?? "—")}</span>
            <br />
            catalog_size: <span className="font-mono">{status?.catalog_size ?? monitor?.catalog_size ?? "—"}</span>
            <br />
            post_close_delay_ms: <span className="font-mono">{monitor?.post_close_delay_ms ?? "—"}</span>
            <br />
            recent_window_ms: <span className="font-mono">{monitor?.recent_window_ms ?? "—"}</span>
            <br />
            slow_tf: <span className="font-mono">{monitor?.slow_tf ?? status?.slow_tf ?? "—"}</span>
            <br />
            slow_tf_ms: <span className="font-mono">{monitor?.slow_tf_ms ?? status?.slow_tf_ms ?? "—"}</span>
          </div>

          {Array.isArray(status?.coins) && status!.coins!.length ? (
            <div className="pt-2 text-xs opacity-80">
              coins: <span className="font-mono">{status!.coins!.length}</span>
            </div>
          ) : null}

          {Array.isArray(status?.timeframes) && status!.timeframes!.length ? (
            <div className="text-xs opacity-80">
              tfs: <span className="font-mono">{status!.timeframes!.join(", ")}</span>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-2">
          <div className="text-sm font-semibold">Counters</div>
          <div className="text-sm opacity-90">
            cycles: <span className="font-mono">{summary.cyc}</span>
            <br />
            setups: <span className="font-mono">{counters?.setups ?? 0}</span>
            <br />
            signals: <span className="font-mono">{summary.sig}</span>
            <br />
            opens: <span className="font-mono">{summary.opens}</span>
            <br />
            closes: <span className="font-mono">{summary.closes}</span>
            <br />
            errors: <span className="font-mono">{summary.err}</span>
            <br />
            <br />
            prelive_setups: <span className="font-mono">{counters?.prelive_setups ?? 0}</span>
            <br />
            prelive_signals: <span className="font-mono">{counters?.prelive_signals ?? 0}</span>
            <br />
            ignored_live: <span className="font-mono">{counters?.ignored_live ?? 0}</span>
            <br />
            <br />
            valid_pairs_found: <span className="font-mono">{counters?.valid_pairs_found ?? 0}</span>
            <br />
            valid_pairs_with_third: <span className="font-mono">{counters?.valid_pairs_with_third ?? 0}</span>
            <br />
            scenario_candidates: <span className="font-mono">{counters?.scenario_candidates ?? 0}</span>
            <br />
            scenario_valid: <span className="font-mono">{counters?.scenario_valid ?? 0}</span>
            <br />
            scenario_rejected: <span className="font-mono">{counters?.scenario_rejected ?? 0}</span>
            <br />
            <br />
            ignored_third: <span className="font-mono">{counters?.ignored_third ?? 0}</span>
            <br />
            ignored_third_missing: <span className="font-mono">{counters?.ignored_third_missing ?? 0}</span>
            <br />
            ignored_third_too_old: <span className="font-mono">{counters?.ignored_third_too_old ?? 0}</span>
            <br />
            ignored_third_weak: <span className="font-mono">{counters?.ignored_third_weak ?? 0}</span>
            <br />
            <br />
            ignored_freshness: <span className="font-mono">{counters?.ignored_freshness ?? 0}</span>
            <br />
            ignored_signal_too_old: <span className="font-mono">{counters?.ignored_signal_too_old ?? 0}</span>
            <br />
            ignored_ema_not_fresh: <span className="font-mono">{counters?.ignored_ema_not_fresh ?? 0}</span>
            <br />
            <br />
            equity: <span className="font-mono">{portfolio?.equity ?? "—"}</span>
            <br />
            rejected_shadow_started: <span className="font-mono">{counters?.rejected_shadow_started ?? 0}</span>
            <br />
            rejected_shadow_sl: <span className="font-mono">{counters?.rejected_shadow_sl ?? 0}</span>
            <br />
            rejected_shadow_trail_armed: <span className="font-mono">{counters?.rejected_shadow_trail_armed ?? 0}</span>
            <br />
            rejected_shadow_trail_exit: <span className="font-mono">{counters?.rejected_shadow_trail_exit ?? 0}</span>
            <br />
            rejected_shadow_positive_close: <span className="font-mono">{counters?.rejected_shadow_positive_close ?? 0}</span>
            <br />
            rejected_shadow_negative_close: <span className="font-mono">{counters?.rejected_shadow_negative_close ?? 0}</span>
            <br />
            rejected_shadow_timeout: <span className="font-mono">{counters?.rejected_shadow_timeout ?? 0}</span>
            <br />
            rejected_shadow_open_count: <span className="font-mono">{rejectedShadowOpenCount}</span>
            <br />
            equity: <span className="font-mono">{portfolio?.equity ?? "—"}</span>
            <br />
            fees: <span className="font-mono">{portfolio?.fees_paid ?? "—"}</span>
            <br />
            position:{" "}
            <span className="font-mono">
              {position?.coin ? `${position.coin} ${position.direction} ${position.classe}` : "—"}
            </span>
          </div>

          {position?.coin ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-2 mt-3">
              <div className="text-sm font-semibold">Position</div>

              {(() => {
                const entry = toNum(position.entry_px);
                const stop = toNum(position.stop_px);
                const lock = toNum(position.lock_pct);

                // Se backend li manda, usali
                const slFromApi = toNum((position as any).sl_px);
                const trailFromApi = toNum((position as any).trail_px);

                // Fallback: SL iniziale coerente con SL_INIT_PCT = -1.00 (=> 1%)
                const slFallback = entry != null ? calcInitialSl(entry, String(position.direction), 1.0) : null;

                // Fallback: se trailing attivo (lock>=0) allora trail = stop_px
                const trailFallback = lock != null && lock >= 0 && stop != null ? stop : null;

                const slPx = slFromApi ?? slFallback;
                const trailPx = trailFromApi ?? trailFallback;

                const activeLabel = lock != null && lock >= 0 ? "TRAIL" : "SL";

                return (
                  <div className="text-sm opacity-90">
                    coin: <span className="font-mono">{position.coin}</span>
                    <br />
                    dir: <span className="font-mono">{position.direction}</span>
                    <br />
                    class: <span className="font-mono">{position.classe}</span>
                    <br />
                    entry: <span className="font-mono">{fmtNum(entry, 6)}</span>
                    <br />
                    SL: <span className="font-mono">{fmtNum(slPx, 6)}</span>
                    <br />
                    TRAIL: <span className="font-mono">{fmtNum(trailPx, 6)}</span>
                    <br />
                    stop_active ({activeLabel}): <span className="font-mono">{fmtNum(stop, 6)}</span>
                    <br />
                    lock: <span className="font-mono">{fmtNum(lock, 4)}</span>
                    <br />
                    maxFav: <span className="font-mono">{fmtNum(position.max_fav_pct, 4)}</span>
                  </div>
                );
              })()}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-2">
          <div className="text-sm font-semibold">Heartbeat</div>
          <div className="text-xs font-mono whitespace-pre-wrap opacity-90">{hbLine ?? "—"}</div>

          <div className="text-xs opacity-70">
            started: <span className="font-mono">{fmtTs(status?.started_at_ms)}</span>
            <br />
            updated: <span className="font-mono">{fmtTs(status?.updated_at_ms)}</span>
            <br />
            last_sig: <span className="font-mono">{fmtTs(status?.last_sig_ts ?? null)}</span>
            <br />
            now: <span className="font-mono">{fmtTs(status?.now_ms ?? null)}</span>
            <br />
            live_from: <span className="font-mono">{fmtTs(status?.live_from_ms ?? null)}</span>
            <br />
            cooldown_until: <span className="font-mono">{fmtTs(status?.cooldown_until_ms ?? null)}</span>
            <br />
            cooldown_left:{" "}
            <span className="font-mono">
              {status?.cooldown_until_ms && status?.now_ms
                ? Math.max(0, Math.floor((status.cooldown_until_ms - status.now_ms) / 1000)) + "s"
                : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* ✅ Riquadro Coins (per-coin status) */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">Coins</div>
          <div className="text-xs opacity-70 font-mono">{coinsStatus ? Object.keys(coinsStatus).length : 0}</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">Rejected Shadow Open</div>
            <div className="text-xs opacity-70 font-mono">{rejectedShadowOpenCount}</div>
          </div>

          {rejectedShadowOpen.length === 0 ? (
            <div className="text-sm opacity-70">—</div>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-auto pr-2">
              {rejectedShadowOpen.map((r, idx) => (
                <div
                  key={r.key || `${r.coin_key}-${r.scenario}-${r.entry_ts_ms}-${idx}`}
                  className="rounded-xl border border-white/10 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-sm">
                      {r.coin_key ?? "—"} · {r.side ?? "—"}
                    </div>
                    <div className="text-xs opacity-70 font-mono">
                      {fmtTs(r.entry_ts_ms ?? null)}
                    </div>
                  </div>

                  <div className="text-xs opacity-80 mt-1">
                    <span className="font-mono">{r.scenario ?? "—"}</span>
                    {" · "}
                    <span className="font-mono">{r.classe ?? "—"}</span>
                    {r.tf_exec || r.timeframe ? (
                      <>
                        {" · "}
                        <span className="font-mono">{r.tf_exec ?? r.timeframe}</span>
                      </>
                    ) : null}
                  </div>

                  <div className="text-[11px] opacity-70 mt-1 font-mono">
                    reject_reason: {r.reject_reason ?? "—"}
                    {r.third_reason ? ` · third_reason: ${r.third_reason}` : ""}
                  </div>

                  {r.reject_details ? (
                    <div className="text-[11px] opacity-60 mt-1 font-mono break-all">
                      {r.reject_details}
                    </div>
                  ) : null}

                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono">
                    <div>entry: {fmtNum(r.entry_px, 6)}</div>
                    <div>stop: {fmtNum(r.stop_px, 6)}</div>
                    <div>lock: {fmtNum(r.lock_pct, 4)}</div>
                    <div>maxFav: {fmtNum(r.max_fav_pct, 4)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!coinsStatus || Object.keys(coinsStatus).length === 0 ? (
          <div className="text-sm opacity-70">—</div>
        ) : (
          <div className="max-h-[360px] overflow-auto pr-2">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-black/60 backdrop-blur border-b border-white/10">
                <tr className="text-left">
                  <th className="py-2 pr-2">Coin</th>
                  <th className="py-2 pr-2">Ultimo scan</th>
                  <th className="py-2 pr-2">Ultimo setup (candela)</th>
                  <th className="py-2 pr-2">Stato</th>
                  <th className="py-2 pr-2">Ultimo segnale</th>
                  <th className="py-2 pr-2">Hits</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(coinsStatus)
                  .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
                  .map(([coin, info]) => (
                    <tr key={coin} className="border-b border-white/5">
                      <td className="py-2 pr-2 font-mono">{coin}</td>
                      <td className="py-2 pr-2 font-mono">{fmtTs(info.last_scan_ms ?? null)}</td>
                      <td className="py-2 pr-2 font-mono">{fmtTs(info.last_setup_ts ?? null)}</td>
                      <td className="py-2 pr-2 font-mono">{info.last_setup_state ?? "—"}</td>
                      <td className="py-2 pr-2 font-mono">{fmtTs(info.last_signal_ts ?? null)}</td>
                      <td className="py-2 pr-2 font-mono">{info.scan_hits ?? 0}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">Recent Signals</div>
            <div className="text-xs opacity-70">{signalsView.length}</div>
          </div>

          <div className="space-y-2 max-h-[520px] overflow-auto pr-2">
            {signalsView.length === 0 ? (
              <div className="text-sm opacity-70">—</div>
            ) : (
              signalsView.map((s, idx) => {
                const displayTf = signalDisplayTf(s);
                const displayComponents = signalDisplayComponents(s);

                return (
                  <div
                    key={`${s.coin}-${s.scenario}-${s.timestamp_ms}-${idx}`}
                    className="rounded-xl border border-white/10 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-sm">
                        {s.coin} · {s.side}
                      </div>
                      <div className="text-xs opacity-70 font-mono">
                        {fmtTs(s.timestamp_ms)}
                      </div>
                    </div>

                    <div className="text-xs opacity-80 mt-1">
                      <span className="font-mono">{s.scenario}</span> ·{" "}
                      <span className="font-mono">{s.classe}</span>
                      {displayTf ? (
                        <>
                          {" "}
                          · <span className="font-mono">{displayTf}</span>
                        </>
                      ) : null}
                      {typeof s.trigger_price === "number" ? (
                        <>
                          {" "}
                          · px: <span className="font-mono">{s.trigger_price}</span>
                        </>
                      ) : null}
                    </div>

                    {displayComponents.length ? (
                      <div className="text-[11px] opacity-70 mt-1 font-mono">
                        {displayComponents.join(" + ")}
                      </div>
                    ) : null}

                    {s.third?.token ? (
                      <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 text-[11px] font-mono text-emerald-300">
                        THIRD: {s.third.token}
                        {typeof s.third.strength === "number" ? (
                          <span className="opacity-70">
                            ({s.third.strength.toFixed(2)})
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">Recent Trades</div>
            <div className="text-xs opacity-70">{tradesView.length}</div>
          </div>

          <div className="space-y-2 max-h-[520px] overflow-auto pr-2">
            {tradesView.length === 0 ? (
              <div className="text-sm opacity-70">—</div>
            ) : (
              tradesView.map((t, idx) => {
                const tradeTf =
                  t?.tf_exec ??
                  t?.timeframe ??
                  t?.meta?.tf_exec ??
                  t?.meta?.timeframe ??
                  "—";

                return (
                  <div
                    key={`trade-${idx}`}
                    className="rounded-xl border border-white/10 p-3"
                  >
                    <div className="text-xs opacity-80 mb-2">
                      tf: <span className="font-mono">{tradeTf}</span>
                    </div>
                    <pre className="text-[11px] font-mono whitespace-pre-wrap opacity-90">
                      {JSON.stringify(t, null, 2)}
                    </pre>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Raw status (debug)
        </summary>
        <pre className="mt-3 text-[11px] font-mono whitespace-pre-wrap opacity-90">
          {JSON.stringify(status, null, 2)}
        </pre>
      </details>
    </div>
  );
}