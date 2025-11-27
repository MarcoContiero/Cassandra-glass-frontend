// src/components/overlays/BoxOverlay.tsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { DialogHeader } from '@/components/ui/dialog';
import SafeDialogContent from '@/components/ui/SafeDialogContent';
import { API } from '@/api';
import { adaptBackendBoxToRanges } from '@/lib/ranges/adapter';
import { flags } from '@/lib/flags';
import { detectors } from '@/lib/ranges/detectors';

// ===== DEBUG SWITCH =====
// abilita da console con: window.__BOX_DEBUG__ = true
const DBG = (...args: any[]) => {
  if (typeof window !== 'undefined' && (window as any).__BOX_DEBUG__) {
    // eslint-disable-next-line no-console
    console.debug('[BOX]', ...args);
  }
};

type OverlayBoxProps = {
  title?: string;
  symbol?: string;
  timeframes?: string[];
  data?: any;
  basePct?: number;
  atrK?: number;
  capRatio?: number;
  atrPeriod?: number;
  tickSize?: number;
  bufferPct?: number;
  limit?: number;
};

type ApiEvent = { type: string; time?: string | number } & Record<string, any>;
type ApiBox = {
  ok: boolean;
  symbol: string;
  timeframe: string;
  box: {
    top: number | null;
    bottom: number | null;
    width: number | null;
    mid: number | null;
    anchor_index?: number | null;
    anchor_time?: string | number | null;
    active_until_index?: number | null;
    active_until_time?: string | number | null;
    start?: string | number | null;
    end?: string | number | null;
    created_at?: string | number | null;
    updated_at?: string | number | null;
  } | null;
  state?: { in_box?: boolean; last_event?: string | null; last_event_time?: string | number | null } | null;
  events?: ApiEvent[] | null;
  counters?: Record<string, number>;
  story?: string;
};

// ====== helpers di estrazione symbol/TF ======
function pickSymbol(d: any): string | undefined {
  return (
    d?.symbol ??
    d?.coin ??
    d?.ticker ??
    d?.risposte?.symbol ??
    d?.context?.symbol ??
    undefined
  );
}
function pickTFs(d: any): string[] | undefined {
  if (Array.isArray(d?.timeframes) && d.timeframes.length) return d.timeframes;
  if (Array.isArray(d?.TF) && d.TF.length) return d.TF;
  if (Array.isArray(d?.tf) && d.tf.length) return d.tf;
  if (d?.timeframe) return [String(d.timeframe)];
  const m = d?.trend_tf_score || d?.tfScore || d?.scores;
  if (m && typeof m === 'object') return Object.keys(m);
  return undefined;
}

// ====== parsing date robusto (ms / sec / ISO) ======
function parseToDate(t?: unknown): Date | null {
  if (t === undefined || t === null) return null;
  if (typeof t === 'number') {
    const ms = t < 1_000_000_000_000 ? t * 1000 : t;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof t === 'string') {
    const d1 = new Date(t);
    if (!isNaN(d1.getTime())) return d1;
    const n = Number(t);
    if (!Number.isNaN(n)) {
      const ms = n < 1_000_000_000_000 ? n * 1000 : n;
      const d2 = new Date(ms);
      return isNaN(d2.getTime()) ? null : d2;
    }
    return null;
  }
  if (t instanceof Date) return isNaN(t.getTime()) ? null : t;
  return null;
}
function fmtTimeAny(t: unknown, opts?: { tz?: 'local' | 'utc' | 'rome' }): string {
  const d = parseToDate(t);
  if (!d) return '—';
  const base: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  };
  const timeZone = opts?.tz === 'utc' ? 'UTC' : opts?.tz === 'rome' ? 'Europe/Rome' : undefined;
  return d.toLocaleString('it-IT', { ...base, timeZone });
}

// ====== diagnostica: quali campi stanno alimentando le date? ======
// --- metti questi due helper in alto, vicino agli altri helper ---

// prova a ricavare una data dall'id (es: "1760788800-1760846400" o "...-1760788800")
function deriveDateFromId(id: any, kind: "start" | "end"): number | null {
  if (!id) return null;
  const s = String(id);
  // prendi tutte le sequenze di 9-13 cifre (epoch sec/ms)
  const matches = [...s.matchAll(/\d{9,13}/g)].map(m => Number(m[0]));
  if (!matches.length) return null;
  let val: number | null = null;
  if (kind === "start") {
    val = matches[0];
  } else {
    val = matches.length > 1 ? matches[1] : matches[0];
  }
  if (val == null || Number.isNaN(val)) return null;
  // normalizza a ms
  return val < 1_000_000_000_000 ? val * 1000 : val;
}

// catena di sorgenti SENZA createdAt/updatedAt (niente più 1970!)
function pickDateSource(b: any, kind: "start" | "end"): { key: string; value: any } {
  const chain =
    kind === "start"
      ? [
        ["start_ts_ms", b?.start_ts_ms],
        ["start_time_iso", b?.start_time_iso],
        ["start_time", b?.start_time],
        ["start", b?.start],
        ["anchor_time", b?.anchor_time],
        ["box.anchor_time", b?.box?.anchor_time],
        ["id-derived", deriveDateFromId(b?.id, "start")], // NEW
      ]
      : [
        ["end_ts_ms", b?.end_ts_ms],
        ["end_time_iso", b?.end_time_iso],
        ["end_time", b?.end_time],
        ["end", b?.end],
        ["active_until_time", b?.active_until_time],
        ["box.active_until_time", b?.box?.active_until_time],
        ["id-derived", deriveDateFromId(b?.id, "end")],   // NEW
      ];
  const hit = chain.find(([_, v]) => v !== undefined && v !== null && v !== "");
  return { key: hit?.[0] ?? "—", value: hit?.[1] ?? null };
}

export default function BoxOverlay({
  title = 'Box',
  symbol: symbolProp,
  timeframes: tfsProp,
  data,
  basePct,
  atrK,
  capRatio = 0.25,
  atrPeriod = 14,
  tickSize = 0.01,
  bufferPct,
  limit,
}: OverlayBoxProps) {
  const derivedSymbol = useMemo(() => symbolProp ?? pickSymbol(data), [symbolProp, data]);
  const derivedTFs = useMemo(
    () => (tfsProp && tfsProp.length ? tfsProp : pickTFs(data)) ?? ['4h'],
    [tfsProp, data]
  );
  const symbol = (derivedSymbol ?? 'ETHUSDT').toString().toUpperCase();
  const resolvedBasePct = basePct ?? bufferPct ?? 0.001;

  // gruppi TF chiusi di default
  const [openTF, setOpenTF] = useState<Record<string, boolean>>({});
  const toggleTF = (tf: string) => setOpenTF((m) => ({ ...m, [tf]: !m[tf] }));

  const overlayTitle = `${title} • ${symbol} • ${derivedTFs.join(' · ')}`;

  // ▼▼▼ AGGIUNTA: controlli globali Inside ▼▼▼
  const [insideMode, setInsideMode] = useState<"strict" | "soft">("strict");
  const [onlyCloseBreaks, setOnlyCloseBreaks] = useState(true);

  return (
    <SafeDialogContent
      title={overlayTitle}
      description="Pannello box: livelli (top/bottom/mid), stato (dentro/fuori), eventi e storico per i timeframe selezionati."
      className="max-w-5xl w-[96vw] p-0 bg-zinc-900/95 text-white"
    >
      <DialogHeader className="p-4 border-b border-white/10" />

      <div className="p-4 space-y-4">
        {/* ▼▼▼ AGGIUNTA: barra controlli Inside ▼▼▼ */}
        <div className="flex flex-wrap items-center gap-3 px-4">
          <label className="text-sm font-medium">Inside:</label>
          <select
            value={insideMode}
            onChange={e => setInsideMode(e.target.value as "strict" | "soft")}
            className="border rounded px-2 py-1 bg-zinc-800 border-white/20 text-sm"
          >
            <option value="strict">Strict (wick dentro wick)</option>
            <option value="soft">Soft (solo corpo nel range)</option>
          </select>

          <label className="text-sm ml-2">
            <input
              type="checkbox"
              className="mr-2"
              checked={onlyCloseBreaks}
              onChange={e => setOnlyCloseBreaks(e.target.checked)}
            />
            Mostra solo rotture a chiusura
          </label>
        </div>

        {derivedTFs.map((tf) => {
          const opened = !!openTF[tf];
          return (
            <TfPanel
              key={tf}
              symbol={symbol}
              timeframe={tf}
              basePct={resolvedBasePct}
              atrK={atrK}
              capRatio={capRatio}
              atrPeriod={atrPeriod}
              tickSize={tickSize}
              open={opened}
              onToggle={() => toggleTF(tf)}
              limit={limit ?? 800}
              // ▼▼▼ NUOVE PROP ▼▼▼
              insideMode={insideMode}
              onlyCloseBreaks={onlyCloseBreaks}
            />
          );
        })}
      </div>
    </SafeDialogContent>
  );

  // ==================== TF PANEL ====================
  type TfPanelProps = {
    symbol: string;
    timeframe: string;
    basePct: number;
    atrK?: number;
    capRatio: number;
    atrPeriod: number;
    tickSize: number;
    open: boolean;
    onToggle: () => void;
    limit: number;
    insideMode: "strict" | "soft";
    onlyCloseBreaks: boolean;
  };

  function TfPanel({
    symbol,
    timeframe,
    basePct,
    atrK,
    capRatio,
    atrPeriod,
    tickSize,
    open,
    onToggle,
    limit,
    insideMode,
    onlyCloseBreaks,
  }: TfPanelProps) {
    const [boxData, setBoxData] = useState<ApiBox | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const [showImg, setShowImg] = useState(false);
    const [imgErr, setImgErr] = useState<string | null>(null);
    const [imgLoading, setImgLoading] = useState(false);

    const [boxes, setBoxes] = useState<any[] | null>(null);

    const [insideExplain, setInsideExplain] = useState<any[] | null>(null);
    const [insideCount, setInsideCount] = useState<number>(0);


    const fmtDate = (t?: string | number | null) => {
      const d = parseToDate(t ?? null);
      return d ? d.toLocaleDateString('it-IT') : '—';
    };
    const toFixed = (n?: number) => (Number.isFinite(n as number) ? (n as number).toFixed(2) : '—');

    const downloadTxt = (b: any) => {
      const lines: string[] = [
        `Symbol: ${b.symbol} · TF: ${b.timeframe}`,
        `Type: ${b.type ?? 'standard'} · Status: ${b.status ?? (b.active ? 'active' : 'closed')}`,
        `Top: ${b.top} · Bottom: ${b.bottom} · Width: ${b.width}`,
        `Apertura: ${fmtDate(b.start_ts_ms ?? b.start_time_iso ?? b.createdAt ?? b.box?.anchor_time)}`,
        `Chiusura: ${fmtDate(b.end_ts_ms ?? b.end_time_iso ?? b.updatedAt ?? b.box?.active_until_time)}`,
      ];
      if (b.type === 'inside' && b.meta) {
        lines.push(
          `Madre: ${fmtDate(b.meta.madre)} · Inside: ${fmtDate(b.meta.inside)} · Conferma: ${fmtDate(b.meta.conferma)}`
        );
      }
      if ((Array.isArray(b.tags) && b.tags.includes('MT')) || b.type === 'multitouch') {
        lines.push(`Touches → low:${b.meta?.touches?.low ?? 0} · high:${b.meta?.touches?.high ?? 0}`);
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${b.symbol}_${b.timeframe}_${b.type ?? 'standard'}_${b.id}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
    };

    const downloadPng = async (b: any) => {
      console.debug('Scarica PNG (stub)', b);
    };
    const previewPng = (b: any) => {
      console.debug('Anteprima PNG (stub)', b);
    };

    // riga singola (con espansione dettagli)
    const Row: React.FC<{ b: any }> = ({ b }) => {
      const isInside = b.type === 'inside';
      const isMulti = (Array.isArray(b.tags) && b.tags.includes('MT')) || b.type === 'multitouch';
      const title = isInside ? 'INSIDE' : isMulti ? 'MULTI-TOUCH' : 'BOX';

      // diagnostica: quale campo sta alimentando la data?
      // --- dentro Row ---
      const sPick = pickDateSource(b, "start");
      const ePick = pickDateSource(b, "end");

      // "in corso" deve rimanere testuale, non va parsato
      const start =
        sPick.value === "in corso" ? "in corso" : parseToDate(sPick.value);
      const end =
        ePick.value === "in corso" ? "in corso" : parseToDate(ePick.value);

      // stampa leggibile (niente 1970)
      const startS =
        start === "in corso"
          ? "in corso"
          : (start && (start as Date).getFullYear() > 2000
            ? (start as Date).toLocaleDateString("it-IT")
            : "—");

      const endS =
        (b.status === "closed" || b.active === false)
          ? (end === "in corso"
            ? "in corso"
            : (end && (end as Date).getFullYear() > 2000
              ? (end as Date).toLocaleDateString("it-IT")
              : "—"))
          : "in corso";

      // DEBUG: vedrai quale sorgente è stata usata davvero
      console.debug("Row time", {
        id: b.id,
        start_raw: sPick.value,
        start_source: sPick.key,
        end_raw: ePick.value,
        end_source: ePick.key,
        startS,
        endS,
      });

      return (
        <details className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
          <summary className="flex items-center justify-between cursor-pointer">
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium">
                {title} · <span className="opacity-80">top</span> {toFixed(b.top)} ·{' '}
                <span className="opacity-80">bottom</span> {toFixed(b.bottom)}
              </div>
              <div className="text-xs opacity-80">{`${startS} – ${endS}`}</div>
              {/* DEBUG: sorgenti date */}
              <div className="text-[11px] opacity-60">
                sorgente data → start:<code className="mx-1">{sPick.key}</code> end:
                <code className="mx-1">{ePick.key}</code>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="px-2 py-1 text-xs rounded bg-white/10 border border-white/15"
                onClick={() => downloadTxt(b)}
              >
                Scarica storia .txt
              </button>
              <button
                className="px-2 py-1 text-xs rounded bg-white/10 border border-white/15"
                onClick={() => downloadPng(b)}
              >
                Scarica immagine .png
              </button>
              <button
                className="px-2 py-1 text-xs rounded bg-white/10 border border-white/15"
                onClick={() => previewPng(b)}
              >
                Anteprima immagine
              </button>
            </div>
          </summary>

          {/* dettagli espansi */}
          <div className="mt-3 text-sm space-y-1">
            <div>
              Width: {toFixed(b.width)} · Status: {b.status ?? (b.active ? 'active' : 'closed')}
            </div>
            {isInside && (
              <div>
                Madre: {fmtDate(b.meta?.madre)} · Inside: {fmtDate(b.meta?.inside)} · Conferma:{' '}
                {fmtDate(b.meta?.conferma)}
              </div>
            )}
            {isMulti && (
              <div>
                Touches → low: {b.meta?.touches?.low ?? 0} · high: {b.meta?.touches?.high ?? 0}
              </div>
            )}
            {b.events?.length ? (
              <div className="mt-2">
                <div className="text-xs opacity-70 mb-1">Eventi</div>
                <ul className="list-disc list-inside text-xs space-y-0.5">
                  {b.events.map((ev: any, i: number) => (
                    <li key={i}>
                      {fmtDate(ev.time)} · {ev.type}
                      {ev.note ? ` · ${ev.note}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      );
    };

    // === querystring ===
    const qs = useMemo(() => {
      const p = new URLSearchParams({
        symbol,
        timeframe,
        base_pct: String(basePct),
        cap_ratio: String(capRatio),
        atr_period: String(atrPeriod),
        tick_size: String(tickSize),
        limit: String(limit),
      });
      if (atrK !== undefined) p.set('atr_k', String(atrK));
      return p.toString();
    }, [symbol, timeframe, basePct, atrK, capRatio, atrPeriod, tickSize, limit]);

    const mkUrl = useCallback(
      (kind: 'json' | 'png' | 'story') => {
        const path =
          kind === 'json'
            ? '/api/box/box.json'
            : kind === 'png'
              ? '/api/box/box.png'
              : '/api/box/story.txt';
        return `${API}${path}?${qs}`;
      },
      [qs]
    );

    // -------- fetch del box singolo (header) --------
    useEffect(() => {
      let alive = true;
      const ctrl = new AbortController();
      if (!open) return () => {
        alive = false;
        ctrl.abort();
      };

      setLoading(true);
      setErr(null);

      (async () => {
        try {
          const r = await fetch(mkUrl('json'), { cache: 'no-store', signal: ctrl.signal });
          DBG('GET box.json', r.status, r.statusText);
          if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
          const j = (await r.json()) as ApiBox;
          if (alive) setBoxData(j);
        } catch (e: any) {
          if (e?.name !== 'AbortError') if (alive) setErr(String(e?.message ?? e));
        } finally {
          if (alive) setLoading(false);
        }
      })();

      return () => {
        alive = false;
        ctrl.abort();
      };
    }, [mkUrl, open]);

    // ------- fetch elenco box (attivi + chiusi) -------
    useEffect(() => {
      let alive = true;
      const ctrl = new AbortController();
      if (!open) return () => {
        alive = false;
        ctrl.abort();
      };

      const url = `${API}/api/box/boxes.json?${qs}`;
      (async () => {
        try {
          const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
          DBG('GET boxes.json', r.status, r.statusText, url);
          if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);

          const j = await r.json();
          DBG('RESP boxes.json', j, 'len=', Array.isArray(j?.boxes) ? j.boxes.length : '—');

          // standard dal backend
          const std = adaptBackendBoxToRanges(j, symbol, timeframe);

          // detector extra (se abilitati)
          const extraPromises: Promise<any[]>[] = [];
          if (flags.ranges.inside && detectors.inside) extraPromises.push(detectors.inside({ symbol, timeframe }));
          if (flags.ranges.multitouch && detectors.multitouch) extraPromises.push(detectors.multitouch({ symbol, timeframe }));

          let extra: any[] = [];
          if (extraPromises.length) {
            try {
              const arrays = await Promise.all(extraPromises);
              extra = arrays.flat();
            } catch (e) {
              DBG('ERR detectors', e);
            }
          }

          // merge per id + sort per createdAt desc (fallback 0)
          const byId = new Map<string, any>();
          [...std, ...extra].forEach((r: any) => byId.set(String(r.id), r));
          const merged = Array.from(byId.values()).sort((a: any, b: any) => {
            const ta = new Date(a.createdAt ?? 0).getTime();
            const tb = new Date(b.createdAt ?? 0).getTime();
            return tb - ta;
          });

          if (alive) setBoxes(merged);
        } catch (e: any) {
          if (e?.name !== 'AbortError') DBG('ERR boxes.json', e);
        }
      })();

      return () => {
        alive = false;
        ctrl.abort();
      };
    }, [qs, symbol, timeframe, open]);

    // ▼▼▼ AGGIUNTA: fetch explain/inside ▼▼▼
    useEffect(() => {
      let alive = true;
      const ctrl = new AbortController();
      if (!open) return () => { alive = false; ctrl.abort(); };

      const url = new URL(`${API}/api/box/explain`);
      url.searchParams.set("symbol", symbol);
      url.searchParams.set("timeframe", timeframe);
      url.searchParams.set("inside_mode", insideMode);
      url.searchParams.set("only_close_breaks", String(onlyCloseBreaks));
      url.searchParams.set("tick_size", String(tickSize ?? 0.01));
      url.searchParams.set("debug", "false");

      (async () => {
        try {
          const r = await fetch(url.toString(), { cache: "no-store", signal: ctrl.signal });
          DBG("GET explain", r.status, r.statusText, url.toString());
          if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
          const j = await r.json();
          if (!alive) return;
          setInsideExplain(Array.isArray(j?.inside) ? j.inside : []);
          setInsideCount(Number(j?.count?.inside ?? 0));
        } catch (e) {
          if (alive) {
            DBG("ERR explain", e);
            setInsideExplain([]);
            setInsideCount(0);
          }
        }
      })();

      return () => { alive = false; ctrl.abort(); };
    }, [symbol, timeframe, tickSize, insideMode, onlyCloseBreaks, open]);


    // ------- util -------
    const box = (data?.box ?? {}) as NonNullable<ApiBox['box']>;
    const fmt = (v: number | null | undefined) =>
      typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 8 }) : '—';

    // ===== HEADER: fallback se manca anchor_time =====
    // ===== HEADER: solo campi attendibili =====
    const headerAnchorIdx = data?.box?.anchor_index ?? null;
    const headerStartRaw =
      data?.box?.start ??
      data?.box?.anchor_time ??
      null;
    const headerEndRaw =
      data?.box?.end ??
      data?.box?.active_until_time ??
      null;

    const headerStartStr =
      headerStartRaw === "in corso" ? "in corso" : fmtTimeAny(headerStartRaw, { tz: "rome" });
    const headerEndStr =
      headerEndRaw === "in corso" ? "in corso" : fmtTimeAny(headerEndRaw, { tz: "rome" });

    console.debug('[HEADER box.json]', {
      start: headerStartRaw,
      end: headerEndRaw,
      box: data?.box,
    });


    // === split gruppi con logica tollerante ===
    const isStd = (x: any) => x?.type === 'standard' || x?.type === undefined || x?.type === null;
    const isActive = (x: any) => x?.status === 'active' || x?.active === true;
    const isClosed = (x: any) => x?.status === 'closed' || x?.active === false;

    const stdActive = useMemo(
      () => (boxes ?? []).filter((x: any) => isStd(x) && isActive(x)),
      [boxes]
    );
    const stdClosed = useMemo(
      () => (boxes ?? []).filter((x: any) => isStd(x) && isClosed(x)),
      [boxes]
    );
    const insideTagged = useMemo(
      () =>
        (boxes ?? []).filter(
          (x: any) => (Array.isArray(x.tags) && x.tags.includes('IB')) || x.type === 'inside'
        ),
      [boxes]
    );
    const mtBoxes = useMemo(
      () =>
        (boxes ?? []).filter(
          (x: any) => (Array.isArray(x.tags) && x.tags.includes('MT')) || x.type === 'multitouch'
        ),
      [boxes]
    );

    const imgUrl = useMemo(
      () =>
        stdActive.length
          ? `${API}/api/box/box.png?${qs}&box_id=${encodeURIComponent(
            String(stdActive[0].id)
          )}&crop=active&t=${Date.now()}`
          : null,
      [stdActive, qs]
    );

    const dlTxt = mkUrl('story');
    const dlPng = mkUrl('png');

    return (
      <section className="rounded-2xl p-3 bg-white/5 space-y-3">
        {/* HEADER */}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between px-2 py-1 -mx-1 rounded hover:bg-white/10 transition"
        >
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 text-center">{open ? '▾' : '▸'}</span>
            <span className="font-medium">
              {symbol} • {timeframe} <span className="ml-2 text-xs opacity-60">inside: {insideMode}</span>
            </span>
          </div>
          <div className="text-xs text-white/60">
            {open ? (
              <>
                anchor {headerAnchorIdx ?? '—'} • {headerStartStr}
                {headerEndRaw && <> • fine box: {headerEndStr}</>}
                <span className="ml-2 opacity-60">
                  (src: box.start / box.end con fallback)
                </span>
              </>
            ) : (
              <>clic per aprire</>
            )}
          </div>
        </button>

        {!open ? null : (
          <>
            {loading && <div className="rounded-xl p-3 bg-white/5 animate-pulse">Caricamento…</div>}
            {!!err && (
              <div className="rounded-xl p-3 bg-rose-500/10 border border-rose-500/30">{err}</div>
            )}

            {!loading && !err && (
              <>
                <div className="space-y-3">
                  {/* ATTIVI */}
                  <details className="rounded-lg border border-white/10 bg-black/20">
                    <summary className="cursor-pointer px-3 py-2 font-medium">
                      BOX ATTIVI ({stdActive.length})
                    </summary>
                    <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                      {stdActive.length ? (
                        stdActive.map((b: any) => <Row key={b.id} b={b} />)
                      ) : (
                        <div className="text-sm opacity-70">Nessun evento</div>
                      )}
                    </div>
                  </details>

                  {/* PASSATI */}
                  <details className="rounded-lg border border-white/10 bg-black/20">
                    <summary className="cursor-pointer px-3 py-2 font-medium">
                      BOX PASSATI ({stdClosed.length})
                    </summary>
                    <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                      {stdClosed.length ? (
                        stdClosed.map((b: any) => <Row key={b.id} b={b} />)
                      ) : (
                        <div className="text-sm opacity-70">Nessun evento</div>
                      )}
                    </div>
                  </details>

                  {/* INSIDE (da /api/box/explain) */}
                  <details className="rounded-lg border border-white/10 bg-black/20">
                    <summary className="cursor-pointer px-3 py-2 font-medium">
                      INSIDE • mode: {insideMode} ({insideCount})
                    </summary>
                    <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                      {insideExplain && insideExplain.length ? (
                        insideExplain.map((e: any, i: number) => (
                          <details key={i} className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                            <summary className="flex items-center justify-between cursor-pointer">
                              <div className="text-sm">
                                top {Number(e.top).toFixed(2)} · bottom {Number(e.bottom).toFixed(2)} · {e.end_status}
                              </div>
                              <div className="text-xs opacity-70">
                                mother {fmtTimeAny(e.mother_time, { tz: "rome" })}
                              </div>
                            </summary>
                            <div className="mt-2 text-xs opacity-80">
                              break: {fmtTimeAny(e.break_time, { tz: "rome" })} ·
                              h:{e.break_candle?.h} l:{e.break_candle?.l} c:{e.break_candle?.c}
                            </div>
                          </details>
                        ))
                      ) : (
                        <div className="text-sm opacity-70">Nessuna inside</div>
                      )}
                    </div>
                  </details>

                  {/* MULTI-TOUCH */}
                  <details className="rounded-lg border border-white/10 bg-black/20">
                    <summary className="cursor-pointer px-3 py-2 font-medium">
                      MULTI-TOUCH ({mtBoxes.length})
                    </summary>
                    <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                      {mtBoxes.length ? (
                        mtBoxes.map((b: any) => <Row key={b.id} b={b} />)
                      ) : (
                        <div className="text-sm opacity-70">Nessun evento</div>
                      )}
                    </div>
                  </details>
                </div>

                {/* Download generali */}
                <div className="flex flex-wrap gap-2">
                  <a className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20" href={dlTxt} download>
                    Scarica storia .txt
                  </a>
                  <a className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20" href={dlPng} download>
                    Scarica immagine .png
                  </a>
                  <button
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20"
                    onClick={() => {
                      setImgErr(null);
                      setImgLoading(true);
                      setShowImg(true);
                    }}
                  >
                    Anteprima immagine
                  </button>
                </div>

                {/* Modal anteprima */}
                {showImg && (
                  <div
                    className="fixed inset-0 z-[999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setShowImg(false)}
                  >
                    <div
                      className="bg-zinc-900 rounded-2xl shadow-xl max-w-5xl w-full"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                        <div className="font-medium">
                          Anteprima • {symbol} • {timeframe}
                        </div>
                        <button
                          className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20"
                          onClick={() => setShowImg(false)}
                        >
                          Chiudi
                        </button>
                      </div>
                      <div className="p-3 min-h-[200px] flex items-center justify-center">
                        {imgLoading && !imgErr && (
                          <div className="text-white/70 text-sm animate-pulse">Caricamento…</div>
                        )}
                        {!!imgErr && (
                          <div className="text-rose-300 text-sm">Immagine non disponibile: {imgErr}</div>
                        )}
                        {imgUrl && (
                          <img
                            src={imgUrl}
                            alt="Anteprima box"
                            className="max-h-[70vh] w-auto rounded-lg shadow"
                            onLoad={() => setImgLoading(false)}
                            onError={() => {
                              setImgLoading(false);
                              setImgErr('vuota o non generabile');
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
    );
  }
}
