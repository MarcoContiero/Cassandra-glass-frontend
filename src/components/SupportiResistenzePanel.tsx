'use client';

import { useState } from 'react';

type SRItem = { testo?: string; forza?: number; [k: string]: any };

type Props = {
  /** prime 3 già pronte lato container */
  supporti?: SRItem[];
  resistenze?: SRItem[];
  /** extra: tutti gli altri */
  supporti_extra?: SRItem[];
  resistenze_extra?: SRItem[];
};

/* ============================ Helpers ============================ */

function toText(x: SRItem | string | null | undefined): string {
  if (x == null) return '';
  if (typeof x === 'string') return x;
  return String(x.testo ?? '');
}

/** etichetta breve (taglia prima di “—/–/confluenza”) */
function shortLabel(full: string): string {
  if (!full) return '';
  const s = full.trim();
  const byDash = s.split(' — ')[0].split('–')[0].split(' - ')[0];
  const byConfl = s.toLowerCase().includes('confluenza')
    ? s.slice(0, s.toLowerCase().indexOf('confluenza')).trim()
    : byDash.trim();
  return byConfl.length >= 12 ? byConfl : s;
}

function countBy<T extends string>(arr: T[]) {
  const m = new Map<T, number>();
  for (const a of arr) m.set(a, (m.get(a) ?? 0) + 1);
  return Array.from(m.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}×${v}`);
}

/** Estrae una “composizione” sintetica del livello dal testo completo */
function extractComposition(full: string) {
  const s = full.toLowerCase();

  // timeframe hits: "supporto (4h)", "resistenza (15m)"...
  const tfHits: string[] = [];
  for (const m of s.matchAll(/(supporto|resistenza)\s*\((\d+[mhwd])\)/g)) {
    const tipo = m[1] === 'supporto' ? 'Supporto' : 'Resistenza';
    tfHits.push(`${tipo} ${m[2]}`);
  }

  // Fibonacci
  const fibs: string[] = [];
  for (const m of s.matchAll(/fib(?:onacci)?\s*(?:[:\-])?\s*(0?\.\d+|[\d]{2,3})/g)) {
    let v = m[1];
    if (/^\d{2,3}$/.test(v)) v = (parseInt(v, 10) / 1000).toFixed(3); // "618" -> "0.618"
    fibs.push(`Fibo ${v}`);
  }
  if (/\b(0\.382|0\.5|0\.618|0\.786)\b/.test(s) && fibs.length === 0) {
    fibs.push(`Fibo ${RegExp.$1}`);
  }

  // Massimi/Minimi precedenti
  const prevs: string[] = [];
  if (/(vecchi[oi]|precedente|old)\s+massim[oi]/.test(s)) prevs.push('Vecchio massimo');
  if (/(vecchi[oi]|precedente|old)\s+minim[oi]/.test(s)) prevs.push('Vecchio minimo');

  // Order Block / Supply-Demand
  const ob: string[] = [];
  if (/\b(order\s*block|ob|supply|demand)\b/.test(s)) ob.push('Order Block / SD');

  // EMA / Media
  const emas = s.match(/\bema\s*(\d{1,3})\b/g)?.map((x) => 'EMA ' + x.replace(/\D/g, '')) ?? [];

  // VWAP / POC / GAP / numero tondo
  const tech: string[] = [];
  if (/\bvwap\b/.test(s)) tech.push('VWAP');
  if (/\b(poc|point of control)\b/.test(s)) tech.push('POC');
  if (/\bgap\b/.test(s)) tech.push('Gap');
  if (/(numero tondo|round number|livello psicologic[oi])/.test(s)) tech.push('Numero tondo');

  const parts: string[] = [];
  if (tfHits.length) parts.push(countBy(tfHits).join(', '));
  if (fibs.length) parts.push(fibs.join(', '));
  if (prevs.length) parts.push(prevs.join(', '));
  if (emas.length) parts.push(emas.join(', '));
  if (ob.length) parts.push(ob.join(', '));
  if (tech.length) parts.push(tech.join(', '));

  return parts.join(' • ');
}

/* ============================ UI ============================ */

function Row({ item }: { item: SRItem | string }) {
  const full = toText(item);
  const label = shortLabel(full);
  const forza =
    typeof item === 'object' && item && typeof item.forza === 'number'
      ? Number(item.forza)
      : undefined;
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl bg-zinc-800/60 ring-1 ring-white/10 px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 grid place-items-center w-6 h-6 rounded-md bg-white/10 hover:bg-white/20 text-white/90"
          aria-label={open ? 'Chiudi dettaglio' : 'Apri dettaglio'}
          title={open ? 'Chiudi' : 'Apri'}
        >
          {open ? '–' : '+'}
        </button>

        <div className="grow text-sm">
          <div className="font-medium text-white/95">{label || 'Zona'}</div>
          {forza !== undefined && (
            <div className="text-[11px] text-zinc-400 mt-0.5">
              Forza: {forza.toFixed(2)} / 💯
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-3 text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap space-y-2">
          <div>{full}</div>
          {(() => {
            const comp = extractComposition(full);
            return comp ? (
              <div className="pt-2 border-t border-white/10 text-zinc-200">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-400">
                  Composizione livello
                </div>
                <div>{comp}</div>
              </div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  items,
  emptyText,
}: {
  title: string;
  items?: (SRItem | string)[];
  emptyText?: string;
}) {
  const list = (items ?? []).filter(Boolean);
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-white/90">{title}</div>
      {list.length === 0 ? (
        <div className="text-xs text-zinc-400">{emptyText ?? 'Nessun elemento'}</div>
      ) : (
        <div className="space-y-2">
          {list.map((it, i) => (
            <Row key={i} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================ Component ============================ */

export default function SupportiResistenzePanel({
  supporti = [],
  resistenze = [],
  supporti_extra = [],
  resistenze_extra = [],
}: Props) {
  return (
    <div className="space-y-6">
      {/* Principali: 3 + 3 (già tagliati dal container) */}
      <Section title="Supporti" items={supporti} emptyText="Nessun supporto" />
      <Section title="Resistenze" items={resistenze} emptyText="Nessuna resistenza" />

      {/* Extra, se presenti */}
      {!!supporti_extra.length && (
        <div className="pt-2 border-t border-white/10">
          <Section title="Extra • Supporti" items={supporti_extra} />
        </div>
      )}
      {!!resistenze_extra.length && (
        <div className="pt-2 border-t border-white/10">
          <Section title="Extra • Resistenze" items={resistenze_extra} />
        </div>
      )}
    </div>
  );
}
