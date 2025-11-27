// src/lib/tlFilter.ts
export const PF_VALUES = ['2+', '3', '>3'] as const;
export type PointsFilter = typeof PF_VALUES[number];

export type TLFilterOptions = { tolPct?: number };

export const filterTLList = (list: any[] = [], pf: PointsFilter, opt?: TLFilterOptions) =>
  list.filter((tl) => {
    const n = countAnchors(tl, opt); // conta anche touches numerici, ecc.
    if (pf === '2+') return n >= 2;
    if (pf === '3')  return n === 3;
    return n > 3; // '>3'
  });

// ---- helpers ----
const asNum = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const firstArray = (obj: any, keys: string[]) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (Array.isArray(v)) return v as any[];
  }
  return undefined;
};

const extractPrice = (pt: any): number | undefined => {
  if (pt == null) return;
  if (typeof pt === 'number') return pt;
  if (Array.isArray(pt)) return asNum(pt[1] ?? pt[0]);
  const candidates = [pt.price, pt.y, pt.value, pt.close, pt.c, pt.p, pt.v];
  for (const c of candidates) {
    const n = asNum(c);
    if (n != null) return n;
  }
  return undefined;
};

const median = (arr: number[]) => {
  if (!arr.length) return undefined;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---- core ----
/**
 * Conta le ancore “utili”.
 * - Se ci sono ancore esplicite, le usa.
 * - Dal terzo in poi somma i touches/hits che cadono entro la tolleranza.
 * - Se il payload ha solo contatori numerici (npoints / touches / pointsCount),
 *   li usa come fallback.
 */
// --- sostituisci questa funzione in src/lib/tlFilter.ts ---
export const countAnchors = (tl: any, opt: TLFilterOptions = {}): number => {
  if (!tl || typeof tl !== 'object') return 2; // minimo per non perdere TL valide

  const tolPct = typeof opt.tolPct === 'number' ? Math.max(0, opt.tolPct) : 0.001; // 0.1%

  // 1) ancore esplicite
  let anchors = firstArray(tl, ['anchors', 'points', 'punti']);
  let n = Array.isArray(anchors) ? anchors.length : 0;

  // 2) ancore nominate (p1..p4 / start-end)
  if (!n) {
    const named = [
      tl.p1 ?? tl.a ?? tl.start ?? tl.from,
      tl.p2 ?? tl.b ?? tl.end ?? tl.to,
      tl.p3 ?? tl.c,
      tl.p4 ?? tl.d,
    ].filter(Boolean);
    n = named.length;
    anchors = named as any[];
  }

  // 3) scala per la tolleranza
  const anchorPrices =
    Array.isArray(anchors) ? anchors.map(extractPrice).filter((x): x is number => x != null) : [];
  const priceScale = anchorPrices.length ? median(anchorPrices) : undefined;
  const tolAbs = priceScale != null ? Math.abs(priceScale) * tolPct : undefined;

  // 4) touches/hits come LISTA con distanze -> aggiungo quelli entro tolleranza
  const touchesArr = firstArray(tl, ['touches', 'hits', 'touchesList']);
  if (Array.isArray(touchesArr) && n >= 2) {
    let add = 0;
    for (const t of touchesArr) {
      let dist: number | undefined;
      if (typeof t === 'number') dist = Math.abs(t);
      else if (t && typeof t === 'object') {
        const dCand = [t.distance, t.dist, t.delta, t.err, t.deviation, t.off, t.offset]
          .map(asNum)
          .find((x) => x != null);
        if (dCand != null) dist = Math.abs(dCand);
      }
      if (dist != null) {
        const pass = tolAbs != null ? dist <= tolAbs : dist <= tolPct; // fallback relativo
        if (pass) add++;
      }
    }
    n += add;
  }

  // 5) contatori NUMERICI affidabili
  const isSmallInt = (x: any) => Number.isInteger(x) && x >= 0 && x <= 12;
  const npoints = asNum((tl as any).npoints) ?? asNum((tl as any).pointsCount);
  const touchesNum = asNum((tl as any).touches);
  const hitsNum = asNum((tl as any).hits ?? (tl as any).hitsCount);

  // se ho un conteggio esplicito, prendilo; altrimenti considera touches/hits numerici
  const countLike =
    (npoints != null ? npoints : undefined) ??
    (isSmallInt(touchesNum) ? touchesNum : undefined) ??
    (isSmallInt(hitsNum) ? hitsNum : undefined);

  if (countLike != null) n = Math.max(n, countLike);

  // 6) evita 0: se non ho capito nulla della linea, trattala come 2 tocchi
  if (!Number.isFinite(n) || n < 2) return 2;
  return Math.floor(n);
};
