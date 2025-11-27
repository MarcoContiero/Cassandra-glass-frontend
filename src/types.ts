// src/types.ts

export type Direction = 'long' | 'short' | 'neutro';
export type DirectionUI = 'LONG' | 'SHORT' | 'NEUTRO' | Direction;

/* ---- Dettaglio score per TF ---- */
export type Component = {
  indicatore?: string;
  scenario?: string;
  direzione?: Direction;
  punteggio?: number;
};

export type ComponentsBucket = {
  long?: Component[];
  short?: Component[];
  neutro?: Component[];
};

export interface TFScoreRow {
  bias: Direction;
  score: number;
  long: number;
  short: number;
  neutro: number;
  tot: number;
  components?: ComponentsBucket | Component[]; // backend può mandare entrambi i formati
}

/* ---- Supporti/Resistenze e Scenari ---- */
export type SRText = { testo: string };

export type Scenario = {
  codice: string;
  nome: string;
  direzione: Direction;
  score: number;
  tfs: string[];
  descrizione: string;
};

/* ---- Riepilogo Totale ---- */
export type RiepilogoTotale = {
  ok: boolean;
  tipo: "riepilogo_totale";
  testo: string;

  per_tf: Record<string, {
    trend: string;                        // es. "LONG" | "SHORT" | "NEUTRO"
    score: number | string;               // punteggio TF
    struttura: string;                    // "HH/HL" | "LL/LH" | "—"
    scenari: { nome: string; attivo: boolean }[];
  }>;

  multi_tf: {
    direzione_dominante: string;          // "LONG" | "SHORT" | "NEUTRO"
    conflitti: string[];                  // TF in conflitto
    supporto_chiave?: string | null;
    resistenza_chiave?: string | null;
    liq_sopra: { price: string; score?: number }[];
    liq_sotto: { price: string; score?: number }[];
    setup: {
      direzione: string;
      entry?: string | null;
      stop?: string | null;
      tp1?: string | null;
      rr?: number | null;
    };
  };
};

// === Strategia AI types ==============================
export type StrategyItem = {
  title: string;
  direction: 'LONG' | 'SHORT' | 'long' | 'short';
  entry: number;
  tf?: string;
  stop?: number;
  tp1?: number;
};

// supporta sia il formato nuovo (oggetto con items) sia quello legacy (array puro)
export type StrategiaAI =
  | StrategyItem[]
  | {
    items?: StrategyItem[];
    score?: number;
    direzione?: string;
    delta_score?: number;
    timeframes?: string[];
    explainText?: string;
    tf?: string[];
    confidence?: number;
  };

/* ----- Blocco risposte (UI) ----- */
export interface Risposte {
  longshort?: { direzione: DirectionUI; score: number; motivi?: string[] };
  trend_tf_score?: Record<string, TFScoreRow>;
  trend_tf?: Record<string, string>;
  entrate?: string;

  supporti?: SRText[];
  supporti_extra?: SRText[];
  resistenze?: SRText[];
  resistenze_extra?: SRText[];

  scenari?: Scenario[];
  motivi?: string[]; // “Spiegazione dell’analisi”
  spiegazione?: string | string[];

  liquidita?: {
    livelli_liquidita: Array<{
      price: number;
      side: 'buy-side' | 'sell-side';
      types: string[];
      score: number;
      status: 'untouched' | 'tested' | 'swept';
    }>;
  };

  riepilogo_totale?: RiepilogoTotale;  // 👈 nuova chiave
}

/* ---- Strategia AI ---- */
export type Strat = {
  id: string;
  titolo: string;
  direzione: Direction;
  score: number;
  tfs: string[];
  descrizione: string;
  trigger: string;
  invalidazione: string;
  targets: string[];
  confidenza: number;      // 0..95
  orizzonte: 'intraday' | 'multiday' | 'swing';
};

/* ---- Risposta dell’API ---- */
export interface ApiResult {
  score: number;
  delta_score: number;
  direzione: Direction;
  trend_tf: Record<string, string>;
  trend_tf_score: Record<string, TFScoreRow>;
  risposte: Risposte;
  strategia?: Strat[];     // ← array di card strategiche
  narrativa: string;
  emozione: string;
  warnings: string[];
}

/* (opzionale) Chiavi accettate da <Domande/> */
export type QuestionKey =
  | 'longshort'
  | 'entrate'
  | 'supporti'
  | 'scenari'
  | 'spiegazione'
  | 'motivi'
  | 'strategia'
  | 'riepilogo_totale'
  | 'liquidita'
  | 'trigger_map'
  | 'momentum_gauge';    // 👈 aggiunta

export type LongShortPerTfEntry = {
  tf: string;
  score: number;
  direction: "LONG" | "SHORT" | "NEUTRO";
};

export type LongShortGlobal = {
  direzione: "LONG" | "SHORT" | "NEUTRO";
  score: number;
  dominant?: "LONG" | "SHORT" | "NEUTRO";
  dominant_score?: number;

  // 🔽 nuovi campi dal backend 2.0
  per_tf?: LongShortPerTfEntry[];
  per_tf_map?: Record<string, { score: number; direction: string }>;
};
