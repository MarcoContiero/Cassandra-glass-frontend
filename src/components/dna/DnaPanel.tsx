'use client';

import React, { useEffect, useState, useMemo } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface GenomeSummary {
  coin: string;
  n_trades: number;
  win_rate: number;
  profit_factor: number | null;
  avg_bars_held: number;
  median_bars_held: number;
  avg_pnl_pct: number;
  built_at: string;
}

interface ScenarioProfile {
  [scenario: string]: { n: number; wr: number; pf: number | null; avg_pnl: number };
}

interface SideProfile {
  [side: string]: { n: number; wr: number; pf: number | null };
}

interface VolatilityProfile {
  avg_range_pct_1m?: number;
  p75_range_pct_1m?: number;
  p95_range_pct_1m?: number;
  avg_range_pct_5m?: number;
  p75_range_pct_5m?: number;
}

interface BtcCorr {
  corr_1m?: number;
  beta_1m?: number | null;
  corr_5m?: number;
  corr_1h?: number;
  lag_m2?: number;
  lag_m1?: number;
  lag_p1?: number;
  lag_p2?: number;
}

interface EthCorr {
  corr_1m?: number;
  beta_1m?: number | null;
}

interface Nervousness {
  spike_rate_1m?: number;
  p99_range_pct_1m?: number;
  autocorr_lag1?: number | null;
  volume_cv?: number;
}

interface SessionStats {
  n: number;
  wr: number;
  pf: number | null;
}

interface SessionProfile {
  asia?: SessionStats;
  europe?: SessionStats;
  us?: SessionStats;
  weekend?: SessionStats;
}

interface DowStats { n: number; wr: number; pf: number | null }
interface DowProfile { [dow: string]: DowStats }

interface MarketProfile {
  avg_price_usd?: number;
  avg_daily_volume_usdc?: number;
  typical_drawdown_4h_pct?: number;
}

interface HourlyWr { [hour: string]: number }

interface GravitaSide {
  avg_max_dist_pct: number;
  p75_max_dist_pct: number;
  avg_bars: number;
  p50_bars: number;
  p90_bars: number;
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

interface Ema200Pull { [tf: string]: Ema200PullTf }
interface BbReturn   { [tf: string]: BbReturnTf   }

interface GenomeFull extends GenomeSummary {
  scenario_profile: ScenarioProfile;
  hourly_wr: HourlyWr;
  hourly_n: { [hour: string]: number };
  side_profile: SideProfile;
  exit_profile: { [reason: string]: number };
  bar_profile: { [bar: string]: { avg_pnl: number; avg_max_fav: number; avg_max_adv: number; n: number } };
  volatility: VolatilityProfile;
  btc_correlation: BtcCorr;
  eth_correlation?: EthCorr;
  nervousness?: Nervousness;
  session_profile?: SessionProfile;
  dow_profile?: DowProfile;
  hurst_exp?: number | null;
  market_profile?: MarketProfile;
  ema200_pull?: Ema200Pull;
  bb_return?: BbReturn;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, decimals = 3) {
  if (v == null) return '—';
  return v.toFixed(decimals);
}

function wr(v: number | null | undefined) {
  if (v == null) return '—';
  return `${v.toFixed(1)}%`;
}

function pfColor(v: number | null | undefined) {
  if (v == null) return 'text-white/40';
  if (v >= 1.1) return 'text-emerald-400';
  if (v >= 1.0) return 'text-yellow-400';
  return 'text-red-400';
}

function wrColor(v: number | null | undefined) {
  if (v == null) return 'text-white/40';
  if (v >= 57) return 'text-emerald-400';
  if (v >= 53) return 'text-yellow-400';
  return 'text-red-400';
}

function corrColor(v: number | null | undefined) {
  if (v == null) return 'text-white/50';
  const abs = Math.abs(v);
  if (abs >= 0.7) return 'text-cyan-300';
  if (abs >= 0.5) return 'text-cyan-500';
  return 'text-white/60';
}

function hurstLabel(h: number): { label: string; color: string } {
  if (h < 0.40) return { label: 'mean-rev forte', color: 'text-violet-400' };
  if (h < 0.47) return { label: 'mean-reverting', color: 'text-violet-300' };
  if (h < 0.53) return { label: 'random walk',    color: 'text-white/50'   };
  if (h < 0.60) return { label: 'trending',       color: 'text-emerald-400' };
  return              { label: 'trend forte',     color: 'text-emerald-300' };
}

function autocorrLabel(v: number): { label: string; color: string } {
  if (v < -0.10) return { label: 'choppy',    color: 'text-orange-400' };
  if (v >  0.10) return { label: 'momentum',  color: 'text-emerald-400' };
  return               { label: 'neutro',    color: 'text-white/40' };
}

function fmtVol(v: number | undefined): string {
  if (v == null) return '—';
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000)     return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

function fmtPrice(v: number | undefined): string {
  if (v == null) return '—';
  if (v < 0.0001) return v.toExponential(2);
  if (v < 0.01)   return v.toFixed(6);
  if (v < 1)      return v.toFixed(4);
  if (v < 100)    return v.toFixed(2);
  return v.toFixed(0);
}

const DOW_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

// ── Sub-components ───────────────────────────────────────────────────────────

function HourlyHeatmap({ wr, n }: { wr: HourlyWr; n: { [h: string]: number } }) {
  const hours  = Array.from({ length: 24 }, (_, i) => i);
  const maxN   = Math.max(...hours.map(h => n[h] ?? 0), 1);
  return (
    <div>
      <span className="section-tag mb-2">WR% per ora UTC</span>
      <div className="flex gap-0.5">
        {hours.map(h => {
          const wrVal = wr[h];
          const nVal  = n[h] ?? 0;
          const opacity = Math.max(0.15, nVal / maxN);
          let bg = 'rgba(201,168,76,0.08)';
          if (wrVal != null) {
            if (wrVal >= 65)       bg = `rgba(61,168,102,${0.7 * opacity})`;
            else if (wrVal >= 55)  bg = `rgba(61,168,102,${0.4 * opacity})`;
            else if (wrVal >= 45)  bg = `rgba(201,168,76,${0.3 * opacity})`;
            else                   bg = `rgba(168,61,61,${0.5 * opacity})`;
          }
          return (
            <div key={h} title={`${h}:00 UTC — WR: ${wrVal != null ? wrVal.toFixed(1) + '%' : '—'} (n=${nVal})`}
              className="flex-1 cursor-default"
              style={{ height: 20, background: bg }} />
          );
        })}
      </div>
      <div className="flex justify-between mt-0.5"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--color-text-dim)' }}>
        <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    </div>
  );
}

function DowHeatmap({ profile }: { profile: DowProfile }) {
  const maxN = Math.max(...Object.values(profile).map(d => d.n), 1);
  return (
    <div>
      <span className="section-tag mb-2">WR% per giorno</span>
      <div className="flex gap-1">
        {DOW_LABELS.map((label, i) => {
          const d       = profile[i];
          const nVal    = d?.n ?? 0;
          const wrVal   = d?.wr;
          const opacity = Math.max(0.15, nVal / maxN);
          let bg = 'rgba(201,168,76,0.06)';
          if (wrVal != null) {
            if (wrVal >= 65)       bg = `rgba(61,168,102,${0.7 * opacity})`;
            else if (wrVal >= 55)  bg = `rgba(61,168,102,${0.4 * opacity})`;
            else if (wrVal >= 45)  bg = `rgba(201,168,76,${0.3 * opacity})`;
            else                   bg = `rgba(168,61,61,${0.5 * opacity})`;
          }
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1"
              title={`${label} — WR: ${wrVal != null ? wrVal.toFixed(1) + '%' : '—'} (n=${nVal})`}>
              <div className="w-full" style={{ height: 28, background: bg }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)' }}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SideBar({ profile }: { profile: SideProfile }) {
  return (
    <div className="flex gap-3">
      {Object.entries(profile).map(([side, s]) => {
        const isLong  = side.toLowerCase() === 'long';
        const isShort = side.toLowerCase() === 'short';
        const headerColor = isLong
          ? 'var(--color-long-bright)'
          : isShort
            ? 'var(--color-short-bright)'
            : 'var(--color-text-dim)';
        const wrValueColor = s.wr >= 57
          ? 'var(--color-long-bright)'
          : s.wr >= 53
            ? 'var(--color-gold)'
            : 'var(--color-short-bright)';
        return (
          <div key={side} className="flex-1 p-2.5"
            style={{
              background: isLong ? 'rgba(45,122,79,0.12)' : isShort ? 'rgba(122,45,45,0.12)' : 'rgba(201,168,76,0.08)',
              borderLeft: `1px solid var(--color-text-faint)`,
            }}>
            <div className="mb-1 uppercase tracking-widest"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: headerColor }}>
              {side}
            </div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              fontWeight: 300,
              color: wrValueColor,
              lineHeight: 1,
            }}>{wr(s.wr)}</div>
            <div className="mt-1" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}>
              PF {fmt(s.pf)}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}>
              n={s.n}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScenarioTable({ profile }: { profile: ScenarioProfile }) {
  const rows = Object.entries(profile).sort((a, b) => b[1].n - a[1].n);
  return (
    <div className="overflow-auto max-h-48">
      <table className="w-full border-collapse" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <thead>
          <tr className="uppercase" style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>
            <th className="text-left pb-1 font-normal">Scenario</th>
            <th className="text-right pb-1 font-normal">n</th>
            <th className="text-right pb-1 font-normal">WR%</th>
            <th className="text-right pb-1 font-normal">PF</th>
            <th className="text-right pb-1 font-normal">avgPnL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([scen, s]) => (
            <tr key={scen} style={{ borderTop: '1px solid var(--color-border-dim)' }}>
              <td className="py-0.5 pr-2 truncate max-w-[220px]" style={{ color: 'var(--color-text)' }}>{scen}</td>
              <td className="text-right" style={{ color: 'var(--color-text-dim)' }}>{s.n}</td>
              <td className={`text-right ${wrColor(s.wr)}`}>{wr(s.wr)}</td>
              <td className={`text-right ${pfColor(s.pf)}`}>{fmt(s.pf)}</td>
              <td className="text-right"
                style={{ color: s.avg_pnl >= 0 ? 'var(--color-long-bright)' : 'var(--color-short-bright)' }}>
                {s.avg_pnl.toFixed(3)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InfoRow({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      <span style={{ color: 'var(--color-text-dim)' }}>{label}</span>
      <span className={cls} style={!cls ? { color: 'var(--color-text)' } : undefined}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="cassandra-card p-3">
      {title && <span className="section-tag mb-2">{title}</span>}
      {children}
    </div>
  );
}

// ── Gravità Section ──────────────────────────────────────────────────────────

const GRAVITY_TFS = ['15m', '1h', '4h', '1d'] as const;
type GravityTf = typeof GRAVITY_TFS[number];

const EMA_COLORS: Record<string, string> = {
  ema9: '#e8c96a', ema21: '#0abfbc', ema50: '#9a6abf', ema100: '#6ab5bf', ema200: '#bf4a4a',
};

function GravitaBar({ val, max, color }: { val: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (val / max) * 100) : 0;
  return (
    <div className="relative h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color, opacity: 0.6 }} />
    </div>
  );
}

function GravitaSection({ pull, bb }: { pull?: Ema200Pull; bb?: BbReturn }) {
  const [tf, setTf] = React.useState<GravityTf>('1h');

  const hasPull = pull && Object.keys(pull).length > 0;
  const hasBb   = bb   && Object.keys(bb).length   > 0;
  if (!hasPull && !hasBb) return null;

  const pullTf = pull?.[tf];
  const bbTf   = bb?.[tf];

  // Scala visiva: max dist tra i 4 TF per normalizzare la barra
  const allPullDists = pull
    ? Object.values(pull).flatMap(t => [t.above?.avg_max_dist_pct ?? 0, t.below?.avg_max_dist_pct ?? 0])
    : [];
  const maxPullDist = Math.max(...allPullDists, 1);

  const allBbDists = bb
    ? Object.values(bb).flatMap(t =>
        (['ema9', 'ema21', 'ema50', 'ema100', 'ema200'] as const).map(k => t[k]?.avg_max_dist_pct ?? 0)
      )
    : [];
  const maxBbDist = Math.max(...allBbDists, 0.5);

  return (
    <div className="cassandra-card p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="section-tag">Gravità</span>
        <div className="flex gap-1">
          {GRAVITY_TFS.map(t => (
            <button key={t} onClick={() => setTf(t)}
              className="px-2 py-0.5 text-[10px] font-mono rounded-sm transition-all"
              style={{
                background:  tf === t ? 'rgba(201,168,76,0.12)' : 'transparent',
                color:       tf === t ? 'var(--color-gold)'     : 'var(--color-text-dim)',
                border:      tf === t ? '1px solid rgba(201,168,76,0.3)' : '1px solid rgba(255,255,255,0.08)',
              }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">

        {/* ── EMA200 Calamita ── */}
        <div className="space-y-2.5">
          <div className="uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)' }}>
            EMA200 Calamita
          </div>
          {pullTf ? (
            <>
              {(['above', 'below'] as const).map(side => {
                const d = pullTf[side];
                if (!d) return null;
                const col = side === 'above' ? 'var(--color-long-bright)' : 'var(--color-short-bright)';
                return (
                  <div key={side} className="space-y-1">
                    <div className="uppercase text-[9px] font-mono tracking-wider" style={{ color: col }}>
                      {side === 'above' ? '↑ sopra ema200' : '↓ sotto ema200'}
                    </div>
                    <GravitaBar val={d.avg_max_dist_pct} max={maxPullDist} color={side === 'above' ? 'rgb(45,168,102)' : 'rgb(168,45,45)'} />
                    <div className="grid grid-cols-2 gap-x-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                      <div>
                        <span style={{ color: 'var(--color-text-dim)' }}>dist avg </span>
                        <span style={{ color: 'var(--color-gold)' }}>{d.avg_max_dist_pct.toFixed(2)}%</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-dim)' }}>p75 </span>
                        <span style={{ color: 'var(--color-text)' }}>{d.p75_max_dist_pct.toFixed(2)}%</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-dim)' }}>barre avg </span>
                        <span style={{ color: 'var(--color-text)' }}>{d.avg_bars.toFixed(0)}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-dim)' }}>p50 </span>
                        <span style={{ color: 'var(--color-text)' }}>{d.p50_bars}</span>
                      </div>
                      {d.p90_bars != null && (
                        <div>
                          <span style={{ color: 'var(--color-text-dim)' }}>p90 </span>
                          <span style={{ color: 'var(--color-text-dim)' }}>{d.p90_bars}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)' }}>
                      n={d.n} eventi
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}>
              — nessun dato per {tf}
            </span>
          )}
        </div>

        {/* ── BB Rientro EMA ── */}
        <div className="space-y-2.5">
          <div className="uppercase tracking-wider" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)' }}>
            BB Rientro EMA
          </div>
          {bbTf ? (
            <>
              {(['ema9', 'ema21', 'ema50', 'ema100', 'ema200'] as const).map(key => {
                const d = bbTf[key];
                if (!d) return null;
                return (
                  <div key={key} className="space-y-1">
                    <div className="uppercase text-[9px] font-mono tracking-wider" style={{ color: EMA_COLORS[key] }}>
                      {key.replace('ema', 'EMA ')}
                    </div>
                    <GravitaBar val={d.avg_max_dist_pct} max={maxBbDist} color={EMA_COLORS[key]} />
                    <div className="grid grid-cols-2 gap-x-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                      <div>
                        <span style={{ color: 'var(--color-text-dim)' }}>dist avg </span>
                        <span style={{ color: 'var(--color-gold)' }}>{d.avg_max_dist_pct.toFixed(2)}%</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-dim)' }}>p75 </span>
                        <span style={{ color: 'var(--color-text)' }}>{d.p75_max_dist_pct.toFixed(2)}%</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-dim)' }}>barre avg </span>
                        <span style={{ color: 'var(--color-text)' }}>{d.avg_bars.toFixed(0)}</span>
                      </div>
                      <div>
                        <span style={{ color: 'var(--color-text-dim)' }}>p50 </span>
                        <span style={{ color: 'var(--color-text)' }}>{d.p50_bars}</span>
                      </div>
                      {d.p90_bars != null && (
                        <div>
                          <span style={{ color: 'var(--color-text-dim)' }}>p90 </span>
                          <span style={{ color: 'var(--color-text-dim)' }}>{d.p90_bars}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)' }}>
                      n={d.n} eventi
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}>
              — nessun dato per {tf}
            </span>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Genome Detail Modal ───────────────────────────────────────────────────────

function GenomeDetail({ genome, onClose }: { genome: GenomeFull; onClose: () => void }) {
  const hurst = genome.hurst_exp;
  const hurstInfo = hurst != null ? hurstLabel(hurst) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-6 px-4 overflow-auto"
      style={{ background: 'rgba(2,2,14,0.92)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl cassandra-card p-6 space-y-4"
        style={{ boxShadow: '0 0 60px rgba(201,168,76,0.06)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <span style={{
              fontFamily: 'var(--font-decorative)',
              fontSize: 28,
              color: 'var(--color-gold)',
              fontWeight: 300,
            }}>{genome.coin}</span>
            <span className="ml-3 uppercase tracking-widest"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}>
              genoma 2y
            </span>
          </div>
          <button onClick={onClose}
            className="transition-all"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--color-text-dim)', background: 'transparent', border: 'none', cursor: 'pointer', lineHeight: 1 }}>
            ✕
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'TRADES',        value: genome.n_trades.toLocaleString(),            positive: true  },
            { label: 'WIN RATE',      value: wr(genome.win_rate),                         positive: genome.win_rate >= 53 },
            { label: 'PROFIT FACTOR', value: fmt(genome.profit_factor),                   positive: (genome.profit_factor ?? 0) >= 1.0 },
            { label: 'AVG PNL',       value: `${(genome.avg_pnl_pct * 100).toFixed(3)}%`, positive: genome.avg_pnl_pct >= 0 },
          ].map(k => (
            <div key={k.label} className="cassandra-card cassandra-card-corners p-4 text-center">
              <span className="section-tag mb-2">{k.label}</span>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 32,
                fontWeight: 300,
                color: k.positive ? 'var(--color-gold)' : 'var(--color-short-bright)',
                lineHeight: 1,
              }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Nota metodologica WR/PF */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.55, lineHeight: 1.6, padding: '6px 10px', border: '1px solid var(--color-border-dim)', borderRadius: 2 }}>
          Win Rate e Profit Factor sono calcolati su un periodo di circa 2 anni con pattern e incroci EMA calibrati dai programmatori in base a dati statistici storici. Non rappresentano garanzie di risultati futuri.
        </div>

        {/* Market profile */}
        {genome.market_profile && Object.keys(genome.market_profile).length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <Section title="Prezzo medio">
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--color-text)' }}>
                ${fmtPrice(genome.market_profile.avg_price_usd)}
              </div>
            </Section>
            <Section title="Volume giornaliero">
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--color-text)' }}>
                ${fmtVol(genome.market_profile.avg_daily_volume_usdc)}
              </div>
            </Section>
            <Section title="Drawdown tipico 4h">
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                color: (genome.market_profile.typical_drawdown_4h_pct ?? 0) > 2
                  ? 'var(--color-short-bright)'
                  : 'var(--color-text)',
              }}>
                {genome.market_profile.typical_drawdown_4h_pct != null
                  ? `${genome.market_profile.typical_drawdown_4h_pct.toFixed(2)}%`
                  : '—'}
              </div>
            </Section>
          </div>
        )}

        {/* Volatility + Nervosismo */}
        <div className="grid grid-cols-2 gap-3">
          <Section title="Volatilita">
            {genome.volatility && Object.keys(genome.volatility).length > 0 ? (
              <div className="space-y-0.5">
                <InfoRow label="avg 1m"  value={`${genome.volatility.avg_range_pct_1m?.toFixed(3)}%`} />
                <InfoRow label="p75 1m"  value={`${genome.volatility.p75_range_pct_1m?.toFixed(3)}%`} />
                <InfoRow label="p95 1m"  value={`${genome.volatility.p95_range_pct_1m?.toFixed(3)}%`} />
                <InfoRow label="avg 5m"  value={`${genome.volatility.avg_range_pct_5m?.toFixed(3)}%`} />
                <InfoRow label="p75 5m"  value={`${genome.volatility.p75_range_pct_5m?.toFixed(3)}%`} />
              </div>
            ) : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}>—</span>}
          </Section>

          <Section title="Nervosismo">
            {genome.nervousness && Object.keys(genome.nervousness).length > 0 ? (
              <div className="space-y-0.5">
                <InfoRow label="spike rate 1m"
                  value={genome.nervousness.spike_rate_1m != null ? `${genome.nervousness.spike_rate_1m.toFixed(2)}%` : '—'}
                  cls={(genome.nervousness.spike_rate_1m ?? 0) > 5 ? 'text-orange-400' : undefined} />
                <InfoRow label="p99 range 1m"
                  value={genome.nervousness.p99_range_pct_1m != null ? `${genome.nervousness.p99_range_pct_1m.toFixed(3)}%` : '—'} />
                {genome.nervousness.autocorr_lag1 != null && (() => {
                  const al = autocorrLabel(genome.nervousness.autocorr_lag1!);
                  return (
                    <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      <span style={{ color: 'var(--color-text-dim)' }}>autocorr lag-1</span>
                      <span>
                        <span className="mr-1" style={{ color: 'var(--color-text)' }}>{genome.nervousness.autocorr_lag1.toFixed(3)}</span>
                        <span className={`text-[10px] ${al.color}`}>{al.label}</span>
                      </span>
                    </div>
                  );
                })()}
                <InfoRow label="volume CV"
                  value={genome.nervousness.volume_cv != null ? genome.nervousness.volume_cv.toFixed(2) : '—'}
                  cls={(genome.nervousness.volume_cv ?? 0) > 3 ? 'text-orange-400' : undefined} />
                {hurst != null && (
                  <div className="flex justify-between pt-0.5 mt-0.5"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, borderTop: '1px solid var(--color-border-dim)' }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>Hurst exp</span>
                    <span>
                      <span className="mr-1" style={{ color: 'var(--color-text)' }}>{hurst.toFixed(3)}</span>
                      <span className={`text-[10px] ${hurstInfo?.color}`}>{hurstInfo?.label}</span>
                    </span>
                  </div>
                )}
              </div>
            ) : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}>—</span>}
          </Section>
        </div>

        {/* BTC + ETH correlation */}
        <div className="grid grid-cols-2 gap-3">
          <Section title="BTC Correlazione">
            {genome.btc_correlation && genome.btc_correlation.corr_1m != null ? (
              <div className="space-y-0.5">
                <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>
                  <span style={{ color: 'var(--color-text-dim)' }}>corr 1m</span>
                  <span style={{ color: (genome.btc_correlation.corr_1m ?? 0) >= 0 ? 'var(--color-gold)' : 'var(--color-short-bright)' }}>
                    {genome.btc_correlation.corr_1m.toFixed(3)}
                  </span>
                </div>
                <InfoRow label="beta 1m" value={genome.btc_correlation.beta_1m?.toFixed(3) ?? '—'} />
                {genome.btc_correlation.corr_5m != null && (
                  <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>corr 5m</span>
                    <span style={{ color: (genome.btc_correlation.corr_5m ?? 0) >= 0 ? 'var(--color-gold)' : 'var(--color-short-bright)' }}>
                      {genome.btc_correlation.corr_5m.toFixed(3)}
                    </span>
                  </div>
                )}
                {genome.btc_correlation.corr_1h != null && (
                  <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>
                    <span style={{ color: 'var(--color-text-dim)' }}>corr 1h</span>
                    <span style={{ color: (genome.btc_correlation.corr_1h ?? 0) >= 0 ? 'var(--color-gold)' : 'var(--color-short-bright)' }}>
                      {genome.btc_correlation.corr_1h.toFixed(3)}
                    </span>
                  </div>
                )}
                {/* Lag correlation */}
                {(genome.btc_correlation.lag_m1 != null || genome.btc_correlation.lag_p1 != null) && (
                  <div className="pt-0.5 mt-0.5 space-y-0.5" style={{ borderTop: '1px solid var(--color-border-dim)' }}>
                    <div className="uppercase tracking-wider"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', marginBottom: 2 }}>
                      Lag (coin leads | BTC leads)
                    </div>
                    {genome.btc_correlation.lag_m2 != null &&
                      <InfoRow label="coin +2" value={genome.btc_correlation.lag_m2.toFixed(3)} />}
                    {genome.btc_correlation.lag_m1 != null &&
                      <InfoRow label="coin +1" value={genome.btc_correlation.lag_m1.toFixed(3)} />}
                    {genome.btc_correlation.lag_p1 != null &&
                      <InfoRow label="BTC +1"  value={genome.btc_correlation.lag_p1.toFixed(3)} />}
                    {genome.btc_correlation.lag_p2 != null &&
                      <InfoRow label="BTC +2"  value={genome.btc_correlation.lag_p2.toFixed(3)} />}
                  </div>
                )}
              </div>
            ) : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}>—</span>}
          </Section>

          <Section title="ETH Correlazione">
            {genome.eth_correlation && genome.eth_correlation.corr_1m != null ? (
              <div className="space-y-0.5">
                <div className="flex justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>
                  <span style={{ color: 'var(--color-text-dim)' }}>corr 1m</span>
                  <span style={{ color: (genome.eth_correlation.corr_1m ?? 0) >= 0 ? 'var(--color-gold)' : 'var(--color-short-bright)' }}>
                    {genome.eth_correlation.corr_1m.toFixed(3)}
                  </span>
                </div>
                <InfoRow label="beta 1m" value={genome.eth_correlation.beta_1m?.toFixed(3) ?? '—'} />
              </div>
            ) : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}>—</span>}
          </Section>
        </div>

        {/* Gravità */}
        {(genome.ema200_pull || genome.bb_return) && (
          <GravitaSection pull={genome.ema200_pull} bb={genome.bb_return} />
        )}

        {/* Session profile */}
        {genome.session_profile && Object.keys(genome.session_profile).length > 0 && (
          <Section title="Sessioni di trading">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                { key: 'asia',    label: 'Asia',    sub: '0-8h UTC',   color: 'var(--color-cyan)' },
                { key: 'europe',  label: 'Europa',  sub: '8-16h UTC',  color: '#a78bfa' },
                { key: 'us',      label: 'US',      sub: '16-24h UTC', color: 'var(--color-long-bright)' },
                { key: 'weekend', label: 'Weekend', sub: 'sab + dom',  color: 'var(--color-gold)' },
              ] as const).map(({ key, label, sub, color }) => {
                const s = genome.session_profile?.[key];
                const wrVal = s?.wr;
                const wrValColor = wrVal != null
                  ? wrVal >= 57
                    ? 'var(--color-long-bright)'
                    : wrVal >= 53
                      ? 'var(--color-gold)'
                      : 'var(--color-short-bright)'
                  : 'var(--color-text-dim)';
                return (
                  <div key={key} className="cassandra-card p-2 text-center">
                    <div className="mb-0.5" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color, fontWeight: 500 }}>{label}</div>
                    <div className="mb-1.5" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)' }}>{sub}</div>
                    {s ? (
                      <>
                        <div style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: 28,
                          fontWeight: 300,
                          color: wrValColor,
                          lineHeight: 1,
                        }}>{wr(s.wr)}</div>
                        <div className="mt-1" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-dim)' }}>
                          PF {fmt(s.pf)}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', marginTop: 2 }}>n={s.n}</div>
                      </>
                    ) : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}>—</span>}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* Day-of-week */}
        {genome.dow_profile && Object.keys(genome.dow_profile).length > 0 && (
          <Section title="">
            <DowHeatmap profile={genome.dow_profile} />
          </Section>
        )}

        {/* Side profile */}
        {genome.side_profile && Object.keys(genome.side_profile).length > 0 && (
          <Section title="Side Profile">
            <SideBar profile={genome.side_profile} />
          </Section>
        )}

        {/* Hourly heatmap */}
        {genome.hourly_wr && Object.keys(genome.hourly_wr).length > 0 && (
          <Section title="">
            <HourlyHeatmap wr={genome.hourly_wr} n={genome.hourly_n ?? {}} />
          </Section>
        )}

        {/* Scenario table */}
        {genome.scenario_profile && Object.keys(genome.scenario_profile).length > 0 && (
          <Section title="Scenari">
            <ScenarioTable profile={genome.scenario_profile} />
          </Section>
        )}

        <div className="text-right" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-dim)' }}>
          built {genome.built_at?.replace('T', ' ').replace('Z', ' UTC')}
        </div>
      </div>
    </div>
  );
}

// ── Coin Card ─────────────────────────────────────────────────────────────────

function CoinCard({ g, onClick }: { g: GenomeSummary; onClick: () => void }) {
  const pfOk = g.profit_factor != null && g.profit_factor >= 1.0;
  const wrValueColor = g.win_rate >= 57
    ? 'var(--color-long-bright)'
    : g.win_rate >= 53
      ? 'var(--color-gold)'
      : 'var(--color-short-bright)';
  return (
    <button onClick={onClick}
      className="cassandra-card cassandra-card-corners text-left p-4 transition-all hover:border-[var(--color-gold-dim)] w-full"
      style={{
        boxShadow: pfOk && g.win_rate >= 57 ? '0 0 20px rgba(61,168,102,0.06)' : undefined,
        background: 'var(--color-deep)',
      }}>
      <div className="mb-3">
        <span style={{
          fontFamily: 'var(--font-decorative)',
          fontSize: 16,
          color: 'var(--color-gold)',
          fontWeight: 300,
        }}>{g.coin}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <div>
          <span style={{ color: 'var(--color-text-dim)' }}>WR </span>
          <span style={{ color: wrValueColor }}>{wr(g.win_rate)}</span>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-dim)' }}>PF </span>
          <span className={pfColor(g.profit_factor)}>{fmt(g.profit_factor)}</span>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-dim)' }}>n </span>
          <span style={{ color: 'var(--color-text)' }}>{g.n_trades.toLocaleString()}</span>
        </div>
        <div>
          <span style={{ color: 'var(--color-text-dim)' }}>avg </span>
          <span style={{ color: g.avg_pnl_pct >= 0 ? 'var(--color-long-bright)' : 'var(--color-short-bright)' }}>
            {(g.avg_pnl_pct * 100).toFixed(3)}%
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

type SortKey = 'coin' | 'win_rate' | 'profit_factor' | 'n_trades' | 'avg_pnl_pct';

interface DnaPanelProps {
  onPiziaContext?: (ctx: string) => void;
}

export default function DnaPanel({ onPiziaContext }: DnaPanelProps) {
  const [cache,     setCache]    = useState<GenomeFull[]>([]);
  const [loading,   setLoading]  = useState(true);
  const [error,     setError]    = useState<string | null>(null);
  const [selected,  setSelected] = useState<GenomeFull | null>(null);
  const [sort,      setSort]     = useState<SortKey>('win_rate');
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMsg, setRebuildMsg] = useState<string | null>(null);

  function loadCache() {
    setLoading(true);
    setError(null);
    fetch('/api/tradedb/genome-cache')
      .then(async r => {
        if (!r.ok) {
          const txt = await r.text();
          throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
        }
        return r.json() as Promise<GenomeFull[]>;
      })
      .then(d => { setCache(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }

  useEffect(() => { loadCache(); }, []);

  useEffect(() => {
    if (!onPiziaContext) return;
    if (selected) {
      const lines = [
        `Pannello: DNA COIN — Profilo statistico`,
        `Coin: ${selected.coin}`,
        `Trade totali: ${selected.n_trades} | Win rate: ${selected.win_rate?.toFixed(1)}% | Profit factor: ${selected.profit_factor?.toFixed(2) ?? '—'}`,
        `Bars medi: ${selected.avg_bars_held} | Bars mediani: ${selected.median_bars_held}`,
        `P&L medio: ${selected.avg_pnl_pct?.toFixed(3)}%`,
        `Costruito il: ${selected.built_at}`,
      ];
      onPiziaContext(lines.join('\n'));
    } else if (cache.length > 0) {
      const lines = [
        `Pannello: DNA COIN — Profilo statistico`,
        `${cache.length} coin disponibili nel database. Nessun coin selezionato.`,
        `Coin disponibili: ${cache.slice(0, 20).map(g => g.coin).join(', ')}${cache.length > 20 ? '...' : ''}`,
      ];
      onPiziaContext(lines.join('\n'));
    }
  }, [selected, cache, onPiziaContext]);

  async function triggerRebuild() {
    setRebuilding(true);
    setRebuildMsg(null);
    try {
      const r = await fetch('/api/tradedb/rebuild-genome', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.detail ?? `HTTP ${r.status}`);
      setRebuildMsg(`Rebuild avviato (PID ${j.pid}) — ricarica tra qualche minuto`);
    } catch (e: any) {
      setRebuildMsg(`Errore: ${e?.message ?? String(e)}`);
    } finally {
      setRebuilding(false);
    }
  }

  const sorted = useMemo(() => {
    return [...cache].sort((a, b) => {
      if (sort === 'coin') return a.coin.localeCompare(b.coin);
      const av = a[sort] ?? -Infinity;
      const bv = b[sort] ?? -Infinity;
      return (bv as number) - (av as number);
    });
  }, [cache, sort]);

  function openDetail(coin: string) {
    const g = cache.find(r => r.coin === coin) ?? null;
    setSelected(g);
  }

  const sortBtns: { key: SortKey; label: string }[] = [
    { key: 'win_rate',      label: 'WR%'    },
    { key: 'profit_factor', label: 'PF'     },
    { key: 'avg_pnl_pct',  label: 'avgPnL' },
    { key: 'n_trades',     label: 'Trade'   },
    { key: 'coin',         label: 'A-Z'    },
  ];

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 style={{
            fontFamily: 'var(--font-decorative)',
            fontSize: 28,
            color: 'var(--color-gold)',
            fontWeight: 300,
            margin: 0,
          }}>DNA Coin</h2>
          <p className="mt-0.5 uppercase tracking-[0.3em]"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)' }}>
            Genoma 2y — {cache.length} coin · backtest storico
          </p>
          {rebuildMsg && (
            <p className="mt-1" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-cyan)' }}>
              {rebuildMsg}
            </p>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          <button
            onClick={triggerRebuild}
            disabled={rebuilding}
            className="bg-transparent border border-[var(--color-border)] text-[var(--color-text-dim)] font-mono text-[10px] tracking-[0.25em] uppercase rounded-none hover:text-[var(--color-gold)] hover:border-[var(--color-gold-dim)] transition-all px-4 py-1.5 disabled:opacity-40"
          >
            {rebuilding ? 'Avvio...' : 'Rebuild genome'}
          </button>
          <button
            onClick={loadCache}
            disabled={loading}
            className="bg-transparent border border-[var(--color-border)] text-[var(--color-text-dim)] font-mono text-[10px] tracking-[0.25em] uppercase rounded-none hover:text-[var(--color-gold)] hover:border-[var(--color-gold-dim)] transition-all px-4 py-1.5 disabled:opacity-40"
          >
            {loading ? '...' : 'Ricarica'}
          </button>
          {sortBtns.map(b => (
            <button key={b.key} onClick={() => setSort(b.key)}
              className="bg-transparent font-mono text-[10px] tracking-[0.25em] uppercase rounded-none transition-all px-2.5 py-1.5"
              style={{
                border: sort === b.key
                  ? '1px solid var(--color-gold-dim)'
                  : '1px solid transparent',
                color: sort === b.key
                  ? 'var(--color-gold)'
                  : 'var(--color-text-dim)',
              }}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="font-mono text-[11px] text-[var(--color-text-dim)] text-center py-16 tracking-[0.2em]">
          Carico genomi...
        </div>
      )}
      {error && (
        <div className="font-mono text-[11px] text-center py-16 tracking-[0.2em]"
          style={{ color: 'var(--color-short-bright)' }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3">
          {sorted.map(g => (
            <CoinCard key={g.coin} g={g} onClick={() => openDetail(g.coin)} />
          ))}
        </div>
      )}

      {selected && <GenomeDetail genome={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
