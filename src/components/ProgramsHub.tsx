'use client';

import React, { useMemo, useState } from 'react';
import CassandraUI from './CassandraUI';
import ArgonautaPanel from './ArgonautaPanel';
import OrionePanel from './orione/OrionePanel';
import AgemaPanel from './agema/AgemaPanel';
import Tifide3Panel from '@/app/tifide3/page';
import TifidePage from '@/app/tifide/page';
import Orione2Page from '@/app/orione2/patterns/page';

type AppKey = 'argonauta' | 'cassandra' | 'orione' | 'agema' | 'tifide2' | 'orione2' | 'tifide3';

const APPS: { key: AppKey; label: string; emoji: string }[] = [
  { key: 'argonauta', label: 'Argonauta', emoji: '🧭' },
  { key: 'cassandra', label: 'Cassandra', emoji: '🔮' },
  { key: 'orione', label: 'Orione', emoji: '✨' },
  { key: 'tifide2', label: 'Tifi 2.0', emoji: '⬅️' },
  { key: 'orione2', label: 'Segnali', emoji: '✅' },
  { key: 'tifide3', label: 'Tifi 3.0', emoji: '🧪' },
  { key: 'agema', label: 'Agema', emoji: '🏅' },
];

export default function ProgramsHub() {
  const [activeApp, setActiveApp] = useState<AppKey>('cassandra');

  const isWide = activeApp === 'tifide2' || activeApp === 'tifide3';

  const content = useMemo(() => {
    switch (activeApp) {
      case 'argonauta':
        return <ArgonautaPanel />;
      case 'orione':
        return <OrionePanel />;
      case 'tifide2':
        return <TifidePage />;
      case 'tifide3':
        return <Tifide3Panel />;
      case 'agema':
        return <AgemaPanel />;
      case 'orione2':
        return <Orione2Page />;
      case 'cassandra':
      default:
        return <CassandraUI />;
    }
  }, [activeApp]);

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      {/* barra superiore programmi */}
      <div className="border-b border-white/10 bg-black/60 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center px-6 py-3">
          <div className="flex gap-2 flex-wrap">
            {APPS.map((app) => {
              const isActive = activeApp === app.key;
              return (
                <button
                  key={app.key}
                  onClick={() => setActiveApp(app.key)}
                  className={[
                    'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition',
                    isActive ? 'bg-white text-black shadow' : 'bg-white/5 text-white/70 hover:bg-white/10',
                  ].join(' ')}
                >
                  <span>{app.emoji}</span>
                  <span>{app.label}</span>
                </button>
              );
            })}
          </div>
          <div className="ml-auto text-xs text-white/50" />
        </div>
      </div>

      {/* contenuto dell’app scelta */}
      <div
        className={
          isWide
            ? 'flex-1 w-full px-2 md:px-4 py-3' // ✅ full width per Tifide2/3
            : 'mx-auto max-w-[1600px] flex-1 px-6 py-6'
        }
      >
        {content}
      </div>
    </div>
  );
}