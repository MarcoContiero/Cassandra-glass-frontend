'use client';

import React from 'react';
import HelpButton from '@/components/help/HelpButton';

// Estratto da DnaPanel.tsx (2026-07-13) per essere riusato anche dalla scheda
// Liquidazioni (LiquidationHeatmapSection) senza duplicare GravitaBar/il
// rendering del cromosoma liquidation_sweep.

export interface LiquidationSweepBucket {
  n_osservati: number;
  n_mangiati: number;
  sweep_rate: number;
  giorni_min?: number;
  giorni_max?: number;
  giorni_media?: number;
}
export interface LiquidationSweep { [bucket: string]: LiquidationSweepBucket }

export function GravitaBar({ val, max, color }: { val: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (val / max) * 100) : 0;
  return (
    <div className="relative h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color, opacity: 0.6 }} />
    </div>
  );
}

const LIQ_SWEEP_BUCKET_ORDER = ['0-3%', '3-6%', '6-10%', '10-20%', '20%+'] as const;

export function LiquidationSweepSection({ data }: { data?: LiquidationSweep }) {
  if (!data || Object.keys(data).length === 0) return null;
  const buckets = LIQ_SWEEP_BUCKET_ORDER.filter(b => data[b]);
  if (buckets.length === 0) return null;

  return (
    <div className="cassandra-card p-3 space-y-3">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="section-tag">Cluster di Liquidazione</span>
        <HelpButton helpKey="dna/liquidation_sweep" label="Cluster di Liquidazione" variant="section" />
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-dim)' }}>
        Solo livelli forti (densità alta) osservati nello storico OI — quante volte il prezzo li ha
        raggiunti e in quanti giorni. Statistica descrittiva sul carattere della coin, non una
        probabilità di sweep.
      </div>
      <div className="space-y-2.5">
        {buckets.map(bucket => {
          const d = data[bucket];
          return (
            <div key={bucket} className="space-y-1">
              <div className="flex items-center justify-between" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                <span style={{ color: 'var(--color-gold)' }}>{bucket} dal prezzo</span>
                <span style={{ color: 'var(--color-text-dim)' }}>
                  raggiunto {Math.round(d.sweep_rate * 100)}% delle volte
                </span>
              </div>
              <GravitaBar val={d.sweep_rate} max={1} color="rgb(201,168,76)" />
              <div className="grid grid-cols-2 gap-x-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                <div>
                  <span style={{ color: 'var(--color-text-dim)' }}>osservati </span>
                  <span style={{ color: 'var(--color-text)' }}>{d.n_osservati}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-dim)' }}>raggiunti </span>
                  <span style={{ color: 'var(--color-text)' }}>{d.n_mangiati}</span>
                </div>
                {d.giorni_media != null && (
                  <>
                    <div>
                      <span style={{ color: 'var(--color-text-dim)' }}>giorni media </span>
                      <span style={{ color: 'var(--color-text)' }}>{d.giorni_media.toFixed(1)}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-text-dim)' }}>min–max </span>
                      <span style={{ color: 'var(--color-text-dim)' }}>{d.giorni_min}–{d.giorni_max}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
