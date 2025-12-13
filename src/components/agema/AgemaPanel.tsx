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

  return (
    <Card className="bg-black/30 border-white/10">
      <CardHeader>
        <CardTitle className="text-sm">Agema — Classifica operativa</CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Seleziona solo le coin con setup utili (ciclica + strategia AI) entro una finestra temporale.
        </CardDescription>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="opacity-70">Min score</span>
            <input
              className="w-20 px-2 py-1 bg-black/40 rounded border border-white/10"
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="opacity-70">Entro (ore)</span>
            <input
              className="w-20 px-2 py-1 bg-black/40 rounded border border-white/10"
              type="number"
              value={maxHours}
              onChange={(e) => setMaxHours(Number(e.target.value))}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="opacity-70">Direzione</span>
            <select
              className="px-2 py-1 bg-black/40 rounded border border-white/10"
              value={dir}
              onChange={(e) => setDir(e.target.value as any)}
            >
              <option value="ALL">ALL</option>
              <option value="LONG">LONG</option>
              <option value="SHORT">SHORT</option>
            </select>
          </div>

          <Button variant="secondary" onClick={fetchAgema} disabled={loading}>
            {loading ? 'Carico…' : 'Aggiorna'}
          </Button>

          {data?.updated_at && (
            <span className="ml-auto opacity-60">
              aggiornato: {data.updated_at}
            </span>
          )}

          {error && <div className="text-red-400">Errore: {error}</div>}
        </div>
      </CardHeader>

      <CardContent className="text-xs">
        {!data && !error && (
          <div className="opacity-70">
            Premi <b>Aggiorna</b> per caricare la classifica.
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex flex-col gap-2">
            {rows.map((row) => {
              const best = (row.best ?? []).slice(0, 3);
              return (
                <div
                  key={row.coin}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold">{row.coin}</div>

                    <Badge variant="outline" className="text-[0.7rem]">
                      prezzo {fmt(row.price, 6)}
                    </Badge>

                    <Badge variant="outline" className="text-[0.7rem]">
                      score {fmt(row.score, 0)}
                    </Badge>

                    {row.direction && (
                      <Badge variant="outline" className="text-[0.7rem]">
                        {row.direction}
                      </Badge>
                    )}

                    {/* opzionali se li metti nel BE */}
                    {row.reentry_label && (
                      <Badge variant="outline" className="text-[0.7rem]">
                        {row.reentry_label}
                      </Badge>
                    )}
                    {Number.isFinite(row.eta_reentry_hours as number) && (
                      <Badge variant="outline" className="text-[0.7rem]">
                        ETA {fmt(row.eta_reentry_hours, 0)}h
                      </Badge>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                    {best.map((s, i) => {
                      const cw = s.ciclica_window;
                      const etaH = cw ? barsToHours(cw.countdown_bars, cw.tf_ciclo) : null;

                      return (
                        <div key={i} className="rounded-md border border-white/10 bg-black/30 px-2 py-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[0.7rem]">
                              TF {s.tf}
                            </Badge>
                            <Badge variant="outline" className="text-[0.7rem]">
                              {s.direction} score {fmt(s.score, 0)}
                            </Badge>
                            {etaH !== null && (
                              <Badge variant="outline" className="text-[0.7rem]">
                                entro {fmt(etaH, 0)}h
                              </Badge>
                            )}
                          </div>

                          <div className="mt-1 font-mono tabular-nums">
                            entry {fmt(s.entry, 6)}
                            {Number.isFinite(s.tp1_price as number) && (
                              <> · tp1 {fmt(s.tp1_price, 6)}</>
                            )}
                            {Number.isFinite(s.tp2_price as number) && (
                              <> · tp2 {fmt(s.tp2_price, 6)}</>
                            )}
                          </div>

                          {cw?.label && (
                            <div className="mt-1 opacity-70">{cw.label}</div>
                          )}

                          {s.explanation && (
                            <div className="mt-1 opacity-60 line-clamp-2">
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
          <div className="opacity-70">Nessun risultato con i filtri attuali.</div>
        )}
      </CardContent>
    </Card>
  );
}
