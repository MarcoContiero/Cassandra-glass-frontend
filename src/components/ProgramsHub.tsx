'use client';

import React, { useMemo, useState } from 'react';
import CassandraUI from './CassandraUI';
import ArgonautaPanel from './ArgonautaPanel';
import OrionePanel from './orione/OrionePanel';
import AgemaPanel from './agema/AgemaPanel';
import DnaPanel from './dna/DnaPanel';
import Tifide3Panel from '@/app/tifide3/page';
import TifidePage from '@/app/tifide/page';
import Orione2Page from '@/app/orione2/patterns/page';

type AppKey = 'argonauta' | 'cassandra' | 'orione' | 'agema' | 'dna' | 'tifide2' | 'orione2' | 'tifide3';

const APPS: { key: AppKey; label: string; icon: string }[] = [
  { key: 'cassandra', label: 'Cassandra', icon: '🔮' },
  { key: 'argonauta', label: 'Argonauta', icon: '🧭' },
  { key: 'orione', label: 'Orione', icon: '✦' },
  { key: 'tifide3', label: 'Tifi 4.0', icon: '⬡' },
  { key: 'tifide2', label: 'Tifi 2.0', icon: '◈' },
  { key: 'orione2', label: 'Segnali', icon: '◉' },
  { key: 'agema', label: 'Agema', icon: '❋' },
  { key: 'dna', label: 'DNA Coin', icon: '◈' },
];

export default function ProgramsHub() {
  const [activeApp, setActiveApp] = useState<AppKey>('cassandra');

  const isWide = activeApp === 'tifide2' || activeApp === 'tifide3';

  const content = useMemo(() => {
    switch (activeApp) {
      case 'argonauta': return <ArgonautaPanel />;
      case 'orione': return <OrionePanel />;
      case 'tifide2': return <TifidePage />;
      case 'tifide3': return <Tifide3Panel />;
      case 'agema': return <AgemaPanel />;
      case 'dna': return <DnaPanel />;
      case 'orione2': return <Orione2Page />;
      case 'cassandra':
      default: return <CassandraUI />;
    }
  }, [activeApp]);

  return (
    <div
      className="flex min-h-screen flex-col text-white"
      style={{
        background: 'var(--background)',
        backgroundImage: [
          'radial-gradient(ellipse 80% 50% at 50% -20%, oklch(0.72 0.15 198 / 0.13), transparent)',
          'radial-gradient(ellipse 60% 40% at 80% 80%, oklch(0.55 0.18 280 / 0.09), transparent)',
        ].join(', '),
      }}
    >

      {/* ── Top nav ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 border-b border-white/[0.06]"
        style={{
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          background: 'rgba(8, 12, 22, 0.80)',
        }}
      >
        <div className="relative mx-auto max-w-[1600px] px-5 py-2.5">

          {/* Status dot — assoluto top-right, non partecipa al flow */}
          <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 opacity-70" style={{ boxShadow: '0 0 6px rgba(6,182,212,0.7)' }} />
            <span className="text-[11px] text-white/30 font-mono">live</span>
          </div>

          {/* Logo + nav — lascia spazio a destra per il live dot */}
          <div className="flex items-center gap-3 pr-14">

            {/* Logo */}
            <div className="flex items-center gap-2 shrink-0">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg text-base shrink-0"
                style={{
                  background: 'linear-gradient(135deg, rgba(6,182,212,0.25) 0%, rgba(99,102,241,0.20) 100%)',
                  border: '1px solid rgba(6,182,212,0.30)',
                  boxShadow: '0 0 12px rgba(6,182,212,0.12)',
                }}
              >
                ◈
              </div>
              <span
                className="text-sm font-semibold tracking-wide shrink-0"
                style={{
                  background: 'linear-gradient(90deg, #67e8f9 0%, #a78bfa 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Cassandra
              </span>
            </div>

            {/* App switcher */}
            <nav className="flex gap-1 flex-wrap">
              {APPS.map((app) => {
                const isActive = activeApp === app.key;
                return (
                  <button
                    key={app.key}
                    onClick={() => setActiveApp(app.key)}
                    className={['nav-pill', isActive ? 'nav-pill-active' : ''].join(' ')}
                  >
                    <span className="text-xs opacity-80">{app.icon}</span>
                    <span>{app.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────── */}
      <main
        className={
          isWide
            ? 'flex-1 w-full px-2 md:px-4 py-3'
            : 'mx-auto max-w-[1600px] flex-1 px-5 py-5 w-full'
        }
      >
        {content}
      </main>
    </div>
  );
}
