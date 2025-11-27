// Tipi condivisi per Strategia

export type Dir = "LONG" | "SHORT";

// Direzione del momentum (se presente)
export type MomentumDir = "UP" | "DOWN" | "NEUTRAL";

export type SignalBreakdown = {
  prob: number;   // 0..1
  payoff: number; // 0..1
  prox: number;   // 0..1
};

export type ScenarioLite = {
  // base (obbligatori)
  direction: Dir;
  entry: number;
  stop: number;

  // opzionali
  tp1?: number;
  tp2?: number;
  rr?: number;
  rrNet?: number;

  confidence?: number;                  // 0..100

  // momentum opzionale — alcuni moduli lo usano
  momentum?: number;                    // 0..1 (se assente, usare 0.5)
  momentumDir?: MomentumDir;

  // punteggio segnale (se disponibile)
  signalScore?: number;                 // 0..100
  signalScoreBreakdown?: SignalBreakdown;

  // testi/meta
  name?: string;
  meta?: string;
  badge?: string;
  explanation?: string;
  narrative?: string;

  trigger?: string;
  triggerZone?: string;
  invalidationText?: string;
  invalidationZone?: string;
  targetsText?: string;

  // altri
  tf?: string[];
  status?: "active" | "suspended" | "adjusted";
  note?: string;
  source?: "sr" | "mechanical" | "backend";
  label?: string;
  tags?: string[];
};
