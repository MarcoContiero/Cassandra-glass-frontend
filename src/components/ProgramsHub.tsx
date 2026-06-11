'use client';

import React, { useMemo, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import CassandraUI from './CassandraUI';
import ArgonautaPanel from './ArgonautaPanel';
import OrionePanel from './orione/OrionePanel';
import AgemaPanel from './agema/AgemaPanel';
import DnaPanel from './dna/DnaPanel';
import Tifide3Panel from '@/app/tifide3/page';
import TifidePage from '@/app/tifide/page';
import Orione2Page from '@/app/orione2/patterns/page';

type AppKey = 'argonauta' | 'cassandra' | 'orione' | 'agema' | 'dna' | 'tifide2' | 'orione2' | 'tifide3';

const APPS: { key: AppKey; label: string }[] = [
  { key: 'cassandra', label: 'Cassandra' },
  { key: 'argonauta', label: 'Argonauta' },
  { key: 'orione',    label: 'Orione' },
  { key: 'tifide3',   label: 'Tifi 4.0' },
  { key: 'tifide2',   label: 'Tifi 2.0' },
  { key: 'orione2',   label: 'Segnali' },
  { key: 'agema',     label: 'Agema' },
  { key: 'dna',       label: 'DNA Coin' },
];

export default function ProgramsHub() {
  const [activeApp, setActiveApp] = useState<AppKey>('cassandra');

  const isWide = activeApp === 'tifide2' || activeApp === 'tifide3';

  const content = useMemo(() => {
    switch (activeApp) {
      case 'argonauta': return <ArgonautaPanel />;
      case 'orione':    return <OrionePanel />;
      case 'tifide2':   return <TifidePage />;
      case 'tifide3':   return <Tifide3Panel />;
      case 'agema':     return <AgemaPanel />;
      case 'dna':       return <DnaPanel />;
      case 'orione2':   return <Orione2Page />;
      case 'cassandra':
      default:          return <CassandraUI />;
    }
  }, [activeApp]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-void)', color: 'var(--color-text)' }}>

      {/* ── Navbar ────────────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          borderBottom: '1px solid var(--color-border-dim)',
          backdropFilter: 'blur(8px)',
          background: 'rgba(2,2,14,0.92)',
        }}
      >
        <div
          style={{
            maxWidth: '1600px',
            margin: '0 auto',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'stretch',
            position: 'relative',
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingRight: '24px',
              marginRight: '8px',
              borderRight: '1px solid var(--color-border-dim)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-decorative)',
                fontSize: '13px',
                fontWeight: 300,
                letterSpacing: '0.2em',
                color: 'var(--color-gold)',
                whiteSpace: 'nowrap',
              }}
            >
              CASSANDRA
            </span>
          </div>

          {/* Nav tabs */}
          <nav
            style={{
              display: 'flex',
              alignItems: 'stretch',
              gap: 0,
              overflowX: 'auto',
              scrollbarWidth: 'none',
              flex: 1,
            }}
          >
            {APPS.map((app) => {
              const isActive = activeApp === app.key;
              return (
                <button
                  key={app.key}
                  onClick={() => setActiveApp(app.key)}
                  className={isActive ? 'nav-tab nav-tab-active' : 'nav-tab'}
                >
                  {app.label}
                </button>
              );
            })}
          </nav>

          {/* Theme toggle + live indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              paddingLeft: '16px',
              marginLeft: 'auto',
              borderLeft: '1px solid var(--color-border-dim)',
            }}
          >
            <ThemeToggle />
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: 'var(--color-long-bright)',
                animation: 'cassandraPulse 2s ease-in-out infinite',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                letterSpacing: '0.3em',
                color: 'var(--color-text-dim)',
                textTransform: 'uppercase',
              }}
            >
              live
            </span>
          </div>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────── */}
      <main
        style={
          isWide
            ? { flex: 1, width: '100%', padding: '12px 8px' }
            : { maxWidth: '1600px', margin: '0 auto', flex: 1, padding: '24px 20px', width: '100%' }
        }
      >
        {content}
      </main>
    </div>
  );
}
