import type { Dir, ScenarioLite, MomentumDir } from "./types";

/** helpers */
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const to01 = (v: any, d = 0.5) => clamp01(Number.isFinite(v) ? Number(v) : d);

/** momentum score: se manca -> 0.5 neutro */
function momentumScore(x: number | undefined): number {
  return to01(x, 0.5);
}

/** bonus coerenza direzionale (semplice) */
function trendBonus(direction: Dir, winning?: Dir): number {
  if (!winning) return 0.5;
  return direction === winning ? 1 : 0;
}

/** distanza/near-proximity (placeholder semplice 0..1) */
function proximity(entry?: number, price?: number): number {
  if (!Number.isFinite(entry as number) || !Number.isFinite(price as number)) return 0.5;
  const p = Math.abs(((entry as number) - (price as number)) / (price as number));
  // più vicino => più alto (cap 3%)
  const score = 1 - Math.min(p / 0.03, 1);
  return clamp01(score);
}

/** Punteggio segnale 0..100 */
export function computeSignalScore(
  s: ScenarioLite,
  opts: { price?: number; winningDirection?: Dir } = {}
): { score: number; breakdown: { prob: number; payoff: number; prox: number; momentum: number } } {
  const conf = clamp01(((s.confidence ?? 50) as number) / 100);
  const trend = trendBonus(s.direction, opts.winningDirection); // 0 o 1
  const lvlQ = clamp01((Number.isFinite(s.tp1 as number) && Number.isFinite(s.tp2 as number)) ? 0.6 : 0.3);
  const mom = momentumScore(s.momentum);

  const prob = clamp01(0.50 * conf + 0.20 * trend + 0.15 * lvlQ + 0.15 * mom);
  const payoff = clamp01(0.5 * (s.rr ?? 1) / 2); // soft-normalization
  const prox = proximity(s.entry, opts.price);

  let score01 = 0.50 * prob + 0.35 * payoff + 0.15 * prox;

  // coerenza tra momentum e direzione → piccolo moltiplicatore
  if (mom >= 0.55 && s.direction === opts.winningDirection) score01 *= 1.10;
  if (mom <= 0.45 && s.direction !== opts.winningDirection) score01 *= 0.90;

  const score = Math.round(clamp01(score01) * 100);
  return { score, breakdown: { prob, payoff, prox, momentum: mom } };
}
