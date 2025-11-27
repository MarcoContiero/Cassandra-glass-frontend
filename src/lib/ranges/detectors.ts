// src/lib/ranges/detectors.ts
import { RangeBox } from "@/types/range";
import { adaptBackendBoxToRanges } from "./adapter";
import { API } from "@/lib/api";
import { flags } from "@/lib/flags";
import { getCandles } from "@/lib/chart";

export interface DetectorInput {
  symbol: string;
  timeframe: string;
}

/* ========= STANDARD ========= */
export async function detectStandardRanges(inp: DetectorInput): Promise<RangeBox[]> {
  const p = new URLSearchParams({ symbol: inp.symbol, timeframe: inp.timeframe });
  const url = `${API}/api/box/boxes.json?${p.toString()}`;
  const res = await fetch(url);
  const json = await res.json();
  return adaptBackendBoxToRanges(json, inp.symbol, inp.timeframe);
}

/* ========= INSIDE ========= */
export async function detectInsideRanges(inp: DetectorInput): Promise<RangeBox[]> {
  const candles = await getCandles(inp.symbol, inp.timeframe, 800);
  const ranges: RangeBox[] = [];

  for (let i = 1; i < candles.length - 1; i++) {
    const madre = candles[i - 1];
    const inside = candles[i];
    const conferma = candles[i + 1];

    const isInside = inside.high <= madre.high && inside.low >= madre.low;
    if (!isInside) continue;

    const confermaBreak = conferma.close > madre.high || conferma.close < madre.low;
    if (confermaBreak) continue;

    ranges.push({
      id: `${inp.symbol}-${inp.timeframe}-inside-${madre.time}`,
      symbol: inp.symbol,
      timeframe: inp.timeframe,
      type: "inside",
      status: "active",
      createdAt: new Date(madre.time).toISOString(),
      top: madre.high,
      bottom: madre.low,
      width: madre.high - madre.low,
      meta: {
        madre: madre.time,
        inside: inside.time,
        conferma: conferma.time,
      },
    });
  }

  return ranges;
}

/* ========= MULTITOUCH ========= */
export async function detectMultitouchRanges(inp: DetectorInput): Promise<RangeBox[]> {
  const candles = await getCandles(inp.symbol, inp.timeframe, 1000);
  const ranges: RangeBox[] = [];

  const tolerancePct = 0.001; // 0.1% tolleranza
  const minTouches = 3;

  for (let i = 2; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const prev2 = candles[i - 2];

    const minLevel = Math.min(c.low, prev.low, prev2.low);
    const maxLevel = Math.max(c.high, prev.high, prev2.high);

    const touchesLow = [c, prev, prev2].filter(
      (x) => Math.abs(x.low - minLevel) / minLevel < tolerancePct
    ).length;

    const touchesHigh = [c, prev, prev2].filter(
      (x) => Math.abs(x.high - maxLevel) / maxLevel < tolerancePct
    ).length;

    if (touchesLow >= minTouches || touchesHigh >= minTouches) {
      ranges.push({
        id: `${inp.symbol}-${inp.timeframe}-multitouch-${c.time}`,
        symbol: inp.symbol,
        timeframe: inp.timeframe,
        type: "multitouch",
        status: "active",
        createdAt: new Date(c.time).toISOString(),
        top: maxLevel,
        bottom: minLevel,
        width: maxLevel - minLevel,
        meta: {
          touches: { low: touchesLow, high: touchesHigh },
        },
      });
    }
  }

  return ranges;
}

/* ========= REGISTRY ========= */
export const detectors: Record<string, (inp: DetectorInput) => Promise<RangeBox[]>> = {
  standard: detectStandardRanges,
  ...(flags.ranges.inside ? { inside: detectInsideRanges } : {}),
  ...(flags.ranges.multitouch ? { multitouch: detectMultitouchRanges } : {}),
};
