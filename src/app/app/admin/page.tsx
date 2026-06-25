'use client';

import { useEffect, useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

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
  const [status, setStatus]         = useState<StatusResponse | null>(null);
  const [gate, setGate]             = useState<GateMonitorResponse | null>(null);
  const [gateLoading, setGateLoading] = useState(false);
  const [runMsg, setRunMsg]         = useState('');
  const [error, setError]           = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/status');
      if (r.ok) setStatus(await r.json());
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
  }, [loadStatus, loadGate]);

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

  const sortedResults = gate?.results
    ? [...gate.results].sort((a, b) =>
        (STATUS_ORDER[worstStatus(a)] ?? 9) - (STATUS_ORDER[worstStatus(b)] ?? 9))
    : [];

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
