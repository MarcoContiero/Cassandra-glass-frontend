"use client";

import React, { useEffect, useMemo, useState } from "react";

const ACTIVE_SCENARIO_TOKENS = new Set<string>([
  "EMA_CROSS_9_21_UP",
  "EMA_CROSS_9_21_UP_RAW",
  "EMA_CROSS_9_21_UP_CONFIRMED",
  "EMA_CROSS_9_21_DOWN",
  "EMA_CROSS_9_21_DOWN_RAW",
  "EMA_CROSS_9_21_DOWN_CONFIRMED",
  "EMA_CROSS_9_50_UP",
  "EMA_CROSS_9_50_UP_RAW",
  "EMA_CROSS_9_50_UP_CONFIRMED",
  "EMA_CROSS_9_50_DOWN",
  "EMA_CROSS_9_50_DOWN_RAW",
  "EMA_CROSS_9_50_DOWN_CONFIRMED",

  "HAMMER",
  "HAMMER_CONFIRMED",
  "MORNING_STAR",
  "MORNING_STAR_CONFIRMED",
  "TWEEZER_BOTTOM",
  "TWEEZER_BOTTOM_CONFIRMED",
  "HARAMI_BULL",
  "HARAMI_BULL_CONFIRMED",

  "SHOOTING_STAR",
  "SHOOTING_STAR_CONFIRMED",
  "DARK_CLOUD_COVER",
  "DARK_CLOUD_COVER_CONFIRMED",
  "TWEEZER_TOP",
  "TWEEZER_TOP_CONFIRMED",
  "HARAMI_BEAR",
  "HARAMI_BEAR_CONFIRMED",
  "EVENING_STAR",
  "EVENING_STAR_CONFIRMED",

  "THREE_WHITE_SOLDIERS",
  "THREE_WHITE_SOLDIERS_CONFIRMED",
  "THREE_BLACK_CROWS",
  "THREE_BLACK_CROWS_CONFIRMED",
]);

const ACTIVE_TIFIDE_COINS = new Set<string>([
  "BTC",
  "SOL",
  "ETH",
  "DOGE",
  "ADA",
  "LTC",
  "XRP",

  "HYPE",
  "WIF",
  "PUMPFUN",
  "FARTCOIN",
  "OP",
  "LINK",
  "AVAX",
  "APT",
  "ARB",
  "AAVE",
  "ATOM",
  "CRV",

  "TAO",
  "UNI",
  "PEPE",
  "SUI",
  "SEI",
  "TON",
  "INJ",
  "NEAR",
  "LDO",

  "JUP",
  "ENA",
  "ONDO",
]);

function isScenarioToken(token?: string | null) {
  const raw = String(token || "").trim();
  if (!raw) return false;

  // esempio:
  // "SHOOTING_STAR@3m" -> "SHOOTING_STAR"
  // "EMA_CROSS_9_21_UP@1m" -> "EMA_CROSS_9_21_UP"
  const base = raw.split("@", 1)[0].trim().toUpperCase();

  return ACTIVE_SCENARIO_TOKENS.has(base);
}

function isActiveCoin(coin?: string | null) {
  const c = String(coin || "").trim().toUpperCase();
  return ACTIVE_TIFIDE_COINS.has(c);
}
type Orione2Item = {
  ts_ms: number;
  token: string;
  tf?: string | null;
  side?: string;
  trigger_price?: number | null;
};

type Orione2CoinBlock = {
  count: number;
  items: Orione2Item[];
};

type Orione2RecentPatternsResp = {
  ok: boolean;
  now_ms: number;
  start_ms: number;
  minutes: number;
  coins: Record<string, Orione2CoinBlock>;
};

function fmtTimeIT(tsMs: number) {
  try {
    const d = new Date(tsMs);
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "—";
  }
}

export default function Orione2Page() {
  const [minutes] = useState<number>(20);
  const [data, setData] = useState<Orione2RecentPatternsResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let alive = true;
    const fetchOnce = async () => {
      try {
        const r = await fetch(`/api/orione2/recent_patterns?minutes=${minutes}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as Orione2RecentPatternsResp;
        if (!alive) return;
        setData(j);
        setErr(null);
        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "fetch error");
        setLoading(false);
      }
    };

    fetchOnce();
    const timer = setInterval(fetchOnce, 2000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [minutes]);

  const tokenStats = useMemo(() => {
    const coins = data?.coins || {};
    let totalHits = 0;
    let allowedHits = 0;
    let emaCrossHits = 0;

    for (const [coin, block] of Object.entries(coins)) {
      if (!isActiveCoin(coin)) continue;

      const items = Array.isArray(block?.items) ? block.items : [];
      for (const it of items) {
        totalHits += 1;

        const tok = String(it?.token || "").trim().toLowerCase();
        if (isScenarioToken(tok)) {
          allowedHits += 1;
        }
        if (tok.startsWith("ema_cross_")) {
          emaCrossHits += 1;
        }
      }
    }

    return {
      totalHits,
      allowedHits,
      emaCrossHits,
    };
  }, [data]);

  const tokenSamples = useMemo(() => {
    const coins = data?.coins || {};
    const samples: string[] = [];

    for (const [coin, block] of Object.entries(coins)) {
      if (!isActiveCoin(coin)) continue;
      const items = Array.isArray(block?.items) ? block.items : [];
      for (const it of items) {
        const tok = String(it?.token || "").trim();
        if (!tok) continue;
        if (!samples.includes(tok)) {
          samples.push(tok);
        }
        if (samples.length >= 12) return samples;
      }
    }

    return samples;
  }, [data]);

  const rows = useMemo(() => {
    const coins = data?.coins || {};
    const out: Array<{ coin: string; items: Orione2Item[]; latestTs: number }> = [];

    for (const [coin, block] of Object.entries(coins)) {
      const coinUp = String(coin || "").toUpperCase();
      if (!isActiveCoin(coinUp)) continue;

      const items = Array.isArray(block?.items) ? block.items : [];
      if (!items.length) continue;

      const filtered = items.filter((it) => isScenarioToken(it?.token));
      if (!filtered.length) continue;

      // ordina per ts desc (più recente prima)
      const sorted = [...filtered].sort((a, b) => (Number(b.ts_ms || 0) - Number(a.ts_ms || 0)));

      out.push({
        coin: coinUp,
        items: sorted,
        latestTs: Number(sorted[0]?.ts_ms || 0),
      });
    }

    // righe coin ordinate per "ultimo hit" più recente
    out.sort((a, b) => (b.latestTs || 0) - (a.latestTs || 0));
    return out;
  }, [data]);

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Orione2 — Hit ultimi {minutes} minuti</div>
          <div style={{ opacity: 0.7, marginTop: 6 }}>
            {data?.now_ms ? `Aggiornato: ${fmtTimeIT(data.now_ms)}` : "—"}
          </div>
        </div>
        <div style={{ opacity: 0.75, fontSize: 13, textAlign: "right" }}>
          {loading ? (
            "Caricamento…"
          ) : err ? (
            `Errore: ${err}`
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div>{`Coin con hit: ${rows.length}`}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                {`Hit watchlist: ${tokenStats.totalHits} | Hit scenari: ${tokenStats.allowedHits} | EMA cross: ${tokenStats.emaCrossHits}`}
              </div>
              <div style={{ fontSize: 11, opacity: 0.65, maxWidth: 520 }}>
                {`Sample token: ${tokenSamples.join(" | ") || "—"}`}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.04)" }}>
              <th style={{ textAlign: "left", padding: "12px 14px", fontWeight: 600, width: 140 }}>Nome Coin</th>
              <th style={{ textAlign: "left", padding: "12px 14px", fontWeight: 600 }}>Hit trovati (finestra mobile)</th>
              <th style={{ textAlign: "left", padding: "12px 14px", fontWeight: 600, width: 160 }}>A che ora</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: 14, opacity: 0.7 }}>
                  Nessun hit negli ultimi {minutes} minuti.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.coin} style={{ borderTop: "1px solid rgba(255,255,255,0.06)", verticalAlign: "top" }}>
                  <td style={{ padding: "12px 14px", fontWeight: 800 }}>{r.coin}</td>

                  {/* Colonna hits: lista completa */}
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {r.items.map((it, idx) => (
                        <div
                          key={`${r.coin}-${it.ts_ms}-${idx}`}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.02)",
                            opacity: 0.95,
                            fontSize: 13,
                            lineHeight: 1.25,
                            wordBreak: "break-word",
                          }}
                        >
                          {it.token || "—"}
                        </div>
                      ))}
                    </div>
                  </td>

                  {/* Colonna orari: una riga per hit, allineata */}
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {r.items.map((it, idx) => (
                        <div
                          key={`${r.coin}-t-${it.ts_ms}-${idx}`}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.02)",
                            fontSize: 13,
                            opacity: 0.9,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {it.ts_ms ? fmtTimeIT(it.ts_ms) : "—"}
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}