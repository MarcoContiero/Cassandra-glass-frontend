// src/ts/aiFallbacks.ts
type AnyObj = Record<string, any>;

const TFS_BREVI = ["1m","3m","5m","15m","30m","1h","2h"];
const TFS_MEDI  = ["4h"];
const TFS_LUNGHI = ["6h","8h","12h","1d","3d","1w","1M"];

function pickPath(o: AnyObj, paths: string[][], def: any = undefined) {
  for (const p of paths) {
    let cur: any = o;
    let ok = true;
    for (const k of p) { cur = (cur ?? {})[k]; if (cur === undefined) { ok = false; break; } }
    if (ok && cur !== undefined) return cur;
  }
  return def;
}

function asZones(arr: any[]): {min:number,max:number,forza?:number}[] {
  if (!Array.isArray(arr)) return [];
  const parse = (x:any) => {
    if (x == null) return null;
    if (typeof x === "string") {
      // es: "183.29–185.04 (forza 53.4/💯)"
      const m = x.replace(",", ".").match(/([\d.]+)\s*[–-]\s*([\d.]+)/);
      if (m) return { min: +m[1], max: +m[2] };
      const s = x.replace(",", ".").match(/([\d.]+)/);
      if (s) { const v = +s[1]; return { min: v, max: v }; }
      return null;
    }
    const lo = x.min ?? x.low ?? x.da ?? x.start ?? x[0];
    const hi = x.max ?? x.high ?? x.a ?? x.end ?? x[1] ?? lo;
    const f  = x.forza ?? x.strength ?? undefined;
    if (lo == null && hi == null) return null;
    const min = +(`${lo}`.replace(",", "."));
    const max = +(`${hi}`.replace(",", "."));
    return isFinite(min) && isFinite(max) ? { min, max, forza: f } : null;
  };
  return arr.map(parse).filter(Boolean) as any;
}

function bestZone(zones: {min:number,max:number,forza?:number}[] | undefined) {
  if (!zones?.length) return undefined;
  // priorità: forza più alta, poi ampiezza minore
  return zones.slice().sort((a,b) => (b.forza ?? 0) - (a.forza ?? 0) || (a.max-a.min) - (b.max-b.min))[0];
}

function fmtRange(z?: {min:number,max:number}) {
  if (!z) return "—";
  return (Math.abs(z.max - z.min) < 1e-6) ? z.min.toFixed(2) : `${z.min.toFixed(2)}–${z.max.toFixed(2)}`;
}

function splitTF(trendTF: AnyObj) {
  const norm = Object.fromEntries(Object.entries(trendTF || {}).map(([k,v]) => [k, String(v ?? "").toUpperCase()]));
  const pick = (lst:string[]) => lst.filter(tf => norm[tf]).map(tf => `${tf}: ${norm[tf]}`).join(", ") || "—";
  return {
    brevi:  pick(TFS_BREVI),
    medi:   pick(TFS_MEDI),
    lunghi: pick(TFS_LUNGHI),
  };
}

export function buildSpiegazioneFallback(result: AnyObj): string {
  const direzione = (pickPath(result, [
    ["direzione"], ["risposte","longshort","direzione"], ["longshort","direzione"]
  ], "NEUTRO") as string).toUpperCase();

  const score = pickPath(result, [["score"],["risposte","score"]], "—");
  const delta = pickPath(result, [["delta"],["risposte","delta"]], "—");

  const trendTF = pickPath(result, [
    ["trend_tf"],["risposte","trend_tf"],["risposte","trend_tf_score"]
  ], {}) as AnyObj;
  const tf = splitTF(trendTF);

  const supporti = asZones(
    pickPath(result, [["supporti"],["risposte","supporti"],["livelli","supporti"]], [])
  );
  const resistenze = asZones(
    pickPath(result, [["resistenze"],["risposte","resistenze"],["livelli","resistenze"]], [])
  );

  const S1 = bestZone(supporti);
  const R1 = bestZone(resistenze);

  return [
    `Bias attuale: **${direzione}** (score ${score}, Δ ${delta}).`,
    `TF brevi: **${tf.brevi}**, 4h: **${trendTF["4h"]?.toUpperCase?.() || "—"}**, TF lunghi: **${tf.lunghi}**.`,
    `Prima area di difesa: **${fmtRange(S1)}** (possibili rimbalzi).`,
    `Prima area di pressione: **${fmtRange(R1)}** (possibili respinte).`,
    `🧭 In sintesi, score complessivo **${score}** pt con prevalenza **${direzione}**.`
  ].join("\n");
}

export function buildStrategieFallback(result: AnyObj) {
  const supporti = asZones(pickPath(result, [["supporti"],["risposte","supporti"],["livelli","supporti"]], []));
  const resistenze = asZones(pickPath(result, [["resistenze"],["risposte","resistenze"],["livelli","resistenze"]], []));
  const S1 = bestZone(supporti);
  const S2 = bestZone(supporti.filter(z => z !== S1));
  const R1 = bestZone(resistenze);

  return [
    {
      titolo: "Prosecuzione rialzista (LONG)",
      descrizione: "Trend forte con pullback poco profondi e breakout progressivi.",
      trigger: R1 ? `Break & tenuta sopra ${fmtRange(R1)} su 1h/4h` : "Break della prima resistenza",
      invalidazione: S1 ? `Chiusura 1h sotto ${fmtRange(S1)}` : "Perdita del primo supporto",
    },
    {
      titolo: "Pullback su livello chiave e continuazione (LONG)",
      descrizione: "Ritorno in area SR vicina e re-entry con EMA veloci.",
      trigger: S1 ? `Reazione su ${fmtRange(S1)} con engulf/RSI>50` : "Reazione sul primo supporto visibile",
      invalidazione: S2 ? `Chiusura 1h sotto ${fmtRange(S2)}` : (S1 ? `Close < ${fmtRange(S1)}` : "Perdita dell’area testata"),
    },
    {
      titolo: "Inversione ribassista (SHORT)",
      descrizione: "Rottura strutturale e cambio bias multi-TF.",
      trigger: S2 ? `Close 4h sotto ${fmtRange(S2)} + failure di retest` : (S1 ? `Close 4h < ${fmtRange(S1)}` : "Breakdown del primo supporto forte"),
      invalidazione: R1 ? `Reclaim ${fmtRange(R1)}` : "Reclaim della prima resistenza",
    },
  ];
}
