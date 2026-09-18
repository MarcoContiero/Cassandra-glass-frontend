'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';

// Sezione dedicata Agema dentro Journal (18/9) — traccia lo storico dei
// pick (score forte + controtendenza) e i loro esiti reali, per costruire
// fiducia nel tempo invece di mostrare solo il presente. A differenza del
// pannello Agema live, QUI i numeri WR/EV si mostrano: e' proprio lo scopo
// di questa scheda (il pannello live resta descrittivo, non mostra numeri
// per non sembrare una garanzia).

type Outcome = 'HIT_TP1' | 'HIT_TP2' | 'HIT_TP1_NO_SL' | 'STOPPED' | 'TIMEOUT';
type Tier = 'forte' | 'normale';

interface AgemaEntry {
  id: number;
  coin: string;
  direzione: 'rialzista' | 'ribassista';
  entry_price: number;
  exit_price?: number;
  stato: 'aperta' | 'chiusa';
  ts_entry: number;
  ts_exit?: number;
  contesto: {
    score?: number;
    tier?: Tier;
    tf?: string;
    sl_price?: number;
    tp1_price?: number;
    tp2_price?: number;
    ciclica_phase_1h?: string;
    outcome?: Outcome;
  };
}

function fmt(ms: number) {
  return new Date(ms).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  HIT_TP1: 'TP1 raggiunto',
  HIT_TP2: 'TP2 raggiunto',
  HIT_TP1_NO_SL: 'TP1 raggiunto',
  STOPPED: 'Stop colpito',
  TIMEOUT: 'Scaduto (nessun tocco)',
};

const OUTCOME_COLOR: Record<Outcome, string> = {
  HIT_TP1: '#2EB87A', HIT_TP2: '#2EB87A', HIT_TP1_NO_SL: '#2EB87A',
  STOPPED: '#EF6464', TIMEOUT: 'var(--color-text-dim)',
};

const WIN_OUTCOMES = new Set<Outcome>(['HIT_TP1', 'HIT_TP2', 'HIT_TP1_NO_SL']);

function computeStats(entries: AgemaEntry[]) {
  const resolved = entries.filter(e => e.stato === 'chiusa' && e.contesto?.outcome);
  const byTier = (tier: Tier) => {
    const sub = resolved.filter(e => e.contesto?.tier === tier && e.contesto?.outcome !== 'TIMEOUT');
    const wins = sub.filter(e => WIN_OUTCOMES.has(e.contesto!.outcome!)).length;
    return { n: sub.length, wr: sub.length ? Math.round((wins / sub.length) * 1000) / 10 : null };
  };
  return {
    totale: entries.length,
    aperti: entries.filter(e => e.stato === 'aperta').length,
    forte: byTier('forte'),
    normale: byTier('normale'),
  };
}

export default function AgemaJournalSection() {
  const { user } = useUser();
  const [entries, setEntries] = useState<AgemaEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const res = await fetch('/api/journal/?source=agema_pick', {
        headers: { 'X-User-Id': user.id },
      });
      if (res.ok) setEntries(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };
  const dim: React.CSSProperties = { color: 'var(--color-text-dim)' };
  const stats = computeStats(entries);

  return (
    <div>
      {/* Statistiche aggregate */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px',
        marginBottom: '20px',
      }}>
        {[
          { label: 'Pick totali', value: String(stats.totale), sub: `${stats.aperti} in corso` },
          { label: 'Controtendenza forte', value: stats.forte.wr != null ? `${stats.forte.wr}% WR` : '—', sub: `n=${stats.forte.n} risolti` },
          { label: 'Controtendenza normale', value: stats.normale.wr != null ? `${stats.normale.wr}% WR` : '—', sub: `n=${stats.normale.n} risolti` },
        ].map((c, i) => (
          <div key={i} style={{
            background: 'var(--color-surface, #0e0e1a)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '2px', padding: '12px 14px',
          }}>
            <div style={{ ...mono, fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase', ...dim, marginBottom: '6px' }}>
              {c.label}
            </div>
            <div style={{ ...mono, fontSize: '18px', fontWeight: 700, color: 'var(--color-gold)', fontVariantNumeric: 'tabular-nums' }}>
              {c.value}
            </div>
            <div style={{ ...mono, fontSize: '9px', ...dim, marginTop: '2px' }}>{c.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ ...mono, fontSize: '10px', ...dim, marginBottom: '18px', lineHeight: 1.6 }}>
        WR calcolato solo sui pick risolti (esclusi gli "scaduti" senza nessun tocco di TP/SL entro 72h) — "vinto" = almeno TP1 raggiunto.
      </div>

      {loading ? (
        <div style={{ ...mono, ...dim, fontSize: '11px', padding: '40px 0', textAlign: 'center' }}>Caricamento...</div>
      ) : entries.length === 0 ? (
        <div style={{ ...mono, ...dim, fontSize: '11px', padding: '60px 0', textAlign: 'center' }}>
          Nessun pick Agema ancora registrato.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {entries.map(e => {
            const outcome = e.contesto?.outcome;
            const tier = e.contesto?.tier;
            return (
              <div key={e.id} style={{
                background: 'var(--color-surface, #0e0e1a)', border: '1px solid',
                borderColor: e.stato === 'aperta' ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.08)',
                borderRadius: '2px', padding: '14px 16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <span style={{ ...mono, fontSize: '13px', fontWeight: 700, color: 'var(--color-gold)' }}>{e.coin}</span>
                  <span style={{
                    ...mono, fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase',
                    padding: '2px 8px', borderRadius: '2px',
                    background: e.direzione === 'rialzista' ? 'rgba(46,184,122,0.12)' : 'rgba(239,100,100,0.12)',
                    color: e.direzione === 'rialzista' ? '#2EB87A' : '#EF6464',
                    border: `1px solid ${e.direzione === 'rialzista' ? 'rgba(46,184,122,0.25)' : 'rgba(239,100,100,0.25)'}`,
                  }}>
                    {e.direzione === 'rialzista' ? '▲' : '▼'} {e.direzione}
                  </span>
                  {tier && (
                    <span style={{
                      ...mono, fontSize: '10px', padding: '2px 8px', borderRadius: '2px',
                      ...(tier === 'forte'
                        ? { color: 'var(--color-gold-bright)', background: 'var(--color-gold-faint)', border: '1px solid rgba(201,168,76,0.45)', fontWeight: 700 }
                        : { ...dim, border: '1px solid rgba(255,255,255,0.1)' }),
                    }}>
                      {tier === 'forte' ? 'Controtendenza forte' : 'Controtendenza'}
                    </span>
                  )}
                  {e.contesto?.score != null && (
                    <span style={{ ...mono, fontSize: '11px', color: 'var(--color-gold)' }}>score {Math.round(e.contesto.score)}</span>
                  )}
                  {e.stato === 'aperta' ? (
                    <span style={{ ...mono, fontSize: '9px', padding: '2px 8px', marginLeft: 'auto',
                      background: 'rgba(201,168,76,0.1)', color: 'var(--color-gold)',
                      border: '1px solid rgba(201,168,76,0.25)', borderRadius: '2px',
                      letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      ● In corso
                    </span>
                  ) : outcome ? (
                    <span style={{ ...mono, fontSize: '11px', fontWeight: 700, marginLeft: 'auto',
                      color: OUTCOME_COLOR[outcome] }}>
                      {OUTCOME_LABEL[outcome]}
                    </span>
                  ) : null}
                </div>

                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <div style={{ ...mono, fontSize: '11px' }}>
                    <span style={dim}>entry </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{e.entry_price}</span>
                  </div>
                  {e.contesto?.sl_price != null && (
                    <div style={{ ...mono, fontSize: '11px' }}><span style={dim}>sl </span>{e.contesto.sl_price}</div>
                  )}
                  {e.contesto?.tp1_price != null && (
                    <div style={{ ...mono, fontSize: '11px' }}><span style={dim}>tp1 </span>{e.contesto.tp1_price}</div>
                  )}
                  {e.contesto?.tp2_price != null && (
                    <div style={{ ...mono, fontSize: '11px' }}><span style={dim}>tp2 </span>{e.contesto.tp2_price}</div>
                  )}
                </div>
                <div style={{ ...mono, fontSize: '10px', ...dim }}>
                  {fmt(e.ts_entry)}{e.ts_exit ? ` → ${fmt(e.ts_exit)}` : ''}
                  {e.contesto?.tf ? ` · tf ${e.contesto.tf}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
