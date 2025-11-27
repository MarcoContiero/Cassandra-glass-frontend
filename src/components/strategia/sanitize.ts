// src/components/strategia/sanitize.ts
// Sanitizzazione degli scenari: normalizza, deduplica e seleziona i migliori per direzione.

import type { ScenarioLite, Dir } from "./types";
import { computeSignalScore } from "./scoring";

/* Helpers ------------------------------------------------------------------ */

const num = (v: any, d = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Tick base: se hai un mapping per symbol, spostalo qui. */
export const DEFAULT_TICK = 0.001;

/** Applica un piccolo min-gap per evitare stop attaccati all'entry. */
function enforceMinGap(s: ScenarioLite, tick = DEFAULT_TICK): ScenarioLite {
  const minGap = 2 * tick;
  let entry = num(s.entry);
  let stop = num(s.stop);

  if (s.direction === "LONG") {
    if (entry - stop < minGap) stop = entry - minGap;
  } else {
    if (stop - entry < minGap) entry = stop - minGap;
  }
  return { ...s, entry, stop };
}

/** Dedup per (direction, entry, stop, tp1, tp2) arrotondati al tick */
function dedupScenarios(items: ScenarioLite[], tick = DEFAULT_TICK): ScenarioLite[] {
  const key = (x: number) => (Math.round(x / tick) * tick).toFixed(6);
  const set = new Set<string>();
  const out: ScenarioLite[] = [];
  for (const s of items) {
    const k = [
      s.direction,
      key(num(s.entry)),
      key(num(s.stop)),
      s.tp1 !== undefined ? key(num(s.tp1)) : "-",
      s.tp2 !== undefined ? key(num(s.tp2)) : "-",
    ].join("|");
    if (!set.has(k)) {
      set.add(k);
      out.push(s);
    }
  }
  return out;
}

/** Sceglie il migliore per direzione: punteggio segnale → vicinanza al prezzo come tie-breaker */
function pickBestPerDirection(items: ScenarioLite[], price?: number): ScenarioLite[] {
  const byDir: Record<Dir, ScenarioLite[]> = { LONG: [], SHORT: [] };
  for (const s of items) {
    if (s.direction === "LONG") byDir.LONG.push(s);
    else if (s.direction === "SHORT") byDir.SHORT.push(s);
  }

  const pick = (arr: ScenarioLite[]): ScenarioLite | undefined => {
    if (!arr.length) return undefined;

    const decorated = arr.map((s) => {
      const { score } = computeSignalScore(s, { price });
      const dist =
        Number.isFinite(price) && Number.isFinite(s.entry)
          ? Math.abs((s.entry! - (price as number)) / (price as number))
          : Number.POSITIVE_INFINITY;
      return { s, score, dist };
    });

    decorated.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.dist - b.dist;
    });

    return decorated[0].s;
  };

  const L = pick(byDir.LONG);
  const S = pick(byDir.SHORT);
  return [L, S].filter(Boolean) as ScenarioLite[];
}

/* API ---------------------------------------------------------------------- */

/**
 * Sanitizza una lista di scenari:
 *  - normalizza numeri
 *  - applica min-gap entry/stop
 *  - deduplica
 *  - seleziona il migliore per ciascuna direzione
 */
export function sanitizePerDirection(items: ScenarioLite[], price?: number, tick = DEFAULT_TICK): ScenarioLite[] {
  const base = Array.isArray(items) ? items : [];

  const normalized = base.map((s) =>
    enforceMinGap(
      {
        ...s,
        direction: (s.direction ?? "LONG") as Dir,
        entry: num(s.entry),
        stop: num(s.stop),
        tp1: Number.isFinite(s.tp1 as number) ? (s.tp1 as number) : undefined,
        tp2: Number.isFinite(s.tp2 as number) ? (s.tp2 as number) : undefined,
        rr: Number.isFinite(s.rr as number) ? (s.rr as number) : undefined,
        rrNet: Number.isFinite(s.rrNet as number) ? (s.rrNet as number) : undefined,
        confidence: clamp(num(s.confidence, 50), 0, 100),
      },
      tick
    )
  );

  const unique = dedupScenarios(normalized, tick);
  return pickBestPerDirection(unique, price);
}

/** Pre-selezione completa (alias comodo) */
export function sanitizeAll(items: ScenarioLite[], price?: number): ScenarioLite[] {
  return sanitizePerDirection(items, price, DEFAULT_TICK);
}
