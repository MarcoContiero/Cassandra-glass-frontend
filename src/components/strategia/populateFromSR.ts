// src/components/strategia/populateFromSR.ts
// Popola le 3 card (2+1) partendo SOLO da Supporti/Resistenze.
// Novità: TP con spaziatura minima percentuale per evitare target troppo vicini.

import type { Dir, ScenarioLite } from "./types";

/* ========== Config ========== */

// Buffer percentuale sul livello usato (0.15% = 0.0015)
const BUFFER_PCT = 0.0015;

// Spaziatura minima per i target:
// - ogni TP deve stare almeno a questa % dall'ENTRY
// - TP2 deve anche distare almeno TP_MIN_STEP_PCT da TP1
const TP_MIN_PCT = 0.0035;       // 0.35%
const TP_MIN_STEP_PCT = 0.0025;  // 0.25%

const round = (x: number, p = 6) => +x.toFixed(p);
const buf = (level: number) => Math.abs(level) * BUFFER_PCT;

/* ========== SR helpers ========== */

type Lvl = { price: number; strength: number };

/** Normalizza array generico di SR in {price, strength}[] numerico */
function toLevels(arr: any[]): Lvl[] {
  const out: Lvl[] = [];
  for (const x of arr ?? []) {
    const priceRaw =
      typeof x?.price === "number" ? x.price :
        typeof x?.prezzo === "number" ? x.prezzo :
          typeof x?.level === "number" ? x.level :
            typeof x?.valore === "number" ? x.valore : NaN;
    if (!Number.isFinite(priceRaw)) continue;

    const strengthRaw =
      typeof x?.strength === "number" ? x.strength :
        typeof x?.forza === "number" ? x.forza :
          typeof x?.score === "number" ? x.score :
            typeof x?.peso === "number" ? x.peso : 50;

    const strength =
      strengthRaw > 1 ? Math.max(0, Math.min(100, strengthRaw))
        : Math.max(0, Math.min(1, strengthRaw)) * 100;

    out.push({ price: priceRaw, strength });
  }

  // dedup per prezzo tenendo la forza massima
  const map = new Map<number, Lvl>();
  for (const l of out) {
    const prev = map.get(l.price);
    if (!prev || l.strength > prev.strength) map.set(l.price, l);
  }
  return Array.from(map.values()).sort((a, b) => a.price - b.price);
}

/** Seleziona i livelli più vicini al prezzo (solo per scegliere S0/S1/R0/R1/R2) */
function pickBands(S: Lvl[], R: Lvl[], price: number) {
  const supportsBelow = S.filter((l) => l.price < price);
  const resistsAbove = R.filter((l) => l.price > price);

  const S0 = supportsBelow.length ? supportsBelow[supportsBelow.length - 1] : undefined;
  const S1 = supportsBelow.length > 1 ? supportsBelow[supportsBelow.length - 2] : undefined;
  const S2 = supportsBelow.length > 2 ? supportsBelow[supportsBelow.length - 3] : undefined;

  const R0 = resistsAbove.length ? resistsAbove[0] : undefined;
  const R1 = resistsAbove.length > 1 ? resistsAbove[1] : undefined;
  const R2 = resistsAbove.length > 2 ? resistsAbove[2] : undefined;

  return { S0, S1, S2, R0, R1, R2 };
}

/* ========== Target pickers con spaziatura minima ========== */

// LONG → cerco resistenze SOPRA l'entry, rispettando le soglie
function pickTargetsAbove(entry: number, resists: Lvl[]): { tp1?: number; tp2?: number } {
  const min1 = entry * (1 + TP_MIN_PCT);
  const picked: number[] = [];

  for (const r of resists) {
    if (r.price <= entry) continue;
    if (r.price < min1) continue; // troppo vicino all'entry
    if (picked.length === 0) {
      picked.push(r.price);
      continue;
    }
    // per TP2 richiedi anche distanza minima da TP1
    const last = picked[picked.length - 1];
    const minStep = last * (1 + TP_MIN_STEP_PCT);
    if (r.price >= minStep) {
      picked.push(r.price);
      break;
    }
  }

  return { tp1: picked[0], tp2: picked[1] };
}

// SHORT → cerco supporti SOTTO l'entry, rispettando le soglie
function pickTargetsBelow(entry: number, supports: Lvl[]): { tp1?: number; tp2?: number } {
  const min1 = entry * (1 - TP_MIN_PCT);
  const picked: number[] = [];

  // supports è ordinato crescente: scorro al contrario per andare verso il basso
  for (let i = supports.length - 1; i >= 0; i--) {
    const s = supports[i];
    if (s.price >= entry) continue;
    if (s.price > min1) continue; // troppo vicino all'entry
    if (picked.length === 0) {
      picked.push(s.price);
      continue;
    }
    const last = picked[picked.length - 1];
    const maxStep = last * (1 - TP_MIN_STEP_PCT);
    if (s.price <= maxStep) {
      picked.push(s.price);
      break;
    }
  }

  return { tp1: picked[0], tp2: picked[1] };
}

/* ========== Builders (Regole 2+1) ========== */

// LONG — Pullback (rimbalzo sul supporto)
function buildLongPullback(S0?: Lvl, S1?: Lvl, Rlist: Lvl[] = []): Partial<ScenarioLite> {
  const entry = S0 ? round(S0.price + buf(S0.price)) : (NaN as any);
  const stop = S1 ? round(S1.price - buf(S1.price))
    : S0 ? round(S0.price - 2 * buf(S0.price)) : (NaN as any);

  const { tp1, tp2 } = Number.isFinite(entry as number)
    ? pickTargetsAbove(entry as number, Rlist)
    : { tp1: undefined, tp2: undefined };

  return {
    entry, stop, tp1, tp2,
    badge: "Pullback",
    status: "active",
  };
}

// LONG — Breakout (sfondamento resistenza)
function buildLongBreakout(R0?: Lvl, Rlist: Lvl[] = []): Partial<ScenarioLite> {
  const entry = R0 ? round(R0.price + buf(R0.price)) : (NaN as any);
  const stop = R0 ? round(R0.price - buf(R0.price)) : (NaN as any);

  // prendo le resistenze *sopra* l'entry (incluso R1, R2, …)
  const above = Rlist.filter((r) => !Number.isFinite(entry as number) ? false : r.price > (entry as number));
  const { tp1, tp2 } = Number.isFinite(entry as number)
    ? pickTargetsAbove(entry as number, above)
    : { tp1: undefined, tp2: undefined };

  return {
    entry, stop, tp1, tp2,
    badge: "Breakout",
    status: "active",
  };
}

// SHORT — Breakout (sfondamento supporto)
function buildShortBreakout(S0?: Lvl, Slist: Lvl[] = []): Partial<ScenarioLite> {
  const entry = S0 ? round(S0.price - buf(S0.price)) : (NaN as any);
  const stop = S0 ? round(S0.price + buf(S0.price)) : (NaN as any);

  const below = Slist.filter((s) => !Number.isFinite(entry as number) ? false : s.price < (entry as number));
  const { tp1, tp2 } = Number.isFinite(entry as number)
    ? pickTargetsBelow(entry as number, below)
    : { tp1: undefined, tp2: undefined };

  return {
    entry, stop, tp1, tp2,
    badge: "Breakout",
    status: "active",
  };
}

// SHORT — Pullback (rimbalzo su resistenza)
function buildShortPullback(R0?: Lvl, R1?: Lvl, Slist: Lvl[] = []): Partial<ScenarioLite> {
  const entry = R0 ? round(R0.price - buf(R0.price)) : (NaN as any);
  const stop = R1 ? round(R1.price + buf(R1.price))
    : R0 ? round(R0.price + 2 * buf(R0.price)) : (NaN as any);

  const { tp1, tp2 } = Number.isFinite(entry as number)
    ? pickTargetsBelow(entry as number, Slist)
    : { tp1: undefined, tp2: undefined };

  return {
    entry, stop, tp1, tp2,
    badge: "Pullback",
    status: "active",
  };
}

/* ========== API principale ========== */

export function populateThreeFromSR(args: {
  symbol: string;             // (non usato qui, ma tenuto per simmetria/config futura)
  price: number;              // solo per scegliere i livelli vicini iniziali
  winning: Dir;               // "LONG" | "SHORT"
  supporti: any[];
  resistenze: any[];
  skeleton: ScenarioLite[];   // le 3 card già create (2+1)
}): ScenarioLite[] {
  const { price, winning, supporti, resistenze, skeleton } = args;

  const S = toLevels(supporti);
  const R = toLevels(resistenze);
  const { S0, S1 } = pickBands(S, R, price); // per entry/stop pullback long
  const { R0 } = pickBands(S, R, price);     // per entry/stop breakout long

  let one: Partial<ScenarioLite>, two: Partial<ScenarioLite>, three: Partial<ScenarioLite>;

  if (winning === "LONG") {
    // Vincente = LONG → 1) Pullback (S)  2) Breakout (R)  3) Perdente SHORT Breakout (S)
    one = buildLongPullback(S0, S1, R);
    two = buildLongBreakout(R0, R);
    three = buildShortBreakout(S0, S);
  } else {
    // Vincente = SHORT → 1) Pullback (R)  2) Breakout (S)  3) Perdente LONG Breakout (R)
    one = buildShortPullback(R0, undefined, S);
    two = buildShortBreakout(S0, S);
    two.badge = "Breakout";
    three = buildLongBreakout(R0, R);
  }

  // Merge dentro lo scheletro rispettando etichette/meta già impostate
  return skeleton.map((s, i) => {
    const patch = i === 0 ? one : i === 1 ? two : three;
    return {
      ...s,
      ...patch,
      confidence: s.confidence ?? 50,
      tp1: Number.isFinite(patch.tp1 as number) ? (patch.tp1 as number) : undefined,
      tp2: Number.isFinite(patch.tp2 as number) ? (patch.tp2 as number) : undefined,
    } as ScenarioLite;
  });
}

export default populateThreeFromSR;
