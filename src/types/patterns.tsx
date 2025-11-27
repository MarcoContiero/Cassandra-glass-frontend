// src/types/patterns.ts
export type PatternItem = {
  code: string;
  name: string;
  side: "long" | "short" | "neutral";
  tf: string;
  status: "active" | "confirmed" | "invalidated";
  score: number;
  confidence: number; // 0..1
  time: { start: string; end: string };
  levels: { trigger?: number | null; invalidation?: number | null; target?: number | null };
  extras?: Record<string, any>;
  tags?: string[];
};

export type PatternsByTF = Record<string, PatternItem[]>;
