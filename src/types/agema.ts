// src/types/agema.ts
//
// Redesign 2026-09-17: Agema seleziona SOLO le coin con un segnale
// Strategia AI forte in controtendenza rispetto alla fase ciclica 1h
// corrente (unico meccanismo validato, vedi
// backend/tifide3/backtest/analisi_agema_ciclica_sai.py). Nessun punteggio
// composito lato frontend — lo snapshot arriva gia' pronto dal backend
// (tools/agema_scan.py, job orario).

export type AgemaDirection = 'LONG' | 'SHORT';

export type AgemaCiclicaPhase =
  | 'early_up' | 'mid_up' | 'late_up'
  | 'early_down' | 'mid_down' | 'late_down';

// "forte" = fase matura (late_up/late_down, trend vecchio — EV piu' alto,
// verificato 18/9: 4/4 fold coerenti, 27/38 coin coerenti) vs "normale"
// (iniziale/centrale — resta un pick valido, solo meno forte).
export type AgemaTier = 'forte' | 'normale';

export interface AgemaPick {
  coin: string;                    // es. "BTC"
  direction: AgemaDirection;
  score: number;
  tf?: string | null;              // TF del setup Strategia AI, es. "1h"
  mode?: string | null;
  entry?: number | null;
  sl_price?: number | null;
  tp1_price?: number | null;
  tp2_price?: number | null;
  ciclica_phase_1h: AgemaCiclicaPhase;
  tier: AgemaTier;
}

export interface AgemaSnapshot {
  generated_at_ms: number | null;
  score_min: number | null;
  coins_scanned: number;
  picks: AgemaPick[];
  error?: string;
}
