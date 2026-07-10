'use client';

import React, { useCallback, useEffect, useState } from 'react';
import SmartChart, { type ShowFlags, type BoxLayer } from '@/components/ui/SmartChart';
import type { OHLCV } from '@/lib/chartCompute';
import type { HeatmapPoint } from '@/lib/liquidationHeatmap';
import { API } from '@/api';

// Finestra storica richiesta all'endpoint heatmap — v1 fissa, indipendente
// dal timeframe/numero di barre visualizzate sul grafico OHLCV.
const HEATMAP_DAYS = 365;

const BYBIT_INTERVAL: Record<string, string> = {
  '1m':'1','3m':'3','5m':'5','15m':'15','30m':'30',
  '1h':'60','2h':'120','4h':'240','6h':'360','12h':'720',
  '1d':'D','1w':'W',
};

async function fetchBybit(symbol: string, tf: string, bars: number): Promise<OHLCV[]> {
  const interval = BYBIT_INTERVAL[tf] ?? tf;
  const sym = symbol.replace(/USDT$/i, '').toUpperCase() + 'USDT';
  const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}&interval=${interval}&limit=${bars}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Bybit ${res.status}`);
  const json = await res.json();
  return ((json?.result?.list ?? []) as any[][])
    .map(r => ({
      time:   Math.floor(Number(r[0]) / 1000),
      open:   Number(r[1]),
      high:   Number(r[2]),
      low:    Number(r[3]),
      close:  Number(r[4]),
      volume: Number(r[5]),
    }))
    .reverse();
}

// ──────────────────────────────
//  Colori EMA (must match chartTheme)
// ──────────────────────────────
const EMA_COLORS: Record<number, string> = {
  9: '#e8c96a', 21: '#0abfbc', 50: '#9a6abf', 200: '#bf4a4a',
};

// ──────────────────────────────
//  Voci legenda
// ──────────────────────────────
const LEGEND: { key: keyof ShowFlags; label: string; color: string; desc: string }[] = [
  { key: 'ema9',       label: 'EMA 9',    color: '#e8c96a', desc: 'Media mobile veloce a 9 periodi. Indica il momentum a brevissimo termine.' },
  { key: 'ema21',      label: 'EMA 21',   color: '#0abfbc', desc: 'Media a breve termine. Usata come supporto/resistenza dinamico.' },
  { key: 'ema50',      label: 'EMA 50',   color: '#9a6abf', desc: 'Livello istituzionale a medio termine. Rottura → cambio di fase.' },
  { key: 'ema200',     label: 'EMA 200',  color: '#bf4a4a', desc: 'Trend strutturale. Sopra = bullish, sotto = bearish sul lungo periodo.' },
  { key: 'volume',     label: 'Volume',   color: '#c9a84c', desc: 'Quantità scambiata per barra. Alto volume conferma breakout; basso li mette in dubbio.' },
  { key: 'trendlines', label: 'Trendline',color: '#3da866', desc: 'Linee dinamiche che collegano pivot di minimo (verde = supporto) e massimo (rosso = resistenza). Il filtro tocchi mostra solo linee confermate N+ volte.' },
  { key: 'srZones',    label: 'Zone SR',  color: '#26a69a', desc: 'Aree di prezzo dove il mercato ha rimbalzato più volte. Verde = supporto (sotto prezzo), rosso = resistenza (sopra). Le due linee indicano i bordi della zona.' },
  { key: 'boxes',      label: 'Box ATR',  color: '#c9a84c', desc: 'Zone di consolidamento rilevate con soglia ATR dinamica. Linea superiore = top del box, tratteggio = bottom. Box attivo in oro pieno, storici in trasparenza.' },
  { key: 'liquidationHeatmap', label: 'Liq. Heatmap', color: '#c94c4c', desc: 'Livelli di liquidazione stimati su modello statistico (distribuzione leva assunta, non dati reali sulle posizioni aperte). Colore più intenso = maggiore densità stimata.' },
];

// ──────────────────────────────
//  Sub-components
// ──────────────────────────────
function ToggleChip({
  label, color, active, onClick,
}: { label: string; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-mono transition-all select-none ${
        active ? 'text-white/75' : 'text-white/25 hover:text-white/45'
      }`}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0 transition-all"
        style={{
          background: active ? color : 'transparent',
          border: `1.5px solid ${active ? color : 'rgba(255,255,255,0.15)'}`,
        }}
      />
      {label}
    </button>
  );
}

// ──────────────────────────────
//  Main component
// ──────────────────────────────
export default function GraficoOverlay({
  symbol = 'BTC',
  timeframes = ['15m', '1h', '4h', '1d'],
}: {
  symbol?: string;
  timeframes?: string[];
}) {
  const tfs = timeframes.length > 0 ? timeframes : ['1h'];
  const [activeTf, setActiveTf]   = useState(tfs[0]);
  const [cache, setCache]         = useState<Record<string, OHLCV[] | null>>({});
  const [loading, setLoading]     = useState(false);

  const [show, setShow] = useState<ShowFlags>({
    ema9: false, ema21: true, ema50: false, ema200: false,
    volume: false, trendlines: true, srZones: true, boxes: false,
    liquidationHeatmap: false,
  });
  const [minTouches, setMinTouches] = useState(2);
  const [showLegend, setShowLegend] = useState(false);
  const [boxData, setBoxData] = useState<BoxLayer[]>([]);
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const [heatmapLoadedFor, setHeatmapLoadedFor] = useState<string | null>(null);

  const toggle = useCallback((key: keyof ShowFlags) => {
    setShow(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Reset cache when symbol changes
  useEffect(() => {
    setActiveTf(tfs[0]);
    setCache({});
    setHeatmapPoints([]);
    setHeatmapLoadedFor(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // Fetch OHLCV on TF/symbol change
  useEffect(() => {
    if (cache[activeTf] !== undefined) return;
    let alive = true;
    setLoading(true);
    fetchBybit(symbol, activeTf, 300)
      .then(ohlcv => {
        if (!alive) return;
        setCache(prev => ({ ...prev, [activeTf]: ohlcv }));
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setCache(prev => ({ ...prev, [activeTf]: null }));
        setLoading(false);
      });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTf, symbol, cache]);

  // Fetch boxes on TF/symbol change (sempre, toggle controlla solo visibilità)
  useEffect(() => {
    let alive = true;
    const sym = symbol.replace(/USDT$/i, '').toUpperCase() + 'USDT';
    const qs = new URLSearchParams({ symbol: sym, timeframe: activeTf, limit: '300' });
    fetch(`${API}/api/box/boxes.json?${qs}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!alive || !json?.boxes) return;
        setBoxData(
          (json.boxes as any[])
            .filter(b => typeof b.top === 'number' && typeof b.bottom === 'number')
            .map(b => ({ top: b.top as number, bottom: b.bottom as number, active: !!b.active }))
        );
      })
      .catch(() => {});
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTf, symbol]);

  // Fetch heatmap liquidazione — LAZY: solo al primo toggle ON per questo
  // symbol, non ad ogni apertura del grafico (dati storici pesanti, ~18k
  // punti nel caso peggiore). Non rifetcha su toggle OFF/ON successivi.
  useEffect(() => {
    if (!show.liquidationHeatmap || heatmapLoadedFor === symbol) return;
    let alive = true;
    const coin = symbol.replace(/USDT$/i, '').toUpperCase();
    const url = `${API}/api/oi/liquidation-heatmap?coin=${coin}&days=${HEATMAP_DAYS}`;
    fetch(url, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!alive) return;
        setHeatmapPoints(Array.isArray(json?.points) ? json.points : []);
        setHeatmapLoadedFor(symbol);
      })
      .catch(() => {
        if (alive) setHeatmapLoadedFor(symbol);
      });
    return () => { alive = false; };
  }, [show.liquidationHeatmap, symbol, heatmapLoadedFor]);

  const ohlcv = (cache[activeTf] ?? []) as OHLCV[];
  const hasData = ohlcv.length > 0;

  return (
    <div className="flex flex-col gap-3">

      {/* ── TF tabs ── */}
      <div className="flex gap-1.5 flex-wrap">
        {tfs.map(tf => (
          <button
            key={tf}
            onClick={() => setActiveTf(tf)}
            className={`px-3 py-1 rounded-lg text-xs font-mono transition-all ${
              activeTf === tf
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-white/40 hover:text-white/70 border border-white/10'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* ── Chart ── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {loading && (
          <div className="h-80 flex items-center justify-center text-white/30 text-sm font-mono">
            Carico grafico…
          </div>
        )}
        {!loading && hasData && (
          <SmartChart
            ohlcv={ohlcv}
            height={420}
            show={show}
            minTouches={minTouches}
            boxData={boxData}
            heatmapPoints={heatmapPoints}
          />
        )}
        {!loading && !hasData && cache[activeTf] !== undefined && (
          <div className="h-80 flex items-center justify-center text-white/30 text-sm">
            Nessun dato per {activeTf}
          </div>
        )}
      </div>

      {/* ── Controls ── */}
      {hasData && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2 px-1">

          {/* EMA group */}
          {([9, 21, 50, 200] as const).map(p => (
            <ToggleChip
              key={p}
              label={`EMA ${p}`}
              color={EMA_COLORS[p]}
              active={show[`ema${p}` as keyof ShowFlags]}
              onClick={() => toggle(`ema${p}` as keyof ShowFlags)}
            />
          ))}

          <span className="mx-1 h-3 w-px bg-white/10 inline-block" />

          {/* Volume */}
          <ToggleChip label="Volume" color="#c9a84c" active={show.volume} onClick={() => toggle('volume')} />

          <span className="mx-1 h-3 w-px bg-white/10 inline-block" />

          {/* Trendlines + touch filter */}
          <div className="flex items-center gap-1">
            <ToggleChip
              label="Trendline"
              color="#3da866"
              active={show.trendlines}
              onClick={() => toggle('trendlines')}
            />
            {show.trendlines && (
              <div className="flex gap-0.5 ml-0.5">
                {([2, 3, 4] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setMinTouches(n)}
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-all ${
                      minTouches === n
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'text-white/25 border border-white/10 hover:text-white/50'
                    }`}
                  >
                    {n === 4 ? '4+' : `${n}+`}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="mx-1 h-3 w-px bg-white/10 inline-block" />

          {/* SR Zones */}
          <ToggleChip label="Zone SR" color="#26a69a" active={show.srZones} onClick={() => toggle('srZones')} />

          <span className="mx-1 h-3 w-px bg-white/10 inline-block" />

          {/* Box ATR */}
          <ToggleChip label="Box ATR" color="#c9a84c" active={show.boxes} onClick={() => toggle('boxes')} />

          <span className="mx-1 h-3 w-px bg-white/10 inline-block" />

          {/* Liquidation Heatmap */}
          <ToggleChip
            label="Liq. Heatmap"
            color="#c94c4c"
            active={show.liquidationHeatmap}
            onClick={() => toggle('liquidationHeatmap')}
          />

          {/* Legend toggle — right-aligned */}
          <button
            onClick={() => setShowLegend(v => !v)}
            className="ml-auto text-[10px] text-white/25 hover:text-white/50 font-mono transition-colors px-1"
          >
            {showLegend ? '▲ chiudi' : '▼ legenda'}
          </button>
        </div>
      )}

      {/* ── Disclaimer heatmap — sempre visibile quando attiva, non solo nella legenda ── */}
      {hasData && show.liquidationHeatmap && (
        <p className="text-[10px] text-white/25 font-mono px-1 leading-relaxed">
          Livelli stimati su modello statistico — distribuzione leva assunta (non dati reali
          sulle posizioni aperte). Dati OI aggregati da Binance, Bybit, OKX e Hyperliquid.
        </p>
      )}

      {/* ── Legend ── */}
      {hasData && showLegend && (
        <div
          className="rounded-xl px-4 py-3 flex flex-col gap-2.5"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {LEGEND.filter(it => show[it.key]).map(it => (
            <div key={it.key} className="flex gap-2.5 items-start">
              <span
                className="mt-[3px] flex-shrink-0 w-2 h-2 rounded-full"
                style={{ background: it.color, opacity: 0.85 }}
              />
              <p className="text-[11px] leading-relaxed">
                <span className="font-mono text-white/60 mr-1">{it.label}</span>
                <span className="text-white/35">{it.desc}</span>
              </p>
            </div>
          ))}
          {LEGEND.every(it => !show[it.key]) && (
            <p className="text-[11px] text-white/20">Attiva almeno un layer per vedere la legenda.</p>
          )}
          <div className="mt-1 pt-2 border-t border-white/5 text-[10px] text-white/20 font-mono">
            Trendline: verde = supporto dinamico · rosso = resistenza · tratteggio = storica
          </div>
        </div>
      )}
    </div>
  );
}
