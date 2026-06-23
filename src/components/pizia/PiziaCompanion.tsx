'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PiziaOrb, { type OrbState } from './PiziaOrb';
import { posthog } from '@/lib/posthog';

type PiziaSize = 'ambient' | 'active' | 'expanded';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

interface Props {
  currentTab?: string;
  currentCoin?: string;
  currentTimeframe?: string;
  cassandraContext?: string;
}

const AMBIENT_TIMEOUT_MS = 22000;
const FALLBACK = 'Non ho accesso ai dati in tempo reale di questa scheda in questo momento — puoi controllare il valore aggiornato direttamente in dashboard.';

export default function PiziaCompanion({ currentTab, currentCoin, currentTimeframe, cassandraContext }: Props) {
  const [size, setSize] = useState<PiziaSize>('ambient');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [orbHovered, setOrbHovered] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const startAmbientTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      setSize(s => s === 'active' ? 'ambient' : s);
    }, AMBIENT_TIMEOUT_MS);
  }, []);

  useEffect(() => () => clearTimer(), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (size === 'expanded') setTimeout(() => inputRef.current?.focus(), 420);
  }, [size]);

  const handleOrbEnter = () => {
    setOrbHovered(true);
    if (size === 'ambient') { setSize('active'); startAmbientTimer(); }
  };

  const handleOrbLeave = () => setOrbHovered(false);

  const handleOrbClick = () => {
    if (size === 'expanded') {
      setSize('active');
      startAmbientTimer();
    } else {
      clearTimer();
      setSize('expanded');
    }
  };

  const handleOverlayClick = () => {
    setSize('active');
    startAmbientTimer();
  };

  const setError = (msg: string) =>
    setMessages(prev => {
      const upd = [...prev];
      const last = upd[upd.length - 1];
      if (last?.role === 'assistant') {
        upd[upd.length - 1] = { ...last, content: msg, streaming: false };
      }
      return upd;
    });

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const context: Record<string, string> = {};
    if (currentTab) context.scheda = currentTab;
    if (currentCoin) context.coin = currentCoin;
    if (currentTimeframe) context.timeframe = currentTimeframe;
    if (cassandraContext) context.analisi_corrente = cassandraContext;

    posthog.capture('pizia_message_sent', { tab: currentTab, message_length: text.length });

    const userMsg: Message = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages([...history, { role: 'assistant', content: '', streaming: true }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/pizia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(m => ({ role: m.role, content: m.content })),
          context: Object.keys(context).length > 0 ? context : null,
        }),
      });

      if (!res.ok) { setError(FALLBACK); return; }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          try {
            const payload = JSON.parse(raw);
            if (payload.done) break outer;
            if (payload.error) { setError(FALLBACK); break outer; }
            if (payload.text) {
              setMessages(prev => {
                const upd = [...prev];
                const last = upd[upd.length - 1];
                if (last?.role === 'assistant') {
                  upd[upd.length - 1] = { ...last, content: last.content + payload.text };
                }
                return upd;
              });
            }
          } catch { /* skip malformed chunk */ }
        }
      }
    } catch {
      setError(FALLBACK);
    } finally {
      setMessages(prev => {
        const upd = [...prev];
        const last = upd[upd.length - 1];
        if (last?.role === 'assistant') {
          upd[upd.length - 1] = { ...last, streaming: false };
        }
        return upd;
      });
      setLoading(false);
    }
  }, [input, loading, messages, currentTab, currentCoin, currentTimeframe, cassandraContext]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const isExpanded = size === 'expanded';
  const orbPx = isExpanded ? 72 : size === 'ambient' ? 40 : 56;
  const orbOpac = size === 'ambient' ? 0.55 : 1;
  const orbState: OrbState = loading ? 'thinking' : size === 'ambient' ? 'ambient' : 'active';

  const contextLine = [currentTab, currentCoin, currentTimeframe].filter(Boolean).join(' · ');

  return (
    <div data-pizia-root style={{ display: 'contents' }}>
      {/* ── Dim overlay ────────────────────────────────────────────────────── */}
      <div
        onClick={handleOverlayClick}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(2,2,14,0.28)',
          backdropFilter: 'blur(0.5px)',
          WebkitBackdropFilter: 'blur(0.5px)',
          zIndex: 190,
          opacity: isExpanded ? 1 : 0,
          pointerEvents: isExpanded ? 'auto' : 'none',
          transition: 'opacity 500ms ease',
        }}
      />

      {/* ── Close hint ─────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: 'var(--font-mono)',
          fontSize: '8px',
          letterSpacing: '0.3em',
          color: 'var(--color-text-faint)',
          textTransform: 'uppercase',
          zIndex: 201,
          opacity: isExpanded ? 1 : 0,
          transition: 'opacity 400ms ease 200ms',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Clicca fuori, o sull'orb, per chiudere
      </div>

      {/* ── Pizia field ────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          alignItems: isExpanded ? 'center' : 'flex-end',
          ...(isExpanded
            ? { bottom: '50%', right: '50%', transform: 'translate(50%, 50%)' }
            : { bottom: '24px', right: '24px', transform: 'translate(0, 0)' }),
          transition: 'bottom 420ms ease, right 420ms ease, transform 420ms ease',
        }}
      >
        {/* ── Orb ──────────────────────────────────────────────────────────── */}
        <button
          onMouseEnter={handleOrbEnter}
          onMouseLeave={handleOrbLeave}
          onClick={handleOrbClick}
          title="Pizia — L'Oracolo di Cassandra"
          style={{
            position: 'relative',
            width: `${orbPx}px`,
            height: `${orbPx}px`,
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
            opacity: orbOpac,
            marginBottom: isExpanded ? '28px' : 0,
            transition: 'width 420ms ease, height 420ms ease, opacity 350ms ease, margin-bottom 420ms ease',
            flexShrink: 0,
          }}
        >
          <PiziaOrb size={orbPx} state={orbState} />

          {/* Hover label */}
          {!isExpanded && (
            <span
              style={{
                position: 'absolute',
                right: `${orbPx + 12}px`,
                top: '50%',
                transform: orbHovered
                  ? 'translateY(-50%) translateX(0)'
                  : 'translateY(-50%) translateX(8px)',
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                letterSpacing: '0.2em',
                color: 'var(--color-text-dim)',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                opacity: orbHovered ? 1 : 0,
                transition: 'opacity 250ms ease, transform 250ms ease',
                pointerEvents: 'none',
              }}
            >
              Chiedi a Pizia
            </span>
          )}
        </button>

        {/* ── Floating content — no box ─────────────────────────────────────── */}
        <div
          style={{
            width: isExpanded ? '480px' : 0,
            maxWidth: isExpanded ? '480px' : 0,
            opacity: isExpanded ? 1 : 0,
            overflow: 'hidden',
            transition: 'max-width 500ms ease, opacity 400ms ease 100ms',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '28px',
            textAlign: 'center',
          }}
        >
          {/* Identity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '13px',
              letterSpacing: '0.35em',
              color: 'var(--color-gold)',
              textTransform: 'uppercase',
            }}>
              Pizia
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.25em',
              color: 'var(--color-text-dim)',
              textTransform: 'uppercase',
            }}>
              {contextLine || 'Cassandra vede · Pizia interpreta'}
            </div>
          </div>

          {/* Messages */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '22px',
            width: '100%',
            maxHeight: '320px',
            overflowY: 'auto',
            scrollbarWidth: 'none',
          }}>
            {messages.map((msg, i) =>
              msg.role === 'user' ? (
                <div
                  key={i}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--color-text-dim)',
                  }}
                >
                  {msg.content}
                </div>
              ) : (
                <div
                  key={i}
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '16px',
                    fontWeight: 300,
                    color: 'var(--color-text)',
                    lineHeight: 1.7,
                    maxWidth: '420px',
                    margin: '0 auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.content || (msg.streaming && (
                    <span style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      {[0, 1, 2].map(j => (
                        <span
                          key={j}
                          className={`pizia-dot pizia-dot-${j}`}
                          style={{
                            display: 'inline-block',
                            width: '4px',
                            height: '4px',
                            borderRadius: '50%',
                            background: 'var(--color-gold-dim)',
                          }}
                        />
                      ))}
                    </span>
                  ))}
                </div>
              )
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ width: '100%', maxWidth: '360px' }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Chiedi a Pizia…"
              disabled={loading}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                borderBottom: `1px solid ${
                  inputFocused
                    ? 'var(--color-gold)'
                    : 'rgba(201,168,76,0.25)'
                }`,
                color: 'var(--color-text)',
                fontFamily: 'var(--font-display)',
                fontSize: '14px',
                fontWeight: 300,
                textAlign: 'center',
                padding: '8px 0',
                letterSpacing: '0.02em',
                outline: 'none',
                opacity: loading ? 0.5 : 1,
                transition: 'border-color 300ms ease, opacity 200ms ease',
              }}
            />
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '8px',
              letterSpacing: '0.25em',
              color: 'var(--color-text-faint)',
              textTransform: 'uppercase',
              marginTop: '10px',
            }}>
              Invio per chiedere
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
