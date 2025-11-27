'use client';

import React, { useEffect, useMemo, useState } from 'react';
import CassandraUI from './CassandraUI';
import ArgonautaPanel from './ArgonautaPanel';
import OrionePanel from './orione/OrionePanel';

type AppKey = 'argonauta' | 'cassandra' | 'orione';

const APPS: { key: AppKey; label: string; emoji: string; }[] = [
  { key: 'argonauta', label: 'Argonauta', emoji: '🧭' },
  { key: 'cassandra', label: 'Cassandra', emoji: '🔮' },
  { key: 'orione', label: 'Orione', emoji: '✨' },
];

export default function ProgramsHub() {
  const [app, setApp] = useState<AppKey>('cassandra');

  // supporto deep-link ?app=...
  useEffect(() => {
    const url = new URL(window.location.href);
    const qp = (url.searchParams.get('app') || '').toLowerCase() as AppKey;
    if (APPS.some(a => a.key === qp)) setApp(qp);
  }, []);

  // ricorda l’ultima scelta
  useEffect(() => {
    try { localStorage.setItem('last_app', app); } catch { }
  }, [app]);
  useEffect(() => {
    try {
      const last = localStorage.getItem('last_app') as AppKey | null;
      if (last && APPS.some(a => a.key === last)) setApp(last);
    } catch { }
  }, []);

  const content = useMemo(() => {
    if (app === 'argonauta') return <ArgonautaPanel />;
    if (app === 'orione') return <OrionePanel />;
    return <CassandraUI />;
  }, [app]);

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* top bar di scelta */}
      <div className="sticky top-0 z-50 backdrop-blur bg-zinc-900/70 border-b border-white/10">
        <div className="mx-auto max-w-[1600px] px-6 py-3 flex items-center gap-2">
          <div className="text-white/90 font-semibold mr-2">Seleziona programma</div>
          <div className="flex gap-2">
            {APPS.map(({ key, label, emoji }) => {
              const active = app === key;
              return (
                <button
                  key={key}
                  onClick={() => setApp(key)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition
                    ${active ? 'bg-white/15 border-white/30 text-white'
                      : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'}`}
                  aria-pressed={active}
                >
                  <span className="mr-1">{emoji}</span>{label}
                </button>
              );
            })}
          </div>
          <div className="ml-auto text-xs text-white/50">
          </div>
        </div>
      </div>

      {/* contenuto dell’app scelta */}
      <div className="mx-auto max-w-[1600px] px-6 py-6">
        {content}
      </div>
    </div>
  );
}
