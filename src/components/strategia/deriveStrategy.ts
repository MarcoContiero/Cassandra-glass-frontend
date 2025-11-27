// Derivazione scenari LONG/SHORT da SR + fallback backend + fallback neutrale.
// Include la regola: "il livello short dominante governa lo stop del long".

import type { ScenarioLite } from "./types";

/* ───── util numerici ───── */
const num = (v: any, d = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};
const withPrec = (x: number, p = 6) => +x.toFixed(p);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/* ───── tick ───── */
function tickOf(_symbol: string) {
  // se hai un mapping reale per simbolo, mettilo qui
  return 0.001;
}

/* ───── tipi interni leggeri ───── */
type SRLevel = { price: number; strength: number; kind: "S" | "R" };
type SRIndex = { levels: SRLevel[]; tick: number };

export type DeriveArgs = {
  symbol: string;
  price: number;
  supporti: any[];
  resistenze: any[];
  backendScenarios?: ScenarioLite[];
};

/* ───── SR: build index + strengthNear ───── */
function readLevel(x: any, kind: "S" | "R"): SRLevel | null {
  const price =
    num(x?.price) ?? num(x?.prezzo) ?? num(x?.level) ?? num(x?.livello) ?? num(x?.value);
  if (!Number.isFinite(price)) return null;

  const raw =
    num(x?.strength, NaN) ??
    num(x?.forza, NaN) ??
    num(x?.score, NaN) ??
    num(x?.peso, NaN) ??
    num(x?.weight, NaN);
  const strength = Number.isFinite(raw) ? (raw > 1 ? clamp01(raw / 100) : clamp01(raw)) : 0.5;

  return { price, strength, kind };
}

function buildSRIndex(supporti: any[], resistenze: any[], symbol: string): SRIndex {
  const S = (supporti ?? []).map((x) => readLevel(x, "S")).filter(Boolean) as SRLevel[];
  const R = (resistenze ?? []).map((x) => readLevel(x, "R")).filter(Boolean) as SRLevel[];
  // dedup su prezzo tenendo strength max
  const map = new Map<number, SRLevel>();
  for (const it of [...S, ...R]) {
    const prev = map.get(it.price);
    if (!prev || it.strength > prev.strength) map.set(it.price, it);
  }
  const levels = Array.from(map.values()).sort((a, b) => a.price - b.price);
  return { levels, tick: tickOf(symbol) };
}

function strengthNear(index: SRIndex, price: number, maxTicks = 3): number {
  const { levels, tick } = index;
  const tol = maxTicks * tick;
  let best: SRLevel | null = null;
  for (const l of levels) {
    const d = Math.abs(l.price - price);
    if (d <= tol && (!best || d < Math.abs(best.price - price))) best = l;
  }
  return best ? best.strength : 0;
}

/* ───── scenari da SR (grezzi) ───── */
function scenariosFromSR(symbol: string, price: number, index: SRIndex): ScenarioLite[] {
  const below = index.levels.filter((l) => l.price < price && l.kind === "S");
  const above = index.levels.filter((l) => l.price > price && l.kind === "R");
  const nearestS = below.length ? below[below.length - 1] : null;
  const nearestR = above.length ? above[0] : null;

  const t = index.tick;
  const out: ScenarioLite[] = [];

  if (nearestS) {
    const nextS = below.length > 1 ? below[below.length - 2] : null;
    const stop = nextS ? nextS.price - t : nearestS.price - 2 * t;
    out.push({
      direction: "LONG",
      entry: withPrec(nearestS.price),
      stop: withPrec(stop),
      tp1: withPrec(nearestS.price + 3 * t),
      confidence: 50,
      source: "sr",
      status: "active",
    });
  }

  if (nearestR) {
    const nextR = above.length > 1 ? above[1] : null;
    const stop = nextR ? nextR.price + t : nearestR.price + 2 * t;
    out.push({
      direction: "SHORT",
      entry: withPrec(nearestR.price),
      stop: withPrec(stop),
      tp1: withPrec(nearestR.price - 3 * t),
      confidence: 50,
      source: "sr",
      status: "active",
    });
  }

  return out;
}

/* ───── sanitize base ───── */
function sanitizeScenarios(scen: ScenarioLite[], symbol: string): ScenarioLite[] {
  const t = tickOf(symbol);
  const minGap = 2 * t;

  return (scen ?? []).map((s) => {
    let entry = num(s.entry);
    let stop = num(s.stop);
    if (s.direction === "LONG") {
      if (entry - stop < minGap) stop = withPrec(entry - minGap);
    } else {
      if (stop - entry < minGap) entry = withPrec(stop - minGap);
    }
    return {
      ...s,
      entry,
      stop,
      tp1: Number.isFinite(s.tp1 as number) ? (s.tp1 as number) : undefined,
      tp2: Number.isFinite(s.tp2 as number) ? (s.tp2 as number) : undefined,
      rr: Number.isFinite(s.rr as number) ? (s.rr as number) : undefined,
      rrNet: Number.isFinite(s.rrNet as number) ? (s.rrNet as number) : undefined,
      confidence: Number.isFinite(s.confidence as number) ? (s.confidence as number) : 50,
    };
  });
}

/* ───── regola dominante: short-level più forte governa stop del long ───── */
function reconcileDominantSR(scenarios: ScenarioLite[], symbol: string, index: SRIndex): ScenarioLite[] {
  const L = scenarios.find((s) => s.direction === "LONG" && Number.isFinite(s.entry) && Number.isFinite(s.stop));
  const S = scenarios.find((s) => s.direction === "SHORT" && Number.isFinite(s.entry) && Number.isFinite(s.stop));
  if (!L || !S) return scenarios;

  const t = index.tick;
  const sStopL = strengthNear(index, L.stop);
  const sEntryS = strengthNear(index, S.entry);

  if (sEntryS > sStopL) {
    const newStopL = withPrec(S.entry - t);
    const longAdj: ScenarioLite = { ...L, stop: newStopL, status: "adjusted", note: `Stop riallineato al livello dominante ${S.entry}` };
    const shortPost: ScenarioLite = { ...S, entry: newStopL, status: "suspended", note: `Attivo dopo close < ${S.entry} + retest (OCO col long)` };
    return scenarios.map((x) => (x === L ? longAdj : x === S ? shortPost : x));
  }

  const newEntryS = withPrec(L.stop - t);
  const shortAdj: ScenarioLite = { ...S, entry: newEntryS, status: "adjusted", note: `Entry spostato sotto lo stop long (${L.stop})` };
  return scenarios.map((x) => (x === S ? shortAdj : x));
}

/* ───── merge backend semplice (se vuoi, tieni il migliore per direzione) ───── */
function mergeWithBackend(local: ScenarioLite[], backend?: ScenarioLite[]): ScenarioLite[] {
  if (!backend?.length) return local;
  // mettiamo semplicemente prima i backend così, se non c'è SR, il sanitize li terrà
  return [...backend, ...local];
}

/* ───── fallback neutrale (per evitare UI vuota) ───── */
function fallbackNeutral(price: number, symbol: string): ScenarioLite[] {
  const t = tickOf(symbol);
  return [
    {
      direction: "LONG",
      entry: withPrec(price - 2 * t),
      stop: withPrec(price - 5 * t),
      tp1: withPrec(price + 3 * t),
      tp2: withPrec(price + 5 * t),
      confidence: 50,
      status: "suspended",
      source: "sr",
      note: "Fallback neutrale: SR/entries non disponibili",
    },
    {
      direction: "SHORT",
      entry: withPrec(price + 2 * t),
      stop: withPrec(price + 5 * t),
      tp1: withPrec(price - 3 * t),
      tp2: withPrec(price - 5 * t),
      confidence: 50,
      status: "suspended",
      source: "sr",
      note: "Fallback neutrale: SR/entries non disponibili",
    },
  ];
}

/* ───── API principale ───── */
export function deriveStrategy(args: DeriveArgs): ScenarioLite[] {
  const symbol = String(args?.symbol ?? "BTCUSDT");
  const price = num(args?.price, 0);
  const supporti = Array.isArray(args?.supporti) ? args.supporti : [];
  const resistenze = Array.isArray(args?.resistenze) ? args.resistenze : [];
  const backend = Array.isArray(args?.backendScenarios) ? args.backendScenarios : [];

  // 1) Index SR
  const index = buildSRIndex(supporti, resistenze, symbol);

  // 2) Scenari da SR
  let scenarios: ScenarioLite[] = scenariosFromSR(symbol, price, index);

  // 3) Merge con backend (se presenti)
  scenarios = mergeWithBackend(scenarios, backend);

  // 4) Sanitize base
  scenarios = sanitizeScenarios(scenarios, symbol);

  // 5) Riconciliazione “dominant SR governs long stop”
  scenarios = reconcileDominantSR(scenarios, symbol, index);

  // 6) Se dopo tutto non c’è nulla ma il backend c’era, usa direttamente backend sanificato
  if ((!scenarios || scenarios.length === 0) && backend.length) {
    const backendSafe = sanitizeScenarios(backend.map((b) => ({
      ...b,
      direction: (String(b.direction || "LONG").toUpperCase() === "SHORT" ? "SHORT" : "LONG"),
      entry: num(b.entry),
      stop: num(b.stop),
      tp1: Number.isFinite(b.tp1 as number) ? (b.tp1 as number) : undefined,
      tp2: Number.isFinite(b.tp2 as number) ? (b.tp2 as number) : undefined,
      confidence: Number.isFinite(b.confidence as number) ? (b.confidence as number) : 50,
    })), symbol);
    if (backendSafe.length) return backendSafe;
  }

  // 7) Ultima rete di sicurezza: fallback neutrale
  if (!scenarios || scenarios.length === 0) {
    scenarios = fallbackNeutral(price, symbol);
  }

  return scenarios;
}

// export default per compatibilità
export default deriveStrategy;
