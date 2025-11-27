// src/lib/extractors/patterns.ts
import { PatternItem, PatternsByTF } from "@/types/patterns";

export function getPatterns(result: any): PatternsByTF {
  const byTf: PatternsByTF = {};
  const raw = result?.patterns || {};
  Object.entries(raw).forEach(([tf, arr]: [string, any]) => {
    byTf[tf] = (arr as any[]).map((p) => ({
      ...p,
      levels: p.levels ?? {},
      extras: p.extras ?? {},
      tags: p.tags ?? []
    })) as PatternItem[];
  });
  return byTf;
}
