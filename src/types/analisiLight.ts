// src/types/analisiLight.ts

// Timeframe standard usati da Cassandra; lasciamo aperto anche string per sicurezza
export type Timeframe = "15m" | "1h" | "4h" | "12h" | "1d" | "1w" | string;

/* -------------------------------------------------------------------------- */
/*  SUPPORTI / RESISTENZE                                                     */
/* -------------------------------------------------------------------------- */

export interface LivelloSR {
  indicatore: "Supporto" | "Resistenza" | string;
  timeframe: Timeframe;
  valore: number;
  scenario: string;
  punteggio: number;
  direzione: "neutro" | "LONG" | "SHORT" | string;
  forza: number;
}

/* -------------------------------------------------------------------------- */
/*  TREND / BIAS PER TF                                                       */
/* -------------------------------------------------------------------------- */

export interface TrendComponent {
  indicatore: string;
  scenario: string;
  scenario_label?: string | null; // nuova etichetta “umana” per la UI
  direzione: "long" | "short" | "neutro" | string;
  punteggio: number;
}

export interface TrendComponentsGroup {
  long: TrendComponent[];
  short: TrendComponent[];
  neutro: TrendComponent[];
}

export interface TrendTfEntry {
  bias: "long" | "short" | "neutro" | string;
  score: number;
  long: number;
  short: number;
  neutro: number;
  tot: number;
  components: TrendComponentsGroup;
}

/* -------------------------------------------------------------------------- */
/*  FVG, SWINGS, ROUND LEVELS, LIQUIDITY                                      */
/* -------------------------------------------------------------------------- */

// Al momento nel JSON sono oggetti generici; li teniamo flessibili.
export interface FvgSideEntry {
  // struttura dettagliata da definire quando agganciamo la vista FVG
  [key: string]: any;
}

export interface FvgBlock {
  above: FvgSideEntry[];
  below: FvgSideEntry[];
}

export interface SwingSideEntry {
  [key: string]: any;
}

export interface SwingsBlock {
  above: SwingSideEntry[];
  below: SwingSideEntry[];
}

export interface RoundLevelEntry {
  livello: number;
  dist: number;
  source: string;
}

export interface RoundLevelsBlock {
  sopra: RoundLevelEntry[];
  sotto: RoundLevelEntry[];
}

export interface LiquidityPoolEntry {
  [key: string]: any;
}

export interface LiquidityMeta {
  price: number;
  tfs: Timeframe[];
}

export interface LiquidityBlock {
  sopra: LiquidityPoolEntry[];
  sotto: LiquidityPoolEntry[];
  _meta: LiquidityMeta;
}

/* -------------------------------------------------------------------------- */
/*  PATTERN PER TF                                                            */
/* -------------------------------------------------------------------------- */

export interface PatternEntry {
  // non ancora utilizzato dal FE: lasciamo generico
  [key: string]: any;
}

export type PatternsPerTf = Record<Timeframe, PatternEntry[]>;

/* -------------------------------------------------------------------------- */
/*  LONGSHORT GLOBALE                                                         */
/* -------------------------------------------------------------------------- */

export interface LongShortGlobal {
  direzione: "LONG" | "SHORT" | "NEUTRO" | string;
  score: number;
}

/* -------------------------------------------------------------------------- */
/*  META X / Y / Z (PENSIERO GASSOSO)                                         */
/* -------------------------------------------------------------------------- */

export interface MetaX {
  tf: Timeframe;
  sequence: string;
  swing: string;
  provenienza: string;
  breakout_state: string;
}

export interface MetaY {
  tf: Timeframe;
  trend: string;
  posizione_verticale: string;
  pos_vs_sr: string;
  pos_bb: string;
}

export interface MetaZ {
  tf: Timeframe;
  convergenza_tf: string;
  fase_ciclica: string;
  intensita: string;
}

/* -------------------------------------------------------------------------- */
/*  META D (FAMIGLIE SCENARI)                                                 */
/* -------------------------------------------------------------------------- */

export interface FamigliaScore {
  score: number;
}

export interface ScenarioAttivo {
  codice: string;
  categoria: string;
  direzione: "LONG" | "SHORT" | "NEUTRO" | string;
  peso: number;
}

export interface MetaDPerTf {
  volatilita: FamigliaScore;
  liquidity: FamigliaScore;
  trend_follow: FamigliaScore;
  mean_reversion: FamigliaScore;
  pattern: FamigliaScore;
  struttura: FamigliaScore;
  gassosi: FamigliaScore;
  altro: FamigliaScore;
  score_long: number;
  score_short: number;
  scenari_attivi: ScenarioAttivo[];
}

/* -------------------------------------------------------------------------- */
/*  STRATEGIA AI: SETUP OPERATIVI                                             */
/* -------------------------------------------------------------------------- */

export interface StrategiaCondition {
  id: string;
  label: string;
  descr: string;
  status: "unknown" | "met" | "not_met" | string;
  tf_scope: Timeframe | string;
  value: number | null;
  expected: string;
  weight: number;
}

export interface StrategiaConditionsBlock {
  confirm: StrategiaCondition[];
  invalidate: StrategiaCondition[];
}

export interface StrategiaSetup {
  tf: Timeframe;
  mode: "breve" | "medio" | "lungo" | string;
  direction: "LONG" | "SHORT";
  setup: string;
  entry: number;
  sl_pad_bps: number;
  tp1: number;
  tp2: number;
  rr1: number;
  rr2: number;
  bias: "LONG" | "SHORT" | string;
  score: number;
  source: string;
  explanation: string;

  tp1_price?: number;
  tp2_price?: number;
  sl_price?: number;

  forza_classe: string;
  tags: string[];
  note: string;
  conditions: StrategiaConditionsBlock;
  conferme: any[];

  is_wall?: boolean;
  is_best?: boolean;

  dist_bps?: number | null;
  dist_pct?: number | null;
}

/* -------------------------------------------------------------------------- */
/*  STRATEGIA AI LANGUAGE (FRASI PER TF)                                      */
/* -------------------------------------------------------------------------- */

export interface StrategiaAiLanguageSection {
  short: string;
  medium: string;
  full: string;
}

export interface StrategiaAiLanguageEntry {
  riassunto: StrategiaAiLanguageSection;
  setup: StrategiaAiLanguageSection;
  debug_pensieri: StrategiaAiLanguageSection;
}

/* -------------------------------------------------------------------------- */
/*  SCENARI (PER TF E PREVISTI)                                               */
/* -------------------------------------------------------------------------- */

export interface ScenarioPrevisto {
  id: string;
  scenario_id: string;
  nome: string;
  categoria: string;
  famiglia: string | null;
  tf: Timeframe;

  direzione: "LONG" | "SHORT" | "NEUTRO" | string;
  stato: string;

  punteggio: number;
  score: number;
  confidence: number;

  motivo: string;
  spiegazione: string;

  tags: string[];
  livelli: Record<string, any>;
  conferme: any[];
  invalidazioni: any[];
  scenari_correlati: any[];

  active: boolean;
  debug: Record<string, any>;
}

export type ScenariPerTf = Record<Timeframe, ScenarioPrevisto[]>;

/* -------------------------------------------------------------------------- */
/*  ALERTS / MOTIVAZIONI / PREGRESSO                                          */
/* -------------------------------------------------------------------------- */

export interface AlertEntry {
  code: string;
  condition: string;
  extra: any | null;
  price: number | null;
  scenario_tag: string | null;
  score: number;
  sources: string[];
  tf: Timeframe;
  time: string | null;
  title: string;
}

export interface PregressoMeta {
  category: string;
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface PregressoResult {
  id: string;
  score: number;
  reason: string;
  active: boolean;
  meta: PregressoMeta;
  debug: Record<string, any>;
}

export type PregressoPerTf = Record<Timeframe, PregressoResult[]>;

/* -------------------------------------------------------------------------- */
/*  MINMAX PER TF                                                             */
/* -------------------------------------------------------------------------- */

export interface MinMaxEntry {
  close: number;
  high: number;
  low: number;
}

export type MinMaxPerTf = Record<Timeframe, MinMaxEntry>;

/* -------------------------------------------------------------------------- */
/*  META GENERALE                                                             */
/* -------------------------------------------------------------------------- */

export interface AnalisiMeta {
  symbol: string;
  tfs: Timeframe[];
  limit: number;
  has_errors: boolean;
  timings_ms: Record<string, number>;
}

/* -------------------------------------------------------------------------- */
/*  ROOT: AnalisiLightResponse                                                */
/* -------------------------------------------------------------------------- */

export interface AnalisiLightResponse {
  timeframes: Timeframe[];

  prezzo: number;
  prezzo_corrente: number;
  last_price: number;

  minmax_per_tf: MinMaxPerTf;

  supporti: LivelloSR[];
  resistenze: LivelloSR[];

  trend_tf_score: Record<Timeframe, TrendTfEntry>;

  diagnostica: any;

  fvg: FvgBlock;
  swings: SwingsBlock;
  round_levels: RoundLevelsBlock;
  patterns: PatternsPerTf;
  liquidity: LiquidityBlock;

  longshort: LongShortGlobal;

  meta_x_per_tf: Record<Timeframe, MetaX>;
  meta_y_per_tf: Record<Timeframe, MetaY>;
  meta_z_per_tf: Record<Timeframe, MetaZ>;
  meta_d_per_tf: Record<Timeframe, MetaDPerTf>;

  strategia_ai: StrategiaSetup[];
  strategia_ai_language: Record<Timeframe, StrategiaAiLanguageEntry>;

  ctx_per_tf: Record<Timeframe, any>;

  scenari_per_tf: ScenariPerTf;
  scenari_previsti: ScenarioPrevisto[];

  alerts: AlertEntry[];
  motivazioni: string[];

  pregresso_per_tf: PregressoPerTf;

  _meta: AnalisiMeta;

  // --- Campi legacy usati dalla vecchia UI (manteniamo per compatibilità) ---
  entries?: any;
  entrate?: any;
  possibili_scenari?: any;
  comparative?: any;
  risposte?: any;
}
