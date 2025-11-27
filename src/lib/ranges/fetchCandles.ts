// src/lib/ranges/fetchCandles.ts
import { API } from "@/lib/api";

export interface Candle {
  time: number; // timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export async function fetchCandles(symbol: string, timeframe: string, limit = 200): Promise<Candle[]> {
  const p = new URLSearchParams({ coin: symbol, timeframe, limit: String(limit) });
  const url = `${API}/api/chart?${p.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Errore fetch candles: ${res.status}`);
  const json = await res.json();
  return json as Candle[];
}
