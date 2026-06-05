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
}

interface HourlyWr {
  [hour: string]: number;
}

interface GenomeFull extends GenomeSummary {
  scenario_profile: ScenarioProfile;
  hourly_wr: HourlyWr;
  hourly_n: { [hour: string]: number };
  side_profile: SideProfile;
  exit_profile: { [reason: string]: number };
  volatility: VolatilityProfile;
  btc_correlation: BtcCorr;
  bar_profile: { [bar: string]: { avg_pnl: number; avg_max_fav: number; avg_max_adv: number; n: number } };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pf(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toFixed(3);
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

// ── Sub-components ───────────────────────────────────────────────────────────

function HourlyHeatmap({ wr, n }: { wr: HourlyWr; n: { [h: string]: number } }) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const maxN = Math.max(...hours.map(h => n[h] ?? 0), 1);

  return (
    <div>
      <div className="text-[10px] text-white/40 mb-1.5 uppercase tracking-wider">WR% per ora UTC</div>
      <div className="flex gap-0.5">
        {hours.map(h => {
          const wrVal = wr[h];
          const nVal = n[h] ?? 0;
          const opacity = Math.max(0.15, nVal / maxN);
          let bg = 'rgba(255,255,255,0.08)';
          if (wrVal != null) {
            if (wrVal >= 60) bg = `rgba(52,211,153,${opacity})`;
            else if (wrVal >= 55) bg = `rgba(234,179,8,${opacity})`;
            else if (wrVal >= 50) bg = `rgba(251,146,60,${opacity * 0.8})`;
            else bg = `rgba(248,113,113,${opacity})`;
          }
          return (
            <div
              key={h}
              title={`${h}:00 UTC — WR: ${wrVal != null ? wrVal.toFixed(1) + '%' : '—'} (n=${nVal})`}
              className="flex-1 rounded-sm cursor-default transition-all"
              style={{ height: 18, background: bg }}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[9px] text-white/20 mt-0.5 font-mono">
        <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    </div>
  );
}

function SideBar({ profile }: { profile: SideProfile }) {
  return (
    <div className="flex gap-3">
      {Object.entries(profile).map(([side, s]) => (
        <div key={side} className="flex-1 rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="text-[10px] text-white/40 mb-1">{side}</div>
          <div className={`text-sm font-mono font-semibold ${wrColor(s.wr)}`}>{wr(s.wr)}</div>
          <div className="text-[10px] text-white/50 font-mono">PF {pf(s.pf)}</div>
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
              <td className={`text-right ${pfColor(s.pf)}`}>{pf(s.pf)}</td>
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

// ── Genome Detail Modal ───────────────────────────────────────────────────────

function GenomeDetail({ genome, onClose }: { genome: GenomeFull; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-6 px-4 overflow-auto"
      style={{ background: 'rgba(4,8,18,0.88)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl p-6"
        style={{ background: 'rgba(10,16,32,0.97)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 0 60px rgba(6,182,212,0.08)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <span className="text-2xl font-bold text-cyan-300 font-mono">{genome.coin}</span>
            <span className="ml-3 text-white/40 text-sm">genoma 2y</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Trades', value: genome.n_trades.toLocaleString(), cls: 'text-white/80' },
            { label: 'Win Rate', value: wr(genome.win_rate), cls: wrColor(genome.win_rate) },
            { label: 'Profit Factor', value: pf(genome.profit_factor), cls: pfColor(genome.profit_factor) },
            { label: 'Avg PnL', value: `${(genome.avg_pnl_pct * 100).toFixed(3)}%`, cls: genome.avg_pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400' },
          ].map(k => (
            <div key={k.label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-[10px] text-white/30 uppercase tracking-wider mb-1">{k.label}</div>
              <div className={`text-lg font-mono font-semibold ${k.cls}`}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Volatility + BTC */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-[10px] text-white/30 uppercase mb-2 tracking-wider">Volatilità</div>
            {genome.volatility && Object.keys(genome.volatility).length > 0 ? (
              <div className="space-y-0.5 text-[11px] font-mono">
                <div className="flex justify-between"><span className="text-white/40">avg 1m</span><span>{genome.volatility.avg_range_pct_1m?.toFixed(3)}%</span></div>
                <div className="flex justify-between"><span className="text-white/40">p75 1m</span><span>{genome.volatility.p75_range_pct_1m?.toFixed(3)}%</span></div>
                <div className="flex justify-between"><span className="text-white/40">p95 1m</span><span>{genome.volatility.p95_range_pct_1m?.toFixed(3)}%</span></div>
                <div className="flex justify-between"><span className="text-white/40">avg 5m</span><span>{genome.volatility.avg_range_pct_5m?.toFixed(3)}%</span></div>
              </div>
            ) : <span className="text-white/20 text-xs">—</span>}
          </div>
          <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-[10px] text-white/30 uppercase mb-2 tracking-wider">BTC Correlazione</div>
            {genome.btc_correlation && genome.btc_correlation.corr_1m != null ? (
              <div className="space-y-0.5 text-[11px] font-mono">
                <div className="flex justify-between"><span className="text-white/40">corr 1m</span><span className={Math.abs(genome.btc_correlation.corr_1m) > 0.6 ? 'text-cyan-300' : ''}>{genome.btc_correlation.corr_1m.toFixed(3)}</span></div>
                <div className="flex justify-between"><span className="text-white/40">beta 1m</span><span>{genome.btc_correlation.beta_1m?.toFixed(3) ?? '—'}</span></div>
              </div>
            ) : <span className="text-white/20 text-xs">—</span>}
          </div>
        </div>

        {/* Side profile */}
        {genome.side_profile && Object.keys(genome.side_profile).length > 0 && (
          <div className="mb-5">
            <div className="text-[10px] text-white/30 uppercase mb-2 tracking-wider">Side Profile</div>
            <SideBar profile={genome.side_profile} />
          </div>
        )}

        {/* Hourly heatmap */}
        {genome.hourly_wr && Object.keys(genome.hourly_wr).length > 0 && (
          <div className="mb-5">
            <HourlyHeatmap wr={genome.hourly_wr} n={genome.hourly_n ?? {}} />
          </div>
        )}

        {/* Scenario table */}
        {genome.scenario_profile && Object.keys(genome.scenario_profile).length > 0 && (
          <div>
            <div className="text-[10px] text-white/30 uppercase mb-2 tracking-wider">Scenari</div>
            <ScenarioTable profile={genome.scenario_profile} />
          </div>
        )}

        <div className="mt-4 text-[10px] text-white/20 text-right">built {genome.built_at?.replace('T', ' ').replace('Z', ' UTC')}</div>
      </div>
    </div>
  );
}

// ── Coin Card ─────────────────────────────────────────────────────────────────

function CoinCard({ g, onClick }: { g: GenomeSummary; onClick: () => void }) {
  const pfOk = g.profit_factor != null && g.profit_factor >= 1.0;

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl p-4 transition-all hover:scale-[1.02] active:scale-[0.98]"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: pfOk && g.win_rate >= 57 ? '0 0 20px rgba(52,211,153,0.05)' : undefined,
      }}
    >
      <div className="mb-3">
        <span className="text-base font-bold text-white font-mono">{g.coin}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono">
        <div><span className="text-white/30">WR </span><span className={wrColor(g.win_rate)}>{wr(g.win_rate)}</span></div>
        <div><span className="text-white/30">PF </span><span className={pfColor(g.profit_factor)}>{pf(g.profit_factor)}</span></div>
        <div><span className="text-white/30">n </span><span className="text-white/60">{g.n_trades.toLocaleString()}</span></div>
        <div><span className="text-white/30">avg </span><span className={g.avg_pnl_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>{(g.avg_pnl_pct * 100).toFixed(3)}%</span></div>
      </div>
    </button>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

type SortKey = 'coin' | 'win_rate' | 'profit_factor' | 'n_trades' | 'avg_pnl_pct';

export default function DnaPanel() {
  const [list, setList] = useState<GenomeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GenomeFull | null>(null);
  const [sort, setSort] = useState<SortKey>('win_rate');
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
      const d = await r.json();
      setSelected(d);
    } catch (e) {
      setError(`Genome ${coin}: ${String(e)}`);
    } finally {
      setLoadingDetail(false);
    }
  }

  const sortBtns: { key: SortKey; label: string }[] = [
    { key: 'win_rate', label: 'WR%' },
    { key: 'profit_factor', label: 'PF' },
    { key: 'avg_pnl_pct', label: 'avgPnL' },
    { key: 'n_trades', label: 'Trade' },
    { key: 'coin', label: 'A–Z' },
  ];

  return (
    <div className="py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white tracking-wide">DNA Coin</h2>
          <p className="text-xs text-white/30 mt-0.5">Genoma 2y — {list.length} coin · backtest storico</p>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {sortBtns.map(b => (
            <button
              key={b.key}
              onClick={() => setSort(b.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                sort === b.key
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-white/40 hover:text-white/70 border border-transparent'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="text-center text-white/30 py-20 text-sm">Carico genomi…</div>
      )}

      {error && (
        <div className="text-center text-red-400/70 py-20 text-sm">{error}</div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3">
          {sorted.map(g => (
            <CoinCard key={g.coin} g={g} onClick={() => openDetail(g.coin)} />
          ))}
        </div>
      )}

      {loadingDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(4,8,18,0.7)' }}>
          <span className="text-white/50 text-sm font-mono">Carico genoma…</span>
        </div>
      )}

      {selected && <GenomeDetail genome={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
