'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';

export type JournalContesto = {
  bias_per_tf?: Record<string, string>;   // { "1h": "rialzista", "4h": "ribassista", ... }
  scenari_attivi?: string[];
  prezzo_snapshot?: number;
};

interface Props {
  coin: string;
  prezzoCorrente?: number;
  contesto?: JournalContesto;
  onClose: () => void;
  onSaved?: () => void;
}

type Stato = 'idle' | 'saving' | 'ok' | 'error';

export default function JournalModal({ coin, prezzoCorrente, contesto, onClose, onSaved }: Props) {
  const { user } = useUser();
  const [direzione, setDirezione] = useState<'rialzista' | 'ribassista'>('rialzista');
  const [entryPrice, setEntryPrice] = useState<string>(prezzoCorrente ? String(prezzoCorrente) : '');
  const [nota, setNota] = useState('');
  const [stato, setStato] = useState<Stato>('idle');
  const [errMsg, setErrMsg] = useState('');
  const priceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => priceRef.current?.select(), 80);
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function salva() {
    if (!user?.id) return;
    const price = parseFloat(entryPrice.replace(',', '.'));
    if (!price || price <= 0) {
      setErrMsg('Inserisci un prezzo di ingresso valido');
      return;
    }

    setStato('saving');
    setErrMsg('');

    const contestoFull: JournalContesto = {
      ...contesto,
      prezzo_snapshot: price,
    };

    try {
      const res = await fetch('/api/journal/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': user.id,
        },
        body: JSON.stringify({
          coin: coin.toUpperCase(),
          direzione,
          entry_price: price,
          note: nota.trim(),
          contesto: contestoFull,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `HTTP ${res.status}`);
      }

      setStato('ok');
      onSaved?.();
      setTimeout(onClose, 900);
    } catch (e: any) {
      setStato('error');
      setErrMsg(e.message || 'Errore durante il salvataggio');
    }
  }

  const biasEntries = contesto?.bias_per_tf ? Object.entries(contesto.bias_per_tf) : [];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(2,6,18,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--color-surface, #0e0e1a)',
        border: '1px solid var(--color-border, rgba(201,168,76,0.2))',
        borderRadius: '2px',
        padding: '28px 28px 24px',
        width: '100%', maxWidth: '420px',
        display: 'flex', flexDirection: 'column', gap: '18px',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.2em',
              textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: '4px' }}>
              Journal — {coin.toUpperCase()}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '17px',
              fontWeight: 300, color: 'var(--color-gold)' }}>
              Log operazione
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-dim)', fontSize: '18px', lineHeight: 1, padding: '2px 4px' }}>
            ×
          </button>
        </div>

        {/* Bias snapshot (se disponibile) */}
        {biasEntries.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {biasEntries.map(([tf, bias]) => (
              <span key={tf} style={{
                fontFamily: 'var(--font-mono)', fontSize: '10px', padding: '2px 8px',
                borderRadius: '2px',
                background: bias === 'rialzista' ? 'rgba(46,184,122,0.12)' : bias === 'ribassista' ? 'rgba(239,100,100,0.12)' : 'rgba(255,255,255,0.05)',
                color: bias === 'rialzista' ? '#2EB87A' : bias === 'ribassista' ? '#EF6464' : 'var(--color-text-dim)',
                border: `1px solid ${bias === 'rialzista' ? 'rgba(46,184,122,0.25)' : bias === 'ribassista' ? 'rgba(239,100,100,0.25)' : 'rgba(255,255,255,0.08)'}`,
              }}>
                {tf} · {bias}
              </span>
            ))}
          </div>
        )}

        {/* Direzione */}
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.15em',
            textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: '8px' }}>
            Direzione
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['rialzista', 'ribassista'] as const).map(d => (
              <button
                key={d}
                onClick={() => setDirezione(d)}
                style={{
                  flex: 1, padding: '9px 0', border: '1px solid',
                  borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                  fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase',
                  fontWeight: direzione === d ? 700 : 400,
                  background: direzione === d
                    ? d === 'rialzista' ? 'rgba(46,184,122,0.15)' : 'rgba(239,100,100,0.15)'
                    : 'transparent',
                  borderColor: direzione === d
                    ? d === 'rialzista' ? 'rgba(46,184,122,0.5)' : 'rgba(239,100,100,0.5)'
                    : 'rgba(255,255,255,0.1)',
                  color: direzione === d
                    ? d === 'rialzista' ? '#2EB87A' : '#EF6464'
                    : 'var(--color-text-dim)',
                  transition: 'all 150ms',
                }}
              >
                {d === 'rialzista' ? '▲ Rialzista' : '▼ Ribassista'}
              </button>
            ))}
          </div>
        </div>

        {/* Entry price */}
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.15em',
            textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: '8px' }}>
            Prezzo di ingresso
          </div>
          <input
            ref={priceRef}
            type="text"
            inputMode="decimal"
            value={entryPrice}
            onChange={e => setEntryPrice(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') salva(); }}
            placeholder="es. 104500"
            style={{
              width: '100%', padding: '9px 12px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '2px', color: 'var(--color-text)',
              fontFamily: 'var(--font-mono)', fontSize: '14px',
              fontVariantNumeric: 'tabular-nums',
              outline: 'none',
            }}
          />
        </div>

        {/* Nota */}
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.15em',
            textTransform: 'uppercase', color: 'var(--color-text-dim)', marginBottom: '8px' }}>
            Nota (opzionale)
          </div>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder="Motivazione, setup, osservazioni..."
            rows={3}
            style={{
              width: '100%', padding: '9px 12px', resize: 'vertical',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '2px', color: 'var(--color-text)',
              fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: 1.6,
              outline: 'none',
            }}
          />
        </div>

        {/* Errore */}
        {errMsg && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px',
            color: '#EF6464', padding: '8px 12px',
            background: 'rgba(239,100,100,0.08)',
            border: '1px solid rgba(239,100,100,0.2)', borderRadius: '2px' }}>
            {errMsg}
          </div>
        )}

        {/* Azioni */}
        <div style={{ display: 'flex', gap: '8px', paddingTop: '4px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '2px', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: '11px',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--color-text-dim)',
            }}
          >
            Annulla
          </button>
          <button
            onClick={salva}
            disabled={stato === 'saving' || stato === 'ok'}
            style={{
              flex: 2, padding: '10px',
              background: stato === 'ok' ? 'rgba(46,184,122,0.2)' : 'rgba(201,168,76,0.12)',
              border: `1px solid ${stato === 'ok' ? 'rgba(46,184,122,0.4)' : 'rgba(201,168,76,0.35)'}`,
              borderRadius: '2px', cursor: stato === 'saving' ? 'wait' : 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: '11px',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: stato === 'ok' ? '#2EB87A' : 'var(--color-gold)',
              opacity: stato === 'saving' ? 0.6 : 1,
              transition: 'all 200ms',
            }}
          >
            {stato === 'saving' ? 'Salvo...' : stato === 'ok' ? '✓ Salvato' : 'Log operazione'}
          </button>
        </div>

      </div>
    </div>
  );
}
