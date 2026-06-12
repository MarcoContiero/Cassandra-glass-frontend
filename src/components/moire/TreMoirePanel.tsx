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

interface GenomeFull {
  coin: string;
  n_trades: number;
  win_rate: number;
  profit_factor: number | null;
  ema200_pull?:     { [tf: string]: Ema200PullTf };
  bb_return?:       { [tf: string]: BbReturnTf };
  btc_regime_axis?: BtcRegimeAxis;
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

function countAxesAvailable(genome: GenomeFull): number {
  let n = 0;
  if (genome.ema200_pull && Object.keys(genome.ema200_pull).length > 0) n++;
  if (genome.bb_return   && Object.keys(genome.bb_return).length   > 0) n++;
  return n;
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

  return (
    <div style={{ borderTop: '1px solid var(--color-border-dim)', paddingTop: 12 }}>
      <div className="flex items-baseline gap-2 mb-3">
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.5 }}>6.</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text)', letterSpacing: '0.1em' }}>
          BTC REGIME SCORE
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.5 }}>
          come performa questa coin a ogni livello di regime BTC
        </span>
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
          <div className="flex items-center justify-between mb-3">
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
          <div className="flex items-baseline gap-2 mb-3">
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-text-dim)', opacity: 0.5 }}>2.</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text)', letterSpacing: '0.1em' }}>
              GRAVITÀ BB — RIENTRO EMA
            </span>
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

        {/* ── Assi 3-8: stub ── */}
        <div className="space-y-3">
          <AxisStub n={3} title="Ciclica" desc="Categoria fase da Agema"
            buckets={['accumulo', 'impulso', 'distribuzione', 'correzione', 'laterale']} />
          <AxisStub n={4} title="Struttura MTF Bias" desc="8 combinazioni binarie long/short su 3 gruppi TF"
            buckets={['LLL', 'LLS', 'LSL', 'LSS', 'SLL', 'SLS', 'SSL', 'SSS']} />
          <AxisStub n={5} title="Momentum X/Y" desc="X = struttura candele · Y = posizione nel range recente"
            buckets={['impulso·alto', 'impulso·centrale', 'impulso·basso', 'pullback·alto', 'pullback·basso', 'laterale·centrale']} />
          {/* Asse 6: BTC Regime Score — dati reali se disponibili */}
          {genome.btc_regime_axis && Object.keys(genome.btc_regime_axis).length > 0 ? (
            <BtcRegimeSection data={genome.btc_regime_axis} />
          ) : (
            <AxisStub n={6} title="BTC Regime Score" desc="Score composito trend BTC 0-7"
              buckets={['0-1 downtrend', '2-3 misto rib.', '4-5 misto rialz.', '6-7 uptrend']} />
          )}
          <AxisStub n={7} title="Distanza S/R" desc="Distanza dal livello più vicino + tipo + test precedenti"
            buckets={['< 1% in zona', '1-3% vicino', '3-7% medio', '> 7% lontano']} />
          <AxisStub n={8} title="Pool Liquidità" desc="Distanza dal pool più vicino + posizione relativa al prezzo"
            buckets={['< 1% in zona', '1-3% vicino', '> 3% lontano', 'sopra', 'sotto']} />
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
