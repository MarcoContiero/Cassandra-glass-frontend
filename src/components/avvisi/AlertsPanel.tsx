'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';

type AlertEvent = {
  id: number;
  user_id: string;
  filter_id: number | null;
  modulo: string;
  coin: string | null;
  timestamp_evento: number;
  dettaglio_match: string;
  letto: number;
};

type Props = {
  onUnreadChange?: (count: number) => void;
};

function fmtTs(ms: number): string {
  return new Date(ms).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function moduloLabel(m: string): string {
  return { orione: 'Orione', argonauta: 'Argonauta', agema: 'Agema', pizia: 'Pizia' }[m] ?? m;
}

function WeeklyReportEmailButton({ eventId }: { eventId: number }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function handleSend() {
    if (!email.trim()) return;
    setStatus('sending');
    try {
      const res = await fetch(`/api/pizia/weekly-report/${eventId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      setStatus(res.ok ? 'sent' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-dim)', marginTop: '8px' }}>
        Email inviata.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }} onClick={e => e.stopPropagation()}>
      <input
        type="email"
        placeholder="la tua email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{
          fontFamily: 'var(--font-mono)', fontSize: '10px',
          background: 'transparent', border: '1px solid var(--color-border)',
          color: 'var(--color-text)', padding: '4px 8px', flex: 1,
        }}
      />
      <button
        onClick={handleSend}
        disabled={status === 'sending' || !email.trim()}
        style={{
          fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--color-gold)',
          background: 'transparent', border: '1px solid rgba(201,168,76,0.4)',
          padding: '4px 10px', cursor: status === 'sending' ? 'default' : 'pointer',
          opacity: status === 'sending' || !email.trim() ? 0.5 : 1,
        }}
      >
        {status === 'sending' ? 'Invio…' : 'Invia via email'}
      </button>
      {status === 'error' && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: '#a83d3d' }}>
          Errore, riprova
        </span>
      )}
    </div>
  );
}

export default function AlertsPanel({ onUnreadChange }: Props) {
  const { user } = useUser();
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const userId = user?.id ?? null;

  const fetchEvents = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch('/api/alerts/events?limit=100', {
        headers: { 'X-User-Id': userId },
      });
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
        const unread = data.filter((e: AlertEvent) => !e.letto).length;
        onUnreadChange?.(unread);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [userId, onUnreadChange]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  async function markRead(id: number) {
    if (!userId) return;
    await fetch(`/api/alerts/events/${id}/read`, {
      method: 'POST',
      headers: { 'X-User-Id': userId },
    });
    setEvents(prev => prev.map(e => e.id === id ? { ...e, letto: 1 } : e));
    const newUnread = events.filter(e => e.id !== id && !e.letto).length;
    onUnreadChange?.(newUnread);
  }

  async function markAllRead() {
    if (!userId) return;
    await fetch('/api/alerts/events/read-all', {
      method: 'POST',
      headers: { 'X-User-Id': userId },
    });
    setEvents(prev => prev.map(e => ({ ...e, letto: 1 })));
    onUnreadChange?.(0);
  }

  const unreadCount = events.filter(e => !e.letto).length;

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', color: 'var(--color-text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.4em', color: 'var(--color-text-dim)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Servizio Alert
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 300, color: 'var(--color-gold)', margin: 0 }}>
            I tuoi alert
          </h2>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.2em',
              color: 'var(--color-text-dim)', textTransform: 'uppercase',
              background: 'transparent', border: '1px solid var(--color-border)',
              padding: '6px 12px', cursor: 'pointer',
            }}
          >
            Segna tutti come letti
          </button>
        )}
      </div>

      {/* Disclaimer */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.15em',
        color: 'var(--color-text-dim)', lineHeight: 1.6, marginBottom: '20px',
        padding: '10px 14px', border: '1px solid var(--color-border)',
      }}>
        Ogni alert è una segnalazione di scansione su criteri configurati — non un consiglio operativo.
      </div>

      {/* Lista eventi */}
      {loading ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-dim)', opacity: 0.5 }}>
          Caricamento…
        </div>
      ) : events.length === 0 ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-dim)', opacity: 0.5, lineHeight: 1.8 }}>
          Nessun alert ancora.<br />
          Configura i tuoi filtri per ricevere segnalazioni quando i moduli rilevano qualcosa che ti interessa.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {events.map(ev => {
            let dettaglio: Record<string, any> = {};
            try { dettaglio = JSON.parse(ev.dettaglio_match); } catch { /* ignore */ }

            return (
              <div
                key={ev.id}
                onClick={() => !ev.letto && markRead(ev.id)}
                style={{
                  background: ev.letto ? 'transparent' : 'rgba(201,168,76,0.04)',
                  border: `1px solid ${ev.letto ? 'var(--color-border)' : 'rgba(201,168,76,0.25)'}`,
                  padding: '12px 16px',
                  cursor: ev.letto ? 'default' : 'pointer',
                  transition: 'border-color 200ms ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  {!ev.letto && (
                    <span style={{
                      width: '5px', height: '5px', borderRadius: '50%',
                      background: 'var(--color-gold)', flexShrink: 0,
                      boxShadow: '0 0 6px var(--color-gold)',
                    }} />
                  )}
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.25em',
                    textTransform: 'uppercase', color: 'var(--color-gold)',
                    border: '1px solid rgba(201,168,76,0.4)', padding: '1px 8px',
                  }}>
                    {moduloLabel(ev.modulo)}
                  </span>
                  {ev.coin && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--color-text)' }}>
                      {ev.coin}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-text-dim)' }}>
                    {fmtTs(ev.timestamp_evento)}
                  </span>
                </div>

                <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 300, color: 'var(--color-text)', lineHeight: 1.5 }}>
                  {dettaglio.messaggio ? (
                    dettaglio.messaggio
                  ) : (
                    <>
                      {dettaglio.pattern && <>Pattern: <strong>{dettaglio.pattern}</strong></>}
                      {dettaglio.score != null && <> · Score {dettaglio.score}</>}
                      {dettaglio.direction && (
                        <span style={{ color: dettaglio.direction === 'LONG' ? 'var(--color-long-bright, #3da866)' : 'var(--color-short-bright, #a83d3d)', marginLeft: '6px', fontSize: '11px' }}>
                          {dettaglio.direction === 'LONG' ? 'rialzista' : 'ribassista'}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {dettaglio.kind === 'weekly_report' && (
                  <WeeklyReportEmailButton eventId={ev.id} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
