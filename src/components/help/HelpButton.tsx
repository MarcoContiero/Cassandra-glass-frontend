'use client';

import React, { useState } from 'react';
import HelpOverlay from './HelpOverlay';

// ── Stele SVG button ──────────────────────────────────────────────────────────

function SteleSvg() {
  return (
    <svg width="16" height="22" viewBox="0 0 16 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2,6 C2,1.5 14,1.5 14,6 L14,20 L2,20 Z"
        stroke="currentColor" strokeWidth="1.2" fill="rgba(201,168,76,0.06)" strokeLinejoin="round"/>
      <line x1="4" y1="9" x2="12" y2="9" stroke="currentColor" strokeWidth="0.5" opacity="0.4"/>
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
            ? '1px solid rgba(201,168,76,0.25)'
            : '1px solid rgba(201,168,76,0.15)',
          cursor: 'pointer',
          color: 'rgba(201,168,76,0.55)',
          borderRadius: 0,
          padding: isPage ? '4px 8px' : '2px 5px',
          transition: 'color 180ms, border-color 180ms, background 180ms',
          flexShrink: 0,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-gold)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,168,76,0.5)';
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(201,168,76,0.06)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.color = 'rgba(201,168,76,0.55)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = isPage
            ? 'rgba(201,168,76,0.25)' : 'rgba(201,168,76,0.15)';
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
