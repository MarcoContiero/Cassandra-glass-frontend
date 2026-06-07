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

  btc_regime_score?: number | null;
  btc_regime_score_prev?: number | null;
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

  // debug regime gate
  debug?: {
    btc_regime_score?: number | null;
    btc_regime_prev?: number | null;
    regime_gate_active?: boolean | null;
    regime_gate_override?: boolean | null;
    last_regime_blocked?: {
      coin_key: string;
      scenario: string;
      tf: string;
      ts_ms: number;
      btc_score: number;
      blocked_at_ms: number;
    } | null;
    last_open_block?: any;
    last_open_attempt?: any;
  } | null;

  recent_setups?: {
    coin: string;
    side: string;
    scenario: string;
    classe: string;
    tf: string;
    ts_ms: number;
    ts_recv_ms: number;
  }[];
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

// ── BTC trend + trade stats types ────────────────────────────────────────────
type BtcTrend = {
  direction: string | null;
  guardrailColor: string | null;
  guardrailScore: number | null;
  faseAttuale: string | null;
  loading: boolean;
  error: boolean;
};

type TradeStat = { count: number; wins: number; wr: number; pf: number | null };

// ── Counter groups ────────────────────────────────────────────────────────────
type CounterGroupId = 'core' | 'prelive' | 'scenari' | 'filtri' | 'shadow' | 'portfolio';

function CtrRow({ label, value, desc }: { label: string; value: React.ReactNode; desc?: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <div className="relative group/tip">
        <span className={`text-white/40 text-[11px] ${desc ? 'cursor-help border-b border-dashed border-white/20' : ''}`}>
          {label}
        </span>
        {desc && (
          <div className="pointer-events-none absolute left-0 bottom-full mb-1.5 z-50 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
            <div
              className="rounded-lg border border-white/[0.12] px-2.5 py-1.5 text-[10px] text-white/75 leading-relaxed w-max max-w-[200px]"
              style={{ backdropFilter: 'blur(12px)', background: 'rgba(8,12,28,0.92)', boxShadow: '0 4px 16px rgba(0,0,0,0.6)' }}
            >
              {desc}
            </div>
          </div>
        )}
      </div>
      <span className="font-mono text-[11px] text-white/80">{value}</span>
    </div>
  );
}

function CounterGroup({
  id, title, badge, open, onToggle, children,
}: {
  id: string;
  title: string;
  badge?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-white/[0.02] hover:bg-white/[0.04] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/70">{title}</span>
          {badge}
        </div>
        <span className="text-white/30 text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 py-2 border-t border-white/[0.05] space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function TifidePage() {
  const [status, setStatus] = useState<TifideStatus | null>(null);
  const [hbLine, setHbLine] = useState<string | null>(null);
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [trades, setTrades] = useState<TradeItem[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<CounterGroupId>>(
    new Set(['core', 'portfolio'] as CounterGroupId[])
  );

  const [recentSetups, setRecentSetups] = useState<NonNullable<TifideStatus['recent_setups']>>([]);

  const [btcTrend, setBtcTrend] = useState<BtcTrend>({
    direction: null, guardrailColor: null, guardrailScore: null, faseAttuale: null, loading: false, error: false,
  });

  function toggleGroup(id: CounterGroupId) {
    setOpenGroups(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function fetchBtcTrend() {
    setBtcTrend(prev => ({ ...prev, loading: true, error: false }));
    try {
      const q = new URLSearchParams();
      q.set('coin', 'BTCUSDT');
      q.set('timeframes', '1d');
      q.set('programma', 'cassandra');
      q.set('tipo', 'riepilogo_totale');
      const r = await fetch(`/api/analisi_light?${q.toString()}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const json = await r.json();
      const cic = json?.ciclica ?? {};
      const rp = cic?.reentry_path ?? {};
      const badges = cic?.guida_umano?.badges ?? {};
      setBtcTrend({
        direction: rp?.direzione_reentry ?? badges?.reentry_direction ?? null,
        guardrailColor: badges?.guardrail_color ?? null,
        guardrailScore: badges?.guardrail_score ?? null,
        faseAttuale: rp?.fase_attuale ?? null,
        loading: false,
        error: false,
      });
    } catch {
      setBtcTrend(prev => ({ ...prev, loading: false, error: true }));
    }
  }

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
    if (Array.isArray(st?.recent_setups)) setRecentSetups(st.recent_setups);

    // reset dell'errore “SSE connection error” quando lo status torna OK
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
        if (Array.isArray(st?.recent_setups)) setRecentSetups(st.recent_setups);

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

  useEffect(() => {
    fetchBtcTrend();
    const id = setInterval(fetchBtcTrend, 5 * 60 * 1000);
    return () => clearInterval(id);
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

  const tradeStats = useMemo((): { byScenario: [string, TradeStat][]; byCoin: [string, TradeStat][] } => {
    type Acc = { count: number; wins: number; pnlWins: number; pnlLoss: number };
    const byScenario = new Map<string, Acc>();
    const byCoin = new Map<string, Acc>();

    const normScenario = (s: string): string =>
      s.split('+').map(p => {
        p = p.trim();
        if (p.endsWith('_confirmed')) p = p.slice(0, -10);
        else if (p.endsWith('_raw')) p = p.slice(0, -4);
        return p.trim();
      }).filter(Boolean).join(' + ');

    for (const t of tradesView) {
      const coin = String(t?.coin ?? t?.coin_key ?? t?.meta?.coin ?? t?.meta?.coin_key ?? '?');
      const rawScenario = String(t?.scenario ?? t?.meta?.scenario ?? '?');
      const scenario = rawScenario !== '?' ? normScenario(rawScenario) : '?';
      const rawPnl = t?.pnl ?? t?.pnl_pct ?? t?.net_pnl ?? t?.meta?.pnl ?? t?.result_pct;
      const pnl = typeof rawPnl === 'number' ? rawPnl : Number(rawPnl);
      const hasPnl = Number.isFinite(pnl);
      const isWin = hasPnl ? pnl > 0 : null;

      const upd = (map: Map<string, Acc>, key: string) => {
        const p = map.get(key) ?? { count: 0, wins: 0, pnlWins: 0, pnlLoss: 0 };
        map.set(key, {
          count: p.count + 1,
          wins: p.wins + (isWin === true ? 1 : 0),
          pnlWins: p.pnlWins + (isWin === true && hasPnl ? pnl : 0),
          pnlLoss: p.pnlLoss + (isWin === false && hasPnl ? Math.abs(pnl) : 0),
        });
      };
      upd(byScenario, scenario);
      upd(byCoin, coin);
    }

    const finalize = (map: Map<string, Acc>): [string, TradeStat][] =>
      Array.from(map.entries())
        .map(([k, v]): [string, TradeStat] => [k, {
          count: v.count,
          wins: v.wins,
          wr: v.count > 0 ? Math.round((v.wins / v.count) * 100) : 0,
          pf: v.pnlLoss > 0 ? Math.round((v.pnlWins / v.pnlLoss) * 100) / 100 : null,
        }])
        .sort((a, b) => b[1].count - a[1].count);

    return { byScenario: finalize(byScenario), byCoin: finalize(byCoin) };
  }, [tradesView]);

  // Status color
  const stColor = running ? '#86efac' : paused ? '#fbbf24' : '#94a3b8';

  return (
    <div className="p-3 md:p-5 space-y-3 text-white">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] px-4 py-3"
        style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(255,255,255,0.03)' }}
      >
        {/* Title + status chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-cyan-400/50 text-sm">⬡</span>
          <span className="font-semibold text-white/90">TIFI 4.0</span>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full border font-mono"
            style={{ color: stColor, borderColor: `${stColor}55`, background: `${stColor}12` }}
          >
            {summary.st}
          </span>
          {[
            { l: 'wl', v: summary.wl },
            { l: 'sig', v: summary.sig },
            { l: 'scen', v: `${summary.scenValid}/${summary.scenRejected}` },
            { l: 'shadow', v: rejectedShadowOpenCount },
          ].map(({ l, v }) => (
            <span key={l} className="text-[10px] font-mono text-white/40">
              <span className="text-white/25">{l}:</span> {v}
            </span>
          ))}
          {status?.catalog_size != null && (
            <span className="text-[10px] font-mono text-white/40">
              <span className="text-white/25">catalog:</span> {status.catalog_size}
            </span>
          )}
          {status?.orione_ready != null && (
            <span
              className="text-[10px] font-mono"
              style={{ color: status.orione_ready ? '#86efac' : '#fca5a5' }}
            >
              orione {status.orione_ready ? 'ready' : 'not ready'}
            </span>
          )}

          {/* BTC regime score chip */}
          {(() => {
            const score = monitor?.btc_regime_score ?? null;
            if (score == null) return null;
            const c = score >= 4 ? '#86efac' : score >= 2 ? '#fbbf24' : '#fca5a5';
            return (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full border font-mono"
                style={{ color: c, borderColor: `${c}55`, background: `${c}12` }}
                title="BTC regime score (0-7)"
              >
                BTC {score}/7
              </span>
            );
          })()}
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            className="px-3 py-1.5 rounded-lg border border-white/[0.08] text-xs text-white/60 hover:bg-white/[0.05] transition-colors"
            onClick={() => refreshStatus()}
          >
            ↺ Refresh
          </button>
          {[
            { label: 'Start', disabled: running || paused, action: '/api/tifide3/start', color: '#86efac' },
            { label: 'Pause', disabled: !running, action: '/api/tifide3/pause', color: '#fbbf24' },
            { label: 'Resume', disabled: !paused, action: '/api/tifide3/resume', color: '#67e8f9' },
            { label: 'Stop', disabled: !running && !paused, action: '/api/tifide3/stop', color: '#fca5a5' },
          ].map(({ label, disabled, action, color }) => (
            <button
              key={label}
              className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                borderColor: disabled ? 'rgba(255,255,255,0.08)' : `${color}55`,
                color: disabled ? 'rgba(255,255,255,0.35)' : color,
                background: disabled ? 'transparent' : `${color}12`,
              }}
              disabled={disabled}
              onClick={() => post(action)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {lastError ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm">
          <div className="font-semibold text-rose-300 mb-1">Errore</div>
          <div className="font-mono text-xs whitespace-pre-wrap text-rose-200/80">{lastError}</div>
        </div>
      ) : null}

      {/* ── Monitor + Heartbeat ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Monitor */}
        <div className="rounded-2xl border border-white/[0.07] p-4 space-y-1" style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">Monitor</div>
          {[
            ['poll_sec', monitor?.poll_sec ?? '—'],
            ['subscribers', monitor?.subscribers_count ?? '—'],
            ['uptime', fmtMs(monitor?.uptime_ms ?? null)],
            ['orione_ready', String(status?.orione_ready ?? monitor?.orione_ready ?? '—')],
            ['catalog_size', status?.catalog_size ?? monitor?.catalog_size ?? '—'],
            ['post_close_delay', monitor?.post_close_delay_ms != null ? `${monitor.post_close_delay_ms}ms` : '—'],
            ['recent_window', monitor?.recent_window_ms != null ? `${monitor.recent_window_ms}ms` : '—'],
            ['slow_tf', monitor?.slow_tf ?? status?.slow_tf ?? '—'],
            ['slow_tf_ms', monitor?.slow_tf_ms ?? status?.slow_tf_ms ?? '—'],
          ].map(([l, v]) => <CtrRow key={String(l)} label={String(l)} value={v} />)}
          {Array.isArray(status?.coins) && status!.coins!.length ? (
            <CtrRow label="coins" value={status!.coins!.length} />
          ) : null}
          {Array.isArray(status?.timeframes) && status!.timeframes!.length ? (
            <CtrRow label="tfs" value={status!.timeframes!.join(', ')} />
          ) : null}
        </div>

        {/* Heartbeat + timing */}
        <div className="rounded-2xl border border-white/[0.07] p-4 space-y-1" style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="text-xs font-medium text-white/50 uppercase tracking-wider mb-2">Heartbeat</div>
          <div className="text-[11px] font-mono text-white/70 whitespace-pre-wrap break-all leading-relaxed mb-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            {hbLine ?? '—'}
          </div>
          {[
            ['started', fmtTs(status?.started_at_ms)],
            ['updated', fmtTs(status?.updated_at_ms)],
            ['last_sig', fmtTs(status?.last_sig_ts ?? null)],
            ['now', fmtTs(status?.now_ms ?? null)],
            ['live_from', fmtTs(status?.live_from_ms ?? null)],
            ['cooldown_until', fmtTs(status?.cooldown_until_ms ?? null)],
            ['cooldown_left', status?.cooldown_until_ms && status?.now_ms
              ? String(Math.max(0, Math.floor((status.cooldown_until_ms - status.now_ms) / 1000))) + 's'
              : '—'],
          ].map(([l, v]) => <CtrRow key={String(l)} label={String(l)} value={v} />)}

          {/* BTC Regime Score */}
          <div className="mt-2 pt-2 border-t border-white/[0.05] space-y-1.5">
            <div className="text-[9px] text-white/25 uppercase tracking-wider">BTC Regime Score</div>
            {(() => {
              const score = monitor?.btc_regime_score ?? null;
              const prev  = monitor?.btc_regime_score_prev ?? null;
              const color = score == null ? '#94a3b8'
                : score >= 4 ? '#86efac'
                : score >= 2 ? '#fbbf24'
                : '#fca5a5';
              const label = score == null ? '—'
                : score >= 4 ? 'bullish'
                : score >= 2 ? 'neutro'
                : 'bearish';
              return (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono" style={{ color }}>
                      {score != null ? `${score} / 7` : '—'}
                      {prev != null && score != null && (
                        <span className="ml-1.5 text-[9px] text-white/30">
                          {score > prev ? '▲' : score < prev ? '▼' : '='}{prev}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] font-medium" style={{ color }}>{label}</span>
                  </div>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 7 }, (_, i) => (
                      <div key={i} className="h-1.5 flex-1 rounded-full"
                        style={{ background: score != null && i < score ? color : 'rgba(255,255,255,0.07)' }}
                      />
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── Counters (macro-gruppi espandibili) ─────────────────────── */}
      <div className="rounded-2xl border border-white/[0.07] p-4" style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(255,255,255,0.02)' }}>
        <div className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">Counters</div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">

          {/* Core */}
          <CounterGroup
            id="core" title="Core"
            badge={<span className="text-[10px] font-mono text-cyan-400/70">{summary.sig} sig · {summary.opens} open</span>}
            open={openGroups.has('core')} onToggle={() => toggleGroup('core')}
          >
            <CtrRow label="cycles" value={summary.cyc} desc="Cicli di polling completati dall'avvio" />
            <CtrRow label="setups" value={counters?.setups ?? 0} desc="Setup grezzi ricevuti da Orione in modalità live (pattern rilevati, prima dei filtri)" />

            {/* Dettaglio setups per coin da coins_status */}
            {coinsStatus && (() => {
              const withSetup = Object.entries(coinsStatus)
                .filter(([, info]) => info.last_setup_state)
                .sort((a, b) => (b[1].last_setup_state_at_ms ?? 0) - (a[1].last_setup_state_at_ms ?? 0));
              if (!withSetup.length) return null;
              return (
                <div className="mt-1 rounded-lg border border-white/[0.05] bg-black/15 px-2 py-1.5 space-y-0.5 max-h-[180px] overflow-y-auto">
                  <div className="text-[9px] text-white/20 uppercase tracking-wider mb-1">dettaglio · {withSetup.length} coin</div>
                  {withSetup.map(([coin, info]) => {
                    const state = info.last_setup_state ?? '';
                    const c = /valid|confirm|ready|active|ok/i.test(state) ? '#86efac'
                      : /form|watch|pend|scan|wait/i.test(state) ? '#67e8f9'
                        : /reject|expir|sl|clos|done|timeout|skip/i.test(state) ? '#fca5a5aa'
                          : '#94a3b8';
                    const ageMs = info.last_setup_state_at_ms
                      ? Date.now() - info.last_setup_state_at_ms
                      : null;
                    const ageStr = ageMs != null
                      ? ageMs < 60000 ? `${Math.floor(ageMs / 1000)}s`
                        : ageMs < 3600000 ? `${Math.floor(ageMs / 60000)}m`
                          : `${Math.floor(ageMs / 3600000)}h`
                      : null;
                    return (
                      <div key={coin} className="flex items-center justify-between gap-2 py-px">
                        <span className="font-mono text-[10px] text-white/65 truncate">{coin}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] font-mono" style={{ color: c }}>{state}</span>
                          {ageStr && <span className="text-[9px] text-white/25 font-mono">{ageStr}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <CtrRow label="signals" value={summary.sig} desc="Setup che hanno superato tutti i filtri live e generato un segnale operativo" />
            <CtrRow label="opens" value={summary.opens} desc="Trade aperti dall'avvio del motore" />
            <CtrRow label="closes" value={summary.closes} desc="Trade chiusi (SL, TP, timeout o stop manuale)" />
            <CtrRow label="errors" value={<span className={summary.err > 0 ? 'text-red-400' : ''}>{summary.err}</span>} desc="Errori interni durante i cicli di scansione" />
          </CounterGroup>

          {/* Pre-live */}
          <CounterGroup
            id="prelive" title="Pre-live"
            badge={<span className="text-[10px] font-mono text-white/30">{counters?.prelive_signals ?? 0} sig</span>}
            open={openGroups.has('prelive')} onToggle={() => toggleGroup('prelive')}
          >
            <CtrRow label="prelive_setups" value={counters?.prelive_setups ?? 0} />
            <CtrRow label="prelive_signals" value={counters?.prelive_signals ?? 0} />
            <CtrRow label="ignored_live" value={counters?.ignored_live ?? 0} />
          </CounterGroup>

          {/* Scenari */}
          <CounterGroup
            id="scenari" title="Scenari"
            badge={
              <span className="text-[10px] font-mono">
                <span className="text-emerald-400/70">{summary.scenValid}v</span>
                <span className="text-white/30"> / </span>
                <span className="text-red-400/60">{summary.scenRejected}r</span>
              </span>
            }
            open={openGroups.has('scenari')} onToggle={() => toggleGroup('scenari')}
          >
            <CtrRow label="valid_pairs_found" value={counters?.valid_pairs_found ?? 0} />
            <CtrRow label="valid_pairs_with_third" value={counters?.valid_pairs_with_third ?? 0} />
            <CtrRow label="scenario_candidates" value={counters?.scenario_candidates ?? 0} />
            <CtrRow label="scenario_valid" value={<span className="text-emerald-400/80">{counters?.scenario_valid ?? 0}</span>} />
            <CtrRow label="scenario_rejected" value={<span className="text-red-400/70">{counters?.scenario_rejected ?? 0}</span>} />
          </CounterGroup>

          {/* Filtri / Ignored */}
          <CounterGroup
            id="filtri" title="Filtri"
            badge={<span className="text-[10px] font-mono text-white/30">{(counters?.ignored_third ?? 0) + (counters?.ignored_freshness ?? 0)} ign.</span>}
            open={openGroups.has('filtri')} onToggle={() => toggleGroup('filtri')}
          >
            <CtrRow label="ignored_third" value={counters?.ignored_third ?? 0} />
            <CtrRow label="third_missing" value={counters?.ignored_third_missing ?? 0} />
            <CtrRow label="third_too_old" value={counters?.ignored_third_too_old ?? 0} />
            <CtrRow label="third_weak" value={counters?.ignored_third_weak ?? 0} />
            <CtrRow label="ignored_freshness" value={counters?.ignored_freshness ?? 0} />
            <CtrRow label="signal_too_old" value={counters?.ignored_signal_too_old ?? 0} />
            <CtrRow label="ema_not_fresh" value={counters?.ignored_ema_not_fresh ?? 0} />
          </CounterGroup>

          {/* Shadow trades */}
          <CounterGroup
            id="shadow" title="Shadow"
            badge={<span className="text-[10px] font-mono text-amber-400/70">{rejectedShadowOpenCount} open</span>}
            open={openGroups.has('shadow')} onToggle={() => toggleGroup('shadow')}
          >
            <CtrRow label="started" value={counters?.rejected_shadow_started ?? 0} />
            <CtrRow label="sl" value={counters?.rejected_shadow_sl ?? 0} />
            <CtrRow label="trail_armed" value={counters?.rejected_shadow_trail_armed ?? 0} />
            <CtrRow label="trail_exit" value={counters?.rejected_shadow_trail_exit ?? 0} />
            <CtrRow label="pos_close" value={counters?.rejected_shadow_positive_close ?? 0} />
            <CtrRow label="neg_close" value={counters?.rejected_shadow_negative_close ?? 0} />
            <CtrRow label="timeout" value={counters?.rejected_shadow_timeout ?? 0} />
            <CtrRow label="open_count" value={<span className="text-amber-300/80">{rejectedShadowOpenCount}</span>} />
          </CounterGroup>

          {/* Portfolio */}
          <CounterGroup
            id="portfolio" title="Portfolio"
            badge={portfolio?.equity != null ? <span className="text-[10px] font-mono text-cyan-300/70">eq {portfolio.equity}</span> : undefined}
            open={openGroups.has('portfolio')} onToggle={() => toggleGroup('portfolio')}
          >
            <CtrRow label="equity" value={portfolio?.equity ?? '—'} />
            <CtrRow label="fees" value={portfolio?.fees_paid ?? '—'} />
            <CtrRow label="position" value={position?.coin ? `${position.coin} ${position.direction} ${position.classe}` : '—'} />
            {position?.coin ? (() => {
              const entry = toNum(position.entry_px);
              const stop = toNum(position.stop_px);
              const lock = toNum(position.lock_pct);
              const slPx = toNum((position as any).sl_px) ?? (entry != null ? calcInitialSl(entry, String(position.direction), 1.0) : null);
              const trailPx = toNum((position as any).trail_px) ?? (lock != null && lock >= 0 && stop != null ? stop : null);
              const activeLabel = lock != null && lock >= 0 ? 'TRAIL' : 'SL';
              return <>
                <CtrRow label="entry" value={fmtNum(entry, 6)} />
                <CtrRow label="SL" value={fmtNum(slPx, 6)} />
                <CtrRow label="TRAIL" value={fmtNum(trailPx, 6)} />
                <CtrRow label={`stop (${activeLabel})`} value={fmtNum(stop, 6)} />
                <CtrRow label="lock" value={fmtNum(lock, 4)} />
                <CtrRow label="maxFav" value={fmtNum(position.max_fav_pct, 4)} />
              </>;
            })() : null}
          </CounterGroup>

        </div>
      </div>

      {/* ── Regime Gate Status ──────────────────────────────────────── */}
      {(() => {
        const dbg = status?.debug ?? null;
        const gateActive = dbg?.regime_gate_active ?? null;
        const btcScore = dbg?.btc_regime_score ?? null;
        const btcPrev = dbg?.btc_regime_prev ?? null;
        const blocked = dbg?.last_regime_blocked ?? null;
        const hasOverride = dbg?.regime_gate_override != null;

        const gateColor = gateActive ? '#fbbf24' : '#86efac';
        const gateLabel = gateActive ? 'ATTIVO' : 'DISATTIVO';
        const scoreColor = btcScore == null ? '#94a3b8'
          : btcScore >= 4 ? '#86efac'
          : btcScore >= 2 ? '#fbbf24'
          : '#fca5a5';

        return (
          <div
            className="rounded-2xl border p-4 space-y-3"
            style={{
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              background: gateActive ? 'rgba(251,191,36,0.03)' : 'rgba(134,239,172,0.02)',
              borderColor: gateActive ? 'rgba(251,191,36,0.15)' : 'rgba(134,239,172,0.1)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Regime Gate BTC</span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full border font-mono font-medium"
                  style={{ color: gateColor, borderColor: `${gateColor}55`, background: `${gateColor}12` }}
                >
                  {gateLabel}
                </span>
                {hasOverride && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-cyan-400/30 text-cyan-400/60 font-mono">
                    override
                  </span>
                )}
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150"
                style={{
                  borderColor: gateActive ? 'rgba(134,239,172,0.3)' : 'rgba(251,191,36,0.3)',
                  color: gateActive ? '#86efac' : '#fbbf24',
                  background: gateActive ? 'rgba(134,239,172,0.06)' : 'rgba(251,191,36,0.06)',
                }}
                onClick={() => post('/api/tifide3/regime-gate/toggle')}
              >
                {gateActive ? 'Disattiva gate' : 'Attiva gate'}
              </button>
            </div>

            {/* BTC score row */}
            <div className="flex items-center gap-4">
              <div>
                <div className="text-[9px] text-white/25 uppercase tracking-wider mb-1">BTC Score</div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-semibold" style={{ color: scoreColor }}>
                    {btcScore != null ? `${btcScore} / 7` : '—'}
                  </span>
                  {btcPrev != null && btcScore != null && (
                    <span className="text-[10px] text-white/30 font-mono">
                      {btcScore > btcPrev ? '▲' : btcScore < btcPrev ? '▼' : '='}{btcPrev}
                    </span>
                  )}
                  <span className="text-[10px] font-medium" style={{ color: scoreColor }}>
                    {btcScore == null ? '' : btcScore >= 4 ? 'bullish' : btcScore >= 2 ? 'neutro' : 'bearish'}
                  </span>
                </div>
              </div>
              {btcScore != null && (
                <div className="flex gap-0.5 flex-1">
                  {Array.from({ length: 7 }, (_, i) => (
                    <div key={i} className="h-1.5 flex-1 rounded-full"
                      style={{ background: i < btcScore ? scoreColor : 'rgba(255,255,255,0.07)' }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Ultimo segnale bloccato */}
            {blocked ? (
              <div className="rounded-xl border border-rose-400/[0.12] bg-rose-500/[0.04] px-3 py-2 space-y-1">
                <div className="text-[9px] text-rose-300/50 uppercase tracking-wider">Ultimo segnale bloccato dal gate</div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-white/80 font-semibold">{blocked.coin_key}</span>
                  <span className="text-[10px] font-mono text-white/35">{fmtTs(blocked.blocked_at_ms)}</span>
                </div>
                <div className="text-[11px] text-white/55 font-mono">
                  {blocked.scenario} · @{blocked.tf}
                </div>
                <div className="flex items-center gap-3 text-[10px] font-mono text-white/40">
                  <span>BTC score al blocco: <span style={{ color: scoreColor }}>{blocked.btc_score} / 7</span></span>
                  <span>signal ts: {fmtTs(blocked.ts_ms)}</span>
                </div>
              </div>
            ) : (
              gateActive && (
                <div className="text-[11px] text-white/25 font-mono italic">
                  nessun segnale bloccato in questa sessione
                </div>
              )
            )}
          </div>
        );
      })()}

      {/* ── Rejected Shadow Open ────────────────────────────────────── */}
      {rejectedShadowOpen.length > 0 && (
        <div className="rounded-2xl border border-amber-400/[0.12] p-4" style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(251,191,36,0.03)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-amber-300/70 uppercase tracking-wider">Rejected Shadow Open</span>
            <span className="text-[10px] font-mono text-amber-300/50">{rejectedShadowOpenCount}</span>
          </div>
          <div className="space-y-2 max-h-[320px] overflow-auto pr-2">
            {rejectedShadowOpen.map((r, idx) => (
              <div key={r.key || `${r.coin_key}-${r.scenario}-${r.entry_ts_ms}-${idx}`}
                className="rounded-xl border border-white/[0.06] px-3 py-2 bg-white/[0.01]">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-mono text-xs text-white/80">{r.coin_key ?? '—'} · {r.side ?? '—'}</span>
                  <span className="text-[10px] font-mono text-white/35">{fmtTs(r.entry_ts_ms ?? null)}</span>
                </div>
                <div className="text-[11px] text-white/50 font-mono mb-1">
                  {r.scenario ?? '—'} · {r.classe ?? '—'}{r.tf_exec || r.timeframe ? ` · ${r.tf_exec ?? r.timeframe}` : ''}
                </div>
                <div className="text-[10px] text-amber-300/60 font-mono">
                  {r.reject_reason ?? '—'}{r.third_reason ? ` · ${r.third_reason}` : ''}
                </div>
                {r.reject_details && (
                  <div className="text-[10px] text-white/30 font-mono mt-1 break-all">{r.reject_details}</div>
                )}
                <div className="mt-2 grid grid-cols-4 gap-1 text-[10px] font-mono text-white/40">
                  <span>entry {fmtNum(r.entry_px, 6)}</span>
                  <span>stop {fmtNum(r.stop_px, 6)}</span>
                  <span>lock {fmtNum(r.lock_pct, 4)}</span>
                  <span>maxFav {fmtNum(r.max_fav_pct, 4)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Coins table ─────────────────────────────────────────────── */}
      {coinsStatus && Object.keys(coinsStatus).length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] p-4" style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Coins</span>
            <span className="text-[10px] font-mono text-white/30">{Object.keys(coinsStatus).length}</span>
          </div>
          <div className="max-h-[320px] overflow-auto pr-1">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 border-b border-white/[0.06]" style={{ backdropFilter: 'blur(8px)', background: 'rgba(8,12,22,0.8)' }}>
                <tr className="text-left text-white/35">
                  <th className="py-1.5 pr-3 font-medium">Coin</th>
                  <th className="py-1.5 pr-3 font-medium">Ultimo scan</th>
                  <th className="py-1.5 pr-3 font-medium">Setup</th>
                  <th className="py-1.5 pr-3 font-medium">Stato</th>
                  <th className="py-1.5 pr-3 font-medium">Segnale</th>
                  <th className="py-1.5 font-medium">Hits</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(coinsStatus)
                  .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
                  .map(([coin, info]) => (
                    <tr key={coin} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="py-1.5 pr-3 font-mono text-white/80">{coin}</td>
                      <td className="py-1.5 pr-3 font-mono text-white/40">{fmtTs(info.last_scan_ms ?? null)}</td>
                      <td className="py-1.5 pr-3 font-mono text-white/40">{fmtTs(info.last_setup_ts ?? null)}</td>
                      <td className="py-1.5 pr-3 font-mono text-white/50">{info.last_setup_state ?? '—'}</td>
                      <td className="py-1.5 pr-3 font-mono text-white/40">{fmtTs(info.last_signal_ts ?? null)}</td>
                      <td className="py-1.5 font-mono text-cyan-400/60">{info.scan_hits ?? 0}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Setups recenti ──────────────────────────────────────────── */}
      {recentSetups.length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] p-4" style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Setups recenti</span>
            <span className="text-[10px] font-mono text-white/30">{recentSetups.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-white/30 border-b border-white/[0.05]">
                  <th className="pb-1.5 font-medium">Coin</th>
                  <th className="pb-1.5 font-medium">Side</th>
                  <th className="pb-1.5 font-medium">Scenario</th>
                  <th className="pb-1.5 font-medium">Classe</th>
                  <th className="pb-1.5 font-medium">TF</th>
                  <th className="pb-1.5 font-medium">Ricevuto</th>
                </tr>
              </thead>
              <tbody>
                {recentSetups.map((s, i) => {
                  const sideColor = s.side === 'LONG' ? '#86efac' : s.side === 'SHORT' ? '#fca5a5' : '#94a3b8';
                  return (
                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.01]">
                      <td className="py-1 pr-3 font-mono text-white/80">{s.coin}</td>
                      <td className="py-1 pr-3 font-mono text-[10px]" style={{ color: sideColor }}>{s.side}</td>
                      <td className="py-1 pr-3 font-mono text-white/55 max-w-[140px] truncate" title={s.scenario}>{s.scenario || '—'}</td>
                      <td className="py-1 pr-3 font-mono text-white/45">{s.classe || '—'}</td>
                      <td className="py-1 pr-3 font-mono text-cyan-400/60">{s.tf || '—'}</td>
                      <td className="py-1 font-mono text-white/30">{fmtTs(s.ts_recv_ms || s.ts_ms)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Signals + Trades ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Signals */}
        <div className="rounded-2xl border border-white/[0.07] p-4" style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Segnali recenti</span>
            <span className="text-[10px] font-mono text-white/30">{signalsView.length}</span>
          </div>
          <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
            {signalsView.length === 0 ? (
              <div className="text-xs text-white/30 py-4 text-center">—</div>
            ) : signalsView.map((s, idx) => {
              const displayTf = signalDisplayTf(s);
              const displayComponents = signalDisplayComponents(s);
              const sideColor = s.side === 'LONG' ? '#86efac' : s.side === 'SHORT' ? '#fca5a5' : '#94a3b8';
              return (
                <div key={`${s.coin}-${s.scenario}-${s.timestamp_ms}-${idx}`}
                  className="rounded-xl border border-white/[0.06] px-3 py-2.5 bg-white/[0.01]">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-white/90">{s.coin}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ color: sideColor, background: `${sideColor}18` }}>{s.side}</span>
                    </div>
                    <span className="text-[10px] font-mono text-white/30">{fmtTs(s.timestamp_ms)}</span>
                  </div>
                  <div className="text-[11px] text-white/50 font-mono">
                    {s.scenario} · {s.classe}
                    {displayTf ? ` · ${displayTf}` : ''}
                    {typeof s.trigger_price === 'number' ? ` · px ${s.trigger_price}` : ''}
                  </div>
                  {displayComponents.length > 0 && (
                    <div className="text-[10px] text-white/35 font-mono mt-0.5">{displayComponents.join(' + ')}</div>
                  )}
                  {s.third?.token && (
                    <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-mono"
                      style={{ background: 'rgba(6,182,212,0.08)', borderColor: 'rgba(6,182,212,0.25)', color: '#67e8f9' }}>
                      THIRD: {s.third.token}
                      {typeof s.third.strength === 'number' && (
                        <span className="opacity-60">({s.third.strength.toFixed(2)})</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Trades */}
        <div className="rounded-2xl border border-white/[0.07] p-4" style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Trade recenti</span>
            <span className="text-[10px] font-mono text-white/30">{tradesView.length}</span>
          </div>
          <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
            {tradesView.length === 0 ? (
              <div className="text-xs text-white/30 py-4 text-center">—</div>
            ) : tradesView.map((t, idx) => {
              const tradeTf = t?.tf_exec ?? t?.timeframe ?? t?.meta?.tf_exec ?? t?.meta?.timeframe ?? '—';
              return (
                <div key={`trade-${idx}`} className="rounded-xl border border-white/[0.06] px-3 py-2 bg-white/[0.01]">
                  <div className="text-[10px] text-white/40 font-mono mb-1">tf: {tradeTf}</div>
                  <pre className="text-[10px] font-mono whitespace-pre-wrap text-white/55 leading-relaxed">
                    {JSON.stringify(t, null, 2)}
                  </pre>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Trade Statistics ────────────────────────────────────────── */}
      {(tradeStats.byScenario.length > 0 || tradeStats.byCoin.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Per scenario */}
          {tradeStats.byScenario.length > 0 && (
            <div className="rounded-2xl border border-white/[0.07] p-4" style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(255,255,255,0.02)' }}>
              <div className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">Stats per scenario</div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-white/30 border-b border-white/[0.05]">
                    <th className="pb-1.5 font-medium">Scenario</th>
                    <th className="pb-1.5 font-medium text-right">Trade</th>
                    <th className="pb-1.5 font-medium text-right">WR%</th>
                    <th className="pb-1.5 font-medium text-right">PF</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeStats.byScenario.map(([k, v]) => (
                    <tr key={k} className="border-b border-white/[0.03] hover:bg-white/[0.01]">
                      <td className="py-1 pr-2 font-mono text-white/55 text-[10px] max-w-[140px] truncate" title={k}>{k}</td>
                      <td className="py-1 text-right font-mono text-white/70">{v.count}</td>
                      <td className="py-1 text-right font-mono" style={{ color: v.wr >= 50 ? '#86efac' : '#fca5a5' }}>{v.wr}%</td>
                      <td className="py-1 text-right font-mono text-cyan-300/70">{v.pf != null ? v.pf.toFixed(2) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Per coin */}
          {tradeStats.byCoin.length > 0 && (
            <div className="rounded-2xl border border-white/[0.07] p-4" style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', background: 'rgba(255,255,255,0.02)' }}>
              <div className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">Stats per coin</div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-white/30 border-b border-white/[0.05]">
                    <th className="pb-1.5 font-medium">Coin</th>
                    <th className="pb-1.5 font-medium text-right">Trade</th>
                    <th className="pb-1.5 font-medium text-right">WR%</th>
                    <th className="pb-1.5 font-medium text-right">PF</th>
                  </tr>
                </thead>
                <tbody>
                  {tradeStats.byCoin.map(([k, v]) => (
                    <tr key={k} className="border-b border-white/[0.03] hover:bg-white/[0.01]">
                      <td className="py-1 pr-2 font-mono text-white/70">{k}</td>
                      <td className="py-1 text-right font-mono text-white/70">{v.count}</td>
                      <td className="py-1 text-right font-mono" style={{ color: v.wr >= 50 ? '#86efac' : '#fca5a5' }}>{v.wr}%</td>
                      <td className="py-1 text-right font-mono text-cyan-300/70">{v.pf != null ? v.pf.toFixed(2) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Debug ───────────────────────────────────────────────────── */}
      <details className="rounded-2xl border border-white/[0.06] p-4" style={{ background: 'rgba(0,0,0,0.3)' }}>
        <summary className="cursor-pointer text-[11px] text-white/25 hover:text-white/50 transition-colors select-none">
          Raw status (debug)
        </summary>
        <pre className="mt-3 text-[10px] font-mono whitespace-pre-wrap text-white/40 leading-relaxed">
          {JSON.stringify(status, null, 2)}
        </pre>
      </details>
    </div>
  );
}