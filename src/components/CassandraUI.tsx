'use client';

import OrionePanel from './orione/OrionePanel';

import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import ChartPreview from "@/components/ChartPreview";
import type { AnalisiLightResponse } from "@/types/analisiLight";  // ⬅️ AGGIUNGI QUESTA

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
import ScenariOverlay from './overlays/ScenariOverlay';
import AlertOverlay from './overlays/AlertOverlay';
import ScenariPrevistiOverlay from "@/components/overlays/ScenariPrevistiOverlay";
import { buildCiclicaViewModel, buildFollowerWithCrossSync } from "@/lib/ciclica/ciclicaViewModel";
import { CiclicaOverlay } from "@/components/ciclica/CiclicaOverlay";
import { mockCiclica } from "@/lib/ciclica/mockCiclica"; // 👈 nuovo


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
  | 'comparativa_full'
  | 'scenari_previsti'
  | 'ciclica' // 👈 NEW
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

/** bridge sopra/sotto ↔ above/below  */
function normalizeLiquidity(result: any): { above: any[]; below: any[] } {
  const cand =
    result?.liquidity ??
    result?.livelli_liquidita ??
    result?.livelli_liquidità ??
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
  const [symbol, setSymbol] = useState<string>('ETH');
  const [timeframes, setTimeframes] = useState<string[]>(['1h']);
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

      // 1) Costruisci l’elenco TF dalla UI (fallback a 1h)
      const selected: string[] = (timeframes && timeframes.length ? timeframes : ['1h'])
        .map(tf => String(tf).trim())
        .filter(Boolean);

      // 2) Query robusta: invia sia multipli (append) sia csv (timeframes_csv)
      const q = new URLSearchParams();
      q.set('coin', coin);
      q.set('tipo', 'riepilogo_totale');
      q.set("programma", "cassandra");     // <-- forza la pipeline con i builders
      q.set("scenari_min_rr", "1.4");
      q.set("scenari_min_score", "50");
      q.set("scenari_max_move_pct", "0.6");


      if (selected.length) {
        selected.forEach(tf => q.append('timeframes', tf)); // per getAll lato API route
        q.set('timeframes_csv', selected.join(','));        // “cintura + bretelle”
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

    // PATCH: calcola le middles dal payload già normalizzato
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
      middles,              // ← aggiunto
      strategia_ai: (overlayData as any)?.strategia_ai ?? (result as any)?.strategia_ai,
      longshort: (overlayData as any)?.longshort ?? (result as any)?.longshort,
      alerts: (overlayData as any)?.alerts ?? (result as any)?.alerts ?? [],

    };
  }, [overlayData, prezzo, sr, result]);

  // View model per l’analisi ciclica:
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
    momentum_gauge: "Termometro d’Impulso",
    spiegazione: "Spiegazione",
    strategia_ai: "Strategia AI",
    box: "Box",
    middles: "Middles",
    supporti: "Supporti/Resistenze",
    liquidita: "Livelli di liquidità",
    scenari: "Scenari attivi",
    ciclica: "Analisi ciclica",
  };

  // ✅ niente indicizzazione con null
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
            <div className="mb-3 font-semibold">Vista completa — {compSymbol}</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
                onClick={() => openOverlay('longshort', `Long o Short? — ${compSymbol}`, compResult)}>
                🧭 Long o Short?
              </button>
              <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
                onClick={() => openOverlay('entrate', `Entrate — ${compSymbol}`, compResult)}>
                🎯 Entrate Mid-term
              </button>
              <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
                onClick={() => openOverlay('supporti', `Supporti/Resistenze — ${compSymbol}`, compResult)}>
                🛡️ Supporti/Resistenze
              </button>
              <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
                onClick={() => openOverlay('scenari', `Scenari attivi — ${compSymbol}`, compResult)}>
                🧩 Scenari attivi
              </button>
              <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
                onClick={() => openOverlay('riepilogo', `Riepilogo totale — ${compSymbol}`, compResult)}>
                📊 Riepilogo totale
              </button>
              <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
                onClick={() => openOverlay('trigger_map', `Mappa dei Trigger — ${compSymbol}`, compResult)}>
                🗺️ Mappa dei Trigger
              </button>
              <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
                onClick={() => openOverlay('momentum_gauge', `Termometro d’Impulso — ${compSymbol}`, compResult)}>
                🌡️ Termometro d’Impulso
              </button>
              <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
                onClick={() => openOverlay('strategia_ai', `Strategia AI — ${compSymbol}`, compResult)}>
                🧪 Strategia AI
              </button>
              <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
                onClick={() => openOverlay('liquidita', `Livelli di liquidità — ${compSymbol}`, compResult)}>
                💧 Livelli di liquidità
              </button>
              <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
                onClick={() => openOverlay('box', `Box — ${compSymbol}`, { symbol: compSymbol, timeframes })}>
                📦 Box
              </button>
              <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
                onClick={() => openOverlay('spiegazione', `Spiegazione — ${compSymbol}`, compResult)}>
                🧠 Spiegazione
              </button>
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
            onClose={() => closeOverlay()}
          />
        );
      case 'trigger_map':
        return <TriggerMapOverlay title="Mappa dei Trigger" data={normalizedOverlayData} />;
      case 'momentum_gauge':
        return <MomentumGaugeOverlay title="Termometro d’Impulso" data={normalizedOverlayData} />;
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
      default:
        return null;
    }
    // dipendenze minime e sicure
  }, [overlayKey, normalizedOverlayData, overlayTitle, symbol, timeframes, ciclicaVm]);

  return (
    <div className="min-h-screen w-full bg-black text-white flex justify-start items-stretch">
      <div className="flex flex-col flex-1 max-w-6xl mx-auto p-4">
        <div className="mb-4 flex flex-wrap gap-2 items-center">
          <div className="font-semibold text-lg mr-2">Cassandra</div>
          <div className="text-sm opacity-80">symbol:</div>
          <input
            className="px-2 py-1 bg-black/40 rounded border border-white/10 mx-2"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="ETH"
          />
          <div className="text-sm opacity-80">TF:</div>
          <div className="flex gap-1 mx-2">
            {TF_PRESET.map((tf) => {
              const active = timeframes.includes(tf);
              return (
                <button
                  key={tf}
                  className={`px-2 py-1 rounded border text-xs ${active ? "bg-emerald-600 border-emerald-500"
                    : "bg-black/40 border-white/10"
                    }`}
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

          <div className="flex items-center gap-3 ml-4">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={compareBTC}
                onChange={(e) => setCompareBTC(e.target.checked)}
              />
              <span>Analisi comparativa con BTC</span>
            </label>

            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={compareAlt}
                onChange={(e) => setCompareAlt(e.target.checked)}
              />
              <span>Comparativa con altra coin</span>
              {compareAlt && (
                <input
                  className="ml-2 px-2 py-1 bg-black/40 rounded border border-white/10 text-xs"
                  value={altCoin}
                  onChange={(e) => setAltCoin(e.target.value)}
                  placeholder="Es. SOL"
                />
              )}
            </label>
          </div>

          <Button variant="secondary" onClick={() => fetchAnalisi()} className="ml-2">
            Applica
          </Button>
          {error && <div className="ml-4 text-red-400 text-sm">Errore: {error}</div>}
        </div>

        {/* Chip prezzo attuale */}
        {Number.isFinite(prezzo as number) && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm opacity-70">Prezzo</span>
            <span className="px-2 py-1 rounded bg-white/10 border border-white/15 font-mono tabular-nums">
              {(prezzo as number).toLocaleString("it-IT", {
                maximumFractionDigits: 8,
              })}
            </span>
          </div>
        )}

        {/* Cards */}
        <div className="mt-4 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
            <button
              className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
              onClick={() => openOverlay('longshort', 'Long o Short?', result)}
            >
              🧭 Long o Short?
            </button>

            <button
              className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
              onClick={() => openOverlay('supporti', 'Supporti/resistenze', result)}
            >
              🛡️ Supporti/resistenze
            </button>

            <button
              className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
              onClick={() => openOverlay('scenari', 'Scenari attivi', result)}
            >
              🧩 Scenari attivi
            </button>

            <button
              className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
              onClick={() => openOverlay('riepilogo', 'Riepilogo totale', result)}
            >
              📊 Riepilogo totale
            </button>

            <button
              className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
              onClick={() => openOverlay('alert', 'Alert', result)}
            >
              🔔 Alert
            </button>

            <button
              className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
              onClick={() => openOverlay('strategia_ai', 'Strategia AI', result)}
            >
              🧪 Strategia AI
            </button>

            <button
              className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
              onClick={() => openOverlay('liquidita', 'Livelli di liquidità', result)}
            >
              💧 Livelli di liquidità
            </button>

            <button
              className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
              onClick={() => openOverlay('spiegazione', 'Spiegazione', result)}
            >
              🧠 Spiegazione
            </button>
            <button
              className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
              onClick={() => openOverlay('ciclica', 'Analisi ciclica', result)}
            >
              ⏳ Analisi ciclica
            </button>

            {/*
        <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
          onClick={() => openOverlay('box', 'Box', { symbol: toUSDT(symbol), timeframes })}>
          📦 Box
        </button>
        */}
            {/*
        <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
          onClick={() => openOverlay('momentum_gauge', "Termometro d'Impulso", result)}>
          🌡️ Termometro d’Impulso
        </button>
        */}
            {/*
        <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
          onClick={() => openOverlay('trigger_map', 'Mappa dei Trigger', result)}>
          🗺️ Mappa dei Trigger
        </button>
        */}{/*
        <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
          onClick={() => setShowMiddles(true)}>
          ⭕ Middles
        </button>
        */}
            {/* 🔥 NUOVA SCHEDA */}
            {/*
        <button
          className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
          onClick={() =>
            openOverlay('scenari_previsti', 'Scenari previsti', {
              ...(result || {}),
              // normalizza il payload che userà l’overlay
              scenari_previsti: (result?.scenari_previsti ?? result?.possibili_scenari ?? []),
              prezzo_corrente: (prezzo ?? (result as any)?.prezzo_corrente ?? null),
            })
          }
        >
          🗓️ Possibili Scenari Long-term
        </button>
        */}

            <button className="rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
              onClick={() => openOverlay('entrate', 'Ci sono entrate valide?', result)}>
              🎯 Setup in costruzione
            </button>


          </div>
        </div>

        {result?.comparative && (
          <div className="mt-6">
            <div className="font-semibold text-lg mb-2">⚖️ Analisi comparativa</div>
            <div className="grid gap-2">
              {Object.entries(result.comparative).map(([sym, comp]: any) => {
                const symBase = String(sym).replace(/(USDT|USD)$/i, '');
                const deltaTxt = typeof comp?.delta === 'number'
                  ? (comp.delta > 0 ? `+${comp.delta.toFixed(1)}` : comp.delta.toFixed(1))
                  : String(comp?.delta ?? '');
                return (
                  <div key={sym} className="flex items-center gap-2">
                    <button
                      className="flex-1 rounded-lg px-4 py-3 bg-white/5 hover:bg-white/10 text-left"
                      onClick={() =>
                        openOverlay('comparativa_full', `${sym} — Cross-coin view`, {
                          symbol: sym,
                          result: comp.analysis,
                        })
                      }
                    >
                      {sym}: {comp?.direction} ({comp?.score} pt.) Δ score {deltaTxt}
                    </button>

                    {/* ⏳ Analisi ciclica comparativa (usa crossSync) */}
                    <button
                      className="px-3 py-3 rounded-lg bg-white/5 hover:bg-white/10"
                      title="Analisi ciclica comparativa"
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
                      ⏳
                    </button>

                    <button
                      className="px-3 py-3 rounded-lg bg-white/5 hover:bg-white/10"
                      title="Apri Cassandra per questa coin"
                      onClick={(e) => {
                        e.stopPropagation();
                        const tfParam = encodeURIComponent(timeframes.join(','));
                        window.open(`/?program=Cassandra&symbol=${symBase}&tf=${tfParam}`, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      ↗︎
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Debug */}
        <div className="mt-6">
          <details>
            <summary className="cursor-pointer text-white/70">
              QUESTA PAGINA E&apos; AMATORIALE E NON FORNISCE SUGGERIMENTI FINANZIARI, E&apos; STATA CREATA SOLO COME TEST E NON HA NESSUN VALORE NELL&apos;ANALISI REALE
            </summary>

            {result ? (
              <div className="mt-2 rounded bg-black/40 p-3 text-xs">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-zinc-400">
                    JSON debug
                  </span>

                  <button
                    type="button"
                    onClick={() => downloadJson(result, "cassandra_debug.json")}
                    className="rounded-md border border-zinc-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide hover:bg-zinc-800"
                  >
                    Scarica .json
                  </button>
                </div>

                <pre className="max-h-[400px] overflow-auto whitespace-pre font-mono text-xs">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="mt-2 text-xs text-zinc-500">
                Nessun dato disponibile (result = null).
              </p>
            )}
          </details>
        </div>

        <Dialog
          open={Boolean(overlayKey) || Boolean(showMiddles)}
          onOpenChange={(v: boolean) => {
            if (!v) closeOverlay();
          }}
        >
          <DialogContent className="text-white bg-transparent border-0 p-0">
            <DialogTitle className="sr-only">{a11yTitle}</DialogTitle>
            <DialogDescription className="sr-only">
              Dettagli overlay
            </DialogDescription>
            <div className="w-[96vw] max-w-[1200px] max-h-[90vh]">
              <div className="rounded-2xl bg-zinc-900/95 ring-1 ring-white/10 shadow-xl px-6 py-5 overflow-y-auto">
                {overlayNode}
                {showMiddles && overlayKey !== "box" && (
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
