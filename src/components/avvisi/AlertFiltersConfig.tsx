'use client';

import { useCallback, useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';

const MAX_FILTERS = 5;

const ORIONE_PATTERNS = [
  { value: 'engulfing_bull', label: 'Engulfing rialzista' },
  { value: 'engulfing_bear', label: 'Engulfing ribassista' },
  { value: 'hammer', label: 'Hammer' },
  { value: 'shooting_star', label: 'Shooting Star' },
  { value: 'morning_star', label: 'Morning Star' },
  { value: 'evening_star', label: 'Evening Star' },
  { value: 'three_white_soldiers', label: 'Three White Soldiers' },
  { value: 'three_black_crows', label: 'Three Black Crows' },
  { value: 'tweezer_bottom', label: 'Tweezer Bottom' },
  { value: 'tweezer_top', label: 'Tweezer Top' },
  { value: 'harami_bull', label: 'Harami rialzista' },
  { value: 'harami_bear', label: 'Harami ribassista' },
  { value: 'dark_cloud', label: 'Dark Cloud Cover' },
];

type AlertFilter = {
  id: number;
  modulo: string;
  condizione: string;
  coin_scope: string;
  attivo: number;
  creato_il: number;
};

type NewFilterState = {
  modulo: 'orione' | 'argonauta' | 'agema';
  orione_pattern: string;
  orione_direction: string;
  argonauta_score_min: string;
  argonauta_fonte: string;
  argonauta_rr_min: string;
  agema_score_min: string;
  agema_posizione_max: string;
  agema_direzione: string;
  coin_scope: string;
};

const DEFAULT_NEW: NewFilterState = {
  modulo: 'orione',
  orione_pattern: 'engulfing_bull',
  orione_direction: '',
  argonauta_score_min: '',
  argonauta_fonte: '',
  argonauta_rr_min: '',
  agema_score_min: '',
  agema_posizione_max: '',
  agema_direzione: 'tutte',
  coin_scope: '',
};

function parseCoinScope(s: string): string[] {
  return s
    .split(',')
    .map(c => c.trim().toUpperCase())
    .filter(Boolean);
}

function buildCondizione(form: NewFilterState): Record<string, any> {
  if (form.modulo === 'orione') {
    const c: Record<string, any> = { pattern: form.orione_pattern };
    if (form.orione_direction) c.direction = form.orione_direction;
    return c;
  }
  if (form.modulo === 'argonauta') {
    const c: Record<string, any> = {};
    if (form.argonauta_score_min) c.score_min = Number(form.argonauta_score_min);
    if (form.argonauta_fonte) c.fonte = form.argonauta_fonte;
    if (form.argonauta_rr_min) c.rr_min = Number(form.argonauta_rr_min);
    return c;
  }
  // agema
  const c: Record<string, any> = {};
  if (form.agema_score_min) c.score_min = Number(form.agema_score_min);
  if (form.agema_posizione_max) c.posizione_max = Number(form.agema_posizione_max);
  if (form.agema_direzione) c.direzione = form.agema_direzione;
  return c;
}

function filterSummary(f: AlertFilter): string {
  try {
    const c = JSON.parse(f.condizione);
    const coins = JSON.parse(f.coin_scope) as string[];
    const parts: string[] = [];
    if (c.pattern) parts.push(c.pattern.replace(/_/g, ' '));
    if (c.score_min) parts.push(`score ≥ ${c.score_min}`);
    if (c.posizione_max) parts.push(`top ${c.posizione_max}`);
    if (c.direzione && c.direzione !== 'tutte') parts.push(c.direzione);
    if (c.direction) parts.push(c.direction === 'LONG' ? 'rialzista' : 'ribassista');
    if (c.rr_min) parts.push(`R/R ≥ ${c.rr_min}`);
    if (c.fonte) parts.push(`fonte: ${c.fonte}`);
    if (coins.length) parts.push(coins.join(', '));
    return parts.join(' · ') || '—';
  } catch {
    return '—';
  }
}

function moduloLabel(m: string): string {
  return { orione: 'Orione', argonauta: 'Argonauta', agema: 'Agema' }[m] ?? m;
}

export default function AlertFiltersConfig() {
  const { user } = useUser();
  const [filters, setFilters] = useState<AlertFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewFilterState>(DEFAULT_NEW);
  const [error, setError] = useState('');

  const userId = user?.id ?? null;

  const fetchFilters = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch('/api/alerts/filters', {
        headers: { 'X-User-Id': userId },
      });
      if (res.ok) setFilters(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);

  async function createFilter() {
    if (!userId) return;
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/alerts/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
        body: JSON.stringify({
          modulo: form.modulo,
          condizione: buildCondizione(form),
          coin_scope: parseCoinScope(form.coin_scope),
        }),
      });
      if (res.status === 422) {
        const data = await res.json();
        setError(data.detail ?? 'Limite filtri raggiunto');
        return;
      }
      if (!res.ok) { setError('Errore durante la creazione'); return; }
      setShowForm(false);
      setForm(DEFAULT_NEW);
      await fetchFilters();
    } catch { setError('Errore di rete'); }
    finally { setSaving(false); }
  }

  async function toggleFilter(f: AlertFilter) {
    if (!userId) return;
    await fetch(`/api/alerts/filters/${f.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
      body: JSON.stringify({ attivo: !f.attivo }),
    });
    await fetchFilters();
  }

  async function deleteFilter(id: number) {
    if (!userId) return;
    await fetch(`/api/alerts/filters/${id}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userId },
    });
    setFilters(prev => prev.filter(f => f.id !== id));
  }

  const activeCount = filters.filter(f => f.attivo).length;

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text)',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    padding: '6px 10px',
    outline: 'none',
    width: '100%',
  };

  const selectStyle: React.CSSProperties = { ...inputStyle };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '9px',
    letterSpacing: '0.3em',
    textTransform: 'uppercase' as const,
    color: 'var(--color-text-dim)',
    marginBottom: '4px',
    display: 'block',
  };

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', color: 'var(--color-text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.4em', color: 'var(--color-text-dim)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Configurazione
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 300, color: 'var(--color-gold)', margin: 0 }}>
            I tuoi filtri
          </h2>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: activeCount >= MAX_FILTERS ? 'var(--color-short-bright, #a83d3d)' : 'var(--color-text-dim)', letterSpacing: '0.1em' }}>
          {activeCount}/{MAX_FILTERS} attivi
        </div>
      </div>

      {/* Lista filtri esistenti */}
      {loading ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-dim)', opacity: 0.5, marginBottom: '20px' }}>Caricamento…</div>
      ) : filters.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-dim)', opacity: 0.5, lineHeight: 1.8, marginBottom: '20px' }}>
          Nessun filtro ancora. Crea il primo per ricevere alert dai moduli.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          {filters.map(f => (
            <div
              key={f.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                border: '1px solid var(--color-border)', padding: '10px 14px',
                opacity: f.attivo ? 1 : 0.45,
              }}
            >
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.25em',
                textTransform: 'uppercase', color: 'var(--color-gold)',
                border: '1px solid rgba(201,168,76,0.4)', padding: '1px 8px', flexShrink: 0,
              }}>
                {moduloLabel(f.modulo)}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text)', flex: 1, minWidth: 0 }}>
                {filterSummary(f)}
              </span>
              <button
                onClick={() => toggleFilter(f)}
                title={f.attivo ? 'Disattiva' : 'Riattiva'}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.15em',
                  color: 'var(--color-text-dim)', background: 'transparent',
                  border: '1px solid var(--color-border)', padding: '4px 8px', cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                {f.attivo ? 'Disattiva' : 'Riattiva'}
              </button>
              <button
                onClick={() => deleteFilter(f.id)}
                title="Elimina"
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: '9px',
                  color: 'var(--color-text-dim)', background: 'transparent',
                  border: 'none', cursor: 'pointer', padding: '4px',
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Aggiungi filtro */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          disabled={activeCount >= MAX_FILTERS}
          style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.25em',
            textTransform: 'uppercase', color: activeCount >= MAX_FILTERS ? 'var(--color-text-dim)' : 'var(--color-gold)',
            background: 'transparent',
            border: `1px solid ${activeCount >= MAX_FILTERS ? 'var(--color-border)' : 'rgba(201,168,76,0.4)'}`,
            padding: '8px 18px', cursor: activeCount >= MAX_FILTERS ? 'not-allowed' : 'pointer',
            opacity: activeCount >= MAX_FILTERS ? 0.4 : 1,
          }}
        >
          + Nuovo filtro
        </button>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', padding: '20px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--color-gold)', marginBottom: '16px' }}>
            Nuovo filtro
          </div>

          {/* Modulo */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Modulo</label>
            <select
              value={form.modulo}
              onChange={e => setForm(f => ({ ...f, modulo: e.target.value as any }))}
              style={selectStyle}
            >
              <option value="orione">Orione — pattern rilevato</option>
              <option value="argonauta">Argonauta — soglia setup</option>
              <option value="agema">Agema — posizione in classifica</option>
            </select>
          </div>

          {/* Campi per Orione */}
          {form.modulo === 'orione' && (
            <>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Pattern</label>
                <select
                  value={form.orione_pattern}
                  onChange={e => setForm(f => ({ ...f, orione_pattern: e.target.value }))}
                  style={selectStyle}
                >
                  {ORIONE_PATTERNS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Direzione (opzionale)</label>
                <select
                  value={form.orione_direction}
                  onChange={e => setForm(f => ({ ...f, orione_direction: e.target.value }))}
                  style={selectStyle}
                >
                  <option value="">Tutte</option>
                  <option value="LONG">Rialzista</option>
                  <option value="SHORT">Ribassista</option>
                </select>
              </div>
            </>
          )}

          {/* Campi per Argonauta */}
          {form.modulo === 'argonauta' && (
            <>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Score minimo (opzionale)</label>
                <input
                  type="number" min="0" max="10" step="0.5"
                  value={form.argonauta_score_min}
                  onChange={e => setForm(f => ({ ...f, argonauta_score_min: e.target.value }))}
                  placeholder="es. 7"
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Fonte (opzionale)</label>
                <select
                  value={form.argonauta_fonte}
                  onChange={e => setForm(f => ({ ...f, argonauta_fonte: e.target.value }))}
                  style={selectStyle}
                >
                  <option value="">Tutte</option>
                  <option value="LEVELS">Livelli</option>
                  <option value="LIQUIDITY">Liquidità</option>
                </select>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>R/R minimo (opzionale)</label>
                <input
                  type="number" min="0" step="0.5"
                  value={form.argonauta_rr_min}
                  onChange={e => setForm(f => ({ ...f, argonauta_rr_min: e.target.value }))}
                  placeholder="es. 2"
                  style={inputStyle}
                />
              </div>
            </>
          )}

          {/* Campi per Agema */}
          {form.modulo === 'agema' && (
            <>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Score minimo in classifica (opzionale)</label>
                <input
                  type="number" min="0" step="1"
                  value={form.agema_score_min}
                  onChange={e => setForm(f => ({ ...f, agema_score_min: e.target.value }))}
                  placeholder="es. 5"
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Posizione massima (opzionale — es. 5 = top 5)</label>
                <input
                  type="number" min="1" step="1"
                  value={form.agema_posizione_max}
                  onChange={e => setForm(f => ({ ...f, agema_posizione_max: e.target.value }))}
                  placeholder="es. 5"
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>Direzione</label>
                <select
                  value={form.agema_direzione}
                  onChange={e => setForm(f => ({ ...f, agema_direzione: e.target.value }))}
                  style={selectStyle}
                >
                  <option value="tutte">Tutte</option>
                  <option value="rialzista">Rialzista</option>
                  <option value="ribassista">Ribassista</option>
                </select>
              </div>
            </>
          )}

          {/* Coin scope */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Coin (opzionale — separare con virgola, es. BTC, ETH)</label>
            <input
              type="text"
              value={form.coin_scope}
              onChange={e => setForm(f => ({ ...f, coin_scope: e.target.value }))}
              placeholder="Tutte le disponibili nel tuo tier"
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-short-bright, #a83d3d)', marginBottom: '12px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={createFilter}
              disabled={saving}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em',
                textTransform: 'uppercase',
                background: 'var(--color-gold)', color: 'var(--color-void)',
                border: 'none', padding: '8px 20px', cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Salvataggio…' : 'Salva filtro'}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(DEFAULT_NEW); setError(''); }}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.2em',
                textTransform: 'uppercase', color: 'var(--color-text-dim)',
                background: 'transparent', border: '1px solid var(--color-border)',
                padding: '8px 16px', cursor: 'pointer',
              }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
