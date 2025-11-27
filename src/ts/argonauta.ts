// src/ts/argonauta.ts
import { Zone, Liquidity, parseZones, parseLiquidity, getCurrentPrice, mid, fmtRange, distancePct, overlap } from "./levels";

export type Treasure = {
  symbol: string;
  title: string;
  side: 'long'|'short';
  entry: string;          // zona testo
  invalidation: string;   // zona testo
  targets: string[];      // testi
  distance?: number;      // % dal prezzo
  rr_est?: number;        // stima RR
  score: number;          // 0–100
  tags: string[];
};

type Any = Record<string, any>;

export type ArgonautaConfig = {
  maxDistancePct: number;      // D (default 1%)
  minRR: number;               // Rmin (default 1.5)
  weights: { liq:number; sr:number; dist:number; rr:number; bias:number; overlap:number };
};

const DEFAULTS: ArgonautaConfig = {
  maxDistancePct: 1,
  minRR: 1.5,
  weights: { liq:0.2, sr:0.25, dist:0.2, rr:0.2, bias:0.1, overlap:0.05 },
};

const normScore = (v:number, min:number, max:number) =>
  (Math.max(min, Math.min(max, v)) - min) / (max - min || 1) * 100;

function biasFrom(payload:Any): 'long'|'short'|'neutro' {
  const d = String(payload?.direzione ?? payload?.risposte?.longshort?.direzione ?? '').toLowerCase();
  return d.includes('long') ? 'long' : d.includes('short') ? 'short' : 'neutro';
}

export function buildArgonautaCandidates(symbol:string, payload: Any, cfg?: Partial<ArgonautaConfig>): Treasure[] {
  const C = { ...DEFAULTS, ...(cfg||{}), weights: { ...DEFAULTS.weights, ...(cfg?.weights||{}) } };

  const S = parseZones(payload?.supporti ?? payload?.risposte?.supporti ?? payload?.livelli?.supporti, 'S');
  const R = parseZones(payload?.resistenze ?? payload?.risposte?.resistenze ?? payload?.livelli?.resistenze, 'R');
  const liq = [
    ...parseLiquidity(payload?.zone_liquidita?.sopra ?? payload?.liquidita_top?.sopra ?? []),
    ...parseLiquidity(payload?.zone_liquidita?.sotto ?? payload?.liquidita_top?.sotto ?? [])
  ];
  const price = getCurrentPrice(payload);
  const bias = biasFrom(payload);

  if (!price || (!S.length && !R.length)) return [];

  const out: Treasure[] = [];

  // helper
  const near = (zones:Zone[]) => zones
    .map(z => ({ z, d: distancePct(mid(z), price) }))
    .filter(o => isFinite(o.d))
    .sort((a,b)=>a.d-b.d);

  const nearS = near(S)[0]?.z;
  const nearR = near(R)[0]?.z;
  const nearLiq = liq.sort((a,b)=>Math.abs(a.price-price)-Math.abs(b.price-price))[0];

  // LONG: vicino a S1/S2
  if (nearS && distancePct(mid(nearS), price) <= C.maxDistancePct) {
    const entry = `${nearS.label ?? 'S?'} ${fmtRange(nearS)}`;
    const inv = S[1] ? `${S[1].label ?? 'S2'} ${fmtRange(S[1])}` : `${nearS.label ?? 'S?'} low fail`;
    const tgt1 = R[0] ? `${R[0].label ?? 'R1'} ${fmtRange(R[0])}` : undefined;
    const tgt2 = R[1] ? `${R[1].label ?? 'R2'} ${fmtRange(R[1])}` : undefined;

    const e = mid(nearS);
    const st = S[1] ? mid(S[1]) : (nearS.min - (nearS.max-nearS.min)*0.5);
    const tp = R[0] ? mid(R[0]) : e + (e - st);
    const rr = Math.abs(tp - e) / Math.max(1e-6, Math.abs(e - st));

    if (rr >= C.minRR) {
      const tags:string[] = ['near support'];
      if (bias !== 'neutro') tags.push(`bias:${bias}`);
      if (nearLiq) {
        tags.push(`${nearLiq.side}`);
        if (overlap({min:nearLiq.price,max:nearLiq.price}, nearS)>0) tags.push('liq@entry');
      }
      const score =
        C.weights.dist * normScore(100 - distancePct(mid(nearS), price), 0, 100) +
        C.weights.sr   * normScore(nearS.forza ?? 50, 0, 100) +
        C.weights.rr   * normScore(rr, 1, 3) +
        C.weights.bias * (bias === 'long' ? 100 : bias === 'neutro' ? 50 : 20) +
        C.weights.liq  * normScore(nearLiq?.score ?? 50, 0, 200) +
        C.weights.overlap * (nearLiq ? (overlap({min:nearLiq.price,max:nearLiq.price}, nearS)>0 ? 100 : 40) : 20);

      out.push({
        symbol, title:'Pullback su supporto (LONG)', side:'long',
        entry, invalidation: inv, targets: [tgt1, tgt2].filter(Boolean) as string[],
        distance: Number(distancePct(mid(nearS), price).toFixed(2)),
        rr_est: Number(rr.toFixed(2)), score: Math.round(score), tags
      });
    }
  }

  // SHORT: vicino a R1/R2
  if (nearR && distancePct(mid(nearR), price) <= C.maxDistancePct) {
    const entry = `${nearR.label ?? 'R?'} ${fmtRange(nearR)}`;
    const inv = R[1] ? `${R[1].label ?? 'R2'} ${fmtRange(R[1])}` : `${nearR.label ?? 'R?'} fail`;
    const tgt1 = S[0] ? `${S[0].label ?? 'S1'} ${fmtRange(S[0])}` : undefined;
    const tgt2 = S[1] ? `${S[1].label ?? 'S2'} ${fmtRange(S[1])}` : undefined;

    const e = mid(nearR);
    const st = R[1] ? mid(R[1]) : (nearR.max + (nearR.max-nearR.min)*0.5);
    const tp = S[0] ? mid(S[0]) : e - (st - e);
    const rr = Math.abs(e - tp) / Math.max(1e-6, Math.abs(st - e));

    if (rr >= C.minRR) {
      const tags:string[] = ['near resistance'];
      if (bias !== 'neutro') tags.push(`bias:${bias}`);
      if (nearLiq) {
        tags.push(`${nearLiq.side}`);
        if (overlap({min:nearLiq.price,max:nearLiq.price}, nearR)>0) tags.push('liq@entry');
      }
      const score =
        C.weights.dist * normScore(100 - distancePct(mid(nearR), price), 0, 100) +
        C.weights.sr   * normScore(nearR.forza ?? 50, 0, 100) +
        C.weights.rr   * normScore(rr, 1, 3) +
        C.weights.bias * (bias === 'short' ? 100 : bias === 'neutro' ? 50 : 20) +
        C.weights.liq  * normScore(nearLiq?.score ?? 50, 0, 200) +
        C.weights.overlap * (nearLiq ? (overlap({min:nearLiq.price,max:nearLiq.price}, nearR)>0 ? 100 : 40) : 20);

      out.push({
        symbol, title:'Ritesto resistenza (SHORT)', side:'short',
        entry, invalidation: inv, targets: [tgt1, tgt2].filter(Boolean) as string[],
        distance: Number(distancePct(mid(nearR), price).toFixed(2)),
        rr_est: Number(rr.toFixed(2)), score: Math.round(score), tags
      });
    }
  }

  return out.sort((a,b)=>b.score-a.score);
}
