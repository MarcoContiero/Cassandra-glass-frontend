// src/types/range.ts
export type RangeType = "standard" | "inside" | "multitouch" | "other";
export type RangeStatus = "active" | "closed";

export interface RangeMeta {
  touchesTop?: number;
  touchesBottom?: number;
  brokenBy?: "wick" | "close" | null;
  strength?: number;           // 0..100
  avgVolumeInside?: number;
  [k: string]: any;
}

export interface RangeBox {
  id: string;
  symbol: string;
  timeframe: string;           // "15m" | "4h" | ...
  type: RangeType;             // oggi "standard"
  top: number;
  bottom: number;
  width: number;               // top - bottom
  createdAt: string;           // ISO
  updatedAt?: string;          // ISO
  status: RangeStatus;         // "active" | "closed"
  meta?: RangeMeta;            // dettagli extra per i vari tipi
}
