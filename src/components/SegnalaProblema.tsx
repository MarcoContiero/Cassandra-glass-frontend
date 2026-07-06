'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';

type State = 'idle' | 'sending' | 'ok' | 'error';

export default function SegnalaProblema() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [descrizione, setDescrizione] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errMsg, setErrMsg] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setState('idle');
      setErrMsg('');
      setTimeout(() => textareaRef.current?.focus(), 120);
    } else {
      setDescrizione('');
    }
  }, [open]);

  // Chiudi con Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  async function submit() {
    if (!descrizione.trim()) return;
    setState('sending');
    setErrMsg('');
    try {
      const res = await fetch('/api/segnala', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: user?.fullName || user?.firstName || undefined,
          userEmail: user?.primaryEmailAddress?.emailAddress || undefined,
          userId: user?.id || undefined,
          descrizione: descrizione.trim(),
          pagina: typeof window !== 'undefined' ? window.location.pathname : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setState('error'); setErrMsg(data.error || 'Errore di invio'); return; }
      setState('ok');
    } catch {
      setState('error');
      setErrMsg('Errore di rete — riprova');
    }
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: 'rgba(2,2,14,0.55)',
    backdropFilter: 'blur(2px)',
    WebkitBackdropFilter: 'blur(2px)',
    zIndex: 300,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px',
  };

  const panelStyle: React.CSSProperties = {
    background: 'var(--color-surface, #0e0e1a)',
    border: '1px solid var(--color-border, rgba(201,168,76,0.2))',
    padding: '28px 28px 24px',
    width: '100%',
    maxWidth: '460px',
    position: 'relative',
  };

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '9px',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'rgba(2,2,14,0.45)',
          background: 'transparent',
          border: '1px solid rgba(2,2,14,0.15)',
          padding: '0 10px',
          height: '32px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          transition: 'color 200ms ease, border-color 200ms ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.color = 'var(--color-void)';
          e.currentTarget.style.borderColor = 'rgba(2,2,14,0.4)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.color = 'rgba(2,2,14,0.45)';
          e.currentTarget.style.borderColor = 'rgba(2,2,14,0.15)';
        }}
      >
        Segnalazioni
      </button>

      {/* Modal */}
      {open && (
        <div style={overlayStyle} onClick={() => setOpen(false)}>
          <div style={panelStyle} onClick={e => e.stopPropagation()}>
            {/* Close */}
            <button
              onClick={() => setOpen(false)}
              aria-label="Chiudi"
              style={{
                position: 'absolute', top: '14px', right: '14px',
                background: 'transparent', border: 'none',
                color: 'var(--color-text-dim)', fontSize: '13px',
                cursor: 'pointer', padding: '4px',
              }}
            >
              ✕
            </button>

            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: '9px',
              letterSpacing: '0.4em', textTransform: 'uppercase',
              color: 'var(--color-text-dim)', marginBottom: '6px',
            }}>
              Supporto
            </div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: '17px',
              fontWeight: 300, color: 'var(--color-gold)', margin: '0 0 20px',
            }}>
              Segnala un problema
            </h2>

            {state === 'ok' ? (
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: '14px',
                fontWeight: 300, color: 'var(--color-text)', lineHeight: 1.7,
              }}>
                Ricevuto — ti risponderemo su{' '}
                <span style={{ color: 'var(--color-gold)' }}>
                  {user?.primaryEmailAddress?.emailAddress || 'la tua email'}
                </span>
                .
              </div>
            ) : (
              <>
                {/* User info (read-only) */}
                {(user?.fullName || user?.primaryEmailAddress) && (
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '10px',
                    color: 'var(--color-text-dim)', marginBottom: '16px',
                    letterSpacing: '0.08em', lineHeight: 1.6,
                  }}>
                    {user.fullName && <span>{user.fullName} · </span>}
                    {user?.primaryEmailAddress?.emailAddress}
                  </div>
                )}

                {/* Textarea */}
                <label style={{
                  fontFamily: 'var(--font-mono)', fontSize: '9px',
                  letterSpacing: '0.3em', textTransform: 'uppercase',
                  color: 'var(--color-text-dim)', display: 'block',
                  marginBottom: '6px',
                }}>
                  Descrivi il problema
                </label>
                <textarea
                  ref={textareaRef}
                  value={descrizione}
                  onChange={e => setDescrizione(e.target.value)}
                  placeholder="Cosa è successo? Dove? Cosa ti aspettavi?"
                  rows={5}
                  disabled={state === 'sending'}
                  style={{
                    width: '100%',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    lineHeight: 1.6,
                    padding: '10px 12px',
                    resize: 'vertical',
                    outline: 'none',
                    opacity: state === 'sending' ? 0.5 : 1,
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                />

                {errMsg && (
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: '10px',
                    color: 'var(--color-short-bright, #a83d3d)',
                    marginTop: '8px',
                  }}>
                    {errMsg}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                  <button
                    onClick={submit}
                    disabled={!descrizione.trim() || state === 'sending'}
                    style={{
                      fontFamily: 'var(--font-mono)', fontSize: '10px',
                      letterSpacing: '0.2em', textTransform: 'uppercase',
                      background: 'var(--color-void)',
                      color: 'var(--color-gold)',
                      border: 'none', padding: '8px 20px',
                      cursor: !descrizione.trim() || state === 'sending' ? 'not-allowed' : 'pointer',
                      opacity: !descrizione.trim() || state === 'sending' ? 0.4 : 1,
                      transition: 'opacity 200ms ease',
                    }}
                  >
                    {state === 'sending' ? 'Invio…' : 'Invia'}
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    style={{
                      fontFamily: 'var(--font-mono)', fontSize: '10px',
                      letterSpacing: '0.2em', textTransform: 'uppercase',
                      color: 'var(--color-text-dim)', background: 'transparent',
                      border: '1px solid var(--color-border)',
                      padding: '8px 14px', cursor: 'pointer',
                    }}
                  >
                    Annulla
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
