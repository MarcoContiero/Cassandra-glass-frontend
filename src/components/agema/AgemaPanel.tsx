'use client';

import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import HelpButton from '../help/HelpButton';
import type { AgemaCiclicaPhase, AgemaPick, AgemaSnapshot } from '@/types/agema';

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

function fmt(n?: number | null, digits = 4) {
  if (!Number.isFinite(n as number)) return '—';
  return Number(n).toLocaleString('it-IT', { maximumFractionDigits: digits });
}

// Fase ciclica -> etichetta descrittiva (mai il nome tecnico interno).
const PHASE_LABEL: Record<AgemaCiclicaPhase, string> = {
  early_up: 'salita iniziale',
  mid_up: 'salita centrale',
  late_up: 'salita matura',
  early_down: 'discesa iniziale',
  mid_down: 'discesa centrale',
  late_down: 'discesa matura',
};

function updatedAtLabel(ms: number | null): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `aggiornato alle ${hh}:${mm}`;
}

interface AgemaPanelProps {
  onPiziaContext?: (ctx: string) => void;
}

export default function AgemaPanel({ onPiziaContext }: AgemaPanelProps) {
  const [data, setData] = useState<AgemaSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [minScore, setMinScore] = useState<number>(51);
  const [dir, setDir] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');

  const [macroEvents, setMacroEvents] = useState<MacroEvent[] | null>(null);
  const [macroError, setMacroError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/macro-calendar/upcoming?days_ahead=14', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
      const r = await fetch('/api/agema', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const js = (await r.json()) as AgemaSnapshot;
      setData(js);
    } catch (e: any) {
      setError(e?.message || 'Errore');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAgema(); }, []);

  const picks = useMemo(() => {
    const base = data?.picks ?? [];
    return base.filter((p) => {
      if (Number.isFinite(minScore) && (p.score ?? -1) < minScore) return false;
      if (dir !== 'ALL' && p.direction !== dir) return false;
      return true;
    });
  }, [data, minScore, dir]);

  useEffect(() => {
    if (!onPiziaContext || picks.length === 0) return;
    const lines: string[] = [
      `Pannello: AGEMA — il reparto scelto delle coin`,
      `${picks.length} pick in controtendenza rispetto al ciclo (min score ${minScore})`,
      '',
    ];
    for (const p of picks) {
      const dirStr = p.direction === 'LONG' ? 'rialzista' : 'ribassista';
      lines.push(
        `${p.coin} — ${dirStr} — score ${fmt(p.score, 0)} — tf ${p.tf ?? '—'} — ` +
        `entry ${fmt(p.entry)} — fase ciclica: ${PHASE_LABEL[p.ciclica_phase_1h]}`
      );
    }
    onPiziaContext(lines.join('\n'));
  }, [picks, onPiziaContext, minScore]);

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

      {/* Lede */}
      <div className="font-mono text-[11px] text-[var(--color-text-dim)] leading-relaxed mb-5">
        Coin con un segnale Strategia AI forte proprio mentre il prezzo va in
        controtendenza rispetto al ciclo di mercato in corso — la combinazione
        che storicamente si è dimostrata più solida, non una classifica di
        tutte le coin.
      </div>

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

        {data && (
          <span className="ml-auto font-mono text-[10px] text-[var(--color-text-dim)]">
            {updatedAtLabel(data.generated_at_ms)} · {data.coins_scanned} coin scansionate
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
            CARICO LO SNAPSHOT...
          </div>
        )}

        {picks.length > 0 && (
          <div className="flex flex-col">
            {picks.map((p) => (
              <AgemaRow key={p.coin} pick={p} />
            ))}
          </div>
        )}

        {data && picks.length === 0 && !error && (
          <div className="font-mono text-[11px] text-[var(--color-text-dim)] text-center py-12 tracking-[0.2em]">
            NESSUNA COIN IN CONTROTENDENZA AL MOMENTO
          </div>
        )}
      </div>
    </div>
  );
}

function AgemaRow({ pick }: { pick: AgemaPick }) {
  const isLong = pick.direction === 'LONG';
  return (
    <div
      className="px-0 py-3 transition-colors duration-200 hover:bg-[rgba(201,168,76,0.02)]"
      style={{ borderBottom: '1px solid var(--color-text-faint)' }}
    >
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <span
          className="text-[14px]"
          style={{ fontFamily: 'var(--font-cinzel, Cinzel, serif)', color: 'var(--color-gold)' }}
        >
          {pick.coin}
        </span>

        <span className={isLong ? 'bias-long' : 'bias-short'}>
          {isLong ? 'Rialzista' : 'Ribassista'}
        </span>

        <span className="font-mono text-[11px] text-[var(--color-gold)]">
          score {fmt(pick.score, 0)}
        </span>

        {pick.tf && (
          <span
            className="font-mono text-[10px] tracking-[0.1em] text-[var(--color-text-dim)] px-1.5 py-0.5"
            style={{ border: '1px solid var(--color-border)' }}
          >
            {pick.tf}
          </span>
        )}

        <span
          className="font-mono text-[11px] text-[var(--color-text-dim)] px-2 py-0.5"
          style={{ border: '1px solid var(--color-border)' }}
        >
          in controtendenza — coin in fase {PHASE_LABEL[pick.ciclica_phase_1h]}
        </span>
      </div>

      <div className="font-mono text-[11px] text-[var(--color-text)] leading-relaxed flex flex-wrap gap-x-4 gap-y-1">
        {pick.entry != null && <span>entry {fmt(pick.entry)}</span>}
        {pick.sl_price != null && <span>sl {fmt(pick.sl_price)}</span>}
        {pick.tp1_price != null && <span>tp1 {fmt(pick.tp1_price)}</span>}
        {pick.tp2_price != null && <span>tp2 {fmt(pick.tp2_price)}</span>}
      </div>
    </div>
  );
}
