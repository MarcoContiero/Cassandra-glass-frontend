'use client';

import * as React from 'react';
import { useMemo, useState } from 'react';

type CiclicaWindow = {
  direction?: 'LONG' | 'SHORT' | string;
  tf_ciclo?: string;            // es. "1h"
  entry_from_bars?: number;     // es. 7
  entry_to_bars?: number;       // es. 17
  countdown_bars?: number;      // es. 16
  timing_grade?: string;        // es. "neutro"
  label?: string;               // testo pronto
};

type StrategiaAIItem = {
  tf: string;                   // "1h", "4h", "1d"...
  mode?: string;                // breve/medio/lungo...
  direction?: 'LONG' | 'SHORT' | string;
  entry: number;
  sl_price?: number | null;
  tp1_price?: number | null;
  tp2_price?: number | null;
  rr1?: number | null;
  rr2?: number | null;
  score?: number | null;
  dist_bps?: number | null;
  explanation?: string;
  tags?: string[];
  ciclica_window?: CiclicaWindow;
};

type AgemaRow = {
  coin: string;                 // "LINKUSDT"
  price?: number | null;
  score?: number | null;        // punteggio "classifica"
  direction?: 'LONG' | 'SHORT' | string;
  ciclica_label?: string | null;
  reentry_label?: string | null;
  eta_reentry_hours?: number | null;
  best?: StrategiaAIItem[];
};

type AgemaResponse = {
  updated_at?: string;
  rows: AgemaRow[];
};

function tfToMinutes(tf?: string): number | null {
  const s = String(tf || '').trim();
  if (!s) return null;
  if (s.endsWith('m')) return Number(s.replace('m', '')) || null;
  if (s.endsWith('h')) return (Number(s.replace('h', '')) || 0) * 60 || null;
  if (s === '1d') return 24 * 60;
  if (s === '1w') return 7 * 24 * 60;
  return null;
}

function barsToHours(bars: number | null | undefined, tf_ciclo?: string): number | null {
  if (!Number.isFinite(bars as number)) return null;
  const mins = tfToMinutes(tf_ciclo);
  if (!mins) return null;
  return (Number(bars) * mins) / 60;
}

function fmt(n?: number | null, digits = 2) {
  if (!Number.isFinite(n as number)) return '—';
  return Number(n).toLocaleString('it-IT', { maximumFractionDigits: digits });
}

export default function AgemaPanel() {
  const [data, setData] = useState<AgemaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // filtri
  const [minScore, setMinScore] = useState<number>(60);
  const [maxHours, setMaxHours] = useState<number>(48);
  const [dir, setDir] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');

  async function fetchAgema() {
    try {
      setLoading(true);
      setError(null);

      const q = new URLSearchParams();
      q.set('min_score', String(minScore));
      q.set('max_hours', String(maxHours));
      if (dir !== 'ALL') q.set('direction', dir);

      const url = `/api/agema?${q.toString()}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const js = (await r.json()) as AgemaResponse;

      setData(js);
    } catch (e: any) {
      setError(e?.message || 'Errore');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const rows = useMemo(() => {
    const base = data?.rows ?? [];

    const filtered = base.filter((row) => {
      const sc = Number(row.score ?? -1);
      if (Number.isFinite(minScore) && sc < minScore) return false;

      if (dir !== 'ALL') {
        const hasDir = (row.best ?? []).some((s) => (s.direction || '') === dir);
        if (!hasDir) return false;
      }

      if (Number.isFinite(maxHours) && maxHours > 0) {
        const etas = (row.best ?? [])
          .map((s) => {
            const cw = s.ciclica_window;
            if (!cw) return null;
            return barsToHours(cw.countdown_bars, cw.tf_ciclo);
          })
          .filter((h): h is number => h !== null);
        if (etas.length > 0 && !etas.some((h) => h <= maxHours)) return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const sa = Number(a.score ?? -1);
      const sb = Number(b.score ?? -1);
      if (sb !== sa) return sb - sa;

      const da = Math.min(...(a.best ?? []).map(x => Number(x.dist_bps ?? 9e9)));
      const db = Math.min(...(b.best ?? []).map(x => Number(x.dist_bps ?? 9e9)));
      return da - db;
    });
  }, [data, minScore, maxHours, dir]);

  return (
    <div className="cassandra-card cassandra-card-corners" style={{ padding: '24px 24px 20px' }}>
      <span className="cassandra-panel-header">AGEMA</span>

      {/* Filter toolbar */}
      <div
        className="flex flex-wrap items-center gap-3 mb-5"
        style={{ borderBottom: '1px solid var(--color-border-dim)', paddingBottom: '16px' }}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-dim)]">
            Min score
          </span>
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-gold)] font-mono text-[11px] tracking-[0.1em] rounded-none focus:border-[var(--color-gold-dim)] focus:outline-none px-3 py-1.5 w-20"
            type="number"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-dim)]">
            Entro (ore)
          </span>
          <input
            className="bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-gold)] font-mono text-[11px] tracking-[0.1em] rounded-none focus:border-[var(--color-gold-dim)] focus:outline-none px-3 py-1.5 w-20"
            type="number"
            value={maxHours}
            onChange={(e) => setMaxHours(Number(e.target.value))}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-dim)]">
            Dir.
          </span>
          <select
            className="bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-dim)] font-mono text-[10px] tracking-[0.2em] uppercase rounded-none focus:border-[var(--color-gold-dim)] focus:outline-none px-3 py-1.5"
            value={dir}
            onChange={(e) => setDir(e.target.value as any)}
          >
            <option value="ALL">TUTTE</option>
            <option value="LONG">LONG</option>
            <option value="SHORT">SHORT</option>
          </select>
        </div>

        <button
          onClick={fetchAgema}
          disabled={loading}
          className="bg-[var(--color-cyan)] text-[var(--color-void)] font-mono text-[10px] tracking-[0.25em] uppercase rounded-none px-4 py-1.5 transition-colors duration-200 hover:opacity-80 disabled:opacity-40"
        >
          {loading ? 'CARICO...' : 'AGGIORNA'}
        </button>

        {data?.updated_at && (
          <span className="ml-auto font-mono text-[10px] text-[var(--color-text-dim)]">
            {data.updated_at}
          </span>
        )}

        {error && (
          <div
            className="font-mono text-[10px] text-[var(--color-short-bright)] px-3 py-1.5"
            style={{ border: '1px solid rgba(168,61,61,0.3)' }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Content */}
      <div>
        {!data && !error && (
          <div className="font-mono text-[11px] text-[var(--color-text-dim)] text-center py-12 tracking-[0.2em]">
            PREMI AGGIORNA PER CARICARE LA CLASSIFICA
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex flex-col">
            {rows.map((row) => {
              const best = (row.best ?? []).slice(0, 3);
              return (
                <div
                  key={row.coin}
                  className="px-0 py-3 transition-colors duration-200 hover:bg-[rgba(201,168,76,0.02)]"
                  style={{ borderBottom: '1px solid var(--color-text-faint)' }}
                >
                  {/* Row header */}
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span
                      className="text-[14px]"
                      style={{ fontFamily: 'var(--font-cinzel, Cinzel, serif)', color: 'var(--color-gold)' }}
                    >
                      {row.coin}
                    </span>

                    {row.direction === 'LONG' && <span className="bias-long">{row.direction}</span>}
                    {row.direction === 'SHORT' && <span className="bias-short">{row.direction}</span>}
                    {row.direction && row.direction !== 'LONG' && row.direction !== 'SHORT' && (
                      <span className="bias-neutral">{row.direction}</span>
                    )}

                    <span className="font-mono text-[11px] text-[var(--color-gold)]">
                      score {fmt(row.score, 0)}
                    </span>

                    <span className="font-mono text-[12px] text-[var(--color-text)]">
                      {fmt(row.price, 6)}
                    </span>

                    {row.reentry_label && (
                      <span
                        className="font-mono text-[11px] text-[var(--color-text-dim)] px-2 py-0.5"
                        style={{ border: '1px solid var(--color-border)' }}
                      >
                        {row.reentry_label}
                      </span>
                    )}
                    {Number.isFinite(row.eta_reentry_hours as number) && (
                      <span
                        className="font-mono text-[11px] text-[var(--color-text-dim)] px-2 py-0.5"
                        style={{ border: '1px solid var(--color-border)' }}
                      >
                        ETA {fmt(row.eta_reentry_hours, 0)}h
                      </span>
                    )}
                  </div>

                  {/* Strategy sub-cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {best.map((s, i) => {
                      const cw = s.ciclica_window;
                      const etaH = cw ? barsToHours(cw.countdown_bars, cw.tf_ciclo) : null;
                      return (
                        <div
                          key={i}
                          className="px-3 py-2"
                          style={{
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-border-dim)',
                          }}
                        >
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span
                              className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-dim)] px-1.5 py-0.5"
                              style={{ border: '1px solid var(--color-border)' }}
                            >
                              {s.tf}
                            </span>

                            {s.direction === 'LONG' && <span className="bias-long">{s.direction}</span>}
                            {s.direction === 'SHORT' && <span className="bias-short">{s.direction}</span>}
                            {s.direction && s.direction !== 'LONG' && s.direction !== 'SHORT' && (
                              <span className="bias-neutral">{s.direction}</span>
                            )}

                            <span className="font-mono text-[11px] text-[var(--color-gold)]">
                              sc {fmt(s.score, 0)}
                            </span>

                            {etaH !== null && (
                              <span className="font-mono text-[11px] text-[var(--color-text-dim)]">
                                &le;{fmt(etaH, 0)}h
                              </span>
                            )}
                          </div>

                          <div className="font-mono text-[11px] text-[var(--color-text)] tabular-nums mb-1">
                            entry {fmt(s.entry, 6)}
                          </div>

                          <div className="font-mono text-[11px] text-[var(--color-text-dim)] tabular-nums">
                            {Number.isFinite(s.tp1_price as number) && (
                              <span>tp1 {fmt(s.tp1_price, 6)}</span>
                            )}
                            {Number.isFinite(s.tp1_price as number) && Number.isFinite(s.tp2_price as number) && (
                              <span> &middot; </span>
                            )}
                            {Number.isFinite(s.tp2_price as number) && (
                              <span>tp2 {fmt(s.tp2_price, 6)}</span>
                            )}
                          </div>

                          {cw?.label && (
                            <div className="font-mono text-[10px] text-[var(--color-text-dim)] mt-1">
                              {cw.label}
                            </div>
                          )}
                          {s.explanation && (
                            <div className="font-mono text-[10px] text-[var(--color-text-dim)] mt-1 line-clamp-2">
                              {s.explanation}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {data && rows.length === 0 && !error && (
          <div className="font-mono text-[11px] text-[var(--color-text-dim)] text-center py-12 tracking-[0.2em]">
            NESSUN RISULTATO CON I FILTRI ATTUALI
          </div>
        )}
      </div>
    </div>
  );
}
