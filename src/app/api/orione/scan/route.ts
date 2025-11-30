import { NextRequest } from "next/server";
import { callBackend } from "@/lib/proxy";

// Evita caching strane su Vercel
export const dynamic = "force-dynamic";

// 👇 Qui gestisci la lista di coin che vuoi scandire h24
const CRON_COINS = ["BTC", "ETH", "SOL"]; // aggiungi/togli quando vuoi

// 👇 Questo è il payload che userà il CRON (GET)
//    Struttura identica a quella che hai incollato tu
const DEFAULT_SCAN_PAYLOAD = {
  request: {
    coins: CRON_COINS,
    timeframes: ["3m", "5m", "15m"],
    patterns: [
      { key: "morning_star", required: true },
      { key: "evening_star", required: true },
      { key: "hammer", required: true },
      { key: "shooting_star", required: true },
      { key: "bullish_engulfing", required: true },
      { key: "bearish_engulfing", required: true },
      { key: "piercing_line", required: true },
      { key: "dark_cloud_cover", required: true },
      { key: "ema_cross_9_21", required: true },
      { key: "ema_cross_9_50", required: true },
      { key: "ema_alignment_trend", required: true },
      { key: "bb_squeeze", required: true },
      { key: "rsi_divergence", required: true },
      { key: "triple_bottom", required: true },
      { key: "triple_top", required: true },
    ],
    lookback: {
      mode: "candles",
      candles: 5,
      minutes: null,
    },
    // quanto spesso teoricamente viene fatto lo scan
    // lo allineiamo al CRON: ogni 2 minuti
    scanIntervalMinutes: 2,
  },
  // opzionale, ma non dà fastidio se è presente
  setups: [],
};

// --- POST: chiamata normale dal frontend (OrionePanel) ---
export async function POST(req: NextRequest): Promise<Response> {
  // leggiamo il body così com'è e lo inoltriamo al backend
  const body = await req.text();

  console.log("[api/orione/scan] incoming POST → backend /api/orione/scan");

  return await callBackend("/api/orione/scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });
}

// --- GET: chiamata dal CRON di Vercel (ogni 2 minuti) ---
export async function GET(): Promise<Response> {
  const body = JSON.stringify(DEFAULT_SCAN_PAYLOAD);

  console.log(
    "[api/orione/scan] CRON GET → backend /api/orione/scan",
    DEFAULT_SCAN_PAYLOAD
  );

  return await callBackend("/api/orione/scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });
}
