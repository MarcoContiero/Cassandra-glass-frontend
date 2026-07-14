'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AddCoinStatus {
  running: boolean;
  coin: string | null;
  step: string | null;
  steps_done: string[];
  error: string | null;
  started_at: string | null;
  log: string[];
  steps_total: string[];
}

interface DailyStatus {
  last_run: string | null;
  last_run_coins_ok: number | null;
  last_run_rows_added: number | null;
  is_running: boolean;
}

interface StatusResponse {
  daily_update: DailyStatus;
  scripts: { daily_update: boolean; gate_monitor: boolean; gate_config: boolean };
  now_utc: string;
}

interface LiveV2Position {
  asset: string;
  side: string;
  entry_px: number;
  stop_px: number;
  sl_placed: boolean;
  sl_unprotected_seconds: number | null;
  scenario?: string;
}

interface WindowData {
  current: { n: number; wr_pct: number | null; pf: number | null; avg_pnl: number | null };
  evaluation: { status: string; flags: string[] };
}

interface GateResult {
  scenario: string;
  label: string;
  calibration_window: string;
  calibration_date: string;
  notes?: string;
  baseline: { n: number; wr_pct: number; pf: number | null };
  windows: Record<string, WindowData>;
}

interface GateMonitorResponse {
  ok: boolean;
  windows: string[];
  results: GateResult[];
  generated_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  OK:         'var(--color-long-bright)',
  ATTENZIONE: 'var(--color-gold)',
  CRITICO:    'var(--color-short-bright)',
  N_BASSO:    'var(--color-text-dim)',
};

const STATUS_ICON: Record<string, string> = {
  OK: '✓', ATTENZIONE: '⚠', CRITICO: '✗', N_BASSO: '~',
};

const STATUS_ORDER: Record<string, number> = {
  CRITICO: 0, ATTENZIONE: 1, N_BASSO: 2, OK: 3,
};

function worstStatus(r: GateResult): string {
  const statuses = Object.values(r.windows).map(w => w.evaluation.status);
  return statuses.sort((a, b) => (STATUS_ORDER[a] ?? 9) - (STATUS_ORDER[b] ?? 9))[0] ?? 'OK';
}

function fmtWr(v: number | null) { return v != null ? `${v.toFixed(1)}%` : '—'; }
function fmtPf(v: number | null) { return v != null ? v.toFixed(2) : '—'; }
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('it-IT', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }) + ' UTC';
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, isLoaded } = useUser();
  const [status, setStatus]             = useState<StatusResponse | null>(null);
  const [unprotectedPositions, setUnprotectedPositions] = useState<LiveV2Position[]>([]);
  const [gate, setGate]                 = useState<GateMonitorResponse | null>(null);
  const [gateLoading, setGateLoading]   = useState(false);
  const [runMsg, setRunMsg]             = useState('');
  const [genomeMsg, setGenomeMsg]       = useState('');
  const [importMsg, setImportMsg]       = useState('');
  const [error, setError]               = useState('');
  const [newCoin, setNewCoin]           = useState('');
  const [addCoinStatus, setAddCoinStatus] = useState<AddCoinStatus | null>(null);
  const [addCoinPolling, setAddCoinPolling] = useState(false);

  // Help content editor
  const [helpKeys, setHelpKeys]         = useState<{ key: string; chars: number; updated_at: string }[]>([]);
  const [helpKey, setHelpKey]           = useState('');
  const [helpContent, setHelpContent]   = useState('');
  const [helpSaving, setHelpSaving]     = useState(false);
  const [helpMsg, setHelpMsg]           = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/status');
      if (r.ok) setStatus(await r.json());
    } catch { /* ignore */ }
  }, []);

  const loadLiveV2Status = useCallback(async () => {
    try {
      const r = await fetch('/api/tifide3/status', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      const positions: LiveV2Position[] = Array.isArray(d?.live_v2_positions) ? d.live_v2_positions : [];
      setUnprotectedPositions(positions.filter(p => p.sl_placed === false));
    } catch { /* ignore */ }
  }, []);

  const loadGate = useCallback(async () => {
    setGateLoading(true);
    setError('');
    try {
      const r = await fetch('/api/admin/gate-monitor?windows=30,60,90');
      if (r.ok) setGate(await r.json());
      else setError(`Gate monitor error ${r.status}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setGateLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadGate();
    loadLiveV2Status();
  }, [loadStatus, loadGate, loadLiveV2Status]);

  // Poll SL non protetto ogni 10s — è un avviso di sicurezza su soldi veri,
  // deve aggiornarsi da solo senza bisogno di refresh manuale della pagina.
  useEffect(() => {
    const id = setInterval(loadLiveV2Status, 10000);
    return () => clearInterval(id);
  }, [loadLiveV2Status]);

  // Poll status ogni 10s se daily update è in running
  useEffect(() => {
    if (!status?.daily_update.is_running) return;
    const iv = setInterval(loadStatus, 10_000);
    return () => clearInterval(iv);
  }, [status?.daily_update.is_running, loadStatus]);

  async function triggerRun() {
    setRunMsg('');
    const r = await fetch('/api/admin/daily-update/run', { method: 'POST' });
    const data = await r.json();
    setRunMsg(data.message ?? (data.ok ? 'Avviato' : 'Errore'));
    if (data.ok) setTimeout(loadStatus, 2000);
  }

  async function triggerGenomeRebuild(mode: 'full' | 'update', extraCoins?: string) {
    setGenomeMsg('');
    const params = new URLSearchParams({ mode });
    if (extraCoins) params.set('extra_coins', extraCoins);
    const r = await fetch(`/api/tradedb/rebuild-genome?${params}`, { method: 'POST' });
    const data = await r.json();
    setGenomeMsg(data.msg ?? (data.ok ? 'Avviato' : `Errore ${r.status}`));
  }

  // ── Help content ────────────────────────────────────────────────────────────

  const loadHelpKeys = useCallback(async () => {
    try {
      const r = await fetch('/api/help/_keys');
      if (r.ok) { const d = await r.json(); setHelpKeys(d.keys ?? []); }
    } catch { /* ignore */ }
  }, []);

  async function loadHelpContent(key: string) {
    setHelpKey(key);
    setHelpContent('');
    setHelpMsg('');
    try {
      const r = await fetch(`/api/help/${key}`, { cache: 'no-store' });
      if (r.ok) { const d = await r.json(); setHelpContent(d.content_md ?? ''); }
    } catch { /* ignore */ }
  }

  async function saveHelpContent() {
    if (!helpKey.trim()) return;
    setHelpSaving(true);
    setHelpMsg('');
    try {
      const r = await fetch(`/api/help/${helpKey}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content_md: helpContent }),
      });
      const d = await r.json();
      if (d.ok) { setHelpMsg(`Salvato · ${d.updated_at}`); loadHelpKeys(); }
      else setHelpMsg(`Errore ${r.status}: ${d.detail ?? JSON.stringify(d)}`);
    } catch (e) { setHelpMsg(String(e)); }
    finally { setHelpSaving(false); }
  }

  useEffect(() => { loadHelpKeys(); }, [loadHelpKeys]);

  const pollAddCoin = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/add-coin/status');
      if (r.ok) {
        const data = await r.json();
        setAddCoinStatus(data);
        if (!data.running) setAddCoinPolling(false);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!addCoinPolling) return;
    const iv = setInterval(pollAddCoin, 4000);
    return () => clearInterval(iv);
  }, [addCoinPolling, pollAddCoin]);

  async function triggerAddCoin() {
    const coin = newCoin.trim().toUpperCase();
    if (!coin) return;
    try {
      const r = await fetch('/api/admin/add-coin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coin }),
      });
      const data = await r.json();
      if (data.ok) {
        setAddCoinPolling(true);
        await pollAddCoin();
      } else {
        setAddCoinStatus(prev => prev ? { ...prev, error: data.detail ?? 'Errore' } : null);
      }
    } catch (e) {
      setAddCoinStatus(prev => prev ? { ...prev, error: String(e) } : null);
    }
  }

  async function triggerImportNewCoins() {
    setImportMsg('Importazione in corso...');
    try {
      const r = await fetch('/api/tradedb/import-new-coins-trades', { method: 'POST' });
      const data = await r.json();
      if (data.ok) {
        setImportMsg(`OK — ${data.imported} trade importati (${(data.coins ?? []).join(', ')})`);
      } else {
        setImportMsg(`Errore: ${data.detail ?? r.status}`);
      }
    } catch (e) {
      setImportMsg(`Errore: ${String(e)}`);
    }
  }

  const sortedResults = gate?.results
    ? [...gate.results].sort((a, b) =>
        (STATUS_ORDER[worstStatus(a)] ?? 9) - (STATUS_ORDER[worstStatus(b)] ?? 9))
    : [];

  // Gate: stesso privilegio di Tifi 4.0 (tifide_access: true in Clerk public metadata)
  if (!isLoaded) {
    return <div style={{ background: 'var(--color-void)', minHeight: '100vh' }} />;
  }
  if (user?.publicMetadata?.tifide_access !== true) {
    return (
      <div style={{ background: 'var(--color-void)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.5em', color: 'var(--color-short-bright)', textTransform: 'uppercase', display: 'block', marginBottom: '16px' }}>
            Accesso non autorizzato
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-text-dim)' }}>
            Questa pagina richiede privilegi amministratore.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--color-void)', minHeight: '100vh', padding: '80px 32px', color: 'var(--color-text)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '48px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.5em', color: 'var(--color-cyan)', textTransform: 'uppercase', display: 'block', marginBottom: '12px' }}>
            Sistema interno
          </span>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 300, color: 'var(--color-gold)', letterSpacing: '0.2em', margin: 0 }}>
            Admin
          </h1>
        </div>

        {/* Avviso: posizione live_v2 senza stop-loss su HL */}
        {unprotectedPositions.length > 0 && (
          <div
            className="cassandra-card cassandra-card-corners"
            style={{ padding: '20px 28px', marginBottom: '32px', border: '1px solid var(--color-short-bright)' }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.3em',
                textTransform: 'uppercase', color: 'var(--color-short-bright)', display: 'block', marginBottom: '10px',
              }}
            >
              ⚠ Tifi 4.0 — stop-loss non piazzato su HL
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {unprotectedPositions.map(p => (
                <span key={p.asset} style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-text)' }}>
                  {p.asset} {p.side} — entry {p.entry_px} — scoperta da{' '}
                  {p.sl_unprotected_seconds != null ? `${Math.round(p.sl_unprotected_seconds)}s` : '—'}
                  {p.scenario ? ` — ${p.scenario}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Daily Update Status */}
        <div className="cassandra-card cassandra-card-corners" style={{ padding: '28px', marginBottom: '32px' }}>
          <span className="cassandra-panel-header">DAILY UPDATE</span>
          <div style={{ marginTop: '16px', display: 'flex', gap: '40px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Ultimo run', value: fmtDate(status?.daily_update.last_run ?? null) },
                { label: 'Coin OK',    value: status?.daily_update.last_run_coins_ok != null ? String(status.daily_update.last_run_coins_ok) : '—' },
                { label: 'Righe aggiunte', value: status?.daily_update.last_run_rows_added != null ? String(status.daily_update.last_run_rows_added) : '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', gap: '16px', alignItems: 'baseline', borderBottom: '1px solid var(--color-text-faint)', paddingBottom: '6px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--color-text-dim)', minWidth: '120px' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--color-text)' }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{ marginLeft: 'auto' }}>
              {status?.daily_update.is_running ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-long-bright)', animation: 'cassandraPulse 1.6s ease-in-out infinite', display: 'inline-block' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-long-bright)', letterSpacing: '0.2em' }}>IN ESECUZIONE</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                  <button
                    onClick={triggerRun}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', background: 'var(--color-cyan)', color: 'var(--color-void)', border: 'none', padding: '10px 20px', cursor: 'pointer', transition: 'background 200ms ease' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-cyan-bright)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-cyan)'; }}
                  >
                    Esegui ora
                  </button>
                  {runMsg && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-dim)' }}>{runMsg}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Aggiungi Nuova Coin */}
        <div className="cassandra-card cassandra-card-corners" style={{ padding: '28px', marginBottom: '32px' }}>
          <span className="cassandra-panel-header">AGGIUNGI NUOVA COIN</span>
          <div style={{ marginTop: '8px', marginBottom: '16px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-dim)', lineHeight: 1.8 }}>
            Download OHLCV 2y → backtest → import trade → genome update
          </div>
          <div style={{ marginBottom: '20px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-gold)', opacity: 0.7, lineHeight: 1.7, padding: '10px 14px', border: '1px solid rgba(201,168,76,0.2)', background: 'rgba(201,168,76,0.04)' }}>
            Nota: le statistiche Tifide/Costellazioni non vengono aggiornate automaticamente — dopo l&apos;aggiunta della coin bisogna rieseguire export_period_summary.py localmente e caricare via upload-period-summary. Il download può durare 20-40 min per 2 anni di dati.
          </div>

          {/* Input + button */}
          {!addCoinStatus?.running && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
              <input
                value={newCoin}
                onChange={e => setNewCoin(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && triggerAddCoin()}
                placeholder="Es. KPEPE"
                maxLength={12}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: '13px',
                  background: 'var(--color-surface)', color: 'var(--color-text)',
                  border: '1px solid var(--color-border)', padding: '8px 14px',
                  outline: 'none', width: '140px', letterSpacing: '0.05em', textTransform: 'uppercase',
                }}
              />
              <button
                onClick={triggerAddCoin}
                disabled={!newCoin.trim()}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.25em',
                  textTransform: 'uppercase', background: 'var(--color-cyan)',
                  color: 'var(--color-void)', border: 'none', padding: '10px 20px',
                  cursor: newCoin.trim() ? 'pointer' : 'default',
                  opacity: newCoin.trim() ? 1 : 0.4, transition: 'background 200ms ease',
                }}
                onMouseEnter={e => { if (newCoin.trim()) e.currentTarget.style.background = 'var(--color-cyan-bright)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-cyan)'; }}
              >
                Avvia pipeline
              </button>
            </div>
          )}

          {/* Progress */}
          {addCoinStatus && (
            <div style={{ marginTop: '12px' }}>
              {/* Steps */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {(addCoinStatus.steps_total ?? ['download_ohlcv', 'backtest', 'import_trades', 'genome']).map(step => {
                  const done  = addCoinStatus.steps_done.includes(step);
                  const active = addCoinStatus.step === step && addCoinStatus.running;
                  const color  = done
                    ? 'var(--color-long-bright)'
                    : active
                      ? 'var(--color-gold)'
                      : 'var(--color-text-faint)';
                  return (
                    <div key={step} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0, animation: active ? 'cassandraPulse 1.6s ease-in-out infinite' : 'none' }} />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.2em', textTransform: 'uppercase', color }}>{step.replace(/_/g, ' ')}</span>
                    </div>
                  );
                })}
                {addCoinStatus.step === 'done' && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-long-bright)', letterSpacing: '0.2em' }}>
                    ✓ COMPLETATO{addCoinStatus.coin ? ` — ${addCoinStatus.coin}` : ''}
                  </span>
                )}
              </div>

              {/* Error */}
              {addCoinStatus.error && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-short-bright)', padding: '10px 14px', border: '1px solid rgba(168,61,61,0.3)', marginBottom: '12px', whiteSpace: 'pre-wrap' }}>
                  {addCoinStatus.error}
                </div>
              )}

              {/* Log */}
              {addCoinStatus.log.length > 0 && (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-dim)',
                  background: 'rgba(0,0,0,0.3)', border: '1px solid var(--color-border-dim)',
                  padding: '12px', maxHeight: '200px', overflowY: 'auto',
                  lineHeight: 1.7, whiteSpace: 'pre-wrap',
                }}>
                  {addCoinStatus.log.slice(-60).join('\n')}
                </div>
              )}

              {/* Restart button if done or error */}
              {!addCoinStatus.running && (addCoinStatus.step === 'done' || addCoinStatus.error) && (
                <div style={{ marginTop: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <input
                    value={newCoin}
                    onChange={e => setNewCoin(e.target.value.toUpperCase())}
                    placeholder="Nuova coin..."
                    maxLength={12}
                    style={{
                      fontFamily: 'var(--font-mono)', fontSize: '13px',
                      background: 'var(--color-surface)', color: 'var(--color-text)',
                      border: '1px solid var(--color-border)', padding: '8px 14px',
                      outline: 'none', width: '140px', textTransform: 'uppercase',
                    }}
                  />
                  <button onClick={triggerAddCoin} disabled={!newCoin.trim()}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', background: 'transparent', color: 'var(--color-cyan)', border: '1px solid var(--color-cyan)', padding: '8px 16px', cursor: 'pointer' }}>
                    Avvia nuova
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Import Nuove Coin */}
        <div className="cassandra-card cassandra-card-corners" style={{ padding: '28px', marginBottom: '32px' }}>
          <span className="cassandra-panel-header">IMPORT NUOVE COIN</span>
          <div style={{ marginTop: '8px', marginBottom: '16px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-dim)' }}>
            Importa i trade da bt_new_coins_2y.parquet nel DB (XLM · RENDER · AERO · SKY)
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={triggerImportNewCoins}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', background: 'transparent', color: 'var(--color-cyan)', border: '1px solid var(--color-cyan)', padding: '8px 16px', cursor: 'pointer' }}>
              Import Nuove Coin
            </button>
            {importMsg && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-dim)' }}>{importMsg}</span>
            )}
          </div>
        </div>

        {/* Genome Rebuild */}
        <div className="cassandra-card cassandra-card-corners" style={{ padding: '28px', marginBottom: '32px' }}>
          <span className="cassandra-panel-header">GENOME REBUILD</span>
          <div style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => triggerGenomeRebuild('update')}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', background: 'transparent', color: 'var(--color-cyan)', border: '1px solid var(--color-cyan)', padding: '8px 16px', cursor: 'pointer' }}>
              Update OHLCV (~90s)
            </button>
            <button onClick={() => triggerGenomeRebuild('full')}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', background: 'transparent', color: 'var(--color-gold)', border: '1px solid rgba(201,168,76,0.4)', padding: '8px 16px', cursor: 'pointer' }}>
              Full Rebuild (~20min)
            </button>
            <button onClick={() => triggerGenomeRebuild('full', 'XLM,RENDER,AERO,SKY')}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.25em', textTransform: 'uppercase', background: 'transparent', color: 'var(--color-gold)', border: '1px solid rgba(201,168,76,0.4)', padding: '8px 16px', cursor: 'pointer' }}>
              + Nuove Coin (XLM RENDER AERO SKY)
            </button>
            {genomeMsg && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-dim)' }}>{genomeMsg}</span>
            )}
          </div>
        </div>

        {/* Help Content Editor */}
        <div className="cassandra-card cassandra-card-corners" style={{ padding: '28px', marginBottom: '32px' }}>
          <span className="cassandra-panel-header">CONOSCI CASSANDRA — LAYER SPIEGAZIONI</span>
          <div style={{ marginTop: '8px', marginBottom: '20px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-dim)' }}>
            Markdown supportato: # Titolo · ## Sottotitolo · **grassetto** · *corsivo* · - lista
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '20px', alignItems: 'start' }}>
            {/* Lista chiavi esistenti */}
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-dim)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px' }}>
                Chiavi esistenti ({helpKeys.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '320px', overflowY: 'auto' }}>
                {helpKeys.map(k => (
                  <button key={k.key} onClick={() => loadHelpContent(k.key)}
                    style={{
                      fontFamily: 'var(--font-mono)', fontSize: '10px', textAlign: 'left',
                      background: helpKey === k.key ? 'rgba(201,168,76,0.10)' : 'transparent',
                      color: helpKey === k.key ? 'var(--color-gold)' : 'var(--color-text-dim)',
                      border: '1px solid ' + (helpKey === k.key ? 'rgba(201,168,76,0.3)' : 'transparent'),
                      padding: '6px 10px', cursor: 'pointer', width: '100%',
                    }}>
                    {k.key}
                    <span style={{ float: 'right', opacity: 0.5, fontSize: '9px' }}>{k.chars}c</span>
                  </button>
                ))}
                {helpKeys.length === 0 && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text-faint)', padding: '8px' }}>
                    Nessun contenuto ancora.
                  </div>
                )}
              </div>
            </div>

            {/* Editor */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  value={helpKey}
                  onChange={e => { setHelpKey(e.target.value); setHelpMsg(''); }}
                  placeholder="chiave (es. dna/scenario)"
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: '12px', flex: 1,
                    background: 'var(--color-surface)', color: 'var(--color-text)',
                    border: '1px solid var(--color-border)', padding: '8px 12px', outline: 'none',
                  }}
                />
                <button onClick={saveHelpContent} disabled={helpSaving || !helpKey.trim()}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.25em',
                    textTransform: 'uppercase', background: 'transparent',
                    color: 'var(--color-gold)', border: '1px solid rgba(201,168,76,0.4)',
                    padding: '8px 16px', cursor: helpSaving ? 'default' : 'pointer', opacity: helpSaving ? 0.5 : 1,
                  }}>
                  {helpSaving ? '...' : 'Salva'}
                </button>
              </div>
              <textarea
                value={helpContent}
                onChange={e => { setHelpContent(e.target.value); setHelpMsg(''); }}
                placeholder={'# Titolo sezione\n\nScrivi la spiegazione qui...\n\n- Punto 1\n- Punto 2\n\n**Nota:** testo in evidenza'}
                rows={14}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: 1.7,
                  background: 'rgba(0,0,0,0.2)', color: 'var(--color-text)',
                  border: '1px solid var(--color-border)', padding: '12px 14px',
                  outline: 'none', resize: 'vertical', width: '100%',
                }}
              />
              {helpMsg && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px',
                  color: helpMsg.startsWith('Errore') ? 'var(--color-short-bright)' : 'var(--color-long-bright)' }}>
                  {helpMsg}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Gate Monitor */}
        <div className="cassandra-card cassandra-card-corners" style={{ padding: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <span className="cassandra-panel-header" style={{ position: 'static', background: 'none', padding: 0 }}>GATE MONITOR</span>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {gate?.generated_at && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-dim)' }}>
                  {fmtDate(gate.generated_at)}
                </span>
              )}
              <button
                onClick={loadGate}
                disabled={gateLoading}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.25em', textTransform: 'uppercase', background: 'transparent', color: gateLoading ? 'var(--color-text-dim)' : 'var(--color-gold)', border: '1px solid var(--color-border)', padding: '6px 14px', cursor: gateLoading ? 'default' : 'pointer' }}
              >
                {gateLoading ? '...' : 'Aggiorna'}
              </button>
            </div>
          </div>

          {error && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-short-bright)', padding: '12px', border: '1px solid rgba(168,61,61,0.3)', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          {gateLoading && !gate && (
            <div className="shimmer" style={{ height: '200px' }} />
          )}

          {sortedResults.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                <thead>
                  <tr>
                    {['Scenario', 'Baseline n / WR / PF', '30d', '60d', '90d'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--color-border-dim)', fontSize: '9px', letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--color-cyan)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedResults.map((r) => {
                    const ws = worstStatus(r);
                    return (
                      <tr key={r.scenario} style={{ borderBottom: '1px solid var(--color-text-faint)' }}>
                        <td style={{ padding: '10px 12px', maxWidth: '280px' }}>
                          <div style={{ color: 'var(--color-text)', lineHeight: 1.5 }}>{r.label}</div>
                          {r.notes && (
                            <div style={{ fontSize: '9px', color: 'var(--color-text-dim)', marginTop: '2px' }}>{r.notes}</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--color-text-dim)', whiteSpace: 'nowrap' }}>
                          n={r.baseline.n.toLocaleString()} · {fmtWr(r.baseline.wr_pct)} · {fmtPf(r.baseline.pf)}
                        </td>
                        {['30', '60', '90'].map(days => {
                          const w = r.windows[days];
                          if (!w) return <td key={days} style={{ padding: '10px 12px', color: 'var(--color-text-faint)' }}>—</td>;
                          const s = w.evaluation.status;
                          const c = STATUS_COLOR[s] ?? 'var(--color-text-dim)';
                          return (
                            <td key={days} style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                              <span style={{ color: c, fontWeight: s !== 'OK' ? 500 : 400 }}>
                                {STATUS_ICON[s]}
                              </span>
                              <span style={{ color: 'var(--color-text-dim)', marginLeft: '6px' }}>
                                n={w.current.n} · {fmtWr(w.current.wr_pct)} · {fmtPf(w.current.pf)}
                              </span>
                              {w.evaluation.flags.length > 0 && (
                                <div style={{ fontSize: '9px', color: c, marginTop: '2px', maxWidth: '200px', lineHeight: 1.4 }}>
                                  {w.evaluation.flags[0]}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Legenda */}
              <div style={{ display: 'flex', gap: '24px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--color-border-dim)' }}>
                {Object.entries(STATUS_ICON).map(([s, icon]) => (
                  <span key={s} style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: STATUS_COLOR[s] }}>
                    {icon} {s}
                  </span>
                ))}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-faint)', marginLeft: 'auto' }}>
                  Le soglie non vengono modificate automaticamente
                </span>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
