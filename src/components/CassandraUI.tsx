'use client';

import OrionePanel from './orione/OrionePanel';

import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import ChartPreview from "@/components/ChartPreview";
import type { AnalisiLightResponse } from "@/types/analisiLight";  // AGGIUNGI QUESTA

// Overlays
import SupportiResistenzeOverlay from './overlays/SupportiResistenzeOverlay';
import RiepilogoOverlay from './overlays/RiepilogoOverlay';
import LiquiditaOverlay from './overlays/LiquiditaOverlay';
import TriggerMapOverlay from './overlays/TriggerMapOverlay';
import MomentumGaugeOverlay from './overlays/MomentumGaugeOverlay';
import LongShortOverlay from './overlays/LongShortOverlay';
import EntriesOverlay from './overlays/EntrateOverlay';
import SpiegazioneOverlay from './overlays/SpiegazioneOverlay';
import StrategiaAIOverlay from './overlays/StrategiaAIOverlay';
import MiddleOverlay from './MiddleOverlay';
import BoxOverlay from './overlays/BoxOverlay';
import GraficoOverlay from './overlays/GraficoOverlay';
import ScenariOverlay from './overlays/ScenariOverlay';
import AlertOverlay from './overlays/AlertOverlay';
import ScenariPrevistiOverlay from "@/components/overlays/ScenariPrevistiOverlay";
import { buildCiclicaViewModel, buildFollowerWithCrossSync } from "@/lib/ciclica/ciclicaViewModel";
import { CiclicaOverlay } from "@/components/ciclica/CiclicaOverlay";
import { mockCiclica } from "@/lib/ciclica/mockCiclica";


// UI
import { Button } from '@/components/ui/button';

type OverlayKey =
  | 'supporti'
  | 'liquidita'
  | 'scenari'
  | 'entrate'
  | 'riepilogo'
  | 'longshort'
  | 'trigger_map'
  | 'momentum_gauge'
  | 'spiegazione'
  | 'alert'
  | 'strategia_ai'
  | 'middles'
  | 'box'
  | 'grafico'
  | 'comparativa_full'
  | 'scenari_previsti'
  | 'ciclica'
  | null;

const TF_PRESET = [
  '1m', '3m', '5m', '15m', '30m',
  '1h', '2h', '4h', '6h', '12h',
  '1d',
  '1w', '1M'
];

function toUSDT(sym: string) {
  const s = String(sym || '').trim().toUpperCase();
  if (s.endsWith('USDT') || s.endsWith('USD')) return s;
  return `${s}USDT`;
}

function extractPrice(result: any): number | undefined {
  const p = Number(
    result?.prezzo ?? result?.price ?? result?.risposte?.prezzo ?? result?.risposte?.price
  );
  return Number.isFinite(p) ? p : undefined;
}

function normalizeSR(result: any): { supporti: any[]; resistenze: any[] } {
  const s =
    result?.supporti ??
    result?.sr?.supporti ??
    result?.levels?.supporti ??
    result?.support ??
    [];
  const r =
    result?.resistenze ??
    result?.sr?.resistenze ??
    result?.levels?.resistenze ??
    result?.resistance ??
    [];
  return { supporti: Array.isArray(s) ? s : [], resistenze: Array.isArray(r) ? r : [] };
}

function downloadJson(data: unknown, filename: string) {
  if (!data) return;

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

/** bridge sopra/sotto above/below  */
function normalizeLiquidity(result: any): { above: any[]; below: any[] } {
  const cand =
    result?.liquidity ??
    result?.livelli_liquidita ??
    result?.livelli_liquidita ??
    result?.liquidity_levels ??
    result?.liquidity_by_tf ??
    result?.pool_liquidita ??
    {};
  const rawAbove =
    (Array.isArray(cand?.above) && cand.above) ||
    (Array.isArray(cand?.sopra) && cand.sopra) ||
    (Array.isArray(result?.sopra) && result.sopra) ||
    (Array.isArray(result?.above) && result.above) ||
    [];
  const rawBelow =
    (Array.isArray(cand?.below) && cand.below) ||
    (Array.isArray(cand?.sotto) && cand.sotto) ||
    (Array.isArray(result?.sotto) && result.sotto) ||
    (Array.isArray(result?.below) && result.below) ||
    [];

  return {
    above: Array.isArray(rawAbove) ? rawAbove.filter(Boolean) : [],
    below: Array.isArray(rawBelow) ? rawBelow.filter(Boolean) : [],
  };
}

type Entry = {
  direction: 'long' | 'short';
  setup: string;
  entry: number;
  stop?: number;
  tp1?: number;
  rr?: number;
  fonte: 'meccanico';
};

function buildMechanicalEntries(
  prezzo0: number | undefined,
  supporti: any[] = [],
  resistenze: any[] = []
): Entry[] {
  const out: Entry[] = [];
  if (!Number.isFinite(prezzo0)) return out;
  const prezzo = prezzo0 as number;

  const nearSup = [...supporti]
    .map((s) => ({
      p: Number(s?.valore ?? s?.price ?? s?.livello ?? s?.level) || Number.NEGATIVE_INFINITY,
      raw: s,
    }))
    .filter((x) => Number.isFinite(x.p) && x.p < prezzo)
    .sort((a, b) => Math.abs(a.p - prezzo) - Math.abs(b.p - prezzo))[0];

  const nearRes = [...resistenze]
    .map((s) => ({
      p: Number(s?.valore ?? s?.price ?? s?.livello ?? s?.level) || Number.POSITIVE_INFINITY,
      raw: s,
    }))
    .filter((x) => Number.isFinite(x.p) && x.p > prezzo)
    .sort((a, b) => Math.abs(a.p - prezzo) - Math.abs(b.p - prezzo))[0];

  if (nearSup?.p) {
    const diff = Math.max(1, Math.round((prezzo - nearSup.p) * 0.5));
    out.push({
      direction: 'long',
      setup: 'Rimbalzo su supporto',
      entry: nearSup.p + diff,
      stop: nearSup.p - diff,
      tp1: nearSup.p + diff * 3,
      rr: 3,
      fonte: 'meccanico',
    });
  }
  if (nearRes?.p) {
    const diff = Math.max(1, Math.round((nearRes.p - prezzo) * 0.5));
    out.push({
      direction: 'short',
      setup: 'Rejection su resistenza',
      entry: nearRes.p - diff,
      stop: nearRes.p + diff,
      tp1: nearRes.p - diff * 3,
      rr: 3,
      fonte: 'meccanico',
    });
  }
  return out;
}

// PATCH: costruisce mid-lines (Q1, MID, Q3) per i TF presenti e misura confluenze
function buildMiddles(result: any) {
  const tfs: string[] =
    (Array.isArray(result?.timeframes) && result.timeframes.length)
      ? result.timeframes
      : Object.keys(result?.trend_tf_score ?? {})  // fallback robusto
    ;
  const minmax = result?.minmax_per_tf ?? {};
  const srSup: any[] = Array.isArray(result?.supporti) ? result.supporti : [];
  const srRes: any[] = Array.isArray(result?.resistenze) ? result.resistenze : [];
  const liq = result?.liquidity ?? {};
  const liqAbove: any[] = Array.isArray(liq.above ?? liq.sopra) ? (liq.above ?? liq.sopra) : [];
  const liqBelow: any[] = Array.isArray(liq.below ?? liq.sotto) ? (liq.below ?? liq.sotto) : [];

  // tolleranza confluenze: usa autotune se presente, altrimenti 0.5%
  const epsPct = Number(result?.liquidity_bias_autotune?.pct_tuned) || 0.005;

  function nearCount(level: number, arr: any[]) {
    const f = (v: any) =>
      Number(v?.valore ?? v?.price ?? v?.livello ?? v?.level ?? v) || NaN;
    return arr.reduce((acc, v) => {
      const p = f(v);
      if (!Number.isFinite(p)) return acc;
      const rel = Math.abs(p - level) / Math.max(1e-9, level);
      return acc + (rel <= epsPct ? 1 : 0);
    }, 0);
  }

  const out: any[] = [];
  const universeTF = tfs.length ? tfs : Object.keys(minmax);
  for (const tf of universeTF) {
    const mm = minmax?.[tf];
    if (!mm) continue;
    const lo = Number(mm.low ?? mm.min ?? NaN);
    const hi = Number(mm.high ?? mm.max ?? NaN);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) continue;

    const mid = (hi + lo) / 2;
    const q1 = lo + 0.25 * (hi - lo);
    const q3 = lo + 0.75 * (hi - lo);
    const lines = [
      { id: 'Q1', lvl: q1 },
      { id: 'MID', lvl: mid },
      { id: 'Q3', lvl: q3 },
    ];

    for (const ln of lines) {
      const conflSR = nearCount(ln.lvl, [...srSup, ...srRes]);
      const conflLiq = nearCount(ln.lvl, [...liqAbove, ...liqBelow]);
      const conflTot = conflSR + conflLiq;
      const score = Math.min(100, Math.round(40 + 15 * conflSR + 10 * conflLiq));
      out.push({
        tf, id: ln.id, level: ln.lvl, confl_sr: conflSR, confl_liq: conflLiq,
        confl_tot: conflTot, score
      });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export default function CassandraUI() {
  const [symbol, setSymbol] = useState<string>('BTC');
  const [timeframes, setTimeframes] = useState<string[]>(['15m', '1h', '4h', '12h', '1d']);
  const [result, setResult] = useState<AnalisiLightResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPrevisti, setOpenPrevisti] = useState(false);
  const [overlayKey, setOverlayKey] = useState<OverlayKey>(null);
  const [overlayTitle, setOverlayTitle] = useState<string>('');
  const [overlayData, setOverlayData] = useState<any | null>(null);
  const [showMiddles, setShowMiddles] = useState<boolean>(false);
  const [middlesData, setMiddlesData] = useState<any | null>(null);

  const [compareBTC, setCompareBTC] = useState<boolean>(false);
  const [compareAlt, setCompareAlt] = useState<boolean>(false);
  const [altCoin, setAltCoin] = useState<string>('');  // es. SOL, ETH, LDO...
  const [bootstrapped, setBootstrapped] = useState(false);

  async function fetchAnalisi() {
    try {
      setError(null);
      setResult(null);

      const coin = toUSDT(symbol);

      // 1) Costruisci l'elenco TF dalla UI (fallback a 1h)
      const selected: string[] = (timeframes && timeframes.length ? timeframes : ['1h'])
        .map(tf => String(tf).trim())
        .filter(Boolean);

      // 2) Query robusta: invia sia multipli (append) sia csv (timeframes_csv)
      const q = new URLSearchParams();
      q.set('coin', coin);
      q.set('tipo', 'riepilogo_totale');
      q.set("programma", "cassandra");     // forza la pipeline con i builders
      q.set("scenari_min_rr", "1.4");
      q.set("scenari_min_score", "50");
      q.set("scenari_max_move_pct", "0.6");


      if (selected.length) {
        selected.forEach(tf => q.append('timeframes', tf)); // per getAll lato API route
        q.set('timeframes_csv', selected.join(','));        // "cintura + bretelle"
      }

      if (compareBTC) q.set('compare_btc', '1');
      if (compareAlt && altCoin.trim()) q.set('compare_alt', toUSDT(altCoin));

      const url = `/api/analisi_light?${q.toString()}`;
      console.log('[DBG FE] fetchAnalisi url=', url, ' selectedTFs=', selected);

      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status} — ${t || 'no body'}`);
      }

      const json = await res.json();

      console.log("[UI] scenari_previsti:", json?.scenari_previsti?.length,
        " possibili_scenari:", json?.possibili_scenari?.length);

      // 3) Debug TF ricevuti
      const tfFromMeta = json?._meta?.tfs || [];
      const tfFromTrend = Object.keys(json?.trend_tf_score || {});
      console.log('[DBG FE] resp._meta.tfs=', tfFromMeta, ' trend_tf_score keys=', tfFromTrend);

      setResult(json);
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  // 1) Legge symbol e tf dalla URL una sola volta
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const sym = params.get('symbol');
    if (sym) {
      // "BTCUSDT" -> "BTC" per l'input
      setSymbol(sym.replace(/(USDT|USD)$/i, ''));
    }

    const tf = params.get('tf');
    if (tf) {
      const arr = tf.split(',').map(s => s.trim()).filter(Boolean);
      if (arr.length) setTimeframes(arr);
    }

    setBootstrapped(true);
  }, []);

  // 2) Dopo che ho applicato i parametri iniziali, faccio la prima fetch
  useEffect(() => {
    if (!bootstrapped) return;
    fetchAnalisi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapped]);

  const prezzo = useMemo(() => extractPrice(result ?? {}), [result]);

  const spiegazione = useMemo(
    () => (result as any)?.spiegazione ?? null,
    [result]
  );

  const sr = useMemo(() => normalizeSR(result ?? {}), [result]);

  const normalizedOverlayData = useMemo(() => {
    const base = overlayData ?? result ?? {};

    const backendEntries: any[] =
      (result?.entries ?? result?.entrate ?? result?.risposte?.entries ?? []) as any[];
    const mechanical = buildMechanicalEntries(prezzo, sr.supporti, sr.resistenze);
    const entries =
      Array.isArray((base as any)?.entries) && (base as any).entries.length
        ? (base as any).entries
        : backendEntries?.length
          ? backendEntries
          : mechanical;

    const liqNorm = normalizeLiquidity(
      (overlayData as any)?.liquidity ?? (result as any)?.liquidity ?? result
    );

    // PATCH: calcola le middles dal payload gia normalizzato
    const middles = buildMiddles({ ...(result ?? {}), liquidity: liqNorm })

    return {
      ...(result ?? {}),
      ...(overlayData ?? {}),
      prezzo: (overlayData as any)?.prezzo ?? prezzo,
      supporti: Array.isArray((overlayData as any)?.supporti)
        ? (overlayData as any).supporti
        : sr.supporti,
      resistenze: Array.isArray((overlayData as any)?.resistenze)
        ? (overlayData as any).resistenze
        : sr.resistenze,
      liquidity: liqNorm,
      entries,
      middles,              // aggiunto
      strategia_ai: (overlayData as any)?.strategia_ai ?? (result as any)?.strategia_ai,
      longshort: (overlayData as any)?.longshort ?? (result as any)?.longshort,
      alerts: (overlayData as any)?.alerts ?? (result as any)?.alerts ?? [],

    };
  }, [overlayData, prezzo, sr, result]);

  // View model per l'analisi ciclica:
  // usa i dati reali se esistono, altrimenti il mock di test.
  const ciclicaVm = useMemo(
    () => buildCiclicaViewModel((result as any)?.ciclica ?? mockCiclica),
    [result]
  );

  function openOverlay(key: OverlayKey, title: string, data?: any) {
    setOverlayKey(key);
    setOverlayTitle(title);
    setOverlayData(data ?? null);
  }
  function closeOverlay() {
    setOverlayKey(null);
    setOverlayData(null);
    setOverlayTitle('');
    setShowMiddles(false);
  }

  const overlayLabelByKey: Record<string, string> = {
    entrate: "Entrate (entries)",
    riepilogo: "Riepilogo totale",
    longshort: "Long o Short?",
    trigger_map: "Mappa dei Trigger",
    momentum_gauge: "Termometro d'Impulso",
    spiegazione: "Spiegazione",
    strategia_ai: "Strategia AI",
    box: "Box",
    middles: "Middles",
    supporti: "Supporti/Resistenze",
    liquidita: "Livelli di liquidita",
    scenari: "Scenari attivi",
    ciclica: "Analisi ciclica",
    grafico: "Grafico + Trendline",
  };

  // niente indicizzazione con null
  const a11yTitle =
    overlayTitle ||
    (overlayKey ? overlayLabelByKey[overlayKey] : undefined) ||
    "Dettagli overlay";

  const overlayNode = useMemo(() => {
    switch (overlayKey) {
      case 'supporti':
        return <SupportiResistenzeOverlay title="Supporti/Resistenze" data={normalizedOverlayData} />;
      case 'comparativa_full': {
        const compResult = (overlayData as any)?.result ?? {};
        const compSymbol = (overlayData as any)?.symbol ?? '';

        return (
          <div className="p-4">
            <div
              className="mb-4 font-mono text-[11px] tracking-[0.4em] uppercase"
              style={{ color: 'var(--color-text-dim)' }}
            >
              Vista completa — {compSymbol}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { key: 'longshort' as OverlayKey, label: 'Quadro Long o Short?' },
                { key: 'entrate' as OverlayKey, label: 'Entrate Mid-term' },
                { key: 'supporti' as OverlayKey, label: 'Supporti/Resistenze' },
                { key: 'scenari' as OverlayKey, label: 'Scenari attivi' },
                { key: 'riepilogo' as OverlayKey, label: 'Riepilogo totale' },
                { key: 'trigger_map' as OverlayKey, label: 'Mappa dei Trigger' },
                { key: 'momentum_gauge' as OverlayKey, label: "Termometro d'Impulso" },
                { key: 'strategia_ai' as OverlayKey, label: 'Strategia AI' },
                { key: 'liquidita' as OverlayKey, label: 'Livelli di liquidita' },
                { key: 'box' as OverlayKey, label: 'Box' },
                { key: 'spiegazione' as OverlayKey, label: 'Spiegazione' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  className="cassandra-card text-left px-4 py-3 font-mono text-[11px] tracking-[0.2em] transition-colors duration-200"
                  style={{ color: 'var(--color-text-dim)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-gold)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-dim)')}
                  onClick={() => {
                    if (key === 'box') {
                      openOverlay('box', `Box — ${compSymbol}`, { symbol: compSymbol, timeframes });
                    } else {
                      openOverlay(key, `${label} — ${compSymbol}`, compResult);
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        );
      }
      case 'liquidita': {
        // Normalizza il blocco come { above, below }
        const liqNorm = normalizeLiquidity(
          (normalizedOverlayData as any)?.liquidity ?? normalizedOverlayData
        );

        const currentPrice = extractPrice(normalizedOverlayData);

        // Adatta alla forma che si aspetta il LiquiditaOverlay: { sopra, sotto, _meta }
        const liquidityBlock: any = {
          sopra: liqNorm.above,
          sotto: liqNorm.below,
          _meta: {
            price: currentPrice ?? null,
            tfs: timeframes,
          },
        };

        return (
          <LiquiditaOverlay
            liquidity={liquidityBlock}
            prezzo={currentPrice}
            timeframes={timeframes as any}
            onClose={closeOverlay}
          />
        );
      }
      case 'scenari':
        return <ScenariOverlay title="Scenari attivi" data={normalizedOverlayData} />;
      case 'entrate':
        return <EntriesOverlay title="Entrate (entries)" data={normalizedOverlayData} />;
      case 'riepilogo':
        return <RiepilogoOverlay title="Riepilogo totale" data={normalizedOverlayData} />;
      case 'longshort':
        return (
          <LongShortOverlay
            trendPerTf={normalizedOverlayData?.trend_tf_score ?? {}}
            longshort={normalizedOverlayData?.longshort}
            timeframes={
              (normalizedOverlayData?.timeframes as string[]) ??
              Object.keys(normalizedOverlayData?.trend_tf_score ?? {})
            }
            spiegazione={(normalizedOverlayData as any)?.spiegazione}
            onClose={() => closeOverlay()}
          />
        );
      case 'trigger_map':
        return <TriggerMapOverlay title="Mappa dei Trigger" data={normalizedOverlayData} />;
      case 'momentum_gauge':
        return <MomentumGaugeOverlay title="Termometro d'Impulso" data={normalizedOverlayData} />;
      case 'spiegazione':
        return (
          <SpiegazioneOverlay
            title="Pregresso (da dove veniamo)"
            data={normalizedOverlayData}
          />
        );
      case 'alert':
        return <AlertOverlay title="Alert" data={normalizedOverlayData} />;
      case "scenari_previsti":
        return (
          <ScenariPrevistiOverlay
            data={overlayData}
            title="Scenari previsti"
          />
        );
      case 'strategia_ai':
        return (
          <StrategiaAIOverlay
            data={(normalizedOverlayData?.strategia_ai ?? [])}
            onClose={() => closeOverlay()}
          />
        );
      case 'box':
        return (
          <BoxOverlay
            title={overlayTitle || 'Box'}
            symbol={toUSDT(symbol)}
            timeframes={timeframes.length ? timeframes : ['1h']}
            basePct={0.001}
            capRatio={0.25}
            atrPeriod={14}
          />
        );
      case 'ciclica': {
        const vmFromOverlay = (overlayData as any)?.ciclicaVm as any;
        return <CiclicaOverlay data={vmFromOverlay ?? ciclicaVm} />;
      }
      case 'grafico':
        return <GraficoOverlay symbol={symbol} timeframes={timeframes} />;
      default:
        return null;
    }
    // dipendenze minime e sicure
  }, [overlayKey, normalizedOverlayData, overlayTitle, symbol, timeframes, ciclicaVm]);

  const CARDS = [
    { key: 'longshort'   as OverlayKey, icon: '➠', label: 'Long o Short?',       desc: 'Quadro direzionale multi-TF' },
    { key: 'supporti'    as OverlayKey, icon: '⬡', label: 'Supporti / Resistenze', desc: 'Livelli chiave di prezzo' },
    { key: 'scenari'     as OverlayKey, icon: '◈', label: 'Scenari attivi',         desc: 'Setup e contesti operativi' },
    { key: 'riepilogo'   as OverlayKey, icon: '◉', label: 'Riepilogo totale',       desc: 'Score e sintesi aggregata' },
    { key: 'alert'       as OverlayKey, icon: '◎', label: 'Alert',                  desc: 'Segnali e notifiche attive' },
    { key: 'strategia_ai'as OverlayKey, icon: '✦', label: 'Strategia AI',           desc: 'Setup generati da Cassandra' },
    { key: 'liquidita'   as OverlayKey, icon: '◌', label: 'Liquidita',              desc: 'Pool e livelli di liquidita' },
    { key: 'spiegazione' as OverlayKey, icon: '◍', label: 'Pregresso',              desc: 'Da dove veniamo' },
    { key: 'ciclica'     as OverlayKey, icon: '◐', label: 'Analisi ciclica',        desc: 'Fasi e finestre temporali' },
    { key: 'entrate'     as OverlayKey, icon: '⊕', label: 'Setup in costruzione',   desc: 'Entrate valide correnti' },
    { key: 'grafico'     as OverlayKey, icon: '◫', label: 'Grafico + Trendline',     desc: 'Chart con supporti e resistenze' },
  ] as const;

  return (
    <div className="w-full" style={{ color: 'var(--color-text)' }}>
      <div className="flex flex-col flex-1 max-w-5xl mx-auto">

        {/* Controls bar */}
        <div className="cassandra-card p-4 mb-6 flex flex-wrap gap-3 items-center">

          {/* Symbol input */}
          <div className="flex flex-col gap-1">
            <label
              className="font-mono text-[9px] tracking-[0.4em] uppercase"
              style={{ color: 'var(--color-text-dim)' }}
            >
              Symbol
            </label>
            <input
              className="bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-gold)] font-mono text-[11px] tracking-[0.1em] rounded-none focus:outline-none focus:border-[var(--color-border-focus)] px-3 py-1.5 w-24"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="ETH"
            />
          </div>

          {/* TF pills */}
          <div className="flex flex-col gap-1">
            <span
              className="font-mono text-[9px] tracking-[0.4em] uppercase"
              style={{ color: 'var(--color-text-dim)' }}
            >
              TF
            </span>
            <div className="flex flex-wrap gap-1">
              {TF_PRESET.map((tf) => {
                const active = timeframes.includes(tf);
                return (
                  <button
                    key={tf}
                    className={
                      active
                        ? 'bg-[rgba(201,168,76,0.08)] border border-[var(--color-border)] text-[var(--color-gold)] font-mono text-[10px] tracking-[0.2em] uppercase rounded-none px-2 py-0.5 transition-colors duration-200'
                        : 'bg-transparent border border-transparent text-[var(--color-text-dim)] hover:text-[var(--color-gold)] hover:border-[var(--color-border-dim)] font-mono text-[10px] tracking-[0.2em] uppercase rounded-none px-2 py-0.5 transition-colors duration-200'
                    }
                    onClick={() =>
                      setTimeframes((prev) =>
                        prev.includes(tf) ? prev.filter((x) => x !== tf) : [...prev, tf]
                      )
                    }
                  >
                    {tf}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Compare checkboxes */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer select-none font-mono text-[10px] tracking-[0.2em]" style={{ color: 'var(--color-text-dim)' }}>
              <input
                type="checkbox"
                className="accent-[var(--color-gold)]"
                checked={compareBTC}
                onChange={(e) => setCompareBTC(e.target.checked)}
              />
              Comparativa BTC
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none font-mono text-[10px] tracking-[0.2em]" style={{ color: 'var(--color-text-dim)' }}>
              <input
                type="checkbox"
                className="accent-[var(--color-gold)]"
                checked={compareAlt}
                onChange={(e) => setCompareAlt(e.target.checked)}
              />
              Altra coin
              {compareAlt && (
                <input
                  className="bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-gold)] font-mono text-[11px] tracking-[0.1em] rounded-none focus:outline-none focus:border-[var(--color-border-focus)] ml-1 w-20 px-2 py-0.5"
                  value={altCoin}
                  onChange={(e) => setAltCoin(e.target.value)}
                  placeholder="SOL"
                />
              )}
            </label>
          </div>

          {/* Analizza button */}
          <button
            onClick={() => fetchAnalisi()}
            className="ml-auto bg-[var(--color-gold)] text-[var(--color-void)] font-mono text-[10px] tracking-[0.3em] uppercase rounded-none hover:bg-[var(--color-gold-bright)] transition-colors duration-200 px-5 py-1.5"
          >
            Analizza
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="cassandra-card p-3 mb-4 border-l-2 border-[var(--color-short-bright)] text-[var(--color-short-bright)] font-mono text-[11px]">
            {error}
          </div>
        )}

        {/* Prezzo attuale */}
        {Number.isFinite(prezzo as number) && (
          <div className="mb-6 flex items-center gap-3">
            <span className="section-tag">{symbol.toUpperCase()}</span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '20px',
                color: 'var(--color-gold)',
              }}
            >
              {(prezzo as number).toLocaleString('it-IT', { maximumFractionDigits: 8 })}
            </span>
          </div>
        )}

        {/* Cards grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-4">
          {CARDS.map(({ key, icon, label, desc }) => {
            const isActive = overlayKey === key;
            return (
              <button
                key={key}
                className="cassandra-card cassandra-card-corners text-left p-4 flex flex-col gap-1 transition-colors duration-200"
                style={
                  isActive
                    ? { background: 'rgba(201,168,76,0.06)', borderColor: 'var(--color-border)' }
                    : undefined
                }
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(201,168,76,0.04)';
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = '';
                }}
                onClick={() => openOverlay(key, label, result)}
              >
                <span
                  className="text-base leading-none"
                  style={{ color: 'var(--color-gold-dim)' }}
                >
                  {icon}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '12px',
                    color: 'var(--color-gold)',
                    fontWeight: 400,
                  }}
                >
                  {label}
                </span>
                <span
                  className="font-mono text-[10px] leading-tight"
                  style={{ color: 'var(--color-text-dim)' }}
                >
                  {desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* Analisi comparativa */}
        {result?.comparative && (
          <div className="mt-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="section-tag">Analisi comparativa</span>
              <div className="flex-1 h-px" style={{ background: 'var(--color-border-dim)' }} />
            </div>
            <div className="grid gap-2">
              {Object.entries(result.comparative).map(([sym, comp]: any) => {
                const symBase = String(sym).replace(/(USDT|USD)$/i, '');
                const deltaTxt = typeof comp?.delta === 'number'
                  ? (comp.delta > 0 ? `+${comp.delta.toFixed(1)}` : comp.delta.toFixed(1))
                  : String(comp?.delta ?? '');
                return (
                  <div key={sym} className="flex items-center gap-2">
                    <button
                      className="cassandra-card flex-1 px-4 py-2.5 text-left font-mono text-[11px] tracking-[0.1em] transition-colors duration-200"
                      onClick={() =>
                        openOverlay('comparativa_full', `${sym} — Cross-coin view`, {
                          symbol: sym,
                          result: comp.analysis,
                        })
                      }
                    >
                      <span style={{ color: 'var(--color-text)' }}>{sym}</span>
                      <span className="mx-2" style={{ color: 'var(--color-text-dim)' }}>·</span>
                      <span style={{ color: 'var(--color-text-dim)' }}>{comp?.direction}</span>
                      <span className="mx-1" style={{ color: 'var(--color-text-dim)' }}>·</span>
                      <span style={{ color: 'var(--color-cyan)' }}>{comp?.score} pt.</span>
                      <span className="mx-1" style={{ color: 'var(--color-text-dim)' }}>·</span>
                      <span style={{ color: comp?.delta > 0 ? 'var(--color-long-bright)' : 'var(--color-short-bright)' }}>
                        D {deltaTxt}
                      </span>
                    </button>

                    <button
                      className="cassandra-card px-3 py-2.5 font-mono text-[11px] transition-colors duration-200"
                      style={{ color: 'var(--color-text-dim)' }}
                      title="Analisi ciclica comparativa"
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-cyan)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-dim)')}
                      onClick={(e) => {
                        e.stopPropagation();
                        const followerRaw = (comp?.analysis as any)?.ciclica ?? null;
                        const followerBase = buildCiclicaViewModel(followerRaw);
                        const followerVm = buildFollowerWithCrossSync(
                          ciclicaVm,
                          followerBase,
                          toUSDT(String(symbol || 'BTC')),
                        );
                        openOverlay('ciclica', `Analisi ciclica comparativa — ${sym}`, {
                          ciclicaVm: followerVm,
                        });
                      }}
                    >
                      ◐
                    </button>

                    <button
                      className="cassandra-card px-3 py-2.5 font-mono text-[11px] transition-colors duration-200"
                      style={{ color: 'var(--color-text-dim)' }}
                      title="Apri Cassandra per questa coin"
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-cyan)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-dim)')}
                      onClick={(e) => {
                        e.stopPropagation();
                        const tfParam = encodeURIComponent(timeframes.join(','));
                        window.open(`/?program=Cassandra&symbol=${symBase}&tf=${tfParam}`, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      ↗
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Debug */}
        <div className="mt-6">
          <details className="group">
            <summary
              className="cursor-pointer font-mono text-[11px] tracking-[0.2em] transition-colors duration-200 select-none"
              style={{ color: 'var(--color-text-faint)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-dim)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-faint)')}
            >
              Disclaimer — uso amatoriale, nessun consiglio finanziario
            </summary>
            {result ? (
              <div
                className="cassandra-card mt-2 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.3em]"
                    style={{ color: 'var(--color-text-dim)' }}
                  >
                    JSON debug
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadJson(result, 'cassandra_debug.json')}
                    className="cassandra-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors duration-200"
                    style={{ color: 'var(--color-text-dim)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-gold)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-dim)')}
                  >
                    Scarica .json
                  </button>
                </div>
                <pre
                  className="max-h-[400px] overflow-auto whitespace-pre font-mono text-[11px]"
                  style={{ color: 'var(--color-text-dim)' }}
                >
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            ) : (
              <p
                className="mt-2 font-mono text-[11px]"
                style={{ color: 'var(--color-text-dim)' }}
              >
                Nessun dato (result = null).
              </p>
            )}
          </details>
        </div>

        {/* Dialog overlay */}
        <Dialog
          open={Boolean(overlayKey) || Boolean(showMiddles)}
          onOpenChange={(v: boolean) => { if (!v) closeOverlay(); }}
        >
          <DialogContent className="text-white bg-transparent border-0 p-0">
            <DialogTitle className="sr-only">{a11yTitle}</DialogTitle>
            <DialogDescription className="sr-only">Dettagli overlay</DialogDescription>
            <div className="w-[96vw] max-w-[1200px] max-h-[90vh]">
              <div
                className="px-6 py-5 overflow-y-auto"
                style={{
                  background: 'var(--color-deep)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 0,
                }}
              >
                {overlayNode}
                {showMiddles && overlayKey !== 'box' && (
                  <MiddleOverlay data={normalizedOverlayData?.middles ?? []} />
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
