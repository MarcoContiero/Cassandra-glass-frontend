'use client';

import React, { useState } from 'react';
import HelpOverlay from './HelpOverlay';

// ── Stele SVG button ──────────────────────────────────────────────────────────

function SteleSvg() {
  return (
    <svg width="32" height="14" viewBox="0 0 32 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.5,1 L28.5,1 C30.5,1 31,3 30,7 C31,11 30.5,13 28.5,13 L3.5,13 C1.5,13 1,11 2,7 C1,3 1.5,1 3.5,1 Z"
        stroke="currentColor" strokeWidth="1" fill="rgba(201,168,76,0.06)"/>
      <line x1="4.5" y1="7" x2="27.5" y2="7" stroke="currentColor" strokeWidth="0.5" opacity="0.45"/>
      <path d="M16,4.5 L18,7 L16,9.5 L14,7 Z" stroke="currentColor" strokeWidth="0.8" fill="none" opacity="0.7"/>
      <circle cx="9" cy="7" r="0.9" fill="currentColor" opacity="0.35"/>
      <circle cx="23" cy="7" r="0.9" fill="currentColor" opacity="0.35"/>
    </svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface HelpButtonProps {
  /** Chiave nel DB: es. "dna", "dna/scenario", "costellazioni/grid" */
  helpKey: string;
  /** Label mostrata nell'overlay (default: helpKey) */
  label?: string;
  /** Variante: "page" = bottone più visibile, "section" = inline piccolo */
  variant?: 'page' | 'section';
}

export default function HelpButton({ helpKey, label, variant = 'section' }: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  const isPage = variant === 'page';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`Cos'è ${label || helpKey}?`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          background: 'transparent',
          border: isPage
            ? '1px solid rgba(2,2,14,0.2)'
            : '1px solid rgba(201,168,76,0.18)',
          cursor: 'pointer',
          color: isPage ? 'rgba(2,2,14,0.45)' : 'rgba(201,168,76,0.55)',
          borderRadius: 0,
          padding: isPage ? '4px 10px' : '2px 5px',
          transition: 'color 180ms, border-color 180ms, background 180ms',
          flexShrink: 0,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.color = isPage ? 'var(--color-void)' : 'var(--color-gold)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = isPage ? 'rgba(2,2,14,0.4)' : 'rgba(201,168,76,0.5)';
          (e.currentTarget as HTMLButtonElement).style.background = isPage ? 'rgba(2,2,14,0.06)' : 'rgba(201,168,76,0.06)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.color = isPage ? 'rgba(2,2,14,0.45)' : 'rgba(201,168,76,0.55)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = isPage
            ? 'rgba(2,2,14,0.2)' : 'rgba(201,168,76,0.18)';
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        <SteleSvg />
        {isPage && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}>
            ?
          </span>
        )}
      </button>

      {open && (
        <HelpOverlay
          helpKey={helpKey}
          label={label}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
