'use client';

import { useEffect } from 'react';
import { Brain, Compass, Telescope } from 'lucide-react';

export type Persona = 'cassandra' | 'argonauta' | 'orione';

export default function PersonaGate({
  onSelect,
  remember = true,
}: {
  onSelect: (p: Persona) => void;
  /** salva la scelta in localStorage per la sessione */
  remember?: boolean;
}) {
  useEffect(() => {
    if (!remember) return;
    const last = (typeof window !== 'undefined')
      ? (localStorage.getItem('persona') as Persona | null)
      : null;
    if (last) onSelect(last);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choose(p: Persona) {
    try { if (remember) localStorage.setItem('persona', p); } catch {}
    onSelect(p);
  }

  const base =
    'group relative rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition p-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400';

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <h1 className="text-2xl font-semibold mb-2">Di chi hai bisogno?</h1>
        <p className="text-sm text-white/70 mb-6">
          Scegli l’assistente adatto al lavoro di oggi.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            className={base}
            onClick={() => choose('cassandra')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && choose('cassandra')}
            aria-label="Cassandra – Analisi singola coin"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white/10 p-3">
                <Brain className="w-6 h-6" aria-hidden />
              </div>
              <div>
                <div className="text-lg font-medium">Cassandra</div>
                <div className="text-sm text-white/70">
                  Analisi profonda di <em>una</em> coin: livelli, strategie, entrate.
                </div>
              </div>
            </div>
          </button>

          <button
            className={base}
            onClick={() => choose('argonauta')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && choose('argonauta')}
            aria-label="Argonauta – Scanner watchlist"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white/10 p-3">
                <Compass className="w-6 h-6" aria-hidden />
              </div>
              <div>
                <div className="text-lg font-medium">Argonauta</div>
                <div className="text-sm text-white/70">
                  Ogni X minuti scansiona la watchlist e segnala <strong>entrate vicine valide</strong>.
                </div>
              </div>
            </div>
          </button>

          <button
            className={base}
            onClick={() => choose('orione')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && choose('orione')}
            aria-label="Orione – Scanner EMA9/EMA21/BB su 1m"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-white/10 p-3">
                <Telescope className="w-6 h-6" aria-hidden />
              </div>
              <div>
                <div className="text-lg font-medium">Orione</div>
                <div className="text-sm text-white/70">
                  Ogni minuto rileva incroci (o quasi) tra <strong>EMA9/EMA21</strong> e <strong>SMA20 (BB)</strong>.
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
