export function extractScoreDelta(resp: any) {
    // 1) punteggio 0..100
    const punteggio =
      Number.isFinite(resp?.score) ? Math.round(resp.score) : 50;
  
    // 2) delta_score numerico (preferenze: alias piatti, poi nidificati)
    const candidates = [
      resp?.deltaPercent,
      resp?.delta_24h?.pct,
      resp?.delta?.pct,
      resp?.yesterdayDelta,
      resp?.risposte?.delta_rispetto_ieri?.pct,
    ];
    const found = candidates.find((x) => typeof x === "number" && isFinite(x));
    const delta_score =
      typeof found === "number" ? Math.round(found * 100) / 100 : 0;
  
    // 3) direzione per l’icona
    const direzione = (resp?.risposte?.longshort?.direzione?.toLowerCase?.() ??
      "neutro") as "long" | "short" | "neutro";
  
    return { punteggio, delta_score, direzione };
  }
  