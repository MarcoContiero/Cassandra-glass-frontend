
'use client';

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Info } from "lucide-react";

export type Direction = "long" | "short" | "neutral";

export type Level = {
  price: number;
  type?: "support" | "resistance" | "liquidity";
  strength?: number;
  label?: string;
};

export type ScenarioInfo = {
  code?: string;
  name?: string;
  direction?: Direction;
  startLevel?: number;
  invalidation?: number;
  active?: boolean;
};

export type TfData = {
  tf: string;
  price?: number;
  direction?: Direction;
  rsi?: number;
  rsiTrend?: "rising" | "falling" | "flat";
  scenarios?: ScenarioInfo[];
  levels?: Level[];
  liquidity?: Level[];
  indicators?: Record<string, any>;
  swingLows?: number[];
  swingHighs?: number[];
};

export type RiepilogoTotale = {
  price?: number;
};

export interface IntraTFOverlayProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  coin?: string;
  timeframes: string[];
  dataByTf: Record<string, TfData | null>;
  riepilogoTotale?: RiepilogoTotale;
}

const TF_MINUTES: Record<string, number> = {
  "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30,
  "1h": 60, "2h": 120, "4h": 240, "6h": 360, "8h": 480, "12h": 720,
  "1d": 1440, "3d": 4320, "1w": 10080, "1M": 43200,
};

function sortTfs(tfs: string[]): string[] {
  return [...tfs].sort((a,b) => (TF_MINUTES[a] ?? 9e9) - (TF_MINUTES[b] ?? 9e9));
}

function strongestBelow(price: number | undefined, levels?: Level[]): Level | undefined {
  if (!price || !levels?.length) return undefined;
  const below = levels.filter(l => l.price < price);
  if (!below.length) return undefined;
  return below.sort((a,b) => (b.strength ?? 0) - (a.strength ?? 0) || b.price - a.price)[0];
}

function nearestBelow(price: number | undefined, arr?: number[]): number | undefined {
  if (!price || !arr?.length) return undefined;
  const below = arr.filter(p => p < price);
  if (!below.length) return undefined;
  return below.sort((a,b) => b - a)[0];
}

function pickActiveLongScenario(tf?: TfData | null): ScenarioInfo | undefined {
  if (!tf?.scenarios?.length) return undefined;
  return tf.scenarios.find(s => s.active && s.direction === "long") ?? tf.scenarios.find(s => s.direction === "long");
}
function pickActiveShortScenario(tf?: TfData | null): ScenarioInfo | undefined {
  if (!tf?.scenarios?.length) return undefined;
  return tf.scenarios.find(s => s.active && s.direction === "short") ?? tf.scenarios.find(s => s.direction === "short");
}

function fmt(n?: number): string {
  if (n == null || Number.isNaN(n)) return "?";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(n);
}

// ---- momentum helpers ----
function num(x: any): number | undefined { const v = typeof x === "number" ? x : undefined; return Number.isFinite(v) ? v : undefined; }
function slope(curr?: number, prev?: number): number | undefined { if (curr == null || prev == null) return undefined; const d = curr - prev; return Number.isFinite(d) ? d : undefined; }

function computeMomentum(tf?: TfData | null) {
  const ind = tf?.indicators || {};
  const macdHist = num(ind.macdHist), macdHistPrev = num(ind.macdHistPrev); const macdSlope = slope(macdHist, macdHistPrev);
  const adx = num(ind.adx), adxPrev = num(ind.adxPrev); const adxSlope = slope(adx, adxPrev); const diPlus = num(ind.diPlus), diMinus = num(ind.diMinus);
  const stochK = num(ind.stochK), stochD = num(ind.stochD), stochPrevK = num(ind.stochPrevK);
  const stochTurnUp = stochPrevK != null && stochK != null && stochD != null && stochPrevK <= stochD && stochK > stochD;
  const stochTurnDown = stochPrevK != null && stochK != null && stochD != null && stochPrevK >= stochD && stochK < stochD;
  const roc = num(ind.roc), rocPrev = num(ind.rocPrev); const rocSlope = slope(roc, rocPrev);
  const bbWidth = num(ind.bbWidth), bbWidthPrev = num(ind.bbWidthPrev); const bbSlope = slope(bbWidth, bbWidthPrev); const bbWidthPct = num(ind.bbWidthPct);
  const atr = num(ind.atrNorm ?? ind.atr), atrPrev = num(ind.atrNormPrev ?? ind.atrPrev); const atrSlope = slope(atr, atrPrev);
  const ema9 = num(ind.ema9), ema21 = num(ind.ema21);
  const emaSpread = (ema9 != null && ema21 != null) ? Math.abs(ema9 - ema21) : undefined;
  const compressLike = (bbWidthPct != null ? bbWidthPct < 25 : (bbWidth != null ? bbWidth < (tf?.price ?? 0) * 0.01 : false)) && (emaSpread != null ? emaSpread <= (tf?.price ?? 1) * 0.0015 : true);

  let score = 0;
  if (macdHist != null) score += macdHist > 0 ? 2 : -2;
  if (macdSlope != null) score += macdSlope > 0 ? 1 : -1;
  if (adx != null) score += adx > 20 ? 1 : 0;
  if (diPlus != null && diMinus != null) score += diPlus > diMinus ? 1 : -1;
  if (adxSlope != null) score += adxSlope > 0 ? 1 : -1;
  if (stochK != null && stochD != null) {
    if (stochK > stochD && stochK < 80) score += 1;
    if (stochK < stochD && stochK > 20) score -= 1;
    if (stochTurnDown && stochK > 80) score -= 1;
    if (stochTurnUp && stochK < 20) score += 1;
  }
  if (roc != null) score += roc > 0 ? 1 : -1;
  if (rocSlope != null) score += rocSlope > 0 ? 1 : -1;
  if (bbSlope != null) score += bbSlope > 0 ? 1 : -1;
  if (atrSlope != null) score += atrSlope > 0 ? 1 : -1;

  score = Math.max(-5, Math.min(5, score));
  const dir: Direction = score > 1 ? "long" : score < -1 ? "short" : "neutral";

  const notes: string[] = [];
  if (macdSlope != null) notes.push(`MACD ${macdSlope > 0 ? "↑" : "↓"}`);
  if (adx != null) notes.push(`ADX ${Math.round(adx)}${adxSlope != null ? (adxSlope > 0 ? "↑" : "↓") : ""}`);
  if (stochK != null && stochD != null) notes.push(`Stoch ${Math.round(stochK)}${stochK > stochD ? "↗" : "↘"}`);
  if (roc != null) notes.push(`ROC ${Math.round(roc)}%`);
  if (bbSlope != null) notes.push(`BB ${bbSlope > 0 ? "exp" : "comp"}`);
  if (atrSlope != null) notes.push(`ATR ${atrSlope > 0 ? "↑" : "↓"}`);
  if (compressLike) notes.push("compressione in rilascio?");

  return { score, dir, notes, compressLike } as const;
}

function buildMomentumSummary(label: string, m: ReturnType<typeof computeMomentum>) {
  const tone = m.dir === "long" ? "spinta long" : m.dir === "short" ? "spinta short" : "impulso neutro";
  const extra = m.compressLike ? ", compressione pronta al rilascio" : "";
  return `${label}: ${tone}${extra}`;
}

// --------- intra narrative core from earlier ----------
function estimateCorrectionCandles(rsiLong?: number, shortTrend?: "falling" | "flat" | "rising", tfShortMin?: number, tfLongMin?: number) {
  const base = Math.max(3, Math.min(12, Math.round(((rsiLong ?? 65) - 65) / 3) + 4));
  const adj = shortTrend === "falling" ? -1 : shortTrend === "rising" ? +1 : 0;
  const shortCandles = Math.max(2, base + adj);
  const ratio = tfLongMin && tfShortMin ? Math.max(1, Math.round((tfLongMin / tfShortMin) * 0.5)) : 4;
  const longCandles = Math.max(1, Math.round(shortCandles / ratio));
  return { shortCandles, longCandles };
}

function getInvalidationLevel(tfLong?: TfData | null): number | undefined {
  if (!tfLong) return undefined;
  const p = tfLong.price;
  const scen = pickActiveLongScenario(tfLong);
  if (scen?.invalidation) return scen.invalidation;
  const swing = nearestBelow(p, tfLong.swingLows);
  if (swing) return swing;
  const lvl = strongestBelow(p, tfLong.levels);
  if (lvl) return lvl.price;
  const liq = strongestBelow(p, tfLong.liquidity);
  if (liq) return liq.price;
  return undefined;
}
function getStartLongLevel(tfLong?: TfData | null): number | undefined {
  if (!tfLong) return undefined;
  const scen = pickActiveLongScenario(tfLong);
  if (scen?.startLevel) return scen.startLevel;
  const p = tfLong.price;
  if (!p) return undefined;
  const lows = (tfLong.swingLows || []).filter(x => x < p).sort((a,b) => a - b);
  return lows[0];
}

function dirBadge(d?: Direction) {
  const map: Record<Direction, { label: string; cls: string }> = {
    long: { label: "LONG", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
    short: { label: "SHORT", cls: "bg-red-500/15 text-red-300 border-red-500/40" },
    neutral: { label: "NEUTRO", cls: "bg-zinc-500/15 text-zinc-300 border-zinc-500/40" },
  } as const;
  const meta = d ? map[d] : { label: "?", cls: "bg-zinc-800 text-zinc-200 border-zinc-700" };
  return <span className={`px-2 py-0.5 text-xs rounded border ${meta.cls}`}>{meta.label}</span>;
}

function buildIntraTfNarrative(tfsSelected: string[], dataByTf: Record<string, TfData | null>, riepilogo?: RiepilogoTotale) {
  const ordered = sortTfs(tfsSelected);
  const tfShort = ordered[0];
  const tfLong = ordered[ordered.length - 1];
  const tfMid = ordered[Math.floor(ordered.length / 2)] ?? tfShort;

  const dShort = dataByTf[tfShort] ?? null;
  const dLong = dataByTf[tfLong] ?? null;
  const dMid = dataByTf[tfMid] ?? null;

  const price = riepilogo?.price ?? dMid?.price ?? dLong?.price ?? dShort?.price;

  const longStart = getStartLongLevel(dLong);
  const invalidation = getInvalidationLevel(dLong);

  const longDir = dLong?.direction ?? "neutral";
  const midDir = dMid?.direction ?? "neutral";
  const shortDir = dShort?.direction ?? "neutral";

  const longRSI = dLong?.rsi;
  const shortRsiTrend = dShort?.rsiTrend ?? "flat";
  const { shortCandles, longCandles } = estimateCorrectionCandles(longRSI, shortRsiTrend, TF_MINUTES[tfShort], TF_MINUTES[tfLong]);

  const shortScenario = pickActiveShortScenario(dShort);
  const sameDirection = longDir === midDir && midDir === shortDir && longDir !== "neutral";

  const parts: string[] = [];
  if (sameDirection) {
    parts.push(
      `Scenario allineato: ${tfLong}–${tfShort} tutti ${longDir.toUpperCase()}.` +
      (longStart ? ` Move iniziato da ~${fmt(longStart)} su ${tfLong}.` : "") +
      (invalidation ? ` Finché sopra ${fmt(invalidation)} il quadro resta valido.` : "")
    );
  } else {
    parts.push(
      `Scenario su ${tfLong} ${String(longDir).toUpperCase()}` +
      (longStart ? `, partito da ~${fmt(longStart)}` : "") +
      `; su ${tfMid} ${String(midDir).toUpperCase()} in continuità, mentre su ${tfShort} si intravede ` +
      `${String((shortScenario?.direction ?? shortDir)).toUpperCase()} ` +
      (invalidation
        ? `che può annullare i LONG più lunghi solo con prezzo < ${fmt(invalidation)}.`
        : `che resta di breve respiro finché il prezzo non invalida i supporti chiave.`)
    );
    if ((longRSI ?? 0) >= 68) {
      parts.push(
        `RSI alto su ${tfLong}${longRSI ? ` (${Math.round(longRSI)})` : ""}; i brevi stanno ` +
        (shortRsiTrend === "falling" ? "scaricando" : shortRsiTrend === "rising" ? "caricando" : "stabilizzando") +
        `: probabile finestra di correzione entro ~${shortCandles} candele ${tfShort}` +
        ` (≈ ${longCandles} ${tfLong}).`
      );
    }
  }

  const keyRes = (dMid?.levels || dLong?.levels || [])
    .filter((l) => l.type !== "support")
    .sort((a, b) => a.price - b.price)[0];
  const keySup = strongestBelow(price, dMid?.levels || dLong?.levels);

  if (keyRes && price && keyRes.price > price) {
    parts.push(`Resistenza vicina a ${fmt(keyRes.price)}; breakout rafforza il quadro ${String(longDir).toUpperCase()}.`);
  }
  if (keySup) {
    parts.push(`Supporto di rilievo a ${fmt(keySup.price)}; perdita del livello indebolisce i LONG su ${tfLong}.`);
  }

  return {
    tfShort, tfMid, tfLong, price,
    longDir, midDir, shortDir,
    longStart, invalidation, longRSI, shortRsiTrend,
    shortCandles, longCandles,
    text: parts.join(" "),
    sameDirection,
  };
}

export default function IntraTFOverlay({ open, onOpenChange, coin, timeframes, dataByTf, riepilogoTotale }: IntraTFOverlayProps) {
  const ordered = useMemo(() => sortTfs(timeframes), [timeframes]);
  const intra = useMemo(() => buildIntraTfNarrative(ordered, dataByTf, riepilogoTotale), [ordered, dataByTf, riepilogoTotale]);

  const momShort = useMemo(() => computeMomentum(dataByTf[intra.tfShort]), [dataByTf, intra.tfShort]);
  const momMid = useMemo(() => computeMomentum(dataByTf[intra.tfMid]), [dataByTf, intra.tfMid]);
  const momLong = useMemo(() => computeMomentum(dataByTf[intra.tfLong]), [dataByTf, intra.tfLong]);
  const approxMinutes = (intra.shortCandles ?? 0) * (TF_MINUTES[intra.tfShort] ?? 0);
  const approxHuman = approxMinutes >= 1440
    ? `${Math.round(approxMinutes / 1440)}d`
    : approxMinutes >= 60
      ? `${Math.round(approxMinutes / 60)}h`
      : `${approxMinutes}m`;

  const momentumSummary = `${buildMomentumSummary(intra.tfLong, momLong)} • ${buildMomentumSummary(intra.tfMid, momMid)} • ${buildMomentumSummary(intra.tfShort, momShort)}`;
  const headline = `${intra.text} ${momentumSummary}`;

  const copyAll = async () => { try { await navigator.clipboard.writeText(headline); } catch {} };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3" onClick={() => onOpenChange(false)}>
      <Card className="w-[min(1100px,95vw)] max-h-[90vh] overflow-hidden bg-zinc-900/95 text-white border-white/10" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-xl">
              Scenario Intra‑TF • {coin?.toUpperCase()} • {ordered.join(", ")}
            </CardTitle>
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 text-xs rounded border border-white/10 bg-white/5 inline-flex items-center gap-1">
                  <Info className="h-3.5 w-3.5 mr-1" />
                  Intra-TF (narrativa intessuta)
                </span>
                <Button size="sm" variant="secondary" onClick={copyAll}>
                  <Copy className="h-4 w-4 mr-1" /> Copia
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                  Chiudi
                </Button>
              </div>
            </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="opacity-70">Direzioni</span>
            <span className="inline-flex items-center gap-1">{intra.tfLong} <span>{intra.longDir}</span></span>
            <span className="inline-flex items-center gap-1">{intra.tfMid} <span>{intra.midDir}</span></span>
            <span className="inline-flex items-center gap-1">{intra.tfShort} <span>{intra.shortDir}</span></span>
            {intra.price != null && (<span className="ml-3 opacity-70">Prezzo: <span className="opacity-100">{fmt(intra.price)}</span></span>)}
          </div>
        </CardHeader>
        <div className="h-px bg-white/10" />
        <CardContent className="p-5 space-y-4 overflow-y-auto">
          <p className="text-base leading-relaxed">{headline}</p>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold opacity-80">Impulso / Momentum</h3>
            <ul className="text-sm space-y-1">
            <li>
                {intra.tfLong}: <span className="font-medium">
                  Trend { (dataByTf[intra.tfLong]?.direction ?? 'neutral').toUpperCase() } • Momentum: {momLong.dir.toUpperCase()}
                </span>
                <span className="opacity-70"> — {momLong.notes.join(", ")}</span>
              </li>
              <li>
                {intra.tfMid}: <span className="font-medium">
                  Trend { (dataByTf[intra.tfMid]?.direction ?? 'neutral').toUpperCase() } • Momentum: {momMid.dir.toUpperCase()}
                </span>
                <span className="opacity-70"> — {momMid.notes.join(", ")}</span>
              </li>
              <li>
                {intra.tfShort}: <span className="font-medium">
                  Trend { (dataByTf[intra.tfShort]?.direction ?? 'neutral').toUpperCase() } • Momentum: {momShort.dir.toUpperCase()}
                </span>
                <span className="opacity-70"> — {momShort.notes.join(", ")}</span>
              </li>
            </ul>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold opacity-80">Livelli chiave</h3>
              <ul className="text-sm space-y-1">
                {intra.longStart != null && (<li>Inizio move (long {intra.tfLong}): <span className="font-medium">~{fmt(intra.longStart)}</span></li>)}
                {intra.invalidation != null && (<li>Invalidazione long {intra.tfLong}: <span className="font-medium">{fmt(intra.invalidation)}</span></li>)}
                {intra.price != null && intra.invalidation != null && (<li>Buffer price→invalidation: <span className="font-medium">{fmt(((intra.price - intra.invalidation) / intra.invalidation) * 100)}%</span></li>)}
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold opacity-80">Timing probabilistico</h3>
              <ul className="text-sm space-y-1">
                {intra.longRSI != null && (<li>RSI {intra.tfLong}: <span className="font-medium">{Math.round(intra.longRSI)}</span></li>)}
                <li>Scarico brevi ({intra.tfShort}): <span className="font-medium">{intra.shortRsiTrend}</span></li>
                <li>Finestra correzione stimata: <span className="font-medium">~{intra.shortCandles} candele {intra.tfShort} (≈ {approxHuman})</span></li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
