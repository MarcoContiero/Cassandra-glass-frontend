"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, } from "@/components/ui/card"

type ApiResp<T> = { ok: boolean; data: T };

type TifideStatus = {
  name: string;
  mode: string;
  status: "running" | "paused" | "stopped";
  started_at_ms: number | null;
  updated_at_ms: number | null;
  uptime_sec: number | null;
  last_error: string | null;
  watchlist_count: number;
  signals_offset: number;
  last_sig_ts: number | null;
  feed: { connected: boolean; last_update_ts: number | null; last_error?: string | null };
  portfolio: { equity_usd: number | null; fees_usd: number };
  position: any | null;
};

type SignalItem = {
  id: string;
  coin: string;
  direction: string;
  scenario: string;
  classe: string;
  trigger_ts: number;
  status: string;
  reason?: string;
  mid_at_trigger?: number;
  entry_px?: number;
};

type TradeItem = {
  coin: string;
  direction: string;
  scenario: string;
  classe: string;
  leverage: number;
  entry_ts: number;
  exit_ts: number;
  entry_px: number;
  exit_px: number;
  close_reason: string;
  pnl_usd: number;
  fee_usd: number;
};

type HbCounters = {
  scan_coin?: number;
  signals_read?: number;
  with_mid?: number;
  no_mid?: number;
  open?: number;
  close_preempt?: number;
  close_trail?: number;
  close_sl?: number;
};

const [hbLine, setHbLine] = useState("");
const [hbCounters, setHbCounters] = useState<HbCounters>({});
const [hbAt, setHbAt] = useState<number | null>(null);

function fmtTs(ts?: number | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString();
}
function fmtNum(x?: number | null, dp = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return Number(x).toFixed(dp);
}

export default function TifidePage() {
  const [status, setStatus] = useState<TifideStatus | null>(null);
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [hbLine, setHbLine] = useState<string>("");
  const esRef = useRef<EventSource | null>(null);
  const hbCountRef = useRef(0);

  async function refreshAll() {
    const st = await fetch("/api/tifide/status").then(r => r.json()) as ApiResp<TifideStatus>;
    const sg = await fetch("/api/tifide/signals?limit=200").then(r => r.json()) as ApiResp<SignalItem[]>;
    const tr = await fetch("/api/tifide/trades?limit=200").then(r => r.json()) as ApiResp<TradeItem[]>;
    setStatus(st.data);
    setSignals(sg.data);
    setTrades(tr.data);
  }

  async function post(path: string) {
    await fetch(path, { method: "POST" });
    await refreshAll();
  }

  useEffect(() => {
    refreshAll();

    // SSE
    const es = new EventSource("/api/tifide/events");
    esRef.current = es;

    es.onmessage = (msg) => {
      try {
        const evt = JSON.parse(msg.data);

        // storico eventi (debug UI)
        setEvents((prev) => [evt, ...prev].slice(0, 400));

        // Monitor (HB): riga identica ai log Render
        if (evt?.type === "hb" && typeof evt?.data?.line === "string") {
          setHbLine(evt.data.line);
        }

        if (evt?.type === "hb") {
          setHbAt(Date.now());
          if (evt?.data?.counters && typeof evt.data.counters === "object") {
            setHbCounters(evt.data.counters as HbCounters);
          }
        }

        // snapshot: aggiorna stato completo e stop
        if (evt?.type === "snapshot") {
          setStatus(evt.data);
          return;
        }

        // aggiorna status “live” su hb/error/status (throttled)
        if (evt?.type === "hb" || evt?.type === "error" || evt?.type === "status") {
          hbCountRef.current += 1;

          const shouldFetch =
            evt.type !== "hb" || (hbCountRef.current % 5 === 0);

          if (shouldFetch) {
            fetch("/api/tifide/status")
              .then((r) => r.json())
              .then((r: ApiResp<TifideStatus>) => setStatus(r.data));
          }
        }

        // stream signals/trades
        if (evt?.type === "signal") {
          setSignals((prev) => [evt.data as SignalItem, ...prev].slice(0, 200));
        }
        if (evt?.type === "trade") {
          setTrades((prev) => [evt.data as TradeItem, ...prev].slice(0, 200));
        }
      } catch { }
    };

    es.onerror = () => {
      // lascia che il browser tenti il reconnect
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  const badge = useMemo(() => {
    const s = status?.status ?? "stopped";
    const cls =
      s === "running" ? "bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-500/30" :
        s === "paused" ? "bg-amber-600/20 text-amber-200 ring-1 ring-amber-500/30" :
          "bg-zinc-600/20 text-zinc-200 ring-1 ring-zinc-500/30";
    return { s, cls };
  }, [status]);

  const hbHealth = useMemo(() => {
    const c = hbCounters || {};
    const noMid = Number(c.no_mid ?? 0);
    const sig = Number(c.signals_read ?? 0);

    // logica semplice:
    // - ERR: tanti no_mid (feed/coin mismatch) o zero HB da troppo (gestito sotto)
    // - WARN: no_mid > 0 oppure segnali 0 (idle)
    // - OK: segnali >0 e no_mid=0
    let level: "OK" | "WARN" | "ERR" = "WARN";

    if (sig > 0 && noMid === 0) level = "OK";
    if (noMid >= 5) level = "ERR";

    // se non arriva hb da > 2 minuti -> ERR
    if (hbAt && Date.now() - hbAt > 120_000) level = "ERR";
    if (!hbAt) level = "WARN";
    else if (Date.now() - hbAt > 120_000) level = "ERR";
    else if (noMid > 0) level = "WARN";
    else level = "OK";

    const cls =
      level === "OK"
        ? "bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-500/30"
        : level === "WARN"
          ? "bg-amber-600/20 text-amber-200 ring-1 ring-amber-500/30"
          : "bg-rose-600/20 text-rose-200 ring-1 ring-rose-500/30";

    return { level, cls };
  }, [hbCounters, hbAt]);

  const hbC = {
    scan_coin: hbCounters.scan_coin ?? 0,
    signals_read: hbCounters.signals_read ?? 0,
    with_mid: hbCounters.with_mid ?? 0,
    no_mid: hbCounters.no_mid ?? 0,
    open: hbCounters.open ?? 0,
    close_preempt: hbCounters.close_preempt ?? 0,
    close_trail: hbCounters.close_trail ?? 0,
    close_sl: hbCounters.close_sl ?? 0,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-tight">TIFIDE</div>
          <div className="text-sm text-zinc-400">
            Stato: <span className={`px-2 py-1 rounded-lg ${badge.cls}`}>{badge.s}</span>{" "}
            • Uptime: {status?.uptime_sec ?? "—"}s
            • Feed: {status?.feed?.connected ? "connected" : "disconnected"} (last: {fmtTs(status?.feed?.last_update_ts)})
          </div>
          {status?.last_error && (
            <div className="text-sm text-red-300 mt-2">Errore: {status.last_error}</div>
          )}
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm">Monitor (HB)</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Stato live + KPI estratti dall’heartbeat.
                </CardDescription>
              </div>

              <span className={`px-2 py-1 text-[11px] rounded-md ${hbHealth.cls}`}>
                {hbHealth.level}
              </span>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded-md border p-2">
                <div className="text-muted-foreground">signals_read</div>
                <div className="font-mono">{hbC.signals_read ?? 0}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-muted-foreground">with_mid</div>
                <div className="font-mono">{hbC.with_mid ?? 0}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-muted-foreground">no_mid</div>
                <div className="font-mono">{hbC.no_mid ?? 0}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-muted-foreground">open/close</div>
                <div className="font-mono">
                  {(hbC.open ?? 0)}/{(hbC.close_preempt ?? 0) + (hbC.close_trail ?? 0) + (hbC.close_sl ?? 0)}
                </div>
              </div>
            </div>

            <div className="rounded-md border bg-muted/40 p-2 font-mono text-[11px] leading-5 whitespace-pre-wrap">
              {hbLine || "Nessun heartbeat ricevuto ancora."}
            </div>

            <div className="text-[11px] text-muted-foreground">
              Last HB: {hbAt ? new Date(hbAt).toLocaleString() : "—"}
            </div>
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <button
            onClick={() => post("/api/tifide/start")}
            className="px-3 py-2 rounded-xl bg-emerald-600/20 ring-1 ring-emerald-500/30 text-emerald-100"
          >
            Start
          </button>
          <button
            onClick={() => post("/api/tifide/pause")}
            className="px-3 py-2 rounded-xl bg-amber-600/20 ring-1 ring-amber-500/30 text-amber-100"
          >
            Pause
          </button>
          <button
            onClick={() => post("/api/tifide/resume")}
            className="px-3 py-2 rounded-xl bg-sky-600/20 ring-1 ring-sky-500/30 text-sky-100"
          >
            Resume
          </button>
          <button
            onClick={() => post("/api/tifide/stop")}
            className="px-3 py-2 rounded-xl bg-red-600/20 ring-1 ring-red-500/30 text-red-100"
          >
            Stop
          </button>
          <button
            onClick={() => refreshAll()}
            className="px-3 py-2 rounded-xl bg-zinc-700/40 ring-1 ring-white/10 text-zinc-100"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-zinc-900/60 ring-1 ring-white/10 p-4">
          <div className="text-sm text-zinc-400">Portfolio</div>
          <div className="text-2xl font-semibold mt-1">${fmtNum(status?.portfolio?.equity_usd, 2)}</div>
          <div className="text-xs text-zinc-400 mt-2">Fees: ${fmtNum(status?.portfolio?.fees_usd, 2)}</div>
          <div className="text-xs text-zinc-400">Watchlist: {status?.watchlist_count ?? "—"}</div>
        </div>

        <div className="rounded-2xl bg-zinc-900/60 ring-1 ring-white/10 p-4">
          <div className="text-sm text-zinc-400">Posizione</div>
          {status?.position ? (
            <div className="mt-2 text-sm">
              <div><span className="text-zinc-400">Coin:</span> {status.position.coin}</div>
              <div><span className="text-zinc-400">Dir:</span> {status.position.direction}</div>
              <div><span className="text-zinc-400">Lev:</span> {status.position.leverage}</div>
              <div><span className="text-zinc-400">Entry:</span> {fmtNum(status.position.entry_px, 4)}</div>
              <div><span className="text-zinc-400">Stop:</span> {fmtNum(status.position.stop_px, 4)}</div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-zinc-400">Nessuna posizione attiva</div>
          )}
        </div>

        <div className="rounded-2xl bg-zinc-900/60 ring-1 ring-white/10 p-4">
          <div className="text-sm text-zinc-400">Ingestion</div>
          <div className="text-sm mt-2">
            <div><span className="text-zinc-400">Offset:</span> {status?.signals_offset ?? "—"}</div>
            <div><span className="text-zinc-400">Last signal:</span> {fmtTs(status?.last_sig_ts)}</div>
            <div><span className="text-zinc-400">Updated:</span> {fmtTs(status?.updated_at_ms)}</div>
          </div>
        </div>
      </div>
      {/* Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-zinc-900/60 ring-1 ring-white/10 p-4">
          <div className="font-semibold">Signals</div>
          <div className="text-xs text-zinc-400 mb-3">Ultimi 200 (live stream)</div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-zinc-400">
                <tr className="text-left">
                  <th className="py-2">Time</th>
                  <th>Coin</th>
                  <th>Dir</th>
                  <th>Classe</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr key={s.id} className="border-t border-white/5">
                    <td className="py-2">{fmtTs(s.trigger_ts)}</td>
                    <td>{s.coin}</td>
                    <td>{s.direction}</td>
                    <td>{s.classe}</td>
                    <td className="text-zinc-300">{s.status}</td>
                  </tr>
                ))}
                {!signals.length && (
                  <tr><td className="py-3 text-zinc-400" colSpan={5}>Nessun segnale</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl bg-zinc-900/60 ring-1 ring-white/10 p-4">
          <div className="font-semibold">Trades</div>
          <div className="text-xs text-zinc-400 mb-3">Ultimi 200 (live stream)</div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-zinc-400">
                <tr className="text-left">
                  <th className="py-2">Coin</th>
                  <th>Dir</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Reason</th>
                  <th>Fee</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t, idx) => (
                  <tr key={idx} className="border-t border-white/5">
                    <td className="py-2">{t.coin}</td>
                    <td>{t.direction}</td>
                    <td>{fmtNum(t.entry_px, 4)}</td>
                    <td>{fmtNum(t.exit_px, 4)}</td>
                    <td className="text-zinc-300">{t.close_reason}</td>
                    <td>${fmtNum(t.fee_usd, 2)}</td>
                  </tr>
                ))}
                {!trades.length && (
                  <tr><td className="py-3 text-zinc-400" colSpan={6}>Nessun trade</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Events */}
      <div className="rounded-2xl bg-zinc-900/60 ring-1 ring-white/10 p-4">
        <div className="font-semibold">Events</div>
        <div className="text-xs text-zinc-400 mb-3">Ultimi 400 eventi SSE</div>
        <div className="h-64 overflow-auto text-xs font-mono text-zinc-200 space-y-1">
          {events.map((e, i) => (
            <div key={i} className="border-b border-white/5 pb-1">
              <span className="text-zinc-400">{e.type}</span>{" "}
              <span className="text-zinc-500">{e.ts ? fmtTs(e.ts) : ""}</span>{" "}
              <span>{typeof e?.data?.line === "string" ? e.data.line : JSON.stringify(e.data)}</span>
            </div>
          ))}
          {!events.length && <div className="text-zinc-400">Nessun evento ancora</div>}
        </div>
      </div>
    </div>
  );
}
