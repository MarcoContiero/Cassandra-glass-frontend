'use client';

import React, { useEffect, useState, useMemo } from 'react';

// ── Types (subset del genome) ────────────────────────────────────────────────

interface GravitaSide {
  avg_max_dist_pct: number;
  p75_max_dist_pct: number;
  avg_bars: number;
  p50_bars: number;
  p90_bars?: number;
  n: number;
}

interface Ema200PullTf {
  above?: GravitaSide;
  below?: GravitaSide;
}

interface BbReturnTf {
  ema9?:   GravitaSide;
  ema21?:  GravitaSide;
  ema50?:  GravitaSide;
  ema100?: GravitaSide;
  ema200?: GravitaSide;
}

interface BtcRegimeBucket {
  n: number;
  wr: number;
  pf: number | null;
  avg_pnl: number;
}

interface BtcRegimeAxis {
  '0-1'?: BtcRegimeBucket;
  '2-3'?: BtcRegimeBucket;
  '4-5'?: BtcRegimeBucket;
  '6-7'?: BtcRegimeBucket;
}

interface AxisBucket {
  n: number;
  wr: number;
  pf: number | null;
  avg_pnl: number;
}

// ── Tre Moire — tipi analisi grafico ────────────────────────────────────────

interface DistStats {
  p25: number; p50: number; p75: number; p90: number;
  avg: number; n: number;
  avg_trim?: number; n_trim?: number; // media robusta senza outlier
}

interface PhaseMove {
  duration_bars: DistStats;
  amplitude_pct: DistStats;
}

interface MoirePhaseStats {
  [tf: string]: { up?: PhaseMove; down?: PhaseMove; n_cycles?: number };
}

interface RevBucket  { p_20b?: number; p_50b?: number; p_100b?: number; n?: number; avg_dist_pct?: number; }
interface BbRevBucket { p_5b?: number; p_10b?: number; p_20b?: number; n?: number; avg_out_pct?: number; }

interface MoireReversionMap {
  [tf: string]: {
    ema200?: { above?: { [bk: string]: RevBucket }; below?: { [bk: string]: RevBucket } };
    bb?:     { upper?: { [bk: string]: BbRevBucket }; lower?: { [bk: string]: BbRevBucket } };
  };
}

interface FwdDist { p10: number; p25: number; p50: number; p75: number; p90: number; n: number; }

interface MoireVolatility {
  [tf: string]: {
    atr_pct?:          DistStats;
    bar_range_pct?:    DistStats;
    forward_return_pct?: { '1b'?: FwdDist; '5b'?: FwdDist; '20b'?: FwdDist };
  };
}

interface BtcMoveBucket { coin_avg_pct: number; btc_avg_pct: number; n: number; }

interface MoireBtcBeta {
  [tf: string]: {
    beta: number; beta_up?: number | null; beta_down?: number | null;
    r2: number; n: number;
    by_btc_move?: {
      btc_up_big?: BtcMoveBucket; btc_up_small?: BtcMoveBucket;
      btc_dn_small?: BtcMoveBucket; btc_dn_big?: BtcMoveBucket;
    };
  };
}

// ── Genome full ───────────────────────────────────────────────────────────────

interface GenomeFull {
  coin: string;
  n_trades: number;
  win_rate: number;
  profit_factor: number | null;
  ema200_pull?:         { [tf: string]: Ema200PullTf };
  bb_return?:           { [tf: string]: BbReturnTf };
  btc_regime_axis?:     BtcRegimeAxis;
  mtf_bias_axis?:       { [combo: string]: AxisBucket };
  ema200_dist_axis?:    { [tf: string]: { [bucket: string]: AxisBucket } };
  momentum_xy_axis?:    { [combo: string]: AxisBucket };
  sr_dist_axis?:        { [bucket: string]: AxisBucket };
  pool_liquidity_axis?: { [combo: string]: AxisBucket };
  ciclica_axis?:        { [tf: string]: { [phase: string]: AxisBucket } };
  // Tre Moire — analisi grafico
  moire_phase_stats?:   MoirePhaseStats;
  moire_reversion_map?: MoireReversionMap;
  moire_volatility?:    MoireVolatility;
  moire_btc_beta?:      MoireBtcBeta;
}

// ── Pattern classifier ───────────────────────────────────────────────────────

type PatternType = 'noise' | 'ciclo_raro' | 'ciclo_strutturale' | 'unknown';

interface PatternInfo {
  type: PatternType;
  label: string;
  color: string;
  desc: string;
}

function classifyPattern(avg: number, p50: number, p90: number | undefined): PatternInfo {
  if (!p90 || p50 <= 0) return { type: 'unknown', label: '—', color: 'var(--color-text-dim)', desc: 'dati insufficienti' };
  const ratio = avg / p50;
  if (p90 < p50 * 2) {
    return { type: 'noise', label: 'noise', color: 'var(--color-text-dim)',
      desc: 'stretch brevi omogenei — nessun ciclo rilevante' };
  }
  if (ratio > 3 && p90 < p50 * 3) {
    return { type: 'ciclo_raro', label: 'ciclo raro', color: 'var(--color-gold)',
      desc: 'pochi stretch lunghi — ciclo rarefatto' };
  }
  return { type: 'ciclo_strutturale', label: 'ciclo strutturale', color: 'var(--color-long-bright)',
    desc: 'pattern ciclico robusto — usabile da Lachesi' };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const GRAVITY_TFS = ['15m', '1h', '4h', '1d'] as const;
type GravityTf = typeof GRAVITY_TFS[number];

const BB_EMAS = ['ema50', 'ema100', 'ema200'] as const;

function dominantPattern(genome: GenomeFull): PatternInfo {
  const candidates: PatternInfo[] = [];
  for (const tf of GRAVITY_TFS) {
    const t = genome.ema200_pull?.[tf];
    if (!t) continue;
    for (const side of ['above', 'below'] as const) {
      const d = t[side];
      if (d) candidates.push(classifyPattern(d.avg_bars, d.p50_bars, d.p90_bars));
    }
  }
  if (candidates.some(c => c.type === 'ciclo_strutturale'))
    return { type: 'ciclo_strutturale', label: 'ciclo strutturale', color: 'var(--color-long-bright)', desc: '' };
  if (candidates.some(c => c.type === 'ciclo_raro'))
    return { type: 'ciclo_raro', label: 'ciclo raro', color: 'var(--color-gold)', desc: '' };
  if (candidates.some(c => c.type === 'noise'))
    return { type: 'noise', label: 'noise', color: 'var(--color-text-dim)', desc: '' };
  return { type: 'unknown', label: '—', color: 'var(--color-text-dim)', desc: '' };
}

function hasData(obj: object | undefined | null): boolean {
  return !!obj && Object.keys(obj).length > 0;
}

function countAxesAvailable(genome: GenomeFull): number {
  return [
    genome.ema200_pull,
    genome.bb_return,
    genome.ciclica_axis,
    genome.mtf_bias_axis,
    genome.momentum_xy_axis,
    genome.btc_regime_axis,
    genome.sr_dist_axis,
    genome.pool_liquidity_axis,
  ].filter(hasData).length;
}

// ── Scale helpers ─────────────────────────────────────────────────────────────

function wrLabel(wr: number): { text: string; color: string } {
  if (wr >= 62) return { text: 'ottimo',  color: 'var(--color-long-bright)' };
  if (wr >= 57) return { text: 'buono',   color: 'var(--color-long-bright)' };
  if (wr >= 53) return { text: 'neutro',  color: 'var(--color-gold)' };
  if (wr >= 48) return { text: 'debole',  color: 'var(--color-text-dim)' };
  return         { text: 'evita',   color: 'var(--color-short-bright)' };
}

function computeFlatSummary(data: FlatAxis): string {
  const rows = Object.entries(data).filter(([, d]) => d.n >= 15);
  if (rows.length < 2) return '';
  const sorted = [...rows].sort((a, b) => b[1].wr - a[1].wr);
  const best  = sorted[0];
  const worst = sorted[sorted.length - 1];
  const gap   = best[1].wr - worst[1].wr;
  if (gap < 5)  return `spread ${gap.toFixed(0)}pt — asse poco discriminante`;
  const strength = gap >= 12 ? 'segnale forte' : gap >= 8 ? 'segnale medio' : 'segnale utile';
  return `migliore: ${best[0]} ${best[1].wr.toFixed(0)}% · peggiore: ${worst[0]} ${worst[1].wr.toFixed(0)}% — gap ${gap.toFixed(0)}pt · ${strength}`;
}

function computeNestedSummary(data: NestedAxis): string {
  const all = Object.values(data).flatMap(tf => Object.entries(tf));
  const filtered = all.filter(([, d]) => d.n >= 15);
  if (filtered.length < 2) return '';
  const sorted = [...filtered].sort((a, b) => b[1].wr - a[1].wr);
  const best  = sorted[0];
  const worst = sorted[sorted.length - 1];
  const gap   = best[1].wr - worst[1].wr;
  if (gap < 5)  return `spread ${gap.toFixed(0)}pt — asse poco discriminante`;
  const strength = gap >= 12 ? 'segnale forte' : gap >= 8 ? 'segnale medio' : 'segnale utile';
  return `migliore: ${best[0]} ${best[1].wr.toFixed(0)}% · peggiore: ${worst[0]} ${worst[1].wr.toFixed(0)}% — gap ${gap.toFixed(0)}pt · ${strength}`;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PatternBadge({ p }: { p: PatternInfo }) {
  return (
    <span style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 9,
      color: p.color,
      border: `1px solid ${p.color}`,
      borderRadius: 2,
      padding: '1px 5px',
      opacity: p.type === 'unknown' ? 0.4 : 1,
      letterSpacing: '0.1em',
    }}>
      {p.label}
    </span>
  );
}

function SideBlock({ d, label, col }: { d: GravitaSide; label: string; col: string }) {
  const pat = classifyPattern(d.avg_bars, d.p50_bars, d.p90_bars);
  return (
    <div style={{
      padding: '8px 10px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid var(--color-border-dim)',
      borderRadius: 2,
    }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: col, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          {label}
        </span>
        <PatternBadge p={pat} />
      </div>

      {/* Bar stats */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-dim)' }}>
        <div className="flex gap-3 mb-1">
          <span>
            <span>p50 </span>
            <span style={{ color: 'var(--color-text)' }}>{d.p50_bars}b</span>
          </span>
          {d.p90_bars != null && (
            <span>
              <span>p90 </span>
              <span style={{ color: pat.type === 'ciclo_strutturale' ? 'var(--color-long-bright)' : 'var(--color-text)' }}>{d.p90_bars}b</span>
            </span>
          )}
          <span>
            <span>avg </span>
            <span style={{ color: 'var(--color-text-dim)' }}>{d.avg_bars.toFixed(0)}b</span>
          </span>
        </div>
        <div className="flex gap-3">
          <span>
            <span>dist avg </span>
            <span style={{ color: 'var(--color-gold)' }}>{d.avg_max_dist_pct.toFixed(2)}%</span>
          </span>
          <span>
            <span>p75 </span>
            <span style={{ color: 'var(--color-text)' }}>{d.p75_max_dist_pct.toFixed(2)}%</span>
          </span>
          <span style={{ opacity: 0.5 }}>n={d.n}</span>
        </div>
      </div>

      {pat.desc && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', marginTop: 4, fontStyle: 'italic', opacity: 0.7 }}>
          {pat.desc}
        </div>
      )}
    </div>
  );
}

const REGIME_LABELS: Record<string, { label: string; desc: string }> = {
  '0-1': { label: 'downtrend',    desc: '0-1' },
  '2-3': { label: 'misto rib.',   desc: '2-3' },
  '4-5': { label: 'misto rialz.', desc: '4-5' },
  '6-7': { label: 'uptrend',      desc: '6-7' },
};

function BtcRegimeSection({ data }: { data: BtcRegimeAxis }) {
  const buckets = ['0-1', '2-3', '4-5', '6-7'] as const;
  const maxN = Math.max(...buckets.map(k => data[k]?.n ?? 0), 1);

  const filled = buckets.filter(k => data[k]);
  const summary = (() => {
    const rows = filled.map(k => ({ k, d: data[k]! })).filter(r => r.d.n >= 10);
    if (rows.length < 2) return filled.length === 1
      ? `tutti i trade in regime ${filled[0]} (periodo IS uniformemente bullish su BTC)`
      : '';
    const sorted = [...rows].sort((a, b) => b.d.wr - a.d.wr);
    const gap = sorted[0].d.wr - sorted[sorted.length - 1].d.wr;
    return `${sorted[0].k} uptrend ${sorted[0].d.wr.toFixed(0)}% vs ${sorted[sorted.length-1].k} ${sorted[sorted.length-1].d.wr.toFixed(0)}% — gap ${gap.toFixed(0)}pt`;
  })();

  return (
    <div style={{ borderTop: '1px solid var(--color-border-dim)', paddingTop: 12 }}>
      <div className="flex items-baseline gap-2 mb-1">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.5 }}>6.</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text)', letterSpacing: '0.1em' }}>
          BTC REGIME SCORE
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.5, marginBottom: 4 }}>
        come performa questa coin a ogni livello di regime BTC
      </div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)',
        opacity: 0.55, marginBottom: 10, lineHeight: 1.6,
        padding: '5px 8px', background: 'rgba(255,255,255,0.015)',
        border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2,
      }}>
        Score composito 0-7 su slope lineare BTC: slope_4h(+1) + slope_6h(+1) + slope_12h(+2) + slope_1d(+3). Calcolato al momento di ogni entry trade. 0-1 = tutti i TF in downtrend, 6-7 = tutti up (massima forza direzionale).
      </div>

      <div className="grid grid-cols-4 gap-2">
        {buckets.map(bk => {
          const d = data[bk];
          const meta = REGIME_LABELS[bk];
          const barPct = d ? Math.max(0.05, (d.n / maxN)) : 0;

          const wrColor = !d ? 'var(--color-text-dim)'
            : d.wr >= 57 ? 'var(--color-long-bright)'
            : d.wr >= 53 ? 'var(--color-gold)'
            : 'var(--color-short-bright)';

          return (
            <div key={bk} style={{
              padding: '8px 10px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--color-border-dim)',
              borderRadius: 2,
              opacity: d ? 1 : 0.3,
            }}>
              {/* Volume bar */}
              <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', marginBottom: 6 }}>
                <div style={{ height: '100%', width: `${barPct * 100}%`, background: 'rgba(201,168,76,0.4)' }} />
              </div>

              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)', opacity: 0.6, marginBottom: 4, letterSpacing: '0.1em' }}>
                {meta.desc} · {meta.label}
              </div>

              {d ? (
                <>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: wrColor, fontWeight: 300, lineHeight: 1 }}>
                    {d.wr.toFixed(1)}%
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', marginTop: 4 }}>
                    PF {d.pf?.toFixed(3) ?? '—'}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)' }}>
                    n={d.n}
                  </div>
                </>
              ) : (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}>—</div>
              )}
            </div>
          );
        })}
      </div>

      {summary && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-gold)', opacity: 0.65, marginTop: 7, fontStyle: 'italic' }}>
          → {summary}
        </div>
      )}
    </div>
  );
}


function AxisStub({ n, title, desc, buckets }: { n: number; title: string; desc: string; buckets: string[] }) {
  return (
    <div style={{ borderTop: '1px solid var(--color-border-dim)', paddingTop: 12 }}>
      <div className="flex items-baseline gap-2 mb-1">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.5 }}>{n}.</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}>{title}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.35, marginLeft: 'auto' }}>
          Cloto in costruzione
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.5, marginBottom: 6 }}>
        {desc}
      </div>
      <div className="flex flex-wrap gap-1">
        {buckets.map(b => (
          <span key={b} style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            color: 'var(--color-text-dim)',
            border: '1px solid var(--color-border-dim)',
            padding: '1px 5px',
            borderRadius: 2,
            opacity: 0.35,
          }}>{b}</span>
        ))}
      </div>
    </div>
  );
}

// ── AxisBucketSection — renderer generico per assi flat e nested ──────────────

type FlatAxis   = Record<string, AxisBucket>;
type NestedAxis = Record<string, FlatAxis>;

function wrColor(wr: number): string {
  if (wr >= 60) return 'var(--color-long-bright)';
  if (wr >= 45) return 'var(--color-gold)';
  return 'var(--color-short-bright)';
}

function BucketRow({ bucket, d }: { bucket: string; d: AxisBucket }) {
  const col = wrColor(d.wr);
  const lbl = wrLabel(d.wr);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)',
                     minWidth: 120, opacity: 0.8 }}>
        {bucket}
      </span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: col,
                     fontWeight: 300, minWidth: 52, textAlign: 'right' }}>
        {d.wr.toFixed(1)}%
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: lbl.color,
                     minWidth: 38, opacity: 0.75, letterSpacing: '0.04em' }}>
        {lbl.text}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)',
                     minWidth: 36, textAlign: 'right', opacity: 0.6 }}>
        n={d.n}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)',
                     minWidth: 52, textAlign: 'right', opacity: 0.5 }}>
        PF {d.pf?.toFixed(2) ?? '—'}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)',
                     opacity: 0.45 }}>
        avg {d.avg_pnl >= 0 ? '+' : ''}{d.avg_pnl.toFixed(2)}%
      </span>
    </div>
  );
}

function AxisBucketSection({
  n, title, desc, explanation, data, nested,
}: {
  n: number;
  title: string;
  desc: string;
  explanation?: string;
  data: FlatAxis | NestedAxis | undefined;
  nested?: boolean;
}) {
  const hasAny = !!data && Object.keys(data).length > 0;
  const summary = hasAny
    ? (nested
        ? computeNestedSummary(data as NestedAxis)
        : computeFlatSummary(data as FlatAxis))
    : '';

  return (
    <div style={{ borderTop: '1px solid var(--color-border-dim)', paddingTop: 12 }}>
      <div className="flex items-baseline gap-2 mb-1">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.5 }}>
          {n}.
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text)', letterSpacing: '0.08em' }}>
          {title}
        </span>
        {!hasAny && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.35, marginLeft: 'auto' }}>
            nessun dato
          </span>
        )}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.5, marginBottom: explanation ? 4 : 6 }}>
        {desc}
      </div>

      {explanation && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)',
          opacity: 0.55, marginBottom: 8, lineHeight: 1.6,
          padding: '5px 8px',
          background: 'rgba(255,255,255,0.015)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 2,
        }}>
          {explanation}
        </div>
      )}

      {hasAny && !nested && (
        <div>
          {Object.entries(data as FlatAxis)
            .sort((a, b) => b[1].n - a[1].n)
            .map(([bk, d]) => <BucketRow key={bk} bucket={bk} d={d} />)}
        </div>
      )}

      {hasAny && nested && (
        <div className="space-y-3">
          {Object.entries(data as NestedAxis).map(([tf, buckets]) => (
            <div key={tf}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-gold)',
                            opacity: 0.7, letterSpacing: '0.12em', marginBottom: 2 }}>
                {tf}
              </div>
              {Object.entries(buckets)
                .sort((a, b) => b[1].n - a[1].n)
                .map(([bk, d]) => <BucketRow key={bk} bucket={bk} d={d} />)}
            </div>
          ))}
        </div>
      )}

      {summary && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-gold)',
          opacity: 0.65, marginTop: 7, fontStyle: 'italic',
        }}>
          → {summary}
        </div>
      )}
    </div>
  );
}

// ── Helpers Moire ─────────────────────────────────────────────────────────────

function MoireSectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ borderTop: '1px solid var(--color-border-dim)', paddingTop: 12, marginTop: 4 }}>
      <div className="flex items-baseline gap-2 mb-1">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-gold)', opacity: 0.7, letterSpacing: '0.12em' }}>
          ◈ {title}
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.5, marginBottom: 8 }}>
        {desc}
      </div>
    </div>
  );
}

function MoireTfTabs({ tfs, active, onChange }: { tfs: string[]; active: string; onChange: (tf: string) => void }) {
  return (
    <div className="flex gap-1 mb-3">
      {tfs.map(t => (
        <button key={t} onClick={() => onChange(t)}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, padding: '2px 8px',
            background: active === t ? 'rgba(201,168,76,0.12)' : 'transparent',
            color:      active === t ? 'var(--color-gold)'     : 'var(--color-text-dim)',
            border:     active === t ? '1px solid rgba(201,168,76,0.3)' : '1px solid rgba(255,255,255,0.08)',
            cursor: 'pointer', borderRadius: 2,
          }}>
          {t}
        </button>
      ))}
    </div>
  );
}

function StatCell({ label, val, secondary, secLabel }: {
  label: string; val: string | number | null | undefined;
  secondary?: string | number | null; secLabel?: string;
}) {
  const fmtVal = val == null ? '—' : typeof val === 'number' ? (Number.isFinite(val) ? val.toFixed(1) : '—') : val;
  return (
    <div style={{ textAlign: 'center', minWidth: 44 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)', opacity: 0.5, marginBottom: 1 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--color-text)', fontWeight: 300 }}>
        {fmtVal}
      </div>
      {secondary != null && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-gold)', opacity: 0.6 }}>
          {secLabel && `${secLabel} `}{typeof secondary === 'number' ? secondary.toFixed(1) : secondary}
        </div>
      )}
    </div>
  );
}

function DistRow({ label, d, unit }: { label: string; d: DistStats | undefined; unit: string }) {
  if (!d) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)',
                     minWidth: 80, opacity: 0.7 }}>
        {label}
      </span>
      <StatCell label="p50"  val={d.p50} />
      <StatCell label="p75"  val={d.p75} />
      <StatCell label="p90"  val={d.p90} />
      <StatCell label="avg"  val={d.avg} secondary={d.avg_trim} secLabel="↓" />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)', opacity: 0.4 }}>
        {unit} · n={d.n}{d.n_trim != null ? `→${d.n_trim}` : ''}
      </span>
    </div>
  );
}

// ── MoirePhaseSection ─────────────────────────────────────────────────────────

function MoirePhaseSection({ data }: { data?: MoirePhaseStats }) {
  const tfs = Object.keys(data || {}).filter(tf => data![tf]);
  const [tf, setTf] = useState(tfs[0] ?? '1h');
  if (!data || tfs.length === 0) return null;
  const d = data[tf] ?? {};

  return (
    <div>
      <MoireSectionHeader title="FASI PREZZO" desc="Durata e ampiezza dei movimenti su/giù · ZigZag per TF" />
      <MoireTfTabs tfs={tfs} active={tf} onChange={setTf} />
      {/* Header columns */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 2, paddingLeft: 86 }}>
        {['p50', 'p75', 'p90', 'avg · avg*'].map(h => (
          <span key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)',
                                  opacity: 0.4, minWidth: 44, textAlign: 'center' }}>{h}</span>
        ))}
      </div>
      {d.up && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-long-bright)',
                        opacity: 0.7, marginBottom: 3 }}>
            ↑ UP · {d.n_cycles ?? '?'} cicli
          </div>
          <DistRow label="durata (bars)" d={d.up.duration_bars}  unit="b" />
          <DistRow label="ampiezza %"    d={d.up.amplitude_pct}  unit="%" />
        </div>
      )}
      {d.down && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-short-bright)',
                        opacity: 0.7, marginBottom: 3 }}>
            ↓ DOWN
          </div>
          <DistRow label="durata (bars)" d={d.down.duration_bars}  unit="b" />
          <DistRow label="ampiezza %"    d={d.down.amplitude_pct}  unit="%" />
        </div>
      )}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)', opacity: 0.35, marginTop: 4 }}>
        avg* = media senza outlier (IQR filter)
      </div>

      {/* Summary calcolato */}
      {d.up && d.down && (() => {
        const upP50  = d.up.duration_bars?.p50  ?? 0;
        const upP75  = d.up.duration_bars?.p75  ?? 0;
        const upP90  = d.up.duration_bars?.p90  ?? 0;
        const upAmp  = d.up.amplitude_pct?.p50  ?? 0;
        const dnAmp  = d.down.amplitude_pct?.p50 ?? 0;
        const bias   = upAmp > dnAmp + 0.5 ? 'fasi UP più ampie' : dnAmp > upAmp + 0.5 ? 'fasi DOWN più ampie' : 'up/down simmetrici';
        return (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-gold)', opacity: 0.65, marginTop: 8, fontStyle: 'italic' }}>
            → Fase mediana UP: {upP50}b · p75={upP75}b · p90={upP90}b. Oltre {upP90}b = fase extended. {bias} in ampiezza ({upAmp.toFixed(1)}% vs {dnAmp.toFixed(1)}%).
          </div>
        );
      })()}
    </div>
  );
}

// ── MoireReversionSection ─────────────────────────────────────────────────────

const EMA_BKS  = ['0-1', '1-3', '3-7', '>7'] as const;
const BB_BKS   = ['0-0.5', '0.5-2', '>2'] as const;

function ProbCell({ val }: { val?: number }) {
  if (val == null) return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.3, minWidth: 44, textAlign: 'center', display: 'inline-block' }}>—</span>;
  const pct = Math.round(val * 100);
  const col = pct >= 70 ? 'var(--color-long-bright)' : pct >= 50 ? 'var(--color-gold)' : 'var(--color-text-dim)';
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: col,
                   minWidth: 44, textAlign: 'center', display: 'inline-block' }}>
      {pct}%
    </span>
  );
}

function MoireReversionSection({ data }: { data?: MoireReversionMap }) {
  const tfs = Object.keys(data || {});
  const [tf, setTf] = useState(tfs[0] ?? '1h');
  if (!data || tfs.length === 0) return null;
  const d = data[tf] ?? {};

  return (
    <div>
      <MoireSectionHeader title="MAPPA DI RIENTRO" desc="P(prezzo torna a EMA200/BB entro N bars) · da storico 2 anni" />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.55, marginBottom: 8, lineHeight: 1.6, padding: '5px 8px', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2 }}>
        Probabilità storica calcolata su ogni barra del dataset 2 anni. EMA200: quanto spesso il prezzo attraversa la EMA200 entro 20/50/100 barre dalla distanza attuale — più alta la distanza, più raro il rientro rapido. BB: dopo un tocco della banda, quanto spesso il prezzo rientra entro le bande in 5/10/20 barre.
      </div>
      <MoireTfTabs tfs={tfs} active={tf} onChange={setTf} />

      {/* EMA200 */}
      {d.ema200 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-gold)', opacity: 0.7, marginBottom: 4 }}>
            EMA200
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 1fr 1fr', gap: 4,
                        fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)', opacity: 0.5,
                        marginBottom: 2 }}>
            <span></span>
            <span style={{ textAlign: 'center' }}>P(20b)</span>
            <span style={{ textAlign: 'center' }}>P(50b)</span>
            <span style={{ textAlign: 'center' }}>P(100b)</span>
            <span style={{ textAlign: 'center' }}>n</span>
          </div>
          {(['above', 'below'] as const).map(side => (
            <div key={side} style={{ marginBottom: 4 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)',
                            opacity: 0.6, marginBottom: 2 }}>
                {side === 'above' ? '↑ sopra EMA200' : '↓ sotto EMA200'}
              </div>
              {EMA_BKS.map(bk => {
                const bkd = d.ema200?.[side]?.[bk];
                return (
                  <div key={bk} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 1fr 1fr',
                                         gap: 4, padding: '2px 0',
                                         borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.7 }}>
                      {bk}%
                    </span>
                    <ProbCell val={bkd?.p_20b} />
                    <ProbCell val={bkd?.p_50b} />
                    <ProbCell val={bkd?.p_100b} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)',
                                   opacity: 0.4, textAlign: 'center' }}>
                      {bkd?.n ?? '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* BB */}
      {d.bb && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-gold)', opacity: 0.7, marginBottom: 4 }}>
            BOLLINGER BANDS (20, 2σ)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 1fr 1fr', gap: 4,
                        fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)', opacity: 0.5,
                        marginBottom: 2 }}>
            <span></span>
            <span style={{ textAlign: 'center' }}>P(5b)</span>
            <span style={{ textAlign: 'center' }}>P(10b)</span>
            <span style={{ textAlign: 'center' }}>P(20b)</span>
            <span style={{ textAlign: 'center' }}>n</span>
          </div>
          {(['upper', 'lower'] as const).map(band => (
            <div key={band} style={{ marginBottom: 4 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)', opacity: 0.6, marginBottom: 2 }}>
                {band === 'upper' ? '↑ banda superiore' : '↓ banda inferiore'}
              </div>
              {BB_BKS.map(bk => {
                const bkd = d.bb?.[band]?.[bk];
                return (
                  <div key={bk} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 1fr 1fr',
                                         gap: 4, padding: '2px 0',
                                         borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.7 }}>
                      {bk}%
                    </span>
                    <ProbCell val={bkd?.p_5b} />
                    <ProbCell val={bkd?.p_10b} />
                    <ProbCell val={bkd?.p_20b} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)',
                                   opacity: 0.4, textAlign: 'center' }}>
                      {bkd?.n ?? '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Summary EMA200 reversion */}
      {d.ema200 && (() => {
        const bk0 = d.ema200.above?.['0-1'];
        const bk7 = d.ema200.above?.['>7'];
        if (!bk0 || !bk7) return null;
        const fast = Math.round((bk0.p_20b ?? 0) * 100);
        const slow = Math.round((bk7.p_20b ?? 0) * 100);
        const threshold = d.ema200.above?.['1-3'];
        const thr20 = threshold ? Math.round((threshold.p_20b ?? 0) * 100) : null;
        return (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-gold)', opacity: 0.65, marginTop: 8, fontStyle: 'italic' }}>
            → Reversion EMA200 rapida (20b) se distanza 0-1%: {fast}%.{thr20 !== null ? ` A 1-3%: ${thr20}%.` : ''} A &gt;7% scende a {slow}% — tendenza prevalente nel breve, non forzare il rientro.
          </div>
        );
      })()}
    </div>
  );
}

// ── MoireVolatilitySection ────────────────────────────────────────────────────

function FwdReturnRow({ label, d }: { label: string; d?: FwdDist }) {
  if (!d) return null;
  const p50col = (d.p50 ?? 0) >= 0 ? 'var(--color-long-bright)' : 'var(--color-short-bright)';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 1fr 1fr 1fr 1fr', gap: 4, padding: '3px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.7 }}>{label}</span>
      {[d.p10, d.p25, d.p50, d.p75, d.p90].map((v, i) => (
        <span key={i} style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, textAlign: 'center',
          color: i === 2 ? p50col : 'var(--color-text-dim)',
          opacity: i === 2 ? 1 : 0.6,
        }}>
          {v != null ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : '—'}
        </span>
      ))}
    </div>
  );
}

function MoireVolatilitySection({ data }: { data?: MoireVolatility }) {
  const tfs = Object.keys(data || {});
  const [tf, setTf] = useState(tfs[0] ?? '1h');
  if (!data || tfs.length === 0) return null;
  const d = data[tf] ?? {};
  const fwd = d.forward_return_pct ?? {};

  return (
    <div>
      <MoireSectionHeader title="PROFILO VOLATILITÀ" desc="ATR storico · rendimento atteso a N bars · da OHLCV 2 anni" />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.55, marginBottom: 8, lineHeight: 1.6, padding: '5px 8px', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2 }}>
        ATR% = Average True Range normalizzato al prezzo — misura il &lsquo;respiro&rsquo; tipico della coin per barra. Il rendimento atteso mostra la distribuzione storica dei ritorni forward a 1/5/20 barre: p50 vicino a 0 = nessun bias direzionale strutturale, spread p25/p75 = range tipico di movimento.
      </div>
      <MoireTfTabs tfs={tfs} active={tf} onChange={setTf} />

      {d.atr_pct && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-gold)', opacity: 0.7, marginBottom: 4 }}>
            ATR %
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {([['p25', d.atr_pct.p25], ['p50', d.atr_pct.p50], ['p75', d.atr_pct.p75], ['p90', d.atr_pct.p90]] as [string, number][]).map(([l, v]) => (
              <div key={l} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)', opacity: 0.5 }}>{l}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--color-text)', fontWeight: 300 }}>
                  {v?.toFixed(2)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(fwd).length > 0 && (
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-gold)', opacity: 0.7, marginBottom: 4 }}>
            RENDIMENTO ATTESO (da chiusura attuale)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 1fr 1fr 1fr 1fr', gap: 4, marginBottom: 2 }}>
            <span></span>
            {['p10', 'p25', 'p50', 'p75', 'p90'].map(h => (
              <span key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)', opacity: 0.4, textAlign: 'center' }}>{h}</span>
            ))}
          </div>
          <FwdReturnRow label="1 bar"  d={fwd['1b']} />
          <FwdReturnRow label="5 bars" d={fwd['5b']} />
          <FwdReturnRow label="20b"    d={fwd['20b']} />
        </div>
      )}

      {/* Summary volatilità */}
      {d.atr_pct && (() => {
        const p50  = d.atr_pct.p50;
        const p90  = d.atr_pct.p90;
        const fwd5 = fwd['5b'];
        const range5 = fwd5 ? ((fwd5.p75 ?? 0) - (fwd5.p25 ?? 0)).toFixed(1) : null;
        return (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-gold)', opacity: 0.65, marginTop: 8, fontStyle: 'italic' }}>
            → ATR mediano {p50?.toFixed(2)}% per barra (p90={p90?.toFixed(2)}%). {range5 ? `Range tipico 5b: ±${(parseFloat(range5)/2).toFixed(1)}% (spread p25-p75).` : ''}
          </div>
        );
      })()}
    </div>
  );
}

// ── MoireBetaSection ──────────────────────────────────────────────────────────

function MoireBetaSection({ data }: { data?: MoireBtcBeta }) {
  const tfs = Object.keys(data || {});
  const [tf, setTf] = useState(tfs[0] ?? '4h');
  if (!data || tfs.length === 0) return null;
  const d = data[tf];
  if (!d) return null;

  const BTC_MOVE_LABELS: Record<string, string> = {
    btc_up_big:   'BTC >+3%',
    btc_up_small: 'BTC 0–+3%',
    btc_dn_small: 'BTC 0–-3%',
    btc_dn_big:   'BTC <-3%',
  };

  return (
    <div>
      <MoireSectionHeader title="CORRELAZIONE BTC" desc="Beta e rendimento della coin al variare di BTC per TF" />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.55, marginBottom: 8, lineHeight: 1.6, padding: '5px 8px', background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2 }}>
        Beta OLS su rendimenti a barra (4h/1d). Beta &gt; 1 = la coin amplifica i movimenti BTC. Beta↑ / Beta↓ = beta separati in sessioni rialziste vs ribassiste di BTC — asimmetria frequente negli altcoin. R² misura quanta varianza della coin è spiegata da BTC (0=indipendente, 1=perfettamente correlata).
      </div>
      <MoireTfTabs tfs={tfs} active={tf} onChange={setTf} />

      <div className="flex gap-6 mb-4">
        {[
          ['Beta', d.beta?.toFixed(3)],
          ['Beta↑', d.beta_up?.toFixed(3) ?? '—'],
          ['Beta↓', d.beta_down?.toFixed(3) ?? '—'],
          ['R²',    d.r2?.toFixed(3)],
        ].map(([l, v]) => (
          <div key={l} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)', opacity: 0.5 }}>{l}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--color-text)', fontWeight: 300 }}>{v ?? '—'}</div>
          </div>
        ))}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)', opacity: 0.4, alignSelf: 'flex-end', marginBottom: 2 }}>
          n={d.n}
        </div>
      </div>

      {d.by_btc_move && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr', gap: 4, marginBottom: 2,
                        fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)', opacity: 0.5 }}>
            <span></span>
            <span style={{ textAlign: 'right' }}>BTC</span>
            <span style={{ textAlign: 'right' }}>COIN</span>
            <span style={{ textAlign: 'right' }}>n</span>
          </div>
          {Object.entries(BTC_MOVE_LABELS).map(([key, label]) => {
            const bk = d.by_btc_move?.[key as keyof typeof d.by_btc_move];
            if (!bk) return null;
            const btcCol = (bk.btc_avg_pct ?? 0) >= 0 ? 'var(--color-long-bright)' : 'var(--color-short-bright)';
            const coinCol = (bk.coin_avg_pct ?? 0) >= 0 ? 'var(--color-long-bright)' : 'var(--color-short-bright)';
            return (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 1fr 1fr', gap: 4,
                                       padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.7 }}>{label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: btcCol, textAlign: 'right' }}>
                  {bk.btc_avg_pct >= 0 ? '+' : ''}{bk.btc_avg_pct?.toFixed(2)}%
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: coinCol, textAlign: 'right', fontWeight: 600 }}>
                  {bk.coin_avg_pct >= 0 ? '+' : ''}{bk.coin_avg_pct?.toFixed(2)}%
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)', opacity: 0.4, textAlign: 'right' }}>
                  {bk.n}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary beta */}
      {(() => {
        const bup = d.beta_up ?? null;
        const bdn = d.beta_down ?? null;
        if (bup == null || bdn == null) return null;
        const asym = Math.abs(bdn - bup);
        const asymDir = bdn > bup ? 'amplifica più le discese' : 'amplifica più le salite';
        const r2label = d.r2 >= 0.6 ? 'alta correlazione BTC' : d.r2 >= 0.35 ? 'correlazione media' : 'bassa dipendenza da BTC';
        return (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-gold)', opacity: 0.65, marginTop: 8, fontStyle: 'italic' }}>
            → Beta↓ {bdn.toFixed(2)} vs Beta↑ {bup.toFixed(2)} (delta {asym.toFixed(2)}) — {asymDir}. R²={d.r2.toFixed(3)} = {r2label}.
          </div>
        );
      })()}
    </div>
  );
}

// ── Genome detail ─────────────────────────────────────────────────────────────

function ClotoDetail({ genome, onClose }: { genome: GenomeFull; onClose: () => void }) {
  const [tf, setTf] = useState<GravityTf>('1h');

  const pullTf = genome.ema200_pull?.[tf];
  const bbTf   = genome.bb_return?.[tf];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-6 px-4 overflow-auto"
      style={{ background: 'rgba(2,2,14,0.92)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl p-6 space-y-5"
        style={{
          background: 'var(--color-deep)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 0 60px rgba(201,168,76,0.05)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <span style={{ fontFamily: 'var(--font-decorative)', fontSize: 26, color: 'var(--color-gold)', fontWeight: 300 }}>
              {genome.coin}
            </span>
            <span className="ml-3 uppercase tracking-widest"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-dim)' }}>
              Mappa Cloto
            </span>
          </div>
          <button onClick={onClose}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--color-text-dim)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            ✕
          </button>
        </div>

        {/* ── ASSE 1: Gravità EMA200 ── */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-baseline gap-2">
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.5 }}>1.</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text)', letterSpacing: '0.1em' }}>
                GRAVITÀ EMA200
              </span>
            </div>
            <div className="flex gap-1">
              {GRAVITY_TFS.map(t => (
                <button key={t} onClick={() => setTf(t)}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    padding: '2px 8px',
                    background: tf === t ? 'rgba(201,168,76,0.12)' : 'transparent',
                    color:      tf === t ? 'var(--color-gold)'     : 'var(--color-text-dim)',
                    border:     tf === t ? '1px solid rgba(201,168,76,0.3)' : '1px solid rgba(255,255,255,0.08)',
                    cursor: 'pointer',
                    borderRadius: 2,
                  }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)',
            opacity: 0.55, marginBottom: 8, lineHeight: 1.6,
            padding: '5px 8px', background: 'rgba(255,255,255,0.015)',
            border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2,
          }}>
            Stretch del prezzo dalla EMA200: quante barre prima del rientro (p50/p90) e quanto lontano arriva (dist avg/p75). &lsquo;Ciclo strutturale&rsquo; = pattern ripetibile con varianza contenuta, usabile come prior di timing. &lsquo;Noise&rsquo; = nessun ciclo identificabile.
          </div>

          {pullTf ? (
            <div className="grid grid-cols-2 gap-2">
              {(['above', 'below'] as const).map(side => {
                const d = pullTf[side];
                if (!d) return null;
                const col = side === 'above' ? 'var(--color-long-bright)' : 'var(--color-short-bright)';
                const lbl = side === 'above' ? '↑ sopra EMA200' : '↓ sotto EMA200';
                return <SideBlock key={side} d={d} label={lbl} col={col} />;
              })}
            </div>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)', opacity: 0.5 }}>
              — nessun dato per {tf}
            </span>
          )}
        </div>

        {/* ── ASSE 2: Gravità BB ── */}
        <div style={{ borderTop: '1px solid var(--color-border-dim)', paddingTop: 16 }}>
          <div className="flex items-baseline gap-2 mb-1">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.5 }}>2.</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text)', letterSpacing: '0.1em' }}>
              GRAVITÀ BB — RIENTRO EMA
            </span>
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)',
            opacity: 0.55, marginBottom: 8, lineHeight: 1.6,
            padding: '5px 8px', background: 'rgba(255,255,255,0.015)',
            border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2,
          }}>
            Quando il prezzo tocca una BB (2σ), misuriamo quanto ci mette a tornare alla EMA50/100/200. p50 = metà dei casi rientra entro X barre. dist avg = distanza massima raggiunta durante lo stretch. Usato da Lachesi per stimare il timing del mean-reversion.
          </div>

          {bbTf ? (
            <div className="space-y-2">
              {BB_EMAS.map(key => {
                const d = bbTf[key];
                if (!d) return null;
                const EMA_COL: Record<string, string> = {
                  ema50: '#9a6abf', ema100: '#6ab5bf', ema200: '#bf4a4a',
                };
                return (
                  <SideBlock key={key} d={d}
                    label={key.replace('ema', 'EMA ')} col={EMA_COL[key] ?? 'var(--color-text-dim)'} />
                );
              })}
            </div>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)', opacity: 0.5 }}>
              — nessun dato per {tf}
            </span>
          )}
        </div>

        {/* ── Assi 3-8 ── */}
        <div className="space-y-3">

          {/* Asse 3: Ciclica */}
          <AxisBucketSection n={3} title="CICLICA" desc="Fase EMA21/50 + età swing · 1h e 4h"
            explanation="EMA21 vs EMA50 determina la direzione (±0.15% = neutro). L'età del ciclo è la distanza dall'ultimo swing locale normalizzata sul ciclo medio: early 0–33%, mid 33–66%, late 66–100%. Il bucket mostra come performa il sistema quando entra in quella specifica fase strutturale."
            data={genome.ciclica_axis} nested />

          {/* Asse 4: MTF Bias */}
          <AxisBucketSection n={4} title="STRUTTURA MTF BIAS" desc="EMA21 su 15m/1h/4h · L=long S=short"
            explanation="Tre caratteri: 1°=15m, 2°=1h, 3°=4h. L = close ≥ EMA21 (bias long), S = close < EMA21 (bias short). LLL = tutti e tre i TF long-biased = trend strutturale forte. Divergenze come SLL (contro-tendenza a 15m) o LLS (4h short contro 15m/1h long) indicano pullback in corso."
            data={genome.mtf_bias_axis} />

          {/* Asse 5: Momentum X/Y */}
          <AxisBucketSection n={5} title="MOMENTUM X/Y" desc="X = impulso/misto/contrarian · Y = alto/centrale/basso nel range 20b"
            explanation="X misura il tipo di spinta: impulso = prezzo nel terzo estremo del range 5b con EMA21 a favore; contrarian = prezzo nel terzo opposto alla direzione EMA21; misto = intermedio. Y misura la posizione nel range delle ultime 20 barre al momento dell'entry: alto &gt;66%, centrale 33–66%, basso &lt;33%. Ogni combinazione identifica la 'firma' del setup."
            data={genome.momentum_xy_axis} />

          {/* Asse 6: BTC Regime Score */}
          {genome.btc_regime_axis && Object.keys(genome.btc_regime_axis).length > 0 ? (
            <BtcRegimeSection data={genome.btc_regime_axis} />
          ) : (
            <AxisStub n={6} title="BTC Regime Score" desc="Score composito trend BTC 0-7"
              buckets={['0-1 downtrend', '2-3 misto rib.', '4-5 misto rialz.', '6-7 uptrend']} />
          )}

          {/* Asse 7: Distanza S/R */}
          <AxisBucketSection n={7} title="DISTANZA S/R" desc="Pivot 4h · in_zona <1% / vicino 1-3% / medio 3-7% / lontano >7%"
            explanation="Pivot 4h calcolati con swing high/low window ±3 barre — solo pivot antecedenti all'entry (no lookahead). in_zona (&lt;1%) = il prezzo è esattamente su un livello S/R, vicino (1–3%) = nell'area di influenza immediata, medio/lontano = in zona più neutra. Un livello di S/R può fungere da magnete o da rimbalzo."
            data={genome.sr_dist_axis} />

          {/* Asse 8: Pool Liquidità */}
          <AxisBucketSection n={8} title="POOL LIQUIDITÀ" desc="Cluster swing 4h ≥2 tocchi · sopra/sotto il prezzo"
            explanation="Cluster di prezzi con ≥2 tocchi storici nel 4h (potenziali zone di accumulo ordini / liquidity pools). sopra il prezzo = resistenza/target potenziale (il mercato tende ad andare a prendere la liquidità sopra), sotto = supporto. La presenza di pool sopra in un contesto rialzista funge spesso da magnete."
            data={genome.pool_liquidity_axis} />

        </div>

        {/* ── TRE MOIRE — analisi grafico ── */}
        <div className="space-y-2">
          <MoirePhaseSection    data={genome.moire_phase_stats} />
          <MoireReversionSection data={genome.moire_reversion_map} />
          <MoireVolatilitySection data={genome.moire_volatility} />
          <MoireBetaSection     data={genome.moire_btc_beta} />
        </div>

        {/* ── ATROPO placeholder ── */}
        <div style={{
          borderTop: '1px solid var(--color-border-dim)',
          paddingTop: 16,
          opacity: 0.35,
        }}>
          <div className="flex items-baseline gap-2 mb-2">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text)', letterSpacing: '0.1em' }}>
              ATROPO — PROIEZIONI
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)' }}>
              in costruzione · richiede Lachesi completo
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['P(direzione 10b)', 'P(tocca EMA200 50b)', 'P(rientro BB 20b)'].map(label => (
              <div key={label} style={{
                padding: '8px 10px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--color-border-dim)',
                borderRadius: 2,
                textAlign: 'center',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', marginBottom: 4 }}>
                  {label}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--color-text-dim)', fontWeight: 300 }}>
                  —
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.4, textAlign: 'right' }}>
          Lachesi: lookup live non disponibile · Cloto: Gravità OK · dati genome 2y
        </div>
      </div>
    </div>
  );
}

// ── Coin card ─────────────────────────────────────────────────────────────────

function MoireCoinCard({ genome, onClick }: { genome: GenomeFull; onClick: () => void }) {
  const pat     = dominantPattern(genome);
  const nAxes   = countAxesAvailable(genome);
  const hasData = nAxes > 0;

  return (
    <button onClick={onClick}
      className="text-left p-3 transition-all w-full"
      style={{
        background: 'var(--color-deep)',
        border: '1px solid var(--color-border)',
        cursor: 'pointer',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-gold-dim)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-border)'}
    >
      <div className="flex items-start justify-between mb-2">
        <span style={{ fontFamily: 'var(--font-decorative)', fontSize: 14, color: 'var(--color-gold)', fontWeight: 300 }}>
          {genome.coin}
        </span>
        {hasData && <PatternBadge p={pat} />}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)' }}>
        {hasData
          ? `${nAxes}/8 assi · gravità disponibile`
          : 'gravità non disponibile'}
      </div>
    </button>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function TreMoirePanel() {
  const [genomes, setGenomes]   = useState<GenomeFull[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error,   setError]     = useState<string | null>(null);
  const [selected, setSelected] = useState<GenomeFull | null>(null);
  const [filter,  setFilter]    = useState<PatternType | 'all'>('all');

  useEffect(() => {
    setLoading(true);
    fetch('/api/tradedb/genome-cache')
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<GenomeFull[]>;
      })
      .then(d => { setGenomes(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return genomes;
    return genomes.filter(g => dominantPattern(g).type === filter);
  }, [genomes, filter]);

  const filterBtns: { key: PatternType | 'all'; label: string; color: string }[] = [
    { key: 'all',               label: 'tutti',              color: 'var(--color-text-dim)'      },
    { key: 'ciclo_strutturale', label: 'ciclo strutturale',  color: 'var(--color-long-bright)'   },
    { key: 'ciclo_raro',        label: 'ciclo raro',         color: 'var(--color-gold)'           },
    { key: 'noise',             label: 'noise',              color: 'var(--color-text-dim)'       },
  ];

  return (
    <div className="py-4">
      {/* ── Header ── */}
      <div className="mb-6">
        <h2 style={{
          fontFamily: 'var(--font-decorative)',
          fontSize: 28,
          color: 'var(--color-gold)',
          fontWeight: 300,
          margin: 0,
        }}>Le Tre Moire</h2>
        <p className="mt-0.5 uppercase tracking-[0.3em]"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}>
          Mappa comportamentale probabilistica · {genomes.length} coin
        </p>
        <div className="mt-3 grid grid-cols-3 gap-3 max-w-xl">
          {[
            { name: 'CLOTO',   sub: 'il passato',   desc: 'Costruisce la mappa · distribuzione storica per ogni asse',    active: true  },
            { name: 'LACHESI', sub: 'il presente',  desc: 'Posiziona sulla mappa · lookup stato attuale',                  active: false },
            { name: 'ATROPO',  sub: 'il futuro',    desc: 'Proietta · combina distribuzioni → output probabilistico',      active: false },
          ].map(m => (
            <div key={m.name} style={{
              padding: '10px 12px',
              background: m.active ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.015)',
              border: m.active ? '1px solid rgba(201,168,76,0.2)' : '1px solid var(--color-border-dim)',
              borderRadius: 2,
            }}>
              <div className="flex items-baseline gap-2">
                <span style={{ fontFamily: 'var(--font-decorative)', fontSize: 13, color: m.active ? 'var(--color-gold)' : 'var(--color-text-dim)', fontWeight: 300 }}>
                  {m.name}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {m.sub}
                </span>
                {!m.active && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)', opacity: 0.3, marginLeft: 'auto' }}>
                    wip
                  </span>
                )}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: m.active ? 0.7 : 0.35, marginTop: 4 }}>
                {m.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {filterBtns.map(b => (
          <button key={b.key} onClick={() => setFilter(b.key)}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              padding: '3px 10px',
              background: 'transparent',
              color:  filter === b.key ? b.color   : 'var(--color-text-dim)',
              border: filter === b.key
                ? `1px solid ${b.color}`
                : '1px solid var(--color-border-dim)',
              cursor: 'pointer',
              opacity: filter === b.key ? 1 : 0.6,
              transition: 'all 150ms',
            }}>
            {b.label}
          </button>
        ))}
      </div>

      {/* ── States ── */}
      {loading && (
        <div className="font-mono text-[11px] text-[var(--color-text-dim)] text-center py-16 tracking-[0.2em]">
          Carico mappa...
        </div>
      )}
      {error && (
        <div className="font-mono text-[11px] text-center py-16" style={{ color: 'var(--color-short-bright)' }}>
          {error}
        </div>
      )}

      {/* ── Coin grid ── */}
      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-2">
          {filtered.map(g => (
            <MoireCoinCard key={g.coin} genome={g} onClick={() => setSelected(g)} />
          ))}
        </div>
      )}

      {selected && <ClotoDetail genome={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
