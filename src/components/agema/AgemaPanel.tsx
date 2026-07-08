'use client';

import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import HelpButton from '../help/HelpButton';

const sanitizeDir = (text: string) =>
  text
    .replace(/\bLONG\b/g, "rialzista")
    .replace(/\bSHORT\b/g, "ribassista")
    .replace(/\blong\b/g, "rialzista")
    .replace(/\bshort\b/g, "ribassista")
    .replace(/\breentry\b/gi, "reingresso");

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

type MacroEvent = {
  release_id: number;
  name: string;
  date: string;        // "YYYY-MM-DD"
  days_until: number;
};

type MacroCalendarResponse = {
  ok: boolean;
  error: string | null;
  data: {
    events: MacroEvent[];
    stale: boolean;
    updated_at: string | null;
    error: string | null;
  } | null;
};

const MACRO_NAME_SHORT: Record<string, string> = {
  'CPI': 'CPI',
  'PPI': 'PPI',
  'NFP (Employment Situation)': 'NFP',
  'FOMC Press Release': 'FOMC',
};

function macroDateLabel(dateStr: string, daysUntil: number): string {
  if (daysUntil === 0) return 'oggi';
  if (daysUntil === 1) return 'domani';
  const d = new Date(dateStr + 'T00:00:00Z');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm} · tra ${daysUntil}gg`;
}

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

function dirLabel(d?: string): string {
  const s = String(d || '').toUpperCase();
  if (s === 'LONG') return 'Rialzista';
  if (s === 'SHORT') return 'Ribassista';
  return d || '';
}

function buildScenarioPhrase(s: StrategiaAIItem): string {
  const dir = String(s.direction || '').toUpperCase();
  const isLong = dir === 'LONG';
  const tags = (s.tags ?? []).map((t: string) => String(t).toUpperCase());
  const isBreakout = tags.some(t => t.includes('BREAK'));
  const score = s.score != null ? Math.round(Number(s.score)) : null;
  const scoreStr = score != null ? ` (livello ${score})` : '';
  const entry = s.entry != null ? fmt(s.entry, 6) : null;
  const tp1 = s.tp1_price != null ? fmt(s.tp1_price, 6) : null;
  const tp2 = s.tp2_price != null ? fmt(s.tp2_price, 6) : null;

  if (!entry) return s.explanation || '—';

  if (isLong) {
    if (isBreakout) {
      let ph = `Se supera ${entry}${scoreStr}`;
      if (tp1) ph += ` — resistenza successiva a ${tp1}`;
      if (tp2 && tp2 !== tp1) ph += `, poi ${tp2}`;
      return ph;
    } else {
      let ph = `Se scende verso ${entry}, zona di supporto${scoreStr}`;
      if (tp1) ph += ` — area rialzista a ${tp1}`;
      return ph;
    }
  } else {
    if (isBreakout) {
      let ph = `Se scende sotto ${entry}${scoreStr}`;
      if (tp1) ph += ` — supporto successivo a ${tp1}`;
      if (tp2 && tp2 !== tp1) ph += `, poi ${tp2}`;
      return ph;
    } else {
      let ph = `Se sale verso ${entry}, zona di resistenza${scoreStr}`;
      if (tp1) ph += ` — area ribassista a ${tp1}`;
      return ph;
    }
  }
}

interface AgemaPanelProps {
  onPiziaContext?: (ctx: string) => void;
}

export default function AgemaPanel({ onPiziaContext }: AgemaPanelProps) {
  const [data, setData] = useState<AgemaResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // filtri
  const [minScore, setMinScore] = useState<number>(60);
  const [maxHours, setMaxHours] = useState<number>(48);
  const [dir, setDir] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');

  const [macroEvents, setMacroEvents] = useState<MacroEvent[] | null>(null);
  const [macroError, setMacroError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/macro-calendar/upcoming?days_ahead=14', { cache: 'no-store' });
        const js = (await r.json()) as MacroCalendarResponse;
        if (cancelled) return;
        if (!js.ok || !js.data) {
          setMacroError(js.error || js.data?.error || 'Non disponibile');
          setMacroEvents(js.data?.events ?? null);
          return;
        }
        setMacroEvents(js.data.events);
        setMacroError(js.data.stale ? js.data.error : null);
      } catch (e: any) {
        if (!cancelled) setMacroError(e?.message || 'Errore');
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  useEffect(() => {
    if (!onPiziaContext || rows.length === 0) return;
    const dirFilter = dir === 'ALL' ? 'tutte le direzioni' : dir === 'LONG' ? 'rialzista' : 'ribassista';
    const lines: string[] = [
      `Pannello: AGEMA — Radar ciclico`,
      `${rows.length} coin in classifica (min_score ${minScore}, entro ${maxHours}h, ${dirFilter})`,
      '',
    ];
    for (const row of rows) {
      const dirStr = row.direction === 'LONG' ? 'rialzista' : row.direction === 'SHORT' ? 'ribassista' : (row.direction ?? '—');
      let line = `${row.coin} — dir: ${dirStr} — score: ${fmt(row.score, 0)} — prezzo: ${fmt(row.price, 6)}`;
      if (row.ciclica_label) line += ` — fase: ${row.ciclica_label}`;
      if (row.reentry_label) line += ` — ${sanitizeDir(row.reentry_label)}`;
      if (Number.isFinite(row.eta_reentry_hours as number)) line += ` — ETA ${fmt(row.eta_reentry_hours, 0)}h`;
      lines.push(line);
      for (const s of (row.best ?? []).slice(0, 3)) {
        const sDir = s.direction === 'LONG' ? 'rialzista' : s.direction === 'SHORT' ? 'ribassista' : (s.direction ?? '');
        lines.push(`  [${s.tf}] ${sDir} sc ${fmt(s.score, 0)}: ${buildScenarioPhrase(s)}`);
      }
    }
    onPiziaContext(lines.join('\n'));
  }, [rows, onPiziaContext, dir, minScore, maxHours]);

  return (
    <div className="cassandra-card cassandra-card-corners" style={{ padding: '24px 24px 20px' }}>
      <span className="cassandra-panel-header">AGEMA</span>
      <span style={{ position: 'absolute', top: 6, right: 6 }} onClick={e => e.stopPropagation()}>
        <HelpButton helpKey="agema" label="Agema" variant="section" />
      </span>

      {/* Macro calendar strip */}
      {macroEvents && macroEvents.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 mb-4"
          style={{ borderBottom: '1px solid var(--color-border-dim)', paddingBottom: '14px' }}
        >
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-dim)] mr-1">
            Eventi macro
          </span>
          {macroEvents.map((ev) => (
            <span
              key={`${ev.release_id}-${ev.date}`}
              className="font-mono text-[10px] tracking-[0.05em] text-[var(--color-text)] px-2 py-1"
              style={{ border: '1px solid var(--color-border)' }}
              title={ev.name}
            >
              {MACRO_NAME_SHORT[ev.name] || ev.name}
              <span className="text-[var(--color-text-dim)]"> · {macroDateLabel(ev.date, ev.days_until)}</span>
            </span>
          ))}
        </div>
      )}
      {macroError && (!macroEvents || macroEvents.length === 0) && (
        <div className="font-mono text-[10px] text-[var(--color-text-dim)] mb-4 opacity-60">
          Eventi macro non disponibili ({macroError})
        </div>
      )}

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
            <option value="LONG">RIALZISTE</option>
            <option value="SHORT">RIBASSISTE</option>
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

                    {row.direction === 'LONG' && <span className="bias-long">Rialzista</span>}
                    {row.direction === 'SHORT' && <span className="bias-short">Ribassista</span>}
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
                        {sanitizeDir(row.reentry_label)}
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
                          {/* Header: TF + direzione + score + eta */}
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span
                              className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-dim)] px-1.5 py-0.5"
                              style={{ border: '1px solid var(--color-border)' }}
                            >
                              {s.tf}
                            </span>

                            {s.direction === 'LONG' && (
                              <span className="font-mono text-[10px] text-[var(--color-long-bright)]">rialzista</span>
                            )}
                            {s.direction === 'SHORT' && (
                              <span className="font-mono text-[10px] text-[var(--color-short-bright)]">ribassista</span>
                            )}

                            {s.score != null && (
                              <span className="font-mono text-[10px] text-[var(--color-gold)]">
                                sc {fmt(s.score, 0)}
                              </span>
                            )}

                            {etaH !== null && (
                              <span className="font-mono text-[10px] text-[var(--color-text-dim)]">
                                &le;{fmt(etaH, 0)}h
                              </span>
                            )}
                          </div>

                          {/* Frase descrittiva scenario */}
                          <div className="font-mono text-[11px] text-[var(--color-text)] leading-relaxed">
                            {buildScenarioPhrase(s)}
                          </div>

                          {/* Finestra ciclica */}
                          {cw?.label && (
                            <div className="font-mono text-[10px] text-[var(--color-text-dim)] mt-1.5 opacity-70">
                              {cw.label}
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
