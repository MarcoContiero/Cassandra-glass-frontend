import type { ScenarioLite } from "./types";

/** util numerico robusto */
function num(v: any, d = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
}

function fixScenarioNumbers(s: Partial<ScenarioLite>): ScenarioLite {
  const entry = num(s.entry, 0);
  const stop = num(s.stop, 0);
  const tp1 = Number.isFinite(s.tp1 as number) ? (s.tp1 as number) : undefined;
  const tp2 = Number.isFinite(s.tp2 as number) ? (s.tp2 as number) : undefined;
  const rr = Number.isFinite(s.rr as number) ? (s.rr as number) : undefined;
  const rrNet = Number.isFinite(s.rrNet as number) ? (s.rrNet as number) : undefined;

  return {
    direction: (s.direction ?? "LONG") as "LONG" | "SHORT",
    entry,
    stop,
    tp1,
    tp2,
    rr,
    rrNet,
    confidence: Number.isFinite(s.confidence as number) ? (s.confidence as number) : undefined,
    signalScore: Number.isFinite(s.signalScore as number) ? (s.signalScore as number) : undefined,
    momentum: Number.isFinite(s.momentum as number) ? (s.momentum as number) : undefined,
    momentumDir: s.momentumDir,
    name: s.name,
    meta: s.meta,
    badge: s.badge,
    explanation: s.explanation,
    narrative: s.narrative,
    trigger: s.trigger,
    triggerZone: s.triggerZone,
    invalidationText: s.invalidationText,
    invalidationZone: s.invalidationZone,
    targetsText: s.targetsText,
    tf: Array.isArray(s.tf) ? s.tf : undefined,
    status: s.status,
    note: s.note,
    source: s.source,
    label: s.label,
    tags: s.tags,
  };
}

/** Esempio: ricava uno scenario dai SR + opzioni; i numeri tornano sempre definiti */
export function fallbackFromSR(raw: any, fullOpts: any = {}): ScenarioLite {
  const entry = num(raw?.entry);
  const stop = num(raw?.stop);
  let tp1 = raw?.tp1;
  let tp2 = raw?.tp2;

  // eventuale calcolo TP se mancanti (placeholder — mantieni la tua logica)
  const tick = num(fullOpts?.tick, 0.001);
  if (!Number.isFinite(tp1 as number)) tp1 = entry + (raw?.direction === "LONG" ? 3 * tick : -3 * tick);
  if (!Number.isFinite(tp2 as number)) tp2 = entry + (raw?.direction === "LONG" ? 5 * tick : -5 * tick);

  // RR (placeholder: ricalcola con tua funzione se presente)
  let rr: number | undefined = raw?.rr;
  if (!Number.isFinite(rr as number)) {
    const risk = Math.abs(entry - stop);
    const reward = Math.abs((tp1 as number) - entry);
    rr = risk > 0 ? +(reward / risk).toFixed(2) : undefined;
  }

  const s: Partial<ScenarioLite> = {
    direction: (String(raw?.direction || raw?.dir || "LONG").toUpperCase() as "LONG" | "SHORT"),
    entry,
    stop,
    tp1: Number(tp1),
    tp2: Number(tp2),
    rr,
    source: raw?.source ?? "sr",
    status: raw?.status,
    note: raw?.note,
  };

  return fixScenarioNumbers(s);
}

/** Completa dagli "entries" meccanici già presenti */
export function fillLevelsFromEntries(opts: {
  scenarios: ScenarioLite[];
  entries?: any[];
  supporti?: any[];
  resistenze?: any[];
  price?: number;
}): ScenarioLite[] {
  const base = Array.isArray(opts.scenarios) ? opts.scenarios : [];
  return base.map((s) =>
    fixScenarioNumbers({
      ...s,
      entry: num(s.entry),
      stop: num(s.stop),
      tp1: s.tp1,
      tp2: s.tp2,
      rr: s.rr,
      rrNet: s.rrNet,
    })
  );
}
