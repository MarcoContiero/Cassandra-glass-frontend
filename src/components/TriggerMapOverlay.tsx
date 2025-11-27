'use client';

import * as React from 'react';
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Zone = { low: number; high: number }; // low ≤ high

type Props = {
  result: any;
  symbol?: string;
  price?: number; // usato solo come ultima scelta
};

/* ================== DEBUG ================== */
const DBG = true;
const T = (m: string) => `[TRIGGER] ${m}`;
const log = (...a: any[]) => { if (DBG) console.log(T(''), ...a); };
const grp = (t: string) => { if (DBG) console.groupCollapsed(T(t)); };
const end = () => { if (DBG && (console as any).groupEnd) console.groupEnd(); };

const fmt2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ===== Utils numeri ===== */
const toNum = (v: any) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string') return NaN;

  let s = v.trim().replace(/\s+/g, '');
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    // Se l'ultimo separatore è la virgola → virgola decimale, punto migliaia
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(/,/g, '.'); // "11.199,23" -> "11199.23"
    } else {
      // Altrimenti punto decimale, virgola migliaia
      s = s.replace(/,/g, '');                      // "11,199.23" -> "11199.23"
    }
  } else if (hasComma && !hasDot) {
    // Solo virgola → tratta come decimale
    s = s.replace(/,/g, '.');
  }
  // Solo punto o nessun separatore → lascia così
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};


/* ===== Estrai TUTTO quello che sembra uno (low,high) ===== */
function parseZones(raw: any): Zone[] {
  const zones: Zone[] = [];

  const push = (a: number, b: number) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return;
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    zones.push({ low, high });
  };

  const fromString = (s: string) => {
    // 1) range esplicito a–b o a-b
    const m = s.match(/(-?\d[\d.,]*)\s*[–-]\s*(-?\d[\d.,]*)/);
    if (m) {
      const a = toNum(m[1]);
      const b = toNum(m[2]);
      push(a, b);
      return;
    }
    // 2) altrimenti prendi i numeri a coppie
    const nums = (s.match(/-?\d[\d.,]*/g) || []).map(toNum).filter(Number.isFinite);
    for (let i = 0; i + 1 < nums.length; i += 2) push(nums[i], nums[i + 1]);
  };

  const readObjPair = (o: any) => {
    const a = toNum(
      o?.min ?? o?.low ?? o?.from ?? o?.inferiore ?? o?.basso ?? (Array.isArray(o?.range) ? o.range[0] : undefined)
    );
    const b = toNum(
      o?.max ?? o?.high ?? o?.to ?? o?.superiore ?? o?.alto ?? (Array.isArray(o?.range) ? o.range[1] : undefined)
    );
    if (Number.isFinite(a) && Number.isFinite(b)) {
      push(a, b);
      return true;
    }
    return false;
  };

  const drill = (x: any) => {
    if (x == null) return;
    if (Array.isArray(x)) { x.forEach(drill); return; }

    // numeri puri
    const n = toNum(x);
    if (Number.isFinite(n)) { push(n, n); return; }

    if (typeof x === 'string') { fromString(x); return; }

    if (typeof x === 'object') {
      if (readObjPair(x)) return;
      // prova tutte le stringhe dell'oggetto (anche nested 1 livello)
      for (const v of Object.values(x)) {
        if (typeof v === 'string') fromString(v);
        else if (Array.isArray(v)) v.forEach(drill);
        else if (v && typeof v === 'object') {
          if (!readObjPair(v)) {
            for (const vv of Object.values(v)) if (typeof vv === 'string') fromString(vv);
          }
        }
      }
    }
  };

  drill(raw);

  // ordina + de-dup
  const uniq = new Map<string, Zone>();
  for (const z of zones) uniq.set(`${z.low}|${z.high}`, z);
  return Array.from(uniq.values()).sort((A, B) => A.low - B.low);
}

export default function TriggerMapOverlay({ result, symbol, price }: Props) {
  /* ---------- SYMBOL ---------- */
  const activeSymbol = React.useMemo<string | undefined>(() => {
    return symbol ?? result?.symbol ?? result?.coin ?? result?.risposte?.symbol ?? result?.risposte?.coin;
  }, [symbol, result]);

  React.useEffect(() => {
    grp('symbol resolved');
    log('symbol prop =', symbol);
    log('result.symbol =', result?.symbol, 'result.coin =', result?.coin);
    log('risposte.symbol =', result?.risposte?.symbol, 'risposte.coin =', result?.risposte?.coin);
    log('→ activeSymbol =', activeSymbol);
    end();
  }, [activeSymbol, symbol, result]);

  /* ---------- PREZZO (result → fetch → prop) ---------- */
  const [fetchedPrice, setFetchedPrice] = React.useState<number | undefined>(undefined);
  const priceFromResult = React.useMemo(() => {
    const p = toNum(result?.prezzo ?? result?.price ?? result?.risposte?.prezzo ?? result?.risposte?.price);
    return Number.isFinite(p) ? p : undefined;
  }, [result]);

  const currentPrice =
    (Number.isFinite(priceFromResult) ? priceFromResult : undefined) ??
    (Number.isFinite(fetchedPrice) ? fetchedPrice : undefined) ??
    (Number.isFinite(price) ? (price as number) : undefined);

  React.useEffect(() => {
    grp('price sources');
    log('passed prop price =', price);
    log('priceFromResult   =', priceFromResult);
    log('fetchedPrice      =', fetchedPrice);
    log('→ currentPrice    =', currentPrice);
    end();
  }, [price, priceFromResult, fetchedPrice, currentPrice]);

  React.useEffect(() => {
    if (!activeSymbol) return;
    (async () => {
      try {
        grp('fetch /api/price');
        const url = `/api/price?symbol=${encodeURIComponent(activeSymbol)}`;
        log('GET', url);
        const r = await fetch(url);
        const j = await r.json();
        const p = toNum(j?.price);
        log('resp.price =', j?.price, '→ parsed =', p);
        if (Number.isFinite(p)) setFetchedPrice(p);
        end();
      } catch (e) {
        log('fetch error', e);
      }
    })();
  }, [activeSymbol]);

  /* ---------- SUPPORTI/RESISTENZE ---------- */
  const pickMany = (...cands: any[]) => cands.find((x) => x != null) ?? [];

  const rawSupports = React.useMemo(
    () =>
      pickMany(
        result?.livelli?.supporti,
        result?.supporti,
        result?.levels?.supports,
        result?.support_zones,
        result?.risposte?.supporti,
        result?.risposte?.levels?.supports,
        result?.data?.supporti
      ),
    [result]
  );
  const rawResistances = React.useMemo(
    () =>
      pickMany(
        result?.livelli?.resistenze,
        result?.resistenze,
        result?.levels?.resistances,
        result?.resistance_zones,
        result?.risposte?.resistenze,
        result?.risposte?.levels?.resistances,
        result?.data?.resistenze
      ),
    [result]
  );

  const supports = React.useMemo(() => parseZones(rawSupports), [rawSupports]);
  const resistances = React.useMemo(() => parseZones(rawResistances), [rawResistances]);

  React.useEffect(() => {
    grp('levels before/after parse');
    const countRawS = Array.isArray(rawSupports) ? rawSupports.length : 1;
    const countRawR = Array.isArray(rawResistances) ? rawResistances.length : 1;
    log(`raw supports count = ${countRawS}`, rawSupports);
    log(`raw resists  count = ${countRawR}`, rawResistances);
    log('parsed supports (first 3) =', supports.slice(0, 3));
    log('parsed resists  (first 3) =', resistances.slice(0, 3));
    end();
  }, [rawSupports, rawResistances, supports, resistances]);

  /* ---------- TRIGGER (2 long, 2 short) ---------- */
  const items = React.useMemo(() => {
    if (!Number.isFinite(currentPrice)) return null;
    const p = currentPrice as number;

    // *** FILTRI CHIARI ***
    const resAbove = resistances.filter((r) => r.low > p).sort((a, b) => a.low - b.low);
    const supBelow = supports.filter((s) => s.high < p).sort((a, b) => b.high - a.high);

    const high = (z?: Zone) => (z ? fmt2.format(z.high) : undefined);
    const low  = (z?: Zone) => (z ? fmt2.format(z.low)  : undefined);
    const mid  = (z?: Zone) => (z ? fmt2.format((z.low + z.high) / 2) : undefined);

    grp('computed triggers');
    log('p =', p, 'resAbove:', resAbove.length, 'supBelow:', supBelow.length);
    log('resAbove[0..1]=', resAbove.slice(0, 2));
    log('supBelow[0..1]=', supBelow.slice(0, 2));
    end();

    const longPlus = resAbove.length
      ? { label: 'LONG+',  text: `breakout ${high(resAbove[0])} → ${mid(resAbove[1]) ?? low(resAbove[0])}` }
      : { label: 'LONG+',  text: '— nessuna resistenza sopra trovata.' };

    const longMinus = supBelow.length
      ? { label: 'LONG−',  text: `rimbalzo ${high(supBelow[0])} → ${mid(resAbove[0]) ?? high(supBelow[0])}` }
      : { label: 'LONG−',  text: '— nessun supporto sotto: usa VWAP/EMA o zona di domanda.' };

    const shortPlus = supBelow.length
      ? { label: 'SHORT+', text: `breakdown ${low(supBelow[0])} → ${mid(supBelow[1]) ?? low(supBelow[0])}` }
      : { label: 'SHORT+', text: '— nessun supporto utile sotto.' };

    const shortMinus = resAbove.length
      ? { label: 'SHORT−', text: `rejection ${low(resAbove[0])} → ${mid(supBelow[0]) ?? low(resAbove[0])}` }
      : { label: 'SHORT−', text: '— nessuna resistenza utile sopra.' };

    return [longPlus, longMinus, shortPlus, shortMinus];
  }, [currentPrice, supports, resistances]);

  React.useEffect(() => {
    grp('items render check');
    if (!items) log('items = null (prezzo mancante?)');
    else log('items ready:', items.map((x) => x.text));
    end();
  }, [items]);

  /* ---------- RENDER ---------- */
  return (
    <DialogContent className="max-w-2xl w-[95vw] p-0 bg-zinc-900/95 text-white backdrop-blur-md">
      <DialogHeader className="sticky top-0 z-10 bg-zinc-900/95 p-4 border-b border-white/10">
        <DialogTitle className="text-xl">🧭 Mappa dei Trigger</DialogTitle>
      </DialogHeader>

      <div className="p-5 space-y-4">
        <ul className="space-y-3">
          {(items ?? []).map((it, idx) => (
            <li
              key={idx}
              className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 shadow-sm"
            >
              <span className="inline-flex shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold bg-white/10 border border-white/20">
                {it.label}
              </span>
              <span className="text-sm leading-6">{it.text}</span>
            </li>
          ))}
        </ul>

        <div className="pt-2 text-xs opacity-70">
          <div>
            <span className="font-medium">{activeSymbol ?? '—'}</span> — Prezzo:{' '}
            {Number.isFinite(currentPrice) ? fmt2.format(currentPrice as number) : '—'}
          </div>
          <div>Fonte: /api/price + livelli Cassandra</div>
        </div>
      </div>
    </DialogContent>
  );
}
