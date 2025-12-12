'use client';

import React, { useMemo, useState } from 'react';
import CassandraUI from './CassandraUI';
import ArgonautaPanel from './ArgonautaPanel';
import OrionePanel from './orione/OrionePanel';
import AgemaPanel from './agema/AgemaPanel';   // ⬅️ NUOVO IMPORT (adatta il path se serve)

type AppKey = 'argonauta' | 'cassandra' | 'orione' | 'agema';

const APPS: { key: AppKey; label: string; emoji: string }[] = [
  { key: 'argonauta', label: 'Argonauta', emoji: '🧭' },
  { key: 'cassandra', label: 'Cassandra', emoji: '🔮' },
  { key: 'orione', label: 'Orione', emoji: '✨' },
  { key: 'agema', label: 'Agema', emoji: '🏅' },  // ⬅️ NUOVO
];

export default function ProgramsHub() {
  const [activeApp, setActiveApp] = useState<AppKey>('cassandra');

  const content = useMemo(() => {
    switch (activeApp) {
      case 'argonauta':
        return <ArgonautaPanel />;
      case 'orione':
        return <OrionePanel />;
      case 'agema':
        return <AgemaPanel />;          // ⬅️ QUI MOSTRIAMO AGEMA
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
          <div className="flex gap-2">
            {APPS.map((app) => {
              const isActive = activeApp === app.key;
              return (
                <button
                  key={app.key}
                  onClick={() => setActiveApp(app.key)}
                  className={[
                    'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition',
                    isActive
                      ? 'bg-white text-black shadow'
                      : 'bg-white/5 text-white/70 hover:bg-white/10'
                  ].join(' ')}
                >
                  <span>{app.emoji}</span>
                  <span>{app.label}</span>
                </button>
              );
            })}
          </div>
          <div className="ml-auto text-xs text-white/50">
            {/* spazio per info generiche se ti servono */}
          </div>
        </div>
      </div>

      {/* contenuto dell’app scelta */}
      <div className="mx-auto max-w-[1600px] flex-1 px-6 py-6">
        {content}
      </div>
    </div>
  );
}