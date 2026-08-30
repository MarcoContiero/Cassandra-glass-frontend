'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';

type Stato = 'aperta' | 'chiusa';

interface TradeEntry {
  id: number;
  coin: string;
  direzione: 'rialzista' | 'ribassista';
  entry_price: number;
  exit_price?: number;
  note?: string;
  stato: Stato;
  ts_entry: number;
  ts_exit?: number;
  contesto: {
    bias_per_tf?: Record<string, string>;
    scenari_attivi?: string[];
    prezzo_snapshot?: number;
    source?: 'tifi4_auto' | 'tifi4_shadow';
    scenario?: string;
    classe?: string;
    patterns_hit?: string[];
    reject_reason?: string;
    close_reason?: string;
  };
}

type Filter = 'tutte' | 'aperta' | 'chiusa' | 'shadow';

function fmt(ms: number) {
  return new Date(ms).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function pnlColor(pnl: number) {
  if (pnl > 0) return '#2EB87A';
  if (pnl < 0) return '#EF6464';
  return 'var(--color-text-dim)';
}

function calcPnl(entry: TradeEntry): number | null {
  if (!entry.exit_price || entry.stato !== 'chiusa') return null;
  const ratio = (entry.exit_price - entry.entry_price) / entry.entry_price * 100;
  return entry.direzione === 'rialzista' ? ratio : -ratio;
}

// Shadow: due stadi di rifiuto molto diversi.
// "matcher" = mai diventato un candidato valido (freschezza/third/EMA,
// Orione2). "gate" = candidato valido, respinto dalle regole del gate
// scenario (i 26 *_gate.py) — il dato utile per giudicare il gate.
const MATCHER_REJECT_REASONS = new Set([
  'TRIGGER_TOO_OLD', 'NO_THIRD', 'LATE_EMA', 'PATTERN_TF_NOT_1M',
]);

function rejectStage(reason?: string): 'matcher' | 'gate' | null {
  if (!reason) return null;
  if (reason === 'gate_blocked') return 'gate';
  if (MATCHER_REJECT_REASONS.has(reason)) return 'matcher';
  return null;
}

export default function JournalPanel() {
  const { user } = useUser();
  const [entries, setEntries] = useState<TradeEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('tutte');
  const [loading, setLoading] = useState(true);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [exitInputs, setExitInputs] = useState<Record<number, string>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // "Shadow" e' una sezione separata (segnali rifiutati dal live, mai
      // realmente tradati) — mai mischiata con le operazioni reali nelle
      // altre tab, per non sporcare lo storico che conta davvero.
      const params = new URLSearchParams();
      if (filter === 'shadow') {
        params.set('source', 'tifi4_shadow');
      } else {
        params.set('exclude_source', 'tifi4_shadow');
        if (filter !== 'tutte') params.set('stato', filter);
      }
      const qs = `?${params.toString()}`;
      const res = await fetch(`/api/journal/${qs}`, {
        headers: { 'X-User-Id': user.id },
      });
      if (res.ok) setEntries(await res.json());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [user?.id, filter]);

  useEffect(() => { load(); }, [load]);

  async function chiudi(id: number) {
    if (!user?.id) return;
    const val = parseFloat((exitInputs[id] || '').replace(',', '.'));
    if (!val || val <= 0) return;
    setClosingId(id);
    try {
      await fetch(`/api/journal/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
        body: JSON.stringify({ exit_price: val }),
      });
      await load();
    } finally { setClosingId(null); }
  }

  async function elimina(id: number) {
    if (!user?.id || !confirm('Eliminare questa entry?')) return;
    setDeletingId(id);
    try {
      await fetch(`/api/journal/${id}`, {
        method: 'DELETE',
        headers: { 'X-User-Id': user.id },
      });
      await load();
    } finally { setDeletingId(null); }
  }

  const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)' };
  const dim: React.CSSProperties = { color: 'var(--color-text-dim)' };

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 20px' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ ...mono, fontSize: '9px', letterSpacing: '0.25em', textTransform: 'uppercase',
          ...dim, marginBottom: '6px' }}>
          Cassandra · Trading Journal
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px',
          fontWeight: 300, color: 'var(--color-gold)', margin: 0 }}>
          Le mie operazioni
        </h1>
      </div>

      {/* Filtri */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {(['tutte', 'aperta', 'chiusa'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...mono, fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase',
              padding: '5px 12px', borderRadius: '2px', cursor: 'pointer',
              border: '1px solid',
              background: filter === f ? 'rgba(201,168,76,0.1)' : 'transparent',
              borderColor: filter === f ? 'rgba(201,168,76,0.35)' : 'rgba(255,255,255,0.1)',
              color: filter === f ? 'var(--color-gold)' : 'var(--color-text-dim)',
            }}
          >
            {f === 'tutte' ? 'Tutte' : f === 'aperta' ? 'Aperte' : 'Chiuse'}
          </button>
        ))}
        {/* Shadow: segnali rifiutati dal live ma tracciati in parallelo da
            Tifi 4.0 — mai realmente tradati, sezione separata apposta per
            non mischiarli con le operazioni reali. Popolata solo per il
            proprietario (TIFI4_JOURNAL_USER_ID lato backend). */}
        <button
          onClick={() => setFilter('shadow')}
          style={{
            ...mono, fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase',
            padding: '5px 12px', borderRadius: '2px', cursor: 'pointer',
            border: '1px solid',
            background: filter === 'shadow' ? 'rgba(125,79,156,0.12)' : 'transparent',
            borderColor: filter === 'shadow' ? 'rgba(193,147,224,0.4)' : 'rgba(255,255,255,0.1)',
            color: filter === 'shadow' ? '#c193e0' : 'var(--color-text-dim)',
          }}
        >
          ◐ Shadow
        </button>
        <button onClick={load} style={{ ...mono, marginLeft: 'auto', fontSize: '9px',
          letterSpacing: '0.12em', textTransform: 'uppercase', padding: '5px 12px',
          borderRadius: '2px', cursor: 'pointer', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-text-dim)' }}>
          ↻ Aggiorna
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ ...mono, ...dim, fontSize: '11px', padding: '40px 0', textAlign: 'center' }}>
          Caricamento...
        </div>
      ) : entries.length === 0 ? (
        <div style={{ ...mono, ...dim, fontSize: '11px', padding: '60px 0', textAlign: 'center' }}>
          Nessuna operazione registrata.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {entries.map(e => {
            const pnl = calcPnl(e);
            return (
              <div
                key={e.id}
                style={{
                  background: 'var(--color-surface, #0e0e1a)',
                  border: '1px solid',
                  borderColor: e.stato === 'aperta'
                    ? 'rgba(201,168,76,0.18)'
                    : pnl !== null && pnl >= 0 ? 'rgba(46,184,122,0.15)' : 'rgba(239,100,100,0.15)',
                  borderRadius: '2px',
                  padding: '14px 16px',
                }}
              >
                {/* Row 1: coin + direzione + stato */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{ ...mono, fontSize: '13px', fontWeight: 700,
                    color: 'var(--color-gold)' }}>{e.coin}</span>
                  <span style={{
                    ...mono, fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase',
                    padding: '2px 8px', borderRadius: '2px',
                    background: e.direzione === 'rialzista' ? 'rgba(46,184,122,0.12)' : 'rgba(239,100,100,0.12)',
                    color: e.direzione === 'rialzista' ? '#2EB87A' : '#EF6464',
                    border: `1px solid ${e.direzione === 'rialzista' ? 'rgba(46,184,122,0.25)' : 'rgba(239,100,100,0.25)'}`,
                  }}>
                    {e.direzione === 'rialzista' ? '▲' : '▼'} {e.direzione}
                  </span>
                  {e.stato === 'aperta' ? (
                    <span style={{ ...mono, fontSize: '9px', padding: '2px 8px',
                      background: 'rgba(201,168,76,0.1)', color: 'var(--color-gold)',
                      border: '1px solid rgba(201,168,76,0.25)', borderRadius: '2px',
                      letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      ● Aperta
                    </span>
                  ) : (
                    <span style={{ ...mono, fontSize: '9px', padding: '2px 8px',
                      background: 'rgba(255,255,255,0.04)', ...dim,
                      border: '1px solid rgba(255,255,255,0.08)', borderRadius: '2px',
                      letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                      Chiusa
                    </span>
                  )}
                  {pnl !== null && (
                    <span style={{ ...mono, fontSize: '13px', fontWeight: 700,
                      marginLeft: 'auto', color: pnlColor(pnl), fontVariantNumeric: 'tabular-nums' }}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
                    </span>
                  )}
                </div>

                {/* Row 2: prezzi + date */}
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <div style={{ ...mono, fontSize: '11px' }}>
                    <span style={dim}>Ingresso </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {e.entry_price.toLocaleString('it-IT', { maximumFractionDigits: 8 })}
                    </span>
                  </div>
                  {e.exit_price && (
                    <div style={{ ...mono, fontSize: '11px' }}>
                      <span style={dim}>Uscita </span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {e.exit_price.toLocaleString('it-IT', { maximumFractionDigits: 8 })}
                      </span>
                    </div>
                  )}
                  <div style={{ ...mono, fontSize: '10px', ...dim }}>
                    {fmt(e.ts_entry)}
                    {e.ts_exit ? ` → ${fmt(e.ts_exit)}` : ''}
                  </div>
                </div>

                {/* Bias snapshot */}
                {e.contesto?.bias_per_tf && Object.keys(e.contesto.bias_per_tf).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                    {Object.entries(e.contesto.bias_per_tf).map(([tf, bias]) => (
                      <span key={tf} style={{
                        ...mono, fontSize: '9px', padding: '1px 6px', borderRadius: '2px',
                        background: 'rgba(255,255,255,0.04)',
                        color: bias === 'rialzista' ? '#2EB87A' : bias === 'ribassista' ? '#EF6464' : 'var(--color-text-dim)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}>
                        {tf} · {bias}
                      </span>
                    ))}
                  </div>
                )}

                {/* Scenario + pattern/EMA che hanno generato il segnale (Tifi 4.0, reale o shadow) */}
                {(e.contesto?.scenario || (e.contesto?.patterns_hit && e.contesto.patterns_hit.length > 0)) && (
                  <div style={{ marginBottom: '8px' }}>
                    {e.contesto?.scenario && (
                      <div style={{ ...mono, fontSize: '10px', ...dim, marginBottom: '4px' }}>
                        {e.contesto.scenario}
                      </div>
                    )}
                    {e.contesto?.patterns_hit && e.contesto.patterns_hit.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {e.contesto.patterns_hit.map((tok, i) => (
                          <span key={i} style={{
                            ...mono, fontSize: '9px', padding: '1px 6px', borderRadius: '2px',
                            background: 'rgba(201,168,76,0.06)', color: 'var(--color-gold)',
                            border: '1px solid rgba(201,168,76,0.15)',
                          }}>
                            {tok}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Motivo scarto (solo Shadow) + motivo chiusura */}
                {(e.contesto?.reject_reason || e.contesto?.close_reason) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px', alignItems: 'center' }}>
                    {(() => {
                      const stage = rejectStage(e.contesto?.reject_reason);
                      if (!stage) return null;
                      const isGate = stage === 'gate';
                      return (
                        <span style={{
                          ...mono, fontSize: '9px', padding: '1px 6px', borderRadius: '2px',
                          letterSpacing: '0.08em', textTransform: 'uppercase',
                          background: isGate ? 'rgba(224,169,74,0.1)' : 'rgba(255,255,255,0.04)',
                          color: isGate ? '#e0a94a' : 'var(--color-text-dim)',
                          border: `1px solid ${isGate ? 'rgba(224,169,74,0.3)' : 'rgba(255,255,255,0.1)'}`,
                        }}>
                          {isGate ? '⛊ gate' : '✳ matcher'}
                        </span>
                      );
                    })()}
                    {e.contesto?.reject_reason && (
                      <span style={{
                        ...mono, fontSize: '9px', padding: '1px 6px', borderRadius: '2px',
                        background: 'rgba(193,147,224,0.08)', color: '#c193e0',
                        border: '1px solid rgba(193,147,224,0.2)',
                      }}>
                        rifiutato: {e.contesto.reject_reason}
                      </span>
                    )}
                    {e.contesto?.close_reason && (
                      <span style={{
                        ...mono, fontSize: '9px', padding: '1px 6px', borderRadius: '2px',
                        background: 'rgba(255,255,255,0.04)', ...dim,
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}>
                        chiuso: {e.contesto.close_reason}
                      </span>
                    )}
                  </div>
                )}

                {/* Nota */}
                {e.note && (
                  <div style={{ ...mono, fontSize: '11px', ...dim, lineHeight: 1.55,
                    padding: '6px 10px', background: 'rgba(255,255,255,0.03)',
                    borderRadius: '2px', marginBottom: '8px' }}>
                    {e.note}
                  </div>
                )}

                {/* Azioni: chiudi trade — non per Shadow, si chiudono da sole (SL/trail/timeout lato backend) */}
                {e.stato === 'aperta' && e.contesto?.source !== 'tifi4_shadow' && (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px' }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Prezzo uscita"
                      value={exitInputs[e.id] ?? ''}
                      onChange={ev => setExitInputs(p => ({ ...p, [e.id]: ev.target.value }))}
                      style={{
                        width: '140px', padding: '5px 10px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '2px',
                        ...mono, fontSize: '11px', fontVariantNumeric: 'tabular-nums',
                        color: 'var(--color-text)', outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => chiudi(e.id)}
                      disabled={closingId === e.id}
                      style={{
                        ...mono, fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase',
                        padding: '5px 12px', borderRadius: '2px', cursor: 'pointer',
                        background: 'rgba(46,184,122,0.1)',
                        border: '1px solid rgba(46,184,122,0.3)', color: '#2EB87A',
                        opacity: closingId === e.id ? 0.5 : 1,
                      }}
                    >
                      Chiudi
                    </button>
                    <button
                      onClick={() => elimina(e.id)}
                      disabled={deletingId === e.id}
                      style={{
                        ...mono, fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase',
                        padding: '5px 10px', borderRadius: '2px', cursor: 'pointer',
                        background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                        ...dim, opacity: deletingId === e.id ? 0.4 : 0.6,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
