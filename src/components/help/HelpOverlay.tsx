'use client';

import React, { useEffect, useState, useCallback } from 'react';

// ── Markdown renderer minimale ────────────────────────────────────────────────

function inlineFmt(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i} style={{ color: 'var(--color-text)', fontWeight: 600 }}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('*') && p.endsWith('*'))
      return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

function parseMd(md: string): React.ReactNode {
  const lines = md.split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('# ')) {
      out.push(
        <h2 key={i} style={{ fontFamily: 'var(--font-decorative)', fontSize: 20, fontWeight: 300,
          color: 'var(--color-gold)', margin: '16px 0 6px' }}>
          {line.slice(2)}
        </h2>
      );
    } else if (line.startsWith('## ')) {
      out.push(
        <h3 key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600,
          color: 'var(--color-text-dim)', letterSpacing: '0.2em', textTransform: 'uppercase',
          margin: '14px 0 4px' }}>
          {line.slice(3)}
        </h3>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2));
        i++;
      }
      out.push(
        <ul key={`ul-${i}`} style={{ margin: '6px 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((item, j) => (
            <li key={j} style={{ fontFamily: 'var(--font-mono)', fontSize: 12,
              color: 'var(--color-text-dim)', lineHeight: 1.6 }}>
              {inlineFmt(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    } else if (line.trim() !== '') {
      out.push(
        <p key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 12,
          color: 'var(--color-text-dim)', lineHeight: 1.7, margin: '6px 0' }}>
          {inlineFmt(line)}
        </p>
      );
    }
    i++;
  }
  return <>{out}</>;
}

// ── Stele decorativa (header overlay) ────────────────────────────────────────

function SteleDecor() {
  return (
    <svg width="200" height="36" viewBox="0 0 200 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8,2 L192,2 C197,2 198,8 196,18 C198,28 197,34 192,34 L8,34 C3,34 2,28 4,18 C2,8 3,2 8,2 Z"
        stroke="rgba(201,168,76,0.45)" strokeWidth="1.2" fill="rgba(201,168,76,0.04)"/>
      <line x1="10" y1="18" x2="190" y2="18" stroke="rgba(201,168,76,0.3)" strokeWidth="0.7"/>
      <path d="M100,11 L105,18 L100,25 L95,18 Z" stroke="rgba(201,168,76,0.65)" strokeWidth="1" fill="rgba(201,168,76,0.12)"/>
      <path d="M60,14 L63,18 L60,22 L57,18 Z" stroke="rgba(201,168,76,0.35)" strokeWidth="0.8" fill="none"/>
      <path d="M140,14 L143,18 L140,22 L137,18 Z" stroke="rgba(201,168,76,0.35)" strokeWidth="0.8" fill="none"/>
      <circle cx="30" cy="18" r="1.5" fill="rgba(201,168,76,0.3)"/>
      <circle cx="170" cy="18" r="1.5" fill="rgba(201,168,76,0.3)"/>
      <circle cx="18" cy="18" r="0.8" fill="rgba(201,168,76,0.2)"/>
      <circle cx="182" cy="18" r="0.8" fill="rgba(201,168,76,0.2)"/>
    </svg>
  );
}

// ── Componente principale ─────────────────────────────────────────────────────

interface Props {
  helpKey: string;
  label?: string;
  onClose: () => void;
}

export default function HelpOverlay({ helpKey, label, onClose }: Props) {
  const [contentMd, setContentMd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/help/${helpKey}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { setContentMd(d.content_md || ''); setLoading(false); })
      .catch(() => { setContentMd(''); setLoading(false); });
  }, [helpKey]);

  const onBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(2,2,14,0.88)',
        backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '60px 20px 40px',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 520,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 0 80px rgba(201,168,76,0.07)',
          padding: '32px 28px 28px',
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Chiudi */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 14, right: 16,
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 16,
            color: 'var(--color-text-dim)', lineHeight: 1,
          }}
        >
          ✕
        </button>

        {/* Header stele */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 22 }}>
          <SteleDecor />
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.35em',
              color: 'var(--color-text-dim)', textTransform: 'uppercase', marginBottom: 8,
            }}>
              CONOSCI CASSANDRA
            </div>
            <div style={{
              fontFamily: 'var(--font-decorative)', fontSize: 22, fontWeight: 300,
              color: 'var(--color-gold)', lineHeight: 1,
            }}>
              {label || helpKey}
            </div>
          </div>
        </div>

        {/* Separatore */}
        <div style={{ height: 1, background: 'var(--color-border-dim)', marginBottom: 20 }} />

        {/* Contenuto */}
        {loading ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text-dim)',
            textAlign: 'center', padding: '20px 0' }}>
            ...
          </div>
        ) : !contentMd ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-text-dim)',
            fontStyle: 'italic', padding: '8px 0' }}>
            Contenuto non ancora disponibile.
          </div>
        ) : (
          <div>{parseMd(contentMd)}</div>
        )}

        {/* Key (debug per admin) */}
        <div style={{ marginTop: 24, fontFamily: 'var(--font-mono)', fontSize: 9,
          color: 'var(--color-text-faint)', opacity: 0.4 }}>
          {helpKey}
        </div>
      </div>
    </div>
  );
}
