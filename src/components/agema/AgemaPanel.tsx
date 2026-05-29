'use client';

import * as React from 'react';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
  ciclica_window?: CiclicaWindow; // 👈 nuovo: arriva già dentro strategia_ai
};

type AgemaRow = {
  coin: string;                 // "LINKUSDT"
  price?: number | null;
  score?: number | null;        // punteggio “classifica”
  direction?: 'LONG' | 'SHORT' | string;
  ciclica_label?: string | null;      // facoltativo (se lo metti nel BE)
  reentry_label?: string | null;      // facoltativo
  eta_reentry_hours?: number | null;  // facoltativo (se lo metti nel BE)
  best?: StrategiaAIItem[];           // top 3 entrate (o più)
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
  const [maxHours, setMaxHours] = useState<number>(48); // “valide entro tot ore”
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

    // filtro temporale “vero” anche se il BE non lo fa ancora:
    // usa ciclica_window.countdown_bars + tf_ciclo dentro ogni strategia_ai.
    const filtered = base.filter((row) => {
      const sc = Number(row.score ?? -1);
      if (Number.isFinite(minScore) && sc < minScore) return false;

      if (dir !== 'ALL') {
        const hasDir = (row.best ?? []).some((s) => (s.direction || '') === dir);
        if (!hasDir) return false;
      }

      // maxHours: la riga passa se almeno UNA delle top entry ha countdown <= maxHours
      if (Number.isFinite(maxHours) && maxHours > 0) {
        const okTime = (row.best ?? []).some((s) => {
          const cw = s.ciclica_window;
          if (!cw) return false;
          const h = barsToHours(cw.countdown_bars, cw.tf_ciclo);
          return h !== null && h <= maxHours;
        });
        // Se non hai ciclica_window nel BE per quella coin, la scartiamo (se maxHours attivo)
        if (!okTime) return false;
      }

      return true;
    });

    // ordinamento: score desc, poi distanza entry (se presente) asc
    return filtered.sort((a, b) => {
      const sa = Number(a.score ?? -1);
      const sb = Number(b.score ?? -1);
      if (sb !== sa) return sb - sa;

      const da = Math.min(...(a.best ?? []).map(x => Number(x.dist_bps ?? 9e9)));
      const db = Math.min(...(b.best ?? []).map(x => Number(x.dist_bps ?? 9e9)));
      return da - db;
    });
  }, [data, minScore, maxHours, dir]);

  const glassInput = "rounded-lg border border-white/[0.10] bg-white/[0.04] text-xs px-2 py-1.5 text-white focus:outline-none focus:ring-1 focus:ring-cyan-400/30";

  return (
    <div
      className="rounded-2xl border border-white/[0.08] text-white"
      style={{
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        background: 'rgba(255,255,255,0.03)',
      }}
    >
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-cyan-400/60">❋</span>
          <span className="font-semibold text-white/90">Agema — Classifica operativa</span>
        </div>
        <p className="text-xs text-white/35 mb-4">
          Coin con setup utili (ciclica + strategia AI) entro una finestra temporale.
        </p>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-white/40">Min score</span>
            <input className={`${glassInput} w-20`} type="number" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-white/40">Entro (ore)</span>
            <input className={`${glassInput} w-20`} type="number" value={maxHours} onChange={(e) => setMaxHours(Number(e.target.value))} />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-white/40">Dir.</span>
            <select
              className="rounded-lg border border-white/[0.10] bg-[#0a0e1a] text-xs px-2 py-1.5 text-white focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
              value={dir}
              onChange={(e) => setDir(e.target.value as any)}
            >
              <option value="ALL">Tutte</option>
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </select>
          </div>

          <button
            onClick={fetchAgema}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium transition-all duration-200 disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, rgba(6,182,212,0.20) 0%, rgba(99,102,241,0.14) 100%)',
              border: '1px solid rgba(6,182,212,0.35)',
              color: '#67e8f9',
            }}
          >
            {loading ? '⟳ Carico…' : '▶ Aggiorna'}
          </button>

          {data?.updated_at && (
            <span className="ml-auto text-white/30 font-mono">{data.updated_at}</span>
          )}
          {error && <div className="text-red-400 text-xs">{error}</div>}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-4 text-xs">
        {!data && !error && (
          <div className="text-white/35 py-6 text-center">Premi Aggiorna per caricare la classifica.</div>
        )}

        {rows.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {rows.map((row) => {
              const best = (row.best ?? []).slice(0, 3);
              const dirColor = row.direction === 'LONG' ? '#86efac' : row.direction === 'SHORT' ? '#fca5a5' : '#94a3b8';
              return (
                <div
                  key={row.coin}
                  className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="font-semibold text-sm text-white/90 font-mono">{row.coin}</span>

                    {row.direction && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full border font-medium"
                        style={{ color: dirColor, borderColor: `${dirColor}55`, background: `${dirColor}12` }}
                      >
                        {row.direction}
                      </span>
                    )}

                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-cyan-400/25 text-cyan-300/70 bg-cyan-400/[0.07]">
                      score {fmt(row.score, 0)}
                    </span>

                    <span className="text-[10px] text-white/35 font-mono">
                      {fmt(row.price, 6)}
                    </span>

                    {row.reentry_label && (
                      <span className="text-[10px] text-white/40 border border-white/[0.08] px-2 py-0.5 rounded-full">
                        {row.reentry_label}
                      </span>
                    )}
                    {Number.isFinite(row.eta_reentry_hours as number) && (
                      <span className="text-[10px] text-white/40 border border-white/[0.08] px-2 py-0.5 rounded-full">
                        ETA {fmt(row.eta_reentry_hours, 0)}h
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {best.map((s, i) => {
                      const cw = s.ciclica_window;
                      const etaH = cw ? barsToHours(cw.countdown_bars, cw.tf_ciclo) : null;
                      const sDir = s.direction === 'LONG' ? '#86efac' : s.direction === 'SHORT' ? '#fca5a5' : '#94a3b8';
                      return (
                        <div key={i} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/[0.10] text-white/50">
                              {s.tf}
                            </span>
                            <span className="text-[10px]" style={{ color: sDir }}>{s.direction}</span>
                            <span className="text-[10px] text-cyan-300/60">sc {fmt(s.score, 0)}</span>
                            {etaH !== null && (
                              <span className="text-[10px] text-white/35">≤{fmt(etaH, 0)}h</span>
                            )}
                          </div>
                          <div className="font-mono tabular-nums text-[10px] text-white/70">
                            entry {fmt(s.entry, 6)}
                            {Number.isFinite(s.tp1_price as number) && <> · tp1 {fmt(s.tp1_price, 6)}</>}
                            {Number.isFinite(s.tp2_price as number) && <> · tp2 {fmt(s.tp2_price, 6)}</>}
                          </div>
                          {cw?.label && <div className="text-[10px] text-white/40">{cw.label}</div>}
                          {s.explanation && <div className="text-[10px] text-white/35 line-clamp-2">{s.explanation}</div>}
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
          <div className="text-white/35 py-6 text-center">Nessun risultato con i filtri attuali.</div>
        )}
      </div>
    </div>
  );
}
