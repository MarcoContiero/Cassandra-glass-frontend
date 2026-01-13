"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Counters = {
  cycles?: number;
  setups?: number;
  signals?: number;
  opens?: number;
  closes?: number;
  errors?: number;

  ignored_live?: number;
  ignored_recent?: number;
  ignored_postclose?: number;
  ignored_dedup?: number;
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

type SignalItem = {
  coin: string;
  timeframe?: string;
  side: "LONG" | "SHORT" | string;
  scenario: string;
  classe: string;
  timestamp_ms: number;
  trigger_price?: number;
  patterns_hit?: string[];
};

type TradeItem = any;

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

  monitor?: Monitor;

  // debug timing
  slow_tf?: string;
  slow_tf_ms?: number;
  now_ms?: number;
  live_from_ms?: number | null;

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

  async function refreshStatus() {
    const st = await fetch("/api/tifide/status", { cache: "no-store" }).then((r) => r.json());
    setStatus(st);
    setHbLine(st?.hb_last_line ?? null);

    if (Array.isArray(st?.recent_signals)) setSignals(st.recent_signals);
    if (Array.isArray(st?.recent_trades)) setTrades(st.recent_trades);

    // reset dell’errore “SSE connection error” quando lo status torna OK
    setLastError((prev) => (prev === "SSE connection error (retrying…)" ? null : prev));
  }

  async function post(path: string) {
    setLastError(null);
    const r = await fetch(path, { method: "POST", cache: "no-store" });
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
        setStatus(msg.data);
        setHbLine(msg.data?.hb_last_line ?? null);
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
        const es = new EventSource("/api/tifide/events");
        esRef.current = es;

        es.onopen = () => {
          setLastError(null); // ✅ appena la SSE torna su, togli il banner rosso
        };

        const onTyped = (ev: MessageEvent) => {
          try {
            const msg = JSON.parse(ev.data) as SseEnvelope;

            // ✅ se sto ricevendo eventi, la SSE è viva
            setLastError(null);

            handleEnvelope(msg);
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
    return { st, wl, cyc, sig, err, opens, closes };
  }, [status, counters]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">TIFIDE</h1>
          <div className="text-sm opacity-80">
            Status: <span className="font-mono">{summary.st}</span> · watchlist:{" "}
            <span className="font-mono">{summary.wl}</span>
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
            onClick={() => post("/api/tifide/start")}
          >
            Start
          </button>

          <button
            className="px-3 py-2 rounded-lg bg-amber-600/80 hover:bg-amber-600 text-white disabled:opacity-50"
            disabled={!running}
            onClick={() => post("/api/tifide/pause")}
          >
            Pause
          </button>

          <button
            className="px-3 py-2 rounded-lg bg-sky-600/80 hover:bg-sky-600 text-white disabled:opacity-50"
            disabled={!paused}
            onClick={() => post("/api/tifide/resume")}
          >
            Resume
          </button>

          <button
            className="px-3 py-2 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white disabled:opacity-50"
            disabled={!running && !paused}
            onClick={() => post("/api/tifide/stop")}
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
            ignored_live: <span className="font-mono">{counters?.ignored_live ?? 0}</span>
            <br />
            ignored_recent: <span className="font-mono">{counters?.ignored_recent ?? 0}</span>
            <br />
            ignored_postclose: <span className="font-mono">{counters?.ignored_postclose ?? 0}</span>
            <br />
            ignored_dedup: <span className="font-mono">{counters?.ignored_dedup ?? 0}</span>
            <br />
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
          </div>
        </div>
      </div>

      {/* ✅ Riquadro Coins (per-coin status) */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">Coins</div>
          <div className="text-xs opacity-70 font-mono">{coinsStatus ? Object.keys(coinsStatus).length : 0}</div>
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
            <div className="text-xs opacity-70">{signals.length}</div>
          </div>

          <div className="space-y-2 max-h-[520px] overflow-auto pr-2">
            {signals.length === 0 ? (
              <div className="text-sm opacity-70">—</div>
            ) : (
              signals.map((s, idx) => (
                <div key={`${s.coin}-${s.scenario}-${s.timestamp_ms}-${idx}`} className="rounded-xl border border-white/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-sm">
                      {s.coin} · {s.side}
                    </div>
                    <div className="text-xs opacity-70 font-mono">{fmtTs(s.timestamp_ms)}</div>
                  </div>
                  <div className="text-xs opacity-80 mt-1">
                    <span className="font-mono">{s.scenario}</span> · <span className="font-mono">{s.classe}</span>{" "}
                    {s.timeframe ? (
                      <>
                        · <span className="font-mono">{s.timeframe}</span>
                      </>
                    ) : null}
                    {typeof s.trigger_price === "number" ? (
                      <>
                        {" "}
                        · px: <span className="font-mono">{s.trigger_price}</span>
                      </>
                    ) : null}
                  </div>
                  {Array.isArray(s.patterns_hit) && s.patterns_hit.length ? (
                    <div className="text-[11px] opacity-70 mt-1 font-mono">{s.patterns_hit.join(" + ")}</div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">Recent Trades</div>
            <div className="text-xs opacity-70">{trades.length}</div>
          </div>

          <div className="space-y-2 max-h-[520px] overflow-auto pr-2">
            {trades.length === 0 ? (
              <div className="text-sm opacity-70">—</div>
            ) : (
              trades.map((t, idx) => (
                <div key={`trade-${idx}`} className="rounded-xl border border-white/10 p-3">
                  <pre className="text-[11px] font-mono whitespace-pre-wrap opacity-90">{JSON.stringify(t, null, 2)}</pre>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <summary className="cursor-pointer text-sm font-semibold">Raw status (debug)</summary>
        <pre className="mt-3 text-[11px] font-mono whitespace-pre-wrap opacity-90">{JSON.stringify(status, null, 2)}</pre>
      </details>
    </div>
  );
}