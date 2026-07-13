'use client';

import React, { useEffect, useState } from 'react';
import SmartChart, { type ShowFlags } from '@/components/ui/SmartChart';
import type { OHLCV } from '@/lib/chartCompute';
import type { HeatmapPoint } from '@/lib/liquidationHeatmap';
import HelpButton from '@/components/help/HelpButton';
import { LiquidationSweepSection, type LiquidationSweep } from '@/components/dna/LiquidationSweepSection';

// Heatmap stile Coinglass nella scheda Liquidazioni (2026-07-13) — vedi piano
// "Heatmap stile Coinglass nella scheda Liquidazioni". Riusa SmartChart (già
// generico) e /api/oi/liquidation-clusters (join lato backend di Sweep
// Probability + Cluster Lifecycle + Cluster Story, stessa tolleranza di
// prossimità del sistema persistente — nessun secondo match qui).

// ── Tipi ─────────────────────────────────────────────────────────────────────

interface EnrichedLevel {
  price: number;
  side: 'long' | 'short';
  distance_pct: number;
  value_today: number;
  value_max: number;
  days_count: number;
  size_percentile: number;
  lifecycle_state: string | null;
  cluster_id: string | null;
  // probability/breakdown sono presenti nella risposta ma NON vengono letti
  // qui: il backtest non ha validato una probabilità aggregata, vedi piano.
}

interface EnrichedClustersResponse {
  coin: string;
  days: number;
  current_price: number;
  above: EnrichedLevel[];
  below: EnrichedLevel[];
  size_percentile_n: number;
  story_lines: string[];
  disclaimer: string;
}

const PERIODS = [7, 30, 90, 365] as const;
type Period = typeof PERIODS[number];

const BYBIT_INTERVAL: Record<'1h' | '4h' | '1d', string> = { '1h': '60', '4h': '240', '1d': 'D' };

function tfForPeriod(days: number): '1h' | '4h' | '1d' {
  if (days <= 30) return '1h';
  if (days <= 90) return '4h';
  return '1d';
}

function barsForPeriod(days: number, tf: '1h' | '4h' | '1d'): number {
  const hoursPerBar = tf === '1h' ? 1 : tf === '4h' ? 4 : 24;
  return Math.min(1000, Math.ceil((days * 24) / hoursPerBar) + 5);
}

async function fetchBybitCandles(coin: string, days: number): Promise<OHLCV[]> {
  const tf = tfForPeriod(days);
  const bars = barsForPeriod(days, tf);
  const symbol = `${coin.toUpperCase()}USDT`;
  const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${BYBIT_INTERVAL[tf]}&limit=${bars}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return ((json?.result?.list ?? []) as any[][])
      .map(r => ({
        time: Math.floor(Number(r[0]) / 1000),
        open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]),
        volume: Number(r[5]),
      }))
      .reverse();
  } catch {
    return [];
  }
}

async function fetchHeatmapPoints(coin: string, days: number): Promise<HeatmapPoint[]> {
  try {
    const r = await fetch(`/api/oi/liquidation-heatmap?coin=${coin}&days=${days}`, { cache: 'no-store' });
    if (!r.ok) return [];
    const json = await r.json();
    return Array.isArray(json?.points) ? json.points : [];
  } catch {
    return [];
  }
}

async function fetchEnrichedClusters(coin: string, days: number): Promise<EnrichedClustersResponse | null> {
  try {
    const r = await fetch(`/api/oi/liquidation-clusters?coin=${coin}&days=${days}`, { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function fetchGenomeLiquidationSweep(coin: string): Promise<LiquidationSweep | undefined> {
  try {
    const r = await fetch(`/api/tradedb/genome/${coin}`, { cache: 'no-store' });
    if (!r.ok) return undefined;
    const json = await r.json();
    return json?.liquidation_sweep;
  } catch {
    return undefined;
  }
}

// ── Stile — convenzioni condivise moderne (cassandra-card/Section/HelpButton),
// diverse dallo stile inline isolato del resto di LiquidationPanel.tsx ──────

const SHOW_HEATMAP_ONLY: ShowFlags = {
  ema9: false, ema21: false, ema50: false, ema200: false,
  volume: false, trendlines: false, srZones: false, boxes: false,
  liquidationHeatmap: true,
};

const STATE_LABELS: Record<string, string> = {
  FORMING: 'in formazione', ACTIVE: 'attivo', PEAK: 'al massimo storico',
  DECAYING: 'in calo', SWEPT: 'spazzato',
};

const STATE_COLORS: Record<string, string> = {
  FORMING: 'var(--color-text-dim)',
  ACTIVE: 'var(--color-gold)',
  PEAK: 'var(--color-long-bright, #2EB87A)',
  DECAYING: 'var(--color-short-bright, #a44)',
  SWEPT: 'rgba(255,255,255,0.4)',
};

function sizeFlagLabel(pct: number): string {
  if (pct >= 99) return 'Top 1%';
  if (pct >= 95) return 'Top 5%';
  return 'Normale';
}

function ClusterRowEnriched({ lv, n }: { lv: EnrichedLevel; n: number }) {
  const posizione = lv.side === 'long' ? 'rialziste' : 'ribassiste';
  const color = lv.side === 'long' ? 'var(--color-long-bright, #2EB87A)' : 'var(--color-short-bright, #a44)';
  const stateColor = lv.lifecycle_state ? (STATE_COLORS[lv.lifecycle_state] ?? 'var(--color-text-dim)') : undefined;

  return (
    <div className="cassandra-card p-2" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="flex items-center justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <span style={{ color }}>
          {lv.distance_pct >= 0 ? '+' : ''}{lv.distance_pct.toFixed(1)}% ({posizione})
        </span>
        {lv.lifecycle_state && (
          <span style={{
            fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: stateColor, border: `1px solid ${stateColor}`, borderRadius: 3, padding: '1px 5px',
          }}>
            {STATE_LABELS[lv.lifecycle_state] ?? lv.lifecycle_state.toLowerCase()}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-dim)' }}>
        <span title={`Percentile di dimensione tra ${n} cluster osservati oggi`}>
          Size Flag: <span style={{ color: 'var(--color-text)' }}>{sizeFlagLabel(lv.size_percentile)}</span>
          {' '}(n={n})
        </span>
        <span title="Giorni distinti, negli ultimi 365, in cui questo livello ha avuto attività — solo contesto">
          da {lv.days_count}gg
        </span>
      </div>
    </div>
  );
}

export default function LiquidationHeatmapSection({ coin }: { coin: string }) {
  const [days, setDays] = useState<Period>(365);
  const [ohlcv, setOhlcv] = useState<OHLCV[]>([]);
  const [ohlcvLoading, setOhlcvLoading] = useState(true);
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([]);
  const [enriched, setEnriched] = useState<EnrichedClustersResponse | null>(null);
  const [enrichedLoading, setEnrichedLoading] = useState(true);
  const [dnaLiquidationSweep, setDnaLiquidationSweep] = useState<LiquidationSweep | undefined>(undefined);

  // Fallback mobile — target performance <800ms, vedi piano: su viewport
  // mobile il default è 90gg invece di 365gg (~18k punti heatmap su BTC/365gg
  // può rendere il primo paint lento su dispositivi di fascia media).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMobile = window.innerWidth <= 768 || (navigator.maxTouchPoints ?? 0) > 0;
    if (isMobile) setDays(90);
  }, []);

  useEffect(() => {
    let alive = true;
    setOhlcvLoading(true);
    fetchBybitCandles(coin, days).then(d => { if (alive) { setOhlcv(d); setOhlcvLoading(false); } });
    fetchHeatmapPoints(coin, days).then(d => { if (alive) setHeatmapPoints(d); });
    setEnrichedLoading(true);
    fetchEnrichedClusters(coin, days).then(d => { if (alive) { setEnriched(d); setEnrichedLoading(false); } });
    return () => { alive = false; };
  }, [coin, days]);

  useEffect(() => {
    let alive = true;
    setDnaLiquidationSweep(undefined);
    fetchGenomeLiquidationSweep(coin).then(d => { if (alive) setDnaLiquidationSweep(d); });
    return () => { alive = false; };
  }, [coin]);

  const above = enriched?.above ?? [];
  const below = enriched?.below ?? [];
  const hasClusters = above.length > 0 || below.length > 0;

  return (
    <div className="cassandra-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="section-tag">Heatmap Liquidazioni</span>
          <HelpButton helpKey="liquidation/heatmap" label="Heatmap Liquidazioni" variant="section" />
        </div>
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setDays(p)}
              className="px-2 py-0.5 text-[10px] font-mono rounded-sm transition-all"
              style={{
                background:  days === p ? 'rgba(201,168,76,0.12)' : 'transparent',
                color:       days === p ? 'var(--color-gold)'     : 'var(--color-text-dim)',
                border:      days === p ? '1px solid rgba(201,168,76,0.3)' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {p}g
            </button>
          ))}
        </div>
      </div>

      {/* Story strip — SOLO se il backend ha valutato almeno una condizione
          di rilevanza vera (cluster eccezionale/accelerazione/ricostruzione/
          persistenza anomala). Nessun placeholder quando vuoto: silenzio. */}
      {enriched && enriched.story_lines.length > 0 && (
        <div
          className="cassandra-card p-2"
          style={{ borderColor: 'rgba(201,168,76,0.3)', background: 'rgba(201,168,76,0.05)' }}
        >
          {enriched.story_lines.map((line, i) => (
            <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text)' }}>
              {line}
            </div>
          ))}
        </div>
      )}

      {/* Grafico candele + heatmap */}
      {ohlcvLoading ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)', opacity: 0.5, padding: 16 }}>
          Caricamento…
        </div>
      ) : ohlcv.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)', opacity: 0.5, padding: 16 }}>
          Nessun dato disponibile
        </div>
      ) : (
        <SmartChart ohlcv={ohlcv} show={SHOW_HEATMAP_ONLY} heatmapPoints={heatmapPoints} height={420} />
      )}

      {/* Lista cluster arricchita — MAI probability/breakdown, vedi piano */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-dim)' }}>
            Sopra il prezzo
          </div>
          {enrichedLoading ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-dim)', opacity: 0.5 }}>Caricamento…</div>
          ) : above.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-dim)', opacity: 0.5 }}>Nessun cluster</div>
          ) : (
            above.map((lv, i) => <ClusterRowEnriched key={i} lv={lv} n={enriched?.size_percentile_n ?? 0} />)
          )}
        </div>
        <div className="space-y-1.5">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-dim)' }}>
            Sotto il prezzo
          </div>
          {enrichedLoading ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-dim)', opacity: 0.5 }}>Caricamento…</div>
          ) : below.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-dim)', opacity: 0.5 }}>Nessun cluster</div>
          ) : (
            below.map((lv, i) => <ClusterRowEnriched key={i} lv={lv} n={enriched?.size_percentile_n ?? 0} />)
          )}
        </div>
      </div>
      {!enrichedLoading && !hasClusters && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-dim)', opacity: 0.5 }}>
          Nessun cluster di liquidazione stimato per questa coin nel periodo selezionato.
        </div>
      )}

      {/* DNA Coin — comportamento storico verso i cluster di liquidazione */}
      {dnaLiquidationSweep && <LiquidationSweepSection data={dnaLiquidationSweep} />}

      {/* Disclaimer restituito dal backend — mai riscritto a mano qui */}
      {enriched?.disclaimer && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
          {enriched.disclaimer}
        </div>
      )}
    </div>
  );
}
