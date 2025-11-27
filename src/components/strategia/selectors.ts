import type { ScenarioLite, Dir } from "./types";

/** pickFirst helper */
function pickFirst<T = any>(x: any, keys: (string | number)[], transform?: (v: any) => T): T | undefined {
  for (const k of keys) {
    const v = typeof k === "number" ? x?.[k] : x?.[k];
    if (v !== undefined && v !== null) return transform ? transform(v) : (v as T);
  }
  return undefined;
}
const num = (v: any, d = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};

function normalizeDir(v: any): Dir {
  const s = String(v ?? "").toUpperCase();
  if (s.startsWith("L")) return "LONG";
  if (s.startsWith("S")) return "SHORT";
  return "LONG";
}

export function collectScenarios(r: any): any[] {
  const cands: any[] = [];
  const push = (xs?: any[]) => { if (Array.isArray(xs)) cands.push(...xs); };
  push(r?.scenari_attivi); push(r?.risposte?.scenari_attivi);
  push(r?.scenari); push(r?.risposte?.scenari);
  push(r?.entries); push(r?.risposte?.entries);
  return Array.from(new Set(cands.filter(Boolean)));
}

export function toScenarioLite(x: any): ScenarioLite {
  const direction: Dir =
    normalizeDir(
      pickFirst<string>(x, ["direction", "direzione", "dir", "tipo"])
    );

  const tf = (pickFirst<string | string[]>(x, ["tf", "timeframes"]) ??
    []) as string[] | string;
  const tfArr = Array.isArray(tf) ? tf : String(tf).split(/[,\s]+/g).filter(Boolean);

  const confRaw = pickFirst<number | string>(x, ["confidence", "confidenza", "score", "punteggio", "totale"]);
  const confidence = Math.max(0, Math.min(100, typeof confRaw === "string" ? Number(confRaw) : (confRaw ?? 50)));

  const out: ScenarioLite = {
    direction,
    entry: num(pickFirst<number>(x, ["entry", "ingresso", "entry_sopra", "entry_sotto"])),
    stop: num(pickFirst<number>(x, ["stop", "invalidazione", "stoploss"])),
    tp1: pickFirst<number>(x, ["tp1", "target1", "t1"]),
    tp2: pickFirst<number>(x, ["tp2", "target2", "t2"]),
    rr: pickFirst<number>(x, ["rr", "riskreward"]),
    rrNet: pickFirst<number>(x, ["rrNet", "rr_net"]),
    confidence,
    name: pickFirst<string>(x, ["name", "nome", "label"]),
    meta: pickFirst<string>(x, ["meta", "badge"]),
    badge: pickFirst<string>(x, ["badge"]),
    explanation: pickFirst<string>(x, ["explanation", "spiegazione"]),
    narrative: pickFirst<string>(x, ["narrative", "narrativa"]),
    trigger: pickFirst<string>(x, ["trigger"]),
    triggerZone: pickFirst<string>(x, ["triggerZone"]),
    invalidationText: pickFirst<string>(x, ["invalidationText"]),
    invalidationZone: pickFirst<string>(x, ["invalidationZone"]),
    targetsText: pickFirst<string>(x, ["targetsText"]),
    tf: tfArr.length ? tfArr : undefined,
    status: pickFirst(x, ["status"]),
    note: pickFirst(x, ["note", "notes"]),
    source: pickFirst(x, ["source"]),
    momentum: pickFirst<number>(x, ["momentum"]),          // può mancare: sarà 0.5 in scoring
    momentumDir: pickFirst<any>(x, ["momentumDir"]),       // opzionale
  };

  // garantisci numeri definiti
  out.entry = num(out.entry);
  out.stop = num(out.stop);

  return out;
}
