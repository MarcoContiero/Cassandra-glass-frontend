// src/ts/argonauta/extract.ts
export type Dir = "LONG" | "SHORT";
export type Level = { price: number; tf?: string; forza?: number; fonte?: string };
export type Suggestion = {
  dir: Dir; kind: "pullback" | "breakout";
  entry: number; stop?: number; tp1?: number; tp2?: number;
  tf?: string; rr?: number | null; score?: number | null; desc?: string;
  tag?: "vicino" | "forte";
};

const toNum = (x: any): number | null => {
  if (x == null) return null;
  const n = Number(String(x).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export function winnerDirection(data: any): Dir {
  const direct = String(data?.longshort?.direzione ?? data?.longshort?.direction ?? "").toUpperCase();
  if (direct === "LONG" || direct === "SHORT") return direct as Dir;

  const tfs = Object.keys(data?.trend_tf_score ?? {});
  if (tfs.length) {
    let acc = 0; // >0 ⇒ SHORT, <0 ⇒ LONG
    for (const tf of tfs) {
      const r = data.trend_tf_score[tf] ?? {};
      acc += Number(r.short ?? 0) - Number(r.long ?? 0);
    }
    if (acc > 0) return "SHORT";
    if (acc < 0) return "LONG";
  }
  const delta = Number(data?.liquidity_summary?.delta ?? data?.diagnostica?.liquidity_bias?.delta ?? 0);
  return Number.isFinite(delta) ? (delta >= 0 ? "LONG" : "SHORT") : "LONG";
}

function tfW(tf?: string): number {
  const t = (tf ?? "").toLowerCase();
  if (/15m/.test(t)) return 1;
  if (/1h/.test(t)) return 2;
  if (/4h/.test(t)) return 3;
  if (/12h/.test(t)) return 4;
  if (/1d|1g/.test(t)) return 5;
  if (/1w/.test(t)) return 6;
  return 1;
}

function liquidity(data: any) {
  const liq = data?.liquidity ?? {};
  const map = (arr: any[]) =>
    Array.isArray(arr)
      ? arr.map((v) => {
        const price = toNum(v.livello ?? v.level ?? v.price ?? v.prezzo);
        if (!Number.isFinite(price)) return null;
        return { price: price as number, tf: v.tf ?? v.timeframe, forza: Number(v?.forza) || 0, fonte: v.source ?? v.fonte ?? v.tipo };
      }).filter(Boolean) as Level[]
      : [];
  return { above: map(liq.sopra ?? liq.above ?? []), below: map(liq.sotto ?? liq.below ?? []) };
}

function nearest(levels: Level[], px: number, dir: Dir, kind: "pullback" | "breakout") {
  const c = dir === "LONG"
    ? (kind === "pullback" ? levels.filter(l => l.price < px) : levels.filter(l => l.price > px))
    : (kind === "pullback" ? levels.filter(l => l.price > px) : levels.filter(l => l.price < px));
  return c.sort((a, b) => Math.abs(a.price - px) - Math.abs(b.price - px))[0] ?? null;
}

function strongest(levels: Level[]): Level | null {
  if (!levels.length) return null;
  return levels
    .slice()
    .sort((a, b) => ((b.forza ?? 0) + tfW(b.tf)) - ((a.forza ?? 0) + tfW(a.tf)))[0]!;
}

function signalScore(entry: number, price: number, lvl: Level | null, bias: Dir, dir: Dir): number {
  const distPct = Math.abs(entry - price) / price * 100;
  const near = Math.max(0, 40 - Math.min(distPct * 200, 40));
  const levelScore = Math.min(40, (lvl?.forza ?? 0) * 3 + tfW(lvl?.tf) * 3);
  const biasBonus = bias === dir ? 20 : 5;
  return Math.round(Math.min(100, near + levelScore + biasBonus));
}

export function buildSuggestions(data: any): Suggestion[] {
  const px = toNum(data?.prezzo ?? data?.price) ?? 0;
  const liq = liquidity(data);
  const bias = winnerDirection(data);

  const sopra = liq.above;
  const sotto = liq.below;

  const nearPullLong = nearest(sotto, px, "LONG", "pullback");
  const nearBreakLong = nearest(sopra, px, "LONG", "breakout");
  const nearPullShort = nearest(sopra, px, "SHORT", "pullback");
  const nearBreakShort = nearest(sotto, px, "SHORT", "breakout");

  const poolStrong = bias === "LONG" ? sotto : sopra;
  const strongWin = strongest(poolStrong);

  const out: Suggestion[] = [];
  const push = (dir: Dir, kind: "pullback" | "breakout", lvl: Level | null, tag?: "vicino" | "forte") => {
    if (!lvl) return;
    const buffer = 0.0015; // 0.15%
    const entry = dir === "LONG"
      ? (kind === "breakout" ? lvl.price * (1 + buffer) : lvl.price)
      : (kind === "breakout" ? lvl.price * (1 - buffer) : lvl.price);

    const stop = dir === "LONG" ? entry * (1 - 0.0035) : entry * (1 + 0.0035);

    const nexts = dir === "LONG"
      ? [...sopra].filter(l => l.price > entry).sort((a, b) => a.price - b.price).slice(0, 2)
      : [...sotto].filter(l => l.price < entry).sort((a, b) => b.price - a.price).slice(0, 2);

    const tp1 = nexts[0]?.price ?? (dir === "LONG" ? entry * 1.0075 : entry * 0.9925);
    const tp2 = nexts[1]?.price ?? (dir === "LONG" ? entry * 1.0175 : entry * 0.9825);

    const s: Suggestion = {
      dir, kind, entry, stop, tp1, tp2, tf: lvl.tf,
      rr: (() => { const r = Math.abs((tp1 as number) - entry), k = Math.abs(entry - (stop as number)); return k > 0 ? +(r / k).toFixed(2) : null; })(),
      score: signalScore(entry, px, lvl, bias, dir),
      desc: lvl.fonte ? (kind === "pullback" ? `Rimbalzo su ${lvl.fonte}` : `Breakout di ${lvl.fonte}`) : undefined,
      tag,
    };
    out.push(s);
  };

  if (bias === "LONG") {
    if (nearPullLong) push("LONG", "pullback", nearPullLong, "vicino");
    if (nearBreakLong) push("LONG", "breakout", nearBreakLong, "vicino");
  } else {
    if (nearPullShort) push("SHORT", "pullback", nearPullShort, "vicino");
    if (nearBreakShort) push("SHORT", "breakout", nearBreakShort, "vicino");
  }

  const opp = bias === "LONG"
    ? [["pullback", nearPullShort], ["breakout", nearBreakShort]]
    : [["pullback", nearPullLong], ["breakout", nearBreakLong]];
  const bestOpp = opp.filter(([, l]) => !!l)
    .sort((a, b) => Math.abs((a[1] as Level).price - (px as number)) - Math.abs((b[1] as Level).price - (px as number)))[0];
  if (bestOpp) {
    const kind = bestOpp[0] as "pullback" | "breakout";
    const lvl = bestOpp[1] as Level;
    push(bias === "LONG" ? "SHORT" : "LONG", kind, lvl, "vicino");
  }

  if (strongWin) push(bias, "pullback", strongWin, "forte");

  return out.slice(0, 4).sort((a, b) => Math.abs(a.entry - (px as number)) - Math.abs(b.entry - (px as number)));
}
