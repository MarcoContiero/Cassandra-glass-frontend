// src/lib/chart.ts
import { API } from "@/api";

type OHLC = { time: number; open: number; high: number; low: number; close: number; volume: number };

// Usa backend o Bybit diretto in base a .env (opzionale)
const USE_BACKEND = process.env.USE_BACKEND_CANDLES === "true";

// 👇 mapping tf → interval Bybit
function bybitInterval(tf: string): string {
  const m: Record<string, string> = {
    "1m": "1", "3m": "3", "5m": "5", "15m": "15", "30m": "30",
    "1h": "60", "2h": "120", "4h": "240", "6h": "360", "12h": "720",
    "1d": "D", "3d": "4320", // Bybit non ha 3d simbolico: puoi usare "4320"
    "1w": "W", "1M": "M",
  };
  return m[tf] ?? tf; // fallback: passa com’è
}

export async function getCandles(symbol: string, timeframe: string, limit: number = 300): Promise<OHLC[]> {
  if (USE_BACKEND) {
    const url = `${API}/api/chart?coin=${symbol}&timeframe=${timeframe}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Errore fetch candele backend: ${res.status} ${res.statusText}`);
    const json = await res.json();
    return (json ?? []).map((d: any) => ({
      time: Number(d.time),
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
      volume: Number(d.volume ?? 0),
    }));
  }

  // 👉 Bybit diretto
  const interval = bybitInterval(timeframe); // <-- FIX
  const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=${limit}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Errore fetch candele Bybit: ${res.status} ${res.statusText}`);

  const json = await res.json();
  const rows: OHLC[] = (json?.result?.list ?? []).map((r: any[]) => ({
    time: Math.floor(Number(r[0]) / 1000), // ms → s
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[5]),
  }));

  return rows.reverse(); // Bybit le dà decrescenti
}
