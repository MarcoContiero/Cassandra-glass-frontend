// src/types/agema.ts

export type AgemaDirection = 'LONG' | 'SHORT';

export interface AgemaTopSetup {
  id: string;
  tf: string;              // es. "1h"
  horizon: string;         // es. "BREVE", "MEDIO"
  direction: AgemaDirection;
  entry: number;
  tp1?: number;
  tp2?: number;
  sl?: number;
  rr1?: number;
  rr2?: number;
  score?: number;          // score interno Strategia AI, opzionale
}

export interface AgemaCiclicaInfo {
  tf: string;                      // es. "1h"
  fase_label: string;              // es. "Fase intermedia", "Zona re-entry"
  zona_reentry_label?: string;     // es. "Zona re-entry 13–14"
  posizione_prezzo?: 'sotto' | 'entro' | 'sopra';
  finestra_reentry_barre?: [number, number]; // es. [7, 17]
  nota_temporale?: string;         // testino tipo "Finestra re-entry 22–51h"
}

export interface AgemaStrategiaInfo {
  sintesi_label: string;           // es. "Setup LONG forte vicino al prezzo"
  n_setup_forte: number;           // quante entrate forti
  direzione_prevalente?: AgemaDirection | 'MIXED';
  top_setups: AgemaTopSetup[];     // max 3, già selezionate dal BE
}

export interface AgemaCoin {
  symbol: string;                  // es. "LINKUSDT"
  price: number;
  ciclica: AgemaCiclicaInfo;
  strategia_ai: AgemaStrategiaInfo;
  // score_agema?: number;         // lo usiamo solo lato BE per filtrare
}

export interface AgemaResponse {
  generated_at: string;            // ISO datetime
  refresh_hours: number;           // es. 4 (una volta ogni 4 ore)
  items: AgemaCoin[];
}