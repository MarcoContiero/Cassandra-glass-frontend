'use client';

import * as React from 'react';

/* ============================
   Tipi
============================ */
type Dir = 'LONG' | 'SHORT' | 'NEUTRO' | '';

type Attivo = {
  titolo?: string;
  descrizione?: string;
  direzione?: string; // verrà normalizzata a Dir
  score?: number;
};

type TfBlock = {
  attivi?: Attivo[];
  direzione?: string; // direzione vincente del TF (badge)
  score?: number;     // punteggio del badge (es. 23)
  manca?: string[];
};

type AnyAttivo = Attivo & Record<string, any>;

type ScenarioData = {
  dominant?: { dir?: string; score?: number };
  order?: string[]; // es. ['15m','1h','4h','1d','1w']
  tfScore?: Record<string, TfBlock>;
  scenari?: unknown;
  explainText?: string;
};

type Props = {
  data: ScenarioData;
  result?: any;
};

/* ============================
   Utils
============================ */
const DBG = true; // metti a false se vuoi silenziare i log

const grp = (t: string) => { if (DBG) console.groupCollapsed(`[SCENARI:Overlay] ${t}`); };
const end = () => { if (DBG && (console as any).groupEnd) console.groupEnd(); };
const log = (...a: unknown[]) => { if (DBG) console.log(...a); };

const normalizeDir = (s?: string): Dir => {
  const t = String(s ?? '').trim().toLowerCase();
  if (!t) return '';
  if (t.startsWith('long') || t === 'l' || t === 'buy' || t.includes('bull')) return 'LONG';
  if (t.startsWith('short') || t === 's' || t === 'sell' || t.includes('bear') || t.includes('ribass') || t.includes('down'))
    return 'SHORT';
  if (t.startsWith('neut')) return 'NEUTRO';
  return '';
};

const pillStyle = (d: Dir) =>
  d === 'LONG'
    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
    : d === 'SHORT'
    ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
    : 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30';

const badgeStyle = (d: Dir) =>
  d === 'LONG'
    ? 'text-emerald-300 border-emerald-600/30'
    : d === 'SHORT'
    ? 'text-rose-300 border-rose-600/30'
    : 'text-zinc-300 border-zinc-600/30';

const dirTextColor = (d: Dir) =>
  d === 'LONG' ? 'text-emerald-300' : d === 'SHORT' ? 'text-rose-300' : 'text-zinc-300';

const safeArr = <T,>(x: T[] | undefined | null): T[] => (Array.isArray(x) ? x : []);

/* ============================
   Component
============================ */
export default function ScenarioOverlay({ data, result }: Props) {
  grp('props ricevuti');
  log('keys(data)=', Object.keys(data ?? {}));
  const fmtOrder = Array.isArray(data?.order) ? data.order : Object.keys(data?.tfScore ?? {});
  log('→ formato: object · order=', fmtOrder);
  log('tfScore keys=', Object.keys(data?.tfScore ?? {}));
  log('dominant =', data?.dominant);
  end();

  const order: string[] = React.useMemo<string[]>(
    () => (Array.isArray(data?.order) ? data!.order!.slice() : Object.keys(data?.tfScore ?? {})),
    [data?.order, data?.tfScore]
  );

  const tfMap: Record<string, TfBlock> = React.useMemo(
    () => (data?.tfScore ? { ...data.tfScore } : {}),
    [data?.tfScore]
  );

  const dominantDir: Dir = normalizeDir(data?.dominant?.dir) || '';
  const dominantScore = Number(data?.dominant?.score ?? 0);

  const explain: string =
    (data?.explainText ??
      (result?.spiegazione_scenari as string) ??
      (result?.spiegazione as string) ??
      (result?.narrativa as string) ??
      '') || '';

  /* ============================
     Render
  ============================ */
  return (
    <div className="p-5 text-white">
      {/* Dominante */}
      <div className="mb-4 text-sm">
        Direzione dominante:{' '}
        <span className={`font-semibold ${dirTextColor(dominantDir)}`}>
          {dominantDir || 'NEUTRO'}
        </span>
        {Number.isFinite(dominantScore) && (
          <span className="opacity-70"> · Score: {dominantScore}</span>
        )}
      </div>

      {/* Lista per TF */}
      <div className="space-y-3">
        {order.map((tf) => {
          const block = tfMap[tf] ?? { attivi: [] };
          const winning: Dir = normalizeDir(block.direzione) || 'NEUTRO';
          const badgeScore = Number(block.score ?? 0);
          // subito sopra, aggiungi una utility type
          const allAttivi = safeArr(block.attivi).map((a: AnyAttivo) => {
            const sc = Number(a?.score ?? a?.punti);
            return {
              titolo: a?.titolo ?? a?.title ?? a?.nome ?? '—',
              descrizione: a?.descrizione ?? a?.desc ?? a?.description ?? '',
              direzione: normalizeDir(a?.direzione ?? a?.dir),
              score: Number.isFinite(sc) ? sc : undefined,
            };
          });


          // Filtra per direzione vincente; se NEUTRO mostro tutto
          const inDir = winning === 'NEUTRO'
            ? allAttivi.slice()
            : allAttivi.filter((a) => a.direzione === winning);

          // FALLBACK: se non ci sono attivi della direzione vincente, mostra i migliori disponibili
          const itemsToShow =
            inDir.length > 0
              ? inDir
              : allAttivi
                  .slice()
                  .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
                  .slice(0, 5); // max 5

          grp(`TF ${tf}`);
          log('winning =', winning, 'badge score =', badgeScore);
          log('tot attivi =', allAttivi.length, '→ coerenti =', inDir.length);
          end();

          return (
            <div
              key={tf}
              className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3"
            >
              {/* intestazione TF + badge */}
              <div className="flex items-center justify-between">
                <div className="font-medium">{tf}</div>
                <div
                  className={`text-[11px] px-2 py-0.5 rounded-full border ${badgeStyle(
                    winning
                  )}`}
                >
                  {winning} {Number.isFinite(badgeScore) ? `· score ${badgeScore}` : ''}
                </div>
              </div>

              {/* contenuto */}
              {itemsToShow.length === 0 ? (
                <div className="mt-1 text-sm opacity-60">Nessuno scenario rilevato.</div>
              ) : (
                <>
                  {inDir.length === 0 && winning !== 'NEUTRO' && (
                    <div className="mt-1 text-xs opacity-70">
                      Nessuno scenario <b>{winning.toLowerCase()}</b> disponibile; mostro i migliori scenari presenti.
                    </div>
                  )}
                  <ul className="mt-2 space-y-1">
                    {itemsToShow.map((a, i) => {
                      const d = (a.direzione || winning || 'NEUTRO') as Dir;
                      return (
                        <li key={i} className="text-sm leading-6">
                          <span
                            className={`mr-2 text-[11px] px-1.5 py-0.5 rounded border ${pillStyle(
                              d
                            )}`}
                          >
                            {d}
                          </span>
                          <span className="font-medium">
                            {a.titolo || '—'}
                          </span>
                          {a.score != null && (
                            <span className="opacity-70"> ({a.score})</span>
                          )}
                          {a.descrizione && (
                            <span className="opacity-80"> · {a.descrizione}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Spiegazione */}
      {explain && (
        <div className="mt-4 text-sm text-zinc-300/90 leading-6">
          <div className="flex items-start gap-2">
            <span className="mt-1 select-none">🗒️</span>
            <p className="whitespace-pre-wrap">{explain}</p>
          </div>
        </div>
      )}
    </div>
  );
}
