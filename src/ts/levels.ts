// src/ts/levels.ts
export type Zone = { min:number; max:number; forza?:number; code?:string; label?:string };
export type Liquidity = {
  price:number; side:'buy-side'|'sell-side'|'buy'|'sell';
  score?:number; status?:string; kinds?:string[]; raw?:any;
};

const toNum = (x:any) => Number(String(x ?? '').replace(',', '.'));

export function parseZone(x:any, ix:number, pref:'S'|'R'): Zone | null {
  if (x == null) return null;

  if (typeof x === 'string') {
    const s = x.replace(',', '.');
    const code = s.match(/\b([SR]\s*\d)\b/i)?.[1]?.replace(/\s+/g,'').toUpperCase();
    const m = s.match(/([\d.]+)\s*[–-]\s*([\d.]+)/);
    if (!m) {
      const n = s.match(/([\d.]+)/)?.[1];
      if (!n) return null;
      const v = toNum(n);
      return { min:v, max:v, code:code ?? `${pref}${ix+1}`, label:code ?? `${pref}${ix+1}` };
    }
    const forza = s.match(/forza\s*([\d.]+)/i)?.[1];
    return {
      min: toNum(m[1]), max: toNum(m[2]),
      forza: forza ? toNum(forza) : undefined,
      code: code ?? `${pref}${ix+1}`, label: code ?? `${pref}${ix+1}`,
    };
  }

  if (Array.isArray(x)) {
    const min = toNum(x[0]), max = toNum(x[1] ?? x[0]);
    if (!isFinite(min) || !isFinite(max)) return null;
    return { min, max, code: `${pref}${ix+1}`, label:`${pref}${ix+1}` };
  }

  if (typeof x === 'object') {
    if ((x as any).testo) return parseZone(String((x as any).testo), ix, pref);
    const lo = (x as any).min ?? (x as any).low ?? (x as any).da ?? (x as any).start ?? (x as any)[0];
    const hi = (x as any).max ?? (x as any).high ?? (x as any).a ?? (x as any).end ?? (x as any)[1] ?? lo;
    const min = toNum(lo), max = toNum(hi);
    if (!isFinite(min) || !isFinite(max)) return null;
    const code = ((x as any).codice ?? (x as any).code ?? (x as any).label)?.toString().toUpperCase();
    const forza = (x as any).forza ?? (x as any).strength;
    return {
      min, max,
      forza: isFinite(toNum(forza)) ? toNum(forza) : undefined,
      code: code ?? `${pref}${ix+1}`, label: code ?? `${pref}${ix+1}`,
    };
  }
  return null;
}

export function parseZones(arr:any, pref:'S'|'R'): Zone[] {
  const list:any[] = Array.isArray(arr) ? arr : [];
  return list.map((v,i)=>parseZone(v,i,pref)).filter(Boolean) as Zone[];
}

export const mid = (z:Zone) => (z.min + z.max) / 2;
export const fmtRange = (z?:Zone) => !z ? '—'
  : (Math.abs(z.max - z.min) < 1e-6 ? z.min.toFixed(2) : `${z.min.toFixed(2)}–${z.max.toFixed(2)}`);
export function distancePct(a:number, b:number){ return Math.abs(a-b) / ((a+b)/2) * 100; }

export function overlap(z1:Zone|{min:number;max:number}, z2:Zone){
  const lo = Math.max(Math.min(z1.min,z1.max), Math.min(z2.min,z2.max));
  const hi = Math.min(Math.max(z1.min,z1.max), Math.max(z2.min,z2.max));
  return Math.max(0, hi - lo);
}

export function parseLiquidity(list:any): Liquidity[] {
  if (!Array.isArray(list)) return [];
  const out:Liquidity[] = [];
  for (const raw of list) {
    let price:number|undefined, side:any, score:any, status:any, kinds:string[]|undefined;
    if (typeof raw === 'number' || typeof raw === 'string') {
      const n = toNum(raw); if (isFinite(n)) price = n;
    } else if (typeof raw === 'object') {
      price = toNum((raw as any).price ?? (raw as any).prezzo ?? (raw as any).livello ?? (raw as any).level);
      side  = String((raw as any).side ?? (raw as any).lato ?? '').toLowerCase();
      score = (raw as any).score ?? (raw as any).punteggio ?? (raw as any).rank;
      status= (raw as any).status ?? (raw as any).stato;
      kinds = Array.isArray((raw as any).tipi) ? (raw as any).tipi : Array.isArray((raw as any).kinds) ? (raw as any).kinds : undefined;
    }
    if (isFinite(price!)) {
      out.push({
        price: price!,
        side: (side.includes('buy')?'buy-side': side.includes('sell')?'sell-side':'buy-side'),
        score: isFinite(toNum(score)) ? toNum(score) : undefined,
        status, kinds, raw
      });
    }
  }
  return out;
}

export function getCurrentPrice(payload:any): number | undefined {
  const cands = [
    payload?.prezzo_attuale, payload?.prezzo, payload?.price, payload?.last,
    payload?.ticker?.price, payload?.close, payload?.ultimo
  ].map(toNum).filter((x)=>isFinite(x)) as number[];
  return cands[0];
}
