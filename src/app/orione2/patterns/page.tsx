"use client";

import React, { useEffect, useMemo, useState } from "react";

const _DEFAULT_TIFIDE_COINS = new Set<string>([
  "BTC","SOL","ETH","DOGE","ADA","LTC","XRP",
  "HYPE","WIF","PUMPFUN","FARTCOIN","OP","LINK","AVAX","APT","ARB","AAVE","ATOM","CRV",
  "TAO","UNI","PEPE","SUI","SEI","TON","INJ","NEAR","LDO",
  "JUP","ENA","ONDO","ZEC","WLD","XLM","RENDER","AERO","SKY",
]);

function isActiveCoin(coin?: string | null, activeCoinSet?: Set<string>) {
  const c = String(coin || "").trim().toUpperCase();
  return (activeCoinSet ?? _DEFAULT_TIFIDE_COINS).has(c);
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
  const [activeCoinSet, setActiveCoinSet] = useState<Set<string>>(_DEFAULT_TIFIDE_COINS);

  useEffect(() => {
    fetch('/api/config/coins')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.coins?.length) setActiveCoinSet(new Set<string>(d.coins)); })
      .catch(() => {});
  }, []);

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
    let emaCrossHits = 0;

    for (const [coin, block] of Object.entries(coins)) {
      if (!isActiveCoin(coin, activeCoinSet)) continue;

      const items = Array.isArray(block?.items) ? block.items : [];
      for (const it of items) {
        totalHits += 1;

        const tok = String(it?.token || "").trim().toLowerCase();
        if (tok.startsWith("ema_cross_")) {
          emaCrossHits += 1;
        }
      }
    }

    return {
      totalHits,
      emaCrossHits,
    };
  }, [data, activeCoinSet]);

  const tokenSamples = useMemo(() => {
    const coins = data?.coins || {};
    const samples: string[] = [];

    for (const [coin, block] of Object.entries(coins)) {
      if (!isActiveCoin(coin, activeCoinSet)) continue;
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
  }, [data, activeCoinSet]);

  const rows = useMemo(() => {
    const coins = data?.coins || {};
    const out: Array<{ coin: string; items: Orione2Item[]; latestTs: number }> = [];

    for (const [coin, block] of Object.entries(coins)) {
      const coinUp = String(coin || "").toUpperCase();
      if (!isActiveCoin(coinUp, activeCoinSet)) continue;

      const items = Array.isArray(block?.items) ? block.items : [];
      if (!items.length) continue;

      // ordina per ts desc (più recente prima) — nessun filtro: mostra
      // tutto quello che Orione rileva, non solo il sottoinsieme usato
      // da Tifi 4.0 per costruire scenari (2026-08-26, richiesta esplicita:
      // la whitelist precedente era anche rotta — mancava ENGULFING e la
      // variante raw/confirmed_strong di ogni altro pattern).
      const sorted = [...items].sort((a, b) => (Number(b.ts_ms || 0) - Number(a.ts_ms || 0)));

      out.push({
        coin: coinUp,
        items: sorted,
        latestTs: Number(sorted[0]?.ts_ms || 0),
      });
    }

    // righe coin ordinate per "ultimo hit" più recente
    out.sort((a, b) => (b.latestTs || 0) - (a.latestTs || 0));
    return out;
  }, [data, activeCoinSet]);

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
                {`Hit totali: ${tokenStats.totalHits} | EMA cross: ${tokenStats.emaCrossHits}`}
              </div>
              <div style={{ fontSize: 11, opacity: 0.65, maxWidth: 520 }}>
                {`Sample token: ${tokenSamples.join(" | ") || "—"}`}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 14, borderRadius: 14, border: "1px solid var(--color-border)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--color-surface)" }}>
              <th style={{ textAlign: "left", padding: "12px 14px", fontWeight: 600, width: 140 }}>Nome Coin</th>
              <th style={{ textAlign: "left", padding: "12px 14px", fontWeight: 600 }}>Hit trovati (finestra mobile)</th>
              <th style={{ textAlign: "left", padding: "12px 14px", fontWeight: 600, width: 160 }}>A che ora</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: 14, color: "var(--color-text-dim)" }}>
                  Nessun hit negli ultimi {minutes} minuti.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.coin} style={{ borderTop: "1px solid var(--color-border-dim)", verticalAlign: "top" }}>
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
                            border: "1px solid var(--color-border)",
                            background: "var(--color-surface)",
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
                            border: "1px solid var(--color-border)",
                            background: "var(--color-surface)",
                            fontSize: 13,
                            color: "var(--color-text-dim)",
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