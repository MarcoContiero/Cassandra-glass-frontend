// src/api.ts

// Base URL API – usa NEXT_PUBLIC_API_URL se c’è, altrimenti localhost
const RAW_API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

function sanitize(base: string) {
  return base
    .replace(/^https?:\/\/www\.(127\.0\.0\.1)(?=[:/]|$)/i, (_m, host) => `http://${host}`)
    .replace(/^https?:\/\/www\.(localhost)(?=[:/]|$)/i, (_m, host) => `http://${host}`)
    .replace(/\/+$/, ""); // rimuove trailing slash
}

export const API = sanitize(RAW_API);

export type OHLC = {
  time: number;   // timestamp in secondi
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/**
 * Recupera le candele OHLCV dal backend (o da Bybit/Binance se il backend le reindirizza).
 */
export async function getCandles(symbol: string, timeframe: string, limit = 300): Promise<OHLC[]> {
  const p = new URLSearchParams({ coin: symbol, timeframe, limit: String(limit) });
  const url = `${API}/api/chart?${p.toString()}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Errore fetch candele: ${res.status} ${res.statusText}`);

  const json = await res.json();

  // Se il backend ritorna direttamente un array di array [ts, o, h, l, c, v]
  if (Array.isArray(json)) {
    return json.map((r: any[]) => ({
      time: Math.floor(Number(r[0]) / 1000),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5] ?? 0),
    }));
  }

  // Se invece ritorna già un array di oggetti {time, open, high, low, close, volume}
  if (Array.isArray(json?.result)) {
    return json.result.map((r: any) => ({
      time: Math.floor(Number(r.time ?? r[0]) / 1000),
      open: Number(r.open ?? r[1]),
      high: Number(r.high ?? r[2]),
      low: Number(r.low ?? r[3]),
      close: Number(r.close ?? r[4]),
      volume: Number(r.volume ?? r[5] ?? 0),
    }));
  }

  throw new Error("Formato candele non riconosciuto");
}
