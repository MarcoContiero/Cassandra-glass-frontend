// src/ts/strategia/scoreBands.ts
//
// Rendimento storico per fascia di punteggio Strategia AI, per TF/direzione.
// Dati da backend/tifide3/backtest/validazione_sai_stats_allcoins_fresh_tol05.csv
// (rilanciato 27-28/8 con lo score sulla scala attuale 0-100, 39 coin,
// nov24-mar26, simulazione candela-per-candela con tolleranza 0,5%).
//
// Decisione esplicita 2026-09-15: NON mostrare il win-rate in UI (motivi
// legali — potrebbe sembrare una promessa/segnale finanziario). Si mostra
// solo l'EV ("rendimento atteso" in multipli di rischio R), un dato
// matematico neutro, insieme alla numerosità storica per dare contesto
// sulla robustezza del numero.
export type ScoreBand = "10-15" | "15-25" | "25+";

export function bandForScore(score: number): ScoreBand {
  if (score < 15) return "10-15";
  if (score < 25) return "15-25";
  return "25+";
}

type BandStats = { evR: number; nEntry: number };

// chiave: `${tf}|${band}|${direction}`
const TABLE: Record<string, BandStats> = {
  "15m|10-15|LONG": { evR: 1.073, nEntry: 3094 },
  "15m|10-15|SHORT": { evR: 0.310, nEntry: 2642 },
  "15m|15-25|LONG": { evR: 0.337, nEntry: 6265 },
  "15m|15-25|SHORT": { evR: 0.248, nEntry: 4048 },
  "15m|25+|LONG": { evR: 0.413, nEntry: 45102 },
  "15m|25+|SHORT": { evR: 0.532, nEntry: 36047 },
  "1h|15-25|LONG": { evR: 0.393, nEntry: 16833 },
  "1h|15-25|SHORT": { evR: 0.373, nEntry: 6632 },
  "1h|25+|LONG": { evR: 0.506, nEntry: 54088 },
  "1h|25+|SHORT": { evR: 0.442, nEntry: 79104 },
  "4h|15-25|LONG": { evR: 0.412, nEntry: 27231 },
  "4h|15-25|SHORT": { evR: -0.211, nEntry: 2911 },
  "4h|25+|LONG": { evR: 0.666, nEntry: 54749 },
  "4h|25+|SHORT": { evR: 0.506, nEntry: 81096 },
  "1d|10-15|LONG": { evR: -0.041, nEntry: 48 },
  "1d|15-25|LONG": { evR: 0.314, nEntry: 15509 },
  "1d|15-25|SHORT": { evR: 0.440, nEntry: 315 },
  "1d|25+|LONG": { evR: 0.841, nEntry: 39219 },
  "1d|25+|SHORT": { evR: 0.524, nEntry: 72502 },
};

// Sotto questa numerosita' il dato e' troppo rumoroso per essere mostrato
// come indicazione affidabile.
const MIN_N_RELIABLE = 300;

export function scoreBandStats(
  tf: string | null | undefined,
  score: number | null | undefined,
  direction: "LONG" | "SHORT"
): (BandStats & { band: ScoreBand; reliable: boolean }) | null {
  if (tf == null || score == null || !isFinite(score)) return null;
  const band = bandForScore(score);
  const key = `${tf.toLowerCase()}|${band}|${direction}`;
  const row = TABLE[key];
  if (!row) return null;
  return { ...row, band, reliable: row.nEntry >= MIN_N_RELIABLE };
}
