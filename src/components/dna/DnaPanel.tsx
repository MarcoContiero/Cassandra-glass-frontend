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
}

interface DowStats { n: number; wr: number; pf: number | null }
interface DowProfile { [dow: string]: DowStats }

interface MarketProfile {
  avg_price_usd?: number;
  avg_daily_volume_usdc?: number;
  typical_drawdown_4h_pct?: number;
}

interface HourlyWr { [hour: string]: number }

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
      <div className="text-[10px] text-white/40 mb-1.5 uppercase tracking-wider">WR% per ora UTC</div>
      <div className="flex gap-0.5">
        {hours.map(h => {
          const wrVal = wr[h];
          const nVal  = n[h] ?? 0;
          const opacity = Math.max(0.15, nVal / maxN);
          let bg = 'rgba(255,255,255,0.08)';
          if (wrVal != null) {
            if (wrVal >= 60)  bg = `rgba(52,211,153,${opacity})`;
            else if (wrVal >= 55) bg = `rgba(234,179,8,${opacity})`;
            else if (wrVal >= 50) bg = `rgba(251,146,60,${opacity * 0.8})`;
            else               bg = `rgba(248,113,113,${opacity})`;
          }
          return (
            <div key={h} title={`${h}:00 UTC — WR: ${wrVal != null ? wrVal.toFixed(1) + '%' : '—'} (n=${nVal})`}
              className="flex-1 rounded-sm cursor-default"
              style={{ height: 18, background: bg }} />
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-white/20 mt-0.5 font-mono">
        <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    </div>
  );
}

function DowHeatmap({ profile }: { profile: DowProfile }) {
  const maxN = Math.max(...Object.values(profile).map(d => d.n), 1);
  return (
    <div>
      <div className="text-[10px] text-white/40 mb-1.5 uppercase tracking-wider">WR% per giorno</div>
      <div className="flex gap-1">
        {DOW_LABELS.map((label, i) => {
          const d       = profile[i];
          const nVal    = d?.n ?? 0;
          const wrVal   = d?.wr;
          const opacity = Math.max(0.15, nVal / maxN);
          let bg = 'rgba(255,255,255,0.06)';
          if (wrVal != null) {
            if (wrVal >= 60)       bg = `rgba(52,211,153,${opacity})`;
            else if (wrVal >= 55)  bg = `rgba(234,179,8,${opacity})`;
            else if (wrVal >= 50)  bg = `rgba(251,146,60,${opacity * 0.8})`;
            else                   bg = `rgba(248,113,113,${opacity})`;
          }
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1"
              title={`${label} — WR: ${wrVal != null ? wrVal.toFixed(1) + '%' : '—'} (n=${nVal})`}>
              <div className="w-full rounded-sm" style={{ height: 28, background: bg }} />
              <span className="text-[9px] text-white/30 font-mono">{label}</span>
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
      {Object.entries(profile).map(([side, s]) => (
        <div key={side} className="flex-1 rounded-lg p-2.5"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-[10px] text-white/40 mb-1">{side}</div>
          <div className={`text-sm font-mono font-semibold ${wrColor(s.wr)}`}>{wr(s.wr)}</div>
          <div className="text-[10px] text-white/50 font-mono">PF {fmt(s.pf)}</div>
          <div className="text-[10px] text-white/30">n={s.n}</div>
        </div>
      ))}
    </div>
  );
}

function ScenarioTable({ profile }: { profile: ScenarioProfile }) {
  const rows = Object.entries(profile).sort((a, b) => b[1].n - a[1].n);
  return (
    <div className="overflow-auto max-h-48">
      <table className="w-full text-[11px] font-mono border-collapse">
        <thead>
          <tr className="text-white/30 text-[10px] uppercase">
            <th className="text-left pb-1 font-normal">Scenario</th>
            <th className="text-right pb-1 font-normal">n</th>
            <th className="text-right pb-1 font-normal">WR%</th>
            <th className="text-right pb-1 font-normal">PF</th>
            <th className="text-right pb-1 font-normal">avgPnL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([scen, s]) => (
            <tr key={scen} className="border-t border-white/5 hover:bg-white/[0.02]">
              <td className="py-0.5 pr-2 text-white/60 truncate max-w-[220px]">{scen}</td>
              <td className="text-right text-white/40">{s.n}</td>
              <td className={`text-right ${wrColor(s.wr)}`}>{wr(s.wr)}</td>
              <td className={`text-right ${pfColor(s.pf)}`}>{fmt(s.pf)}</td>
              <td className={`text-right ${s.avg_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
    <div className="flex justify-between text-[11px] font-mono">
      <span className="text-white/40">{label}</span>
      <span className={cls ?? 'text-white/70'}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="text-[10px] text-white/30 uppercase mb-2 tracking-wider">{title}</div>
      {children}
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
      style={{ background: 'rgba(4,8,18,0.88)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl p-6 space-y-4"
        style={{ background: 'rgba(10,16,32,0.97)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 0 60px rgba(6,182,212,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-2xl font-bold text-cyan-300 font-mono">{genome.coin}</span>
            <span className="ml-3 text-white/40 text-sm">genoma 2y</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Trades',       value: genome.n_trades.toLocaleString(),                  cls: 'text-white/80' },
            { label: 'Win Rate',     value: wr(genome.win_rate),                               cls: wrColor(genome.win_rate) },
            { label: 'Profit Factor',value: fmt(genome.profit_factor),                         cls: pfColor(genome.profit_factor) },
            { label: 'Avg PnL',      value: `${(genome.avg_pnl_pct * 100).toFixed(3)}%`,       cls: genome.avg_pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400' },
          ].map(k => (
            <div key={k.label} className="rounded-xl p-3 text-center"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">{k.label}</div>
              <div className={`text-lg font-mono font-semibold ${k.cls}`}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Market profile */}
        {genome.market_profile && Object.keys(genome.market_profile).length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <Section title="Prezzo medio">
              <div className="text-base font-mono font-semibold text-white/80">
                ${fmtPrice(genome.market_profile.avg_price_usd)}
              </div>
            </Section>
            <Section title="Volume giornaliero">
              <div className="text-base font-mono font-semibold text-white/80">
                ${fmtVol(genome.market_profile.avg_daily_volume_usdc)}
              </div>
            </Section>
            <Section title="Drawdown tipico 4h">
              <div className={`text-base font-mono font-semibold ${
                (genome.market_profile.typical_drawdown_4h_pct ?? 0) > 2 ? 'text-orange-400' : 'text-white/80'
              }`}>
                {genome.market_profile.typical_drawdown_4h_pct != null
                  ? `${genome.market_profile.typical_drawdown_4h_pct.toFixed(2)}%`
                  : '—'}
              </div>
            </Section>
          </div>
        )}

        {/* Volatility + Nervosismo */}
        <div className="grid grid-cols-2 gap-3">
          <Section title="Volatilità">
            {genome.volatility && Object.keys(genome.volatility).length > 0 ? (
              <div className="space-y-0.5">
                <InfoRow label="avg 1m"  value={`${genome.volatility.avg_range_pct_1m?.toFixed(3)}%`} />
                <InfoRow label="p75 1m"  value={`${genome.volatility.p75_range_pct_1m?.toFixed(3)}%`} />
                <InfoRow label="p95 1m"  value={`${genome.volatility.p95_range_pct_1m?.toFixed(3)}%`} />
                <InfoRow label="avg 5m"  value={`${genome.volatility.avg_range_pct_5m?.toFixed(3)}%`} />
                <InfoRow label="p75 5m"  value={`${genome.volatility.p75_range_pct_5m?.toFixed(3)}%`} />
              </div>
            ) : <span className="text-white/20 text-xs">—</span>}
          </Section>

          <Section title="Nervosismo">
            {genome.nervousness && Object.keys(genome.nervousness).length > 0 ? (
              <div className="space-y-0.5">
                <InfoRow label="spike rate 1m"
                  value={genome.nervousness.spike_rate_1m != null ? `${genome.nervousness.spike_rate_1m.toFixed(2)}%` : '—'}
                  cls={(genome.nervousness.spike_rate_1m ?? 0) > 5 ? 'text-orange-400' : 'text-white/70'} />
                <InfoRow label="p99 range 1m"
                  value={genome.nervousness.p99_range_pct_1m != null ? `${genome.nervousness.p99_range_pct_1m.toFixed(3)}%` : '—'} />
                {genome.nervousness.autocorr_lag1 != null && (() => {
                  const al = autocorrLabel(genome.nervousness.autocorr_lag1!);
                  return (
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="text-white/40">autocorr lag-1</span>
                      <span>
                        <span className="text-white/70 mr-1">{genome.nervousness.autocorr_lag1.toFixed(3)}</span>
                        <span className={`text-[10px] ${al.color}`}>{al.label}</span>
                      </span>
                    </div>
                  );
                })()}
                <InfoRow label="volume CV"
                  value={genome.nervousness.volume_cv != null ? genome.nervousness.volume_cv.toFixed(2) : '—'}
                  cls={(genome.nervousness.volume_cv ?? 0) > 3 ? 'text-orange-400' : 'text-white/70'} />
                {hurst != null && (
                  <div className="flex justify-between text-[11px] font-mono pt-0.5 border-t border-white/5 mt-0.5">
                    <span className="text-white/40">Hurst exp</span>
                    <span>
                      <span className="text-white/70 mr-1">{hurst.toFixed(3)}</span>
                      <span className={`text-[10px] ${hurstInfo?.color}`}>{hurstInfo?.label}</span>
                    </span>
                  </div>
                )}
              </div>
            ) : <span className="text-white/20 text-xs">—</span>}
          </Section>
        </div>

        {/* BTC + ETH correlation */}
        <div className="grid grid-cols-2 gap-3">
          <Section title="BTC Correlazione">
            {genome.btc_correlation && genome.btc_correlation.corr_1m != null ? (
              <div className="space-y-0.5">
                <InfoRow label="corr 1m" value={genome.btc_correlation.corr_1m.toFixed(3)}  cls={corrColor(genome.btc_correlation.corr_1m)} />
                <InfoRow label="beta 1m" value={genome.btc_correlation.beta_1m?.toFixed(3) ?? '—'} />
                {genome.btc_correlation.corr_5m != null &&
                  <InfoRow label="corr 5m" value={genome.btc_correlation.corr_5m.toFixed(3)} cls={corrColor(genome.btc_correlation.corr_5m)} />}
                {genome.btc_correlation.corr_1h != null &&
                  <InfoRow label="corr 1h" value={genome.btc_correlation.corr_1h.toFixed(3)} cls={corrColor(genome.btc_correlation.corr_1h)} />}
                {/* Lag correlation */}
                {(genome.btc_correlation.lag_m1 != null || genome.btc_correlation.lag_p1 != null) && (
                  <div className="pt-0.5 mt-0.5 border-t border-white/5 space-y-0.5">
                    <div className="text-[9px] text-white/25 uppercase tracking-wider mb-0.5">Lag (coin leads ← | BTC leads →)</div>
                    {genome.btc_correlation.lag_m2 != null &&
                      <InfoRow label="coin +2" value={genome.btc_correlation.lag_m2.toFixed(3)} cls={corrColor(genome.btc_correlation.lag_m2)} />}
                    {genome.btc_correlation.lag_m1 != null &&
                      <InfoRow label="coin +1" value={genome.btc_correlation.lag_m1.toFixed(3)} cls={corrColor(genome.btc_correlation.lag_m1)} />}
                    {genome.btc_correlation.lag_p1 != null &&
                      <InfoRow label="BTC +1"  value={genome.btc_correlation.lag_p1.toFixed(3)} cls={corrColor(genome.btc_correlation.lag_p1)} />}
                    {genome.btc_correlation.lag_p2 != null &&
                      <InfoRow label="BTC +2"  value={genome.btc_correlation.lag_p2.toFixed(3)} cls={corrColor(genome.btc_correlation.lag_p2)} />}
                  </div>
                )}
              </div>
            ) : <span className="text-white/20 text-xs">—</span>}
          </Section>

          <Section title="ETH Correlazione">
            {genome.eth_correlation && genome.eth_correlation.corr_1m != null ? (
              <div className="space-y-0.5">
                <InfoRow label="corr 1m" value={genome.eth_correlation.corr_1m.toFixed(3)} cls={corrColor(genome.eth_correlation.corr_1m)} />
                <InfoRow label="beta 1m" value={genome.eth_correlation.beta_1m?.toFixed(3) ?? '—'} />
              </div>
            ) : <span className="text-white/20 text-xs">—</span>}
          </Section>
        </div>

        {/* Session profile */}
        {genome.session_profile && Object.keys(genome.session_profile).length > 0 && (
          <Section title="Sessioni di trading">
            <div className="grid grid-cols-3 gap-2">
              {(['asia', 'europe', 'us'] as const).map(sess => {
                const s = genome.session_profile?.[sess];
                const label = sess === 'asia' ? 'Asia 0–8h' : sess === 'europe' ? 'Europa 8–16h' : 'US 16–24h';
                return (
                  <div key={sess} className="rounded-lg p-2 text-center"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="text-[9px] text-white/30 mb-1">{label}</div>
                    {s ? (
                      <>
                        <div className={`text-sm font-mono font-semibold ${wrColor(s.wr)}`}>{wr(s.wr)}</div>
                        <div className="text-[10px] text-white/40 font-mono">PF {fmt(s.pf)}</div>
                        <div className="text-[9px] text-white/25">n={s.n}</div>
                      </>
                    ) : <span className="text-white/20 text-xs">—</span>}
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

        <div className="text-[10px] text-white/20 text-right">
          built {genome.built_at?.replace('T', ' ').replace('Z', ' UTC')}
        </div>
      </div>
    </div>
  );
}

// ── Coin Card ─────────────────────────────────────────────────────────────────

function CoinCard({ g, onClick }: { g: GenomeSummary; onClick: () => void }) {
  const pfOk = g.profit_factor != null && g.profit_factor >= 1.0;
  return (
    <button onClick={onClick}
      className="text-left rounded-xl p-4 transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: pfOk && g.win_rate >= 57 ? '0 0 20px rgba(52,211,153,0.05)' : undefined,
      }}>
      <div className="mb-3">
        <span className="text-base font-bold text-white font-mono">{g.coin}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono">
        <div><span className="text-white/30">WR </span><span className={wrColor(g.win_rate)}>{wr(g.win_rate)}</span></div>
        <div><span className="text-white/30">PF </span><span className={pfColor(g.profit_factor)}>{fmt(g.profit_factor)}</span></div>
        <div><span className="text-white/30">n </span><span className="text-white/60">{g.n_trades.toLocaleString()}</span></div>
        <div><span className="text-white/30">avg </span><span className={g.avg_pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>{(g.avg_pnl_pct * 100).toFixed(3)}%</span></div>
      </div>
    </button>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

type SortKey = 'coin' | 'win_rate' | 'profit_factor' | 'n_trades' | 'avg_pnl_pct';

export default function DnaPanel() {
  const [list,          setList]          = useState<GenomeSummary[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [selected,      setSelected]      = useState<GenomeFull | null>(null);
  const [sort,          setSort]          = useState<SortKey>('win_rate');
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    fetch('/api/tradedb/genome')
      .then(async r => {
        if (!r.ok) {
          const txt = await r.text();
          throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
        }
        return r.json();
      })
      .then(d => { setList(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  const sorted = useMemo(() => {
    return [...list].sort((a, b) => {
      if (sort === 'coin') return a.coin.localeCompare(b.coin);
      const av = a[sort] ?? -Infinity;
      const bv = b[sort] ?? -Infinity;
      return (bv as number) - (av as number);
    });
  }, [list, sort]);

  async function openDetail(coin: string) {
    setLoadingDetail(true);
    try {
      const r = await fetch(`/api/tradedb/genome/${coin}`);
      if (!r.ok) {
        const txt = await r.text();
        setError(`Genome ${coin}: HTTP ${r.status} — ${txt.slice(0, 200)}`);
        return;
      }
      setSelected(await r.json());
    } catch (e) {
      setError(`Genome ${coin}: ${String(e)}`);
    } finally {
      setLoadingDetail(false);
    }
  }

  const sortBtns: { key: SortKey; label: string }[] = [
    { key: 'win_rate',      label: 'WR%'   },
    { key: 'profit_factor', label: 'PF'    },
    { key: 'avg_pnl_pct',  label: 'avgPnL' },
    { key: 'n_trades',     label: 'Trade'  },
    { key: 'coin',         label: 'A–Z'   },
  ];

  return (
    <div className="py-4">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white tracking-wide">DNA Coin</h2>
          <p className="text-xs text-white/30 mt-0.5">Genoma 2y — {list.length} coin · backtest storico</p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {sortBtns.map(b => (
            <button key={b.key} onClick={() => setSort(b.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                sort === b.key
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-white/40 hover:text-white/70 border border-transparent'
              }`}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-center text-white/30 py-20 text-sm">Carico genomi…</div>}
      {error   && <div className="text-center text-red-400/70 py-20 text-sm">{error}</div>}

      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3">
          {sorted.map(g => (
            <CoinCard key={g.coin} g={g} onClick={() => openDetail(g.coin)} />
          ))}
        </div>
      )}

      {loadingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(4,8,18,0.7)' }}>
          <span className="text-white/50 text-sm font-mono">Carico genoma…</span>
        </div>
      )}

      {selected && <GenomeDetail genome={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
