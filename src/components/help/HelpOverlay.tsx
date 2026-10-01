'use client';

import React, { useEffect, useState, useCallback } from 'react';
import styles from './HelpOverlay.module.css';

const SHADOW = 'none';
const GOLD   = 'rgb(201,168,76)';
const GOLDDIM= '#d6bd79';
const TEXT   = 'rgba(230,220,195,0.92)';
const TEXTDIM= '#ddd7c8';
const FAINT  = '#b9ad91';

// ── Markdown renderer minimale ────────────────────────────────────────────────

function inlineFmt(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**'))
      return <strong key={i} style={{ color: TEXT, fontWeight: 600, textShadow: SHADOW }}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('*') && p.endsWith('*'))
      return <em key={i} style={{ color: GOLDDIM, textShadow: SHADOW }}>{p.slice(1, -1)}</em>;
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
          color: GOLD, margin: '16px 0 6px', textShadow: SHADOW }}>
          {line.slice(2)}
        </h2>
      );
    } else if (line.startsWith('## ')) {
      out.push(
        <h3 key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
          color: GOLDDIM, letterSpacing: '0.2em', textTransform: 'uppercase',
          margin: '14px 0 4px', textShadow: SHADOW }}>
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
            <li key={j} style={{ fontFamily: 'system-ui, sans-serif', fontSize: 15,
              color: TEXTDIM, lineHeight: 1.6, textShadow: SHADOW }}>
              {inlineFmt(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    } else if (line.trim() !== '') {
      out.push(
        <p key={i} style={{ fontFamily: 'system-ui, sans-serif', fontSize: 15,
          color: TEXTDIM, lineHeight: 1.8, margin: '10px 0', textShadow: SHADOW }}>
          {inlineFmt(line)}
        </p>
      );
    }
    i++;
  }
  return <>{out}</>;
}

// ── Stele decorativa ──────────────────────────────────────────────────────────

function SteleDecor() {
  return (
    <svg width="200" height="36" viewBox="0 0 200 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8,2 L192,2 C197,2 198,8 196,18 C198,28 197,34 192,34 L8,34 C3,34 2,28 4,18 C2,8 3,2 8,2 Z"
        stroke="rgba(201,168,76,0.55)" strokeWidth="1.2" fill="rgba(201,168,76,0.03)"/>
      <line x1="10" y1="18" x2="190" y2="18" stroke="rgba(201,168,76,0.35)" strokeWidth="0.7"/>
      <path d="M100,11 L105,18 L100,25 L95,18 Z" stroke="rgba(201,168,76,0.7)" strokeWidth="1" fill="rgba(201,168,76,0.12)"/>
      <path d="M60,14 L63,18 L60,22 L57,18 Z" stroke="rgba(201,168,76,0.38)" strokeWidth="0.8" fill="none"/>
      <path d="M140,14 L143,18 L140,22 L137,18 Z" stroke="rgba(201,168,76,0.38)" strokeWidth="0.8" fill="none"/>
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
      className={styles.backdrop}
      onClick={onBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(2,2,14,0.76)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px',
        overflowY: 'auto',
      }}
    >
      {/* Nessun riquadro — contenuto galleggiante con text-shadow */}
      <div
        className={styles.panel}
        role="dialog" aria-modal="true" aria-labelledby="cassandra-help-title"
        style={{ width: '100%', maxWidth: 640, position: 'relative' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Chiudi */}
        <button
          onClick={onClose}
          aria-label="Chiudi spiegazione"
          className={styles.close}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 16,
            color: GOLDDIM, lineHeight: 1,
            textShadow: SHADOW,
          }}
        >
          ✕
        </button>

        {/* Header stele */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <div style={{ filter: 'drop-shadow(0 0 12px rgba(2,2,14,0.9))' }}>
            <SteleDecor />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.35em',
              color: FAINT, textTransform: 'uppercase', marginBottom: 8,
              textShadow: SHADOW,
            }}>
              CONOSCI CASSANDRA
            </div>
            <div id="cassandra-help-title" style={{
              fontFamily: 'var(--font-decorative)', fontSize: 30, fontWeight: 300,
              color: GOLD, lineHeight: 1,
              textShadow: SHADOW,
            }}>
              {label || helpKey}
            </div>
          </div>
        </div>

        {/* Separatore */}
        <div style={{
          height: 1,
          background: 'rgba(201,168,76,0.25)',
          marginBottom: 20,
          boxShadow: '0 0 8px rgba(2,2,14,0.8)',
        }} />

        {/* Contenuto */}
        {loading ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: TEXTDIM,
            textAlign: 'center', padding: '20px 0', textShadow: SHADOW }}>
            ...
          </div>
        ) : !contentMd ? (
          <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 15, color: TEXTDIM,
            fontStyle: 'italic', padding: '8px 0', textShadow: SHADOW }}>
            Contenuto non ancora disponibile.
          </div>
        ) : (
          <div className={styles.content}>{parseMd(contentMd)}</div>
        )}

      </div>
    </div>
  );
}
