// src/lib/ciclica/ciclicaViewModel.ts

// -----------------------------------------------------------------------------
// 1) Tipi BASE (forme raw attese dal backend)
//    (puoi aggiustarli quando definiremo il builder Python, ma sono già coerenti
//     con tutto quello che ci siamo detti finora)
// -----------------------------------------------------------------------------

export type CiclicaRaw = {
  timeframes_attivi?: string[];
  cicli_per_tf?: Record<string, CicliPerTfRaw>;
  finestre_per_tf?: Record<string, FinestraCiclicaRaw[]>;
  timeline?: Record<string, TimelineItemRaw[]>;

  compatibilita_scenari?: Record<string, CompatScenarioRaw>;
  compatibilita_strategia_ai?: CompatStrategiaRaw | null;

  narrativa_gassosa?: string;
  sintesi_ciclica_multi_tf?: string;   // 👈 sintesi multi-TF dal BE

  windows_2_5?: CiclicaWindows25Raw;

  roadmap_temporale?: string;

  // Roadmap ciclica strutturata (builder custom)
  ciclica_custom?: CiclicaCustomRaw;

  // 🔵 Nodo di Transizione ciclico (multi-TF)
  nodo_transizione?: NodoTransizioneRaw | null;

  reentry_path?: CiclicaReentryRaw | null;
};

export type CiclicaCustomPhaseRaw = {
  id?: string;
  ordine?: number;
  nome?: string;
  timeframe_riferimento?: string | null;
  finestra_barre?: { min?: number | null; max?: number | null };
  descrizione?: string;
  impatto?: string;
};

export type CiclicaCustomRaw = {
  meta?: {
    version?: string;
    fonte?: string;
    note?: string;
  };
  roadmap?: {
    fasi?: CiclicaCustomPhaseRaw[];
  };
  sintesi_operativa?: {
    bias_strutturale?: string;
    direzione_dominante_cicli_medi_lunghi?: string;
    stato_cicli?: Record<string, string>;
    testo_breve?: string;
    nota_operativa?: string;
  };
  scenari?: {
    id?: string;
    nome?: string;
    probabilita?: number | null;
    descrizione?: string;
  }[];
  livelli_operativi?: {
    take_profit?: Record<
      string,
      { valore_min?: number; valore_max?: number; tipo?: string; note?: string }
    >;
    stop_loss?: Record<
      string,
      {
        valore_min?: number;
        valore_max?: number;
        valore_riferimento?: number;
        timeframe_riferimento?: string;
        note?: string;
      }
    >;
  };
};

export type CiclicaReentryStepRaw = {
  id?: string;
  ordine?: number;
  tipo?: "take_profit" | "attesa" | "reentry_long" | string;
  label?: string;
  finestra_barre?: { min?: number | null; max?: number | null };
  descrizione?: string;
  zona_reentry?: {
    valore_min?: number | null;
    valore_max?: number | null;
    valore_centrale?: number | null;
    strength?: number | null;
  } | null;
};

export type CiclicaReentryRaw = {
  archetipo?: string;
  direzione_reentry?: "LONG" | "SHORT" | string;
  fase_attuale?: string;
  sequenza?: CiclicaReentryStepRaw[];
  zone_operative?: {
    take_profit_iniziale?: { min?: number | null; max?: number | null } | null;
    zona_reentry_long?: {
      valore_min?: number | null;
      valore_max?: number | null;
      valore_centrale?: number | null;
      strength?: number | null;
    } | null;
  } | null;
};

// Nuovo: finestre cicliche 2.5 (windows_2_5) con proiezione
export type CiclicaWindow25ProiezioneRaw = {
  bars_to_pivot?: number;
  eta_restante?: number;
};

export type CiclicaWindow25PerTfRaw = {
  tf?: string;
  fase?: string;
  pivot_dir?: string;
  pivot_type?: string;
  pivot_age_bars?: number;
  a_norm?: number;
  eta_norm?: number;
  over_extension?: boolean;
  flags?: Record<string, boolean>;
  proiezione?: CiclicaWindow25ProiezioneRaw;
};

export type CiclicaWindows25Raw = {
  per_tf?: Record<string, CiclicaWindow25PerTfRaw>;
  multi_tf?: Record<string, any>;
};

// Nodo di Transizione – forma raw dal backend
export type NodoTransizioneParamsRaw = {
  tf_daily_completamento?: number | null;
  tf_daily_stato?: string | null;
  tf_12h_residuo?: number | null;
  tf_12h_fase?: string | null;
  tf_4h_chiarezza?: boolean | null;
  tf_1h_partito?: boolean | null;
  range_basso?: number | null;
  range_alto?: number | null;
};

export type NodoTransizioneRaw = {
  attivo?: boolean | null;
  params?: NodoTransizioneParamsRaw | null;
  narrativa?: string | null;
};

export type CicliPerTfRaw = {
  tf?: string;
  attivo?: boolean;
  motivo_attivazione?: string | null;
  ciclo_breve?: CicloSingoloRaw | null;
  ciclo_medio?: CicloSingoloRaw | null;
  ciclo_lungo?: CicloSingoloRaw | null;
  meta_x?: string | null;
  meta_y?: string | null;
  meta_z?: string | null;
  meta_d?: string | null;
};

export type CicloSingoloRaw = {
  fase_x?: string | null;              // "early_up", "mid_up", "late_up", ...
  posizione_y?: string | null;         // "alta", "media", "bassa"
  convergenza_z?: string | null;       // "forte", "media", "debole", ...
  distorsione_d?: string | null;       // "bassa", "moderata", "alta"
  qualita?: number | null;             // 0-100

  // Durate stimate dal builder 2.5
  durata_media_candele?: number | null;
  durata_residua_candele?: number | null;

  // Metriche aggiuntive lato BE (nomi esatti dal JSON)
  completamento_perc?: number | null;        // es. 100
  fase_residua_candele?: number | null;      // es. 0
  countdown_finestra_candele?: number | null; // es. 28
};

export type FinestraCiclicaRaw = {
  id?: string;
  tipo?:
  | "cuspide_breve"
  | "valle_medio_orizzonte"
  | "nodo_transizione"
  | "sforzo_estremo"
  | string;
  nome?: string;
  tf?: string;
  ciclo_riferimento?: "breve" | "medio" | "lungo" | string;
  stato?: "attiva" | "in_arrivo" | "storica" | string;
  t_inizio_iso?: string;
  t_fine_iso?: string;
  index_candle_start?: number;
  index_candle_end?: number;
  price_min?: number;
  price_max?: number;
  price_ref?: number;
  ampiezza_prezzo_pct_range?: number;
  confidence?: number;
  direzione_attesa?: "max" | "min" | "reversal" | "eccesso" | string;
  colore_suggerito?: "caldo" | "freddo" | "neutro" | string;
  confluenze?: {
    liquidita_sopra?: boolean;
    liquidita_sotto?: boolean;
    sr_resistenza?: boolean;
    sr_supporto?: boolean;
    ema_cluster?: boolean;
    fvg?: boolean;
    bb_compressione?: boolean;
    pattern_rilevanti?: string[];
    scenari_supportati?: string[];
  } | null;
  descrizione_breve?: string;
  meta_gassosa?: string;
};

export type TimelineItemRaw = {
  tipo?: string;
  t_inizio_iso?: string;
  t_fine_iso?: string;
  confidence?: number;
  stato?: "attiva" | "in_arrivo" | "storica" | string;
};

export type CompatScenarioRaw = {
  supportato_da_finestre?: {
    tf?: string;
    finestra_id?: string;
    allineamento?: "forte" | "medio" | "debole" | "neutro" | string;
  }[];
  timing?: "favorevole" | "neutro" | "tardivo" | "precoce" | string;
  nota_ciclica?: string;
};

export type CompatStrategiaRaw = {
  setup_principale?: {
    id_setup?: string;
    tf?: string;
    direction?: "LONG" | "SHORT" | string;
    finestre_rilevanti?: {
      tf?: string;
      tipo?: string;
      finestra_id?: string;
      timing?: "in_finestra" | "prima_della_finestra" | "dopo_la_finestra" | string;
    }[];
    giudizio_ciclico?: "coerente" | "neutro" | "incoerente" | string;
    commento_ciclico_breve?: string;
  } | null;
};

// -----------------------------------------------------------------------------
// 2) Tipi VIEW MODEL per il FE
// -----------------------------------------------------------------------------

export type CiclicaCustomPhaseVM = {
  id: string;
  label: string;
  tfLabel?: string | null;
  barsRangeLabel?: string | null;
  description?: string;
  impact?: string;
};

export type CiclicaCustomRoadmapVM = {
  hasData: boolean;
  biasLabel: string;
  uiSummary: string;
  phases: CiclicaCustomPhaseVM[];
  tpLevels: { key: string; label: string }[];
  slLevels: { key: string; label: string }[];
};

export type CiclicaReentryStepVM = {
  id: string;
  order: number;
  label: string;
  type: "take_profit" | "attesa" | "reentry_long" | string;
  barsRangeLabel?: string | null;
  description?: string;
};

export type CiclicaReentryVM = {
  hasData: boolean;
  archetypeLabel: string;
  directionLabel: string;
  currentPhase: string;
  steps: CiclicaReentryStepVM[];
  tpLabel?: string | null;
  reentryZoneLabel?: string | null;

  // Nuovo: mini-roadmap temporale del re-entry (in ore sul TF 1h)
  roadmapLines?: string[];
};

export type CiclicaViewModel = {
  activeTimeframes: string[];
  cyclesByTf: Record<string, CiclicaTfBlock>;
  windows: CiclicaWindowVM[];
  timelineItems: CiclicaTimelineVM[];
  scenariosCompatibility: CiclicaScenarioCompatVM[];
  strategiaAiCompat?: CiclicaStrategiaCompatVM;

  narrative: string;
  summary: string; // sintesi multi-TF dal backend

  roadmap: string;

  // 🔵 Nodo di Transizione (già mappato e pronto per il FE)
  nodoTransizione?: CiclicaNodoTransizioneVM;

  // 🌈 Roadmap ciclica strutturata (builder custom)
  customRoadmap?: CiclicaCustomRoadmapVM;

  reentryPath?: CiclicaReentryVM;
};

export type CiclicaNodoTransizioneVM = {
  active: boolean;

  dailyCompletionLabel: string;
  dailyPhaseLabel: string;

  h12ResidualLabel: string;
  h12PhaseLabel: string;

  h4ClarityLabel: string;
  h1StartedLabel: string;

  priceRangeLabel: string;
  narrative: string;
};

export type CiclicaTfBlock = {
  tfKey: string;
  tfLabel: string;
  tfDescription: string;

  phaseLabel: string;
  rangePositionLabel: string;
  convergenceLabel: string;
  distortionLabel: string;

  phaseTooltip?: string;
  rangeTooltip?: string;
  convergenceTooltip?: string;
  distortionTooltip?: string;

  qualityScore: number;

  // Nuovi campi per la scheda per-TF
  cycleDurationLabel?: string;          // es. "≈ 48 barre"
  cycleRemainingLabel?: string;         // es. "≈ 0 barre"
  completionPct: number | null;         // es. 100
  phaseRemainingLabel?: string;         // es. "≈ 0 barre"
  nextWindowCountdownLabel?: string;    // es. "≈ 28 barre"

  // Proiezione pivot 2.5 (windows_2_5)
  pivotCountdownLabel?: string;         // es. "≈ 42 barre"
  pivotFlagsLabel?: string;             // es. "over-extension · ciclo in ritardo"
};

export type CiclicaWindowVM = {
  id: string;

  tfKey: string;
  tfLabel: string;

  typeKey:
  | "cuspide_breve"
  | "valle_medio_orizzonte"
  | "nodo_transizione"
  | "sforzo_estremo"
  | string;
  typeLabel: string;
  typeShortLabel: string;

  stateKey: "attiva" | "in_arrivo" | "storica" | string;
  stateLabel: string;

  directionKey: "max" | "min" | "reversal" | "eccesso" | string;
  directionLabel: string;

  timeStartIso: string;
  timeEndIso: string;
  timeRangeLabel: string;

  priceMin: number | null;
  priceMax: number | null;
  priceRangeLabel: string;

  confidence: number;
  intensityLabel: string;

  confluenzeBadges: string[];
  scenariosSupported: string[];
  hasMultiConfluence: boolean;

  uiTitle: string;
  uiSubtitle: string;
  uiBodySummary: string;
};

export type CiclicaTimelineVM = {
  id: string;
  windowIds: string[];
  tfKeys: string[];

  timeStartIso: string;
  timeEndIso: string;

  mainTypeKey: string;
  mainTypeLabel: string;

  stateKey: string;
  stateLabel: string;

  confidenceMax: number;
  confidenceAvg: number;
  intensityLabel: string;

  tfCount: number;
  isMultiTf: boolean;
  multiTfTag: "" | "x2" | "multi-tf";

  uiLabel: string;
  uiSubLabel?: string;
};

export type CiclicaScenarioCompatVM = {
  scenarioKey: string;
  scenarioLabel: string;
  timingKey: string;
  timingLabel: string;
  windowsLinked: {
    windowId: string;
    tfKey: string;
    tfLabel: string;
    typeKey: string;
    typeLabel: string;
    timingRelation: string;
    directionLabel: string;
  }[];
  uiSummary: string;
};

export type CiclicaStrategiaCompatVM = {
  mainSetupId: string;
  tfKey: string;
  tfLabel: string;
  directionKey: string;
  directionLabel: string;

  timingKey: string;
  timingLabel: string;

  windowsRelevant: {
    windowId: string;
    tfKey: string;
    tfLabel: string;
    typeKey: string;
    typeLabel: string;
    timingRelation: string;
  }[];

  uiSummary: string;
};

// -----------------------------------------------------------------------------
// 3) Funzione principale di mapping: raw -> CiclicaViewModel
// -----------------------------------------------------------------------------

export function buildCiclicaViewModel(raw: CiclicaRaw | null | undefined): CiclicaViewModel | null {
  if (!raw) return null;

  const activeTimeframes = (raw.timeframes_attivi ?? []).filter(Boolean);

  const cyclesByTf: Record<string, CiclicaTfBlock> = {};
  const cicliPerTf = raw.cicli_per_tf ?? {};

  // Nuovo: finestre cicliche 2.5 per TF
  const windows25PerTf: Record<string, CiclicaWindow25PerTfRaw> =
    raw.windows_2_5?.per_tf ?? {};

  for (const [tfKey, bloccoRaw] of Object.entries(cicliPerTf)) {
    const win25 = windows25PerTf[tfKey];
    cyclesByTf[tfKey] = mapCiclicaTfBlock(tfKey, bloccoRaw, win25);
  }

  const windows: CiclicaWindowVM[] = mapWindows(raw.finestre_per_tf ?? {});
  const timelineItems: CiclicaTimelineVM[] = mapTimeline(raw.timeline ?? {}, windows);

  const scenariosCompatibility = mapScenarioCompatibility(raw.compatibilita_scenari ?? {}, windows);

  const strategiaAiCompat = raw.compatibilita_strategia_ai
    ? mapStrategiaAiCompat(raw.compatibilita_strategia_ai, windows)
    : undefined;

  const narrative = raw.narrativa_gassosa ?? "";
  const summary = raw.sintesi_ciclica_multi_tf ?? "";
  const roadmap = raw.roadmap_temporale ?? "";

  const nodoTransizione = raw.nodo_transizione
    ? mapNodoTransizione(raw.nodo_transizione)
    : undefined;

  const customRoadmap = mapCiclicaCustom(raw.ciclica_custom)

  const reentryPath = mapReentryPath(raw.reentry_path ?? null);

  return {
    activeTimeframes,
    cyclesByTf,
    windows,
    timelineItems,
    scenariosCompatibility,
    strategiaAiCompat,
    narrative,
    summary,
    roadmap,
    nodoTransizione,
    customRoadmap,
    reentryPath,
  };
}

function mapCiclicaCustom(raw: CiclicaCustomRaw | undefined): CiclicaCustomRoadmapVM | undefined {
  if (!raw) return undefined;

  const fasiRaw = raw.roadmap?.fasi ?? [];
  const phases: CiclicaCustomPhaseVM[] = [];

  for (const fase of fasiRaw) {
    if (!fase) continue;
    const id = fase.id || fase.nome || `fase_${phases.length}`;
    const fb = fase.finestra_barre;
    let barsRangeLabel: string | null = null;
    if (fb && typeof fb.min === "number" && typeof fb.max === "number") {
      barsRangeLabel = `Fra ${fb.min}-${fb.max} barre`;
    }
    const tf = fase.timeframe_riferimento ?? null;
    const tfLabel = tf ? `TF ${tf}` : null;

    phases.push({
      id,
      label: fase.nome || "Fase ciclica",
      tfLabel,
      barsRangeLabel,
      description: fase.descrizione ?? "",
      impact: fase.impatto ?? "",
    });
  }

  const sint = raw.sintesi_operativa ?? {};
  const bias = sint.bias_strutturale ?? "NEUTRO";
  const domin = sint.direzione_dominante_cicli_medi_lunghi ?? "";
  const biasLabel = domin ? `${bias} (${domin})` : bias;
  const uiSummary = sint.testo_breve || sint.nota_operativa || "";

  const tpLevels: { key: string; label: string }[] = [];
  const slLevels: { key: string; label: string }[] = [];

  const tpRaw = raw.livelli_operativi?.take_profit ?? {};
  for (const [key, lvl] of Object.entries(tpRaw)) {
    const lo = (lvl as any).valore_min;
    const hi = (lvl as any).valore_max;
    let label = key;
    if (typeof lo === "number" && typeof hi === "number") {
      if (Math.round(lo) === Math.round(hi)) {
        label = `${key.toUpperCase()}: ≈ ${Math.round(lo)}`;
      } else {
        label = `${key.toUpperCase()}: ≈ ${Math.round(lo)}–${Math.round(hi)}`;
      }
    }
    tpLevels.push({ key, label });
  }

  const slRaw = raw.livelli_operativi?.stop_loss ?? {};
  for (const [key, lvl] of Object.entries(slRaw)) {
    const lo = (lvl as any).valore_min;
    const hi = (lvl as any).valore_max;
    const ref = (lvl as any).valore_riferimento;
    let label = key;
    if (typeof lo === "number" && typeof hi === "number") {
      if (Math.round(lo) === Math.round(hi)) {
        label = `${key}: ≈ ${Math.round(lo)}`;
      } else {
        label = `${key}: ≈ ${Math.round(lo)}–${Math.round(hi)}`;
      }
    } else if (typeof ref === "number") {
      label = `${key}: ≈ ${Math.round(ref)}`;
    }
    slLevels.push({ key, label });
  }

  const hasData = phases.length > 0 || tpLevels.length > 0 || slLevels.length > 0 || !!uiSummary;
  if (!hasData) return undefined;

  return {
    hasData,
    biasLabel,
    uiSummary,
    phases,
    tpLevels,
    slLevels,
  };
}

function mapReentryPath(raw: CiclicaReentryRaw | null | undefined): CiclicaReentryVM | undefined {
  if (!raw) return undefined;

  const stepsRaw = raw.sequenza ?? [];
  const steps: CiclicaReentryStepVM[] = [];

  for (const s of stepsRaw) {
    if (!s) continue;
    const id = s.id || s.label || `step_${steps.length}`;
    const fb = s.finestra_barre;
    let barsRangeLabel: string | null = null;
    if (fb && typeof fb.min === "number" && typeof fb.max === "number") {
      barsRangeLabel = `Fra ${fb.min}-${fb.max} barre`;
    }
    steps.push({
      id,
      order: s.ordine ?? steps.length + 1,
      label: s.label || "Fase ciclica",
      type: (s.tipo as any) || "fase",
      barsRangeLabel,
      description: s.descrizione || "",
    });
  }

  const zones = raw.zone_operative ?? {};
  const tp = zones.take_profit_iniziale;
  const zr = zones.zona_reentry_long;

  let tpLabel: string | null = null;
  if (tp && typeof tp.min === "number" && typeof tp.max === "number") {
    if (Math.round(tp.min) === Math.round(tp.max)) {
      tpLabel = `TP iniziale ≈ ${Math.round(tp.min)}`;
    } else {
      tpLabel = `TP iniziale ≈ ${Math.round(tp.min)}–${Math.round(tp.max)}`;
    }
  }

  let reentryZoneLabel: string | null = null;
  if (zr && typeof zr.valore_min === "number" && typeof zr.valore_max === "number") {
    if (Math.round(zr.valore_min) === Math.round(zr.valore_max)) {
      reentryZoneLabel = `Zona re-entry ≈ ${Math.round(zr.valore_min)}`;
    } else {
      reentryZoneLabel = `Zona re-entry ≈ ${Math.round(zr.valore_min)}–${Math.round(
        zr.valore_max
      )}`;
    }
  }

  const currentPhase = raw.fase_attuale || "";
  const archetypeLabel = raw.archetipo || "Percorso di rientro ciclico";
  const directionLabel = raw.direzione_reentry || "N/D";

  // 🔹 Roadmap temporale sintetica (in ore sul TF 1h)
  const roadmapLines: string[] = [];

  if (steps.length > 0) {
    // finestre fisse indicative: 1–3h, 4–7h, 8–10h
    const ranges = [
      { from: 1, to: 3 },
      { from: 4, to: 7 },
      { from: 8, to: 10 },
    ];

    const s1 = steps[0];
    const s2 = steps[1];
    const s3 = steps[2];

    if (s1) {
      // es: "1–3h: Fase ciclica attuale (1h)"
      roadmapLines.push(`${ranges[0].from}-${ranges[0].to}h: ${s1.label}`);
    }

    if (s2) {
      // per la seconda fase provo a usare la zona di re-entry se c'è
      let midLabel = s2.label;
      if (reentryZoneLabel) {
        // "Zona re-entry ≈ 3100–3131" -> "area re-entry 3100–3131"
        midLabel = reentryZoneLabel.replace("Zona re-entry ≈", "area re-entry");
      }
      roadmapLines.push(`${ranges[1].from}-${ranges[1].to}h: ${midLabel}`);
    }

    if (s3) {
      // terza fase: inizio nuova gamba rialzista / conferma rientro
      roadmapLines.push(`${ranges[2].from}-${ranges[2].to}h: ${s3.label}`);
    }
  }

  const hasData =
    steps.length > 0 || tpLabel !== null || reentryZoneLabel !== null || !!currentPhase;
  if (!hasData) return undefined;

  return {
    hasData,
    archetypeLabel,
    directionLabel,
    currentPhase,
    steps,
    tpLabel,
    reentryZoneLabel,
    roadmapLines: roadmapLines.length > 0 ? roadmapLines : undefined,
  };
}

function mapNodoTransizione(raw: NodoTransizioneRaw | null | undefined): CiclicaNodoTransizioneVM | undefined {
  if (!raw) return undefined;
  if (raw.attivo === false) return undefined;

  const p = raw.params ?? {};

  const dailyComp = p.tf_daily_completamento ?? null;
  const dailyPhase = p.tf_daily_stato ?? "";

  const h12Resid = p.tf_12h_residuo ?? null;
  const h12Phase = p.tf_12h_fase ?? "";

  const h4Clarity = p.tf_4h_chiarezza;
  const h1Started = p.tf_1h_partito;

  const priceMin = p.range_basso ?? null;
  const priceMax = p.range_alto ?? null;

  const narrative = raw.narrativa ?? "";

  if (!narrative && !p) return undefined;

  const dailyCompletionLabel =
    dailyComp != null ? `${Math.round(dailyComp)}%` : "n.d.";

  const dailyPhaseLabel = dailyPhase || "Fase non definita";

  const h12ResidualLabel =
    h12Resid != null ? `≈ ${Math.round(h12Resid)} barre` : "n.d.";

  const h12PhaseLabel = h12Phase || "Fase non definita";

  const h4ClarityLabel =
    typeof h4Clarity === "boolean"
      ? h4Clarity
        ? "Struttura chiara (pivot di conferma)"
        : "Fase di ricalibrazione"
      : "n.d.";

  const h1StartedLabel =
    typeof h1Started === "boolean"
      ? h1Started
        ? "Ciclo breve già ripartito"
        : "Ciclo breve non ancora avviato"
      : "n.d.";

  let priceRangeLabel = "";
  if (priceMin != null && priceMax != null) {
    priceRangeLabel = `≈ ${Math.round(priceMin)} – ${Math.round(priceMax)} USD`;
  } else {
    priceRangeLabel = "Range non definito";
  }

  const isActive: boolean = raw.attivo == null ? true : !!raw.attivo;

  return {
    active: isActive,
    dailyCompletionLabel,
    dailyPhaseLabel,
    h12ResidualLabel,
    h12PhaseLabel,
    h4ClarityLabel,
    h1StartedLabel,
    priceRangeLabel,
    narrative,
  };
}

// -----------------------------------------------------------------------------
// 4) Mapper per blocco ciclo per TF
// -----------------------------------------------------------------------------

function mapCiclicaTfBlock(
  tfKey: string,
  raw: CicliPerTfRaw,
  window25?: CiclicaWindow25PerTfRaw
): CiclicaTfBlock {
  const tfLabel = tfKey;
  const tfDescription = describeTf(tfKey);

  const ciclo: CicloSingoloRaw | null =
    raw.ciclo_breve ?? raw.ciclo_medio ?? raw.ciclo_lungo ?? null;

  const phaseLabel = mapPhaseLabel(ciclo?.fase_x);
  const rangePositionLabel = mapRangePositionLabel(ciclo?.posizione_y);
  const convergenceLabel = mapConvergenceLabel(ciclo?.convergenza_z);
  const distortionLabel = mapDistortionLabel(ciclo?.distorsione_d);

  const qualityScore = ciclo?.qualita ?? 0;

  // ------------------------------------------------------------
  // Durata totale ciclo
  // ------------------------------------------------------------
  let cycleDurationLabel: string | undefined = undefined;
  if (typeof ciclo?.durata_media_candele === "number") {
    cycleDurationLabel = `≈ ${Math.round(ciclo.durata_media_candele)} barre`;
  }

  // ------------------------------------------------------------
  // Durata residua ciclo
  // ------------------------------------------------------------
  let cycleRemainingLabel: string | undefined = undefined;
  if (typeof ciclo?.durata_residua_candele === "number") {
    cycleRemainingLabel = `≈ ${Math.round(ciclo.durata_residua_candele)} barre`;
  }

  // ------------------------------------------------------------
  // % completamento ciclo
  // ------------------------------------------------------------
  const completionPct =
    typeof ciclo?.completamento_perc === "number"
      ? ciclo.completamento_perc
      : null;

  // ------------------------------------------------------------
  // Fase residua
  // ------------------------------------------------------------
  let phaseRemainingLabel: string | undefined = undefined;
  if (typeof ciclo?.fase_residua_candele === "number") {
    phaseRemainingLabel = `≈ ${Math.round(ciclo.fase_residua_candele)} barre`;
  }

  // ------------------------------------------------------------
  // Countdown prossima finestra
  // ------------------------------------------------------------
  let nextWindowCountdownLabel: string | undefined = undefined;
  if (typeof ciclo?.countdown_finestra_candele === "number") {
    nextWindowCountdownLabel = `≈ ${Math.round(
      ciclo.countdown_finestra_candele
    )} barre`;
  }

  // ------------------------------------------------------------
  // Proiezione pivot (windows_2_5)
  // ------------------------------------------------------------
  let pivotCountdownLabel: string | undefined;
  let pivotFlagsLabel: string | undefined;

  if (window25 && typeof window25.proiezione?.bars_to_pivot === "number") {
    const bars = Math.round(window25.proiezione.bars_to_pivot);
    pivotCountdownLabel = `≈ ${bars} barre`;
  }

  if (window25?.flags) {
    const flagsOn = Object.entries(window25.flags)
      .filter(([, v]) => Boolean(v))
      .map(([k]) => {
        switch (k) {
          case "in_fase_di_inversione":
            return "in fase di inversione";
          case "warning_overext":
          case "over_extension":
            return "over-extension";
          case "warning_late":
            return "ciclo in ritardo";
          default:
            return k.replace(/_/g, " ");
        }
      });

    if (flagsOn.length) {
      pivotFlagsLabel = flagsOn.join(" · ");
    }
  }

  return {
    tfKey,
    tfLabel,
    tfDescription,

    phaseLabel,
    rangePositionLabel,
    convergenceLabel,
    distortionLabel,

    qualityScore,

    cycleDurationLabel,
    cycleRemainingLabel,
    completionPct,
    phaseRemainingLabel,
    nextWindowCountdownLabel,

    pivotCountdownLabel,
    pivotFlagsLabel,
  };
}

// -----------------------------------------------------------------------------
// 5) Mapper finestre: finestre_per_tf -> CiclicaWindowVM[]
// -----------------------------------------------------------------------------

function mapWindows(finestrePerTf: Record<string, FinestraCiclicaRaw[]>): CiclicaWindowVM[] {
  const result: CiclicaWindowVM[] = [];

  for (const [tfKey, list] of Object.entries(finestrePerTf)) {
    for (const raw of list ?? []) {
      if (!raw || !raw.id) continue;

      const tfLabel = tfKey;
      const typeKey = raw.tipo ?? "nodo_transizione";
      const { typeLabel, typeShortLabel } = mapWindowTypeLabels(typeKey);

      const stateKey = raw.stato ?? "attiva";
      const stateLabel = mapStateLabel(stateKey);

      const directionKey = raw.direzione_attesa ?? "reversal";
      const directionLabel = mapDirectionLabel(directionKey);

      const timeStartIso = raw.t_inizio_iso ?? "";
      const timeEndIso = raw.t_fine_iso ?? "";

      const timeRangeLabel = buildTimeRangeLabel(tfKey, timeStartIso, timeEndIso);

      const priceMin = raw.price_min ?? null;
      const priceMax = raw.price_max ?? null;
      const priceRangeLabel = buildPriceRangeLabel(priceMin, priceMax);

      const confidence = raw.confidence ?? 0;
      const intensityLabel = mapIntensityLabel(confidence);

      const { confluenzeBadges, scenariosSupported, hasMultiConfluence } =
        buildConfluenceInfo(raw.confluenze);

      const uiTitle = `${typeLabel} – TF ${tfLabel}`;
      const uiSubtitle =
        raw.descrizione_breve ??
        defaultWindowSubtitle(typeKey, tfLabel, directionLabel);

      const uiBodySummary = raw.meta_gassosa ?? "";

      result.push({
        id: raw.id,
        tfKey,
        tfLabel,
        typeKey,
        typeLabel,
        typeShortLabel,
        stateKey,
        stateLabel,
        directionKey,
        directionLabel,
        timeStartIso,
        timeEndIso,
        timeRangeLabel,
        priceMin,
        priceMax,
        priceRangeLabel,
        confidence,
        intensityLabel,
        confluenzeBadges,
        scenariosSupported,
        hasMultiConfluence,
        uiTitle,
        uiSubtitle,
        uiBodySummary,
      });
    }
  }

  // Ordinamento consigliato: per TF + tipo + stato + tempo inizio
  return result.sort((a, b) => {
    const tfOrder = compareTf(a.tfKey, b.tfKey);
    if (tfOrder !== 0) return tfOrder;

    const typeOrder = compareTypePriority(a.typeKey, b.typeKey);
    if (typeOrder !== 0) return typeOrder;

    const stateOrder = compareStatePriority(a.stateKey, b.stateKey);
    if (stateOrder !== 0) return stateOrder;

    return (a.timeStartIso || "").localeCompare(b.timeStartIso || "");
  });
}

// -----------------------------------------------------------------------------
// 6) Mapper timeline: timeline raw + windows -> CiclicaTimelineVM[]
// -----------------------------------------------------------------------------

function mapTimeline(
  timelineRaw: Record<string, TimelineItemRaw[]>,
  windows: CiclicaWindowVM[],
): CiclicaTimelineVM[] {
  // Mappa finestra per id per agganciare i tipi
  const windowById = new Map<string, CiclicaWindowVM>();
  for (const w of windows) {
    windowById.set(w.id, w);
  }

  const items: CiclicaTimelineVM[] = [];

  // Strategia semplice:
  // - ogni entry timelineRaw[tf] viene cercata nelle finestre di quel TF
  // - se più finestre condividono lo stesso intervallo temporale, possiamo aggregarle in futuro
  for (const [tfKey, list] of Object.entries(timelineRaw)) {
    for (const raw of list ?? []) {
      const id = `${tfKey}-${raw.tipo ?? "generic"}-${raw.t_inizio_iso ?? ""}-${raw.t_fine_iso ?? ""}`;

      const timeStartIso = raw.t_inizio_iso ?? "";
      const timeEndIso = raw.t_fine_iso ?? "";

      const statoKey = raw.stato ?? "attiva";
      const stateLabel = mapStateLabel(statoKey);

      // Proviamo a trovare almeno una finestra compatibile per tipo e TF
      const candidateWindows = windows.filter(
        (w) => w.tfKey === tfKey && w.typeKey === raw.tipo,
      );

      let mainTypeKey = raw.tipo ?? (candidateWindows[0]?.typeKey ?? "nodo_transizione");
      const { typeLabel: mainTypeLabel } = mapWindowTypeLabels(mainTypeKey);

      let confidenceList: number[] = [];
      if (candidateWindows.length) {
        confidenceList = candidateWindows.map((w) => w.confidence);
      } else if (typeof raw.confidence === "number") {
        confidenceList = [raw.confidence];
      }

      const confidenceMax = confidenceList.length ? Math.max(...confidenceList) : (raw.confidence ?? 0) ?? 0;
      const confidenceAvg = confidenceList.length
        ? confidenceList.reduce((a, b) => a + b, 0) / confidenceList.length
        : confidenceMax;

      const intensityLabel = mapIntensityLabel(confidenceMax);

      const tfKeys = candidateWindows.length
        ? Array.from(new Set(candidateWindows.map((w) => w.tfKey)))
        : [tfKey];

      const windowIds = candidateWindows.length ? candidateWindows.map((w) => w.id) : [];

      const tfCount = tfKeys.length;
      const isMultiTf = tfCount > 1;
      const multiTfTag: "" | "x2" | "multi-tf" =
        !isMultiTf ? "" : tfCount === 2 ? "x2" : "multi-tf";

      const uiLabel = buildTimelineLabel(mainTypeLabel, tfKeys, multiTfTag);
      const uiSubLabel = buildTimelineSubLabel(tfKeys, multiTfTag);

      items.push({
        id,
        windowIds,
        tfKeys,
        timeStartIso,
        timeEndIso,
        mainTypeKey,
        mainTypeLabel,
        stateKey: statoKey,
        stateLabel,
        confidenceMax,
        confidenceAvg,
        intensityLabel,
        tfCount,
        isMultiTf,
        multiTfTag,
        uiLabel,
        uiSubLabel,
      });
    }
  }

  // Ordiniamo per tempo di inizio
  return items.sort((a, b) => (a.timeStartIso || "").localeCompare(b.timeStartIso || ""));
}

// -----------------------------------------------------------------------------
// 7) Mapper compatibilità scenari / strategia AI
// -----------------------------------------------------------------------------

function mapScenarioCompatibility(
  raw: Record<string, CompatScenarioRaw>,
  windows: CiclicaWindowVM[],
): CiclicaScenarioCompatVM[] {
  const result: CiclicaScenarioCompatVM[] = [];

  const windowById = new Map<string, CiclicaWindowVM>();
  for (const w of windows) windowById.set(w.id, w);

  for (const [scenarioKey, info] of Object.entries(raw)) {
    const timingKey = info.timing ?? "neutro";
    const timingLabel = mapScenarioTimingLabel(timingKey);

    const windowsLinked: CiclicaScenarioCompatVM["windowsLinked"] = [];

    for (const link of info.supportato_da_finestre ?? []) {
      if (!link.finestra_id) continue;
      const w = windowById.get(link.finestra_id);
      if (!w) continue;

      windowsLinked.push({
        windowId: w.id,
        tfKey: w.tfKey,
        tfLabel: w.tfLabel,
        typeKey: w.typeKey,
        typeLabel: w.typeLabel,
        timingRelation: link.allineamento ?? "neutro",
        directionLabel: w.directionLabel,
      });
    }

    const scenarioLabel = scenarioKey; // puoi mappare a label più parlante in futuro
    const uiSummary =
      info.nota_ciclica ??
      `Timing ${timingLabel.toLowerCase()} rispetto alle finestre cicliche attive.`;

    result.push({
      scenarioKey,
      scenarioLabel,
      timingKey,
      timingLabel,
      windowsLinked,
      uiSummary,
    });
  }

  return result;
}

function mapStrategiaAiCompat(
  raw: CompatStrategiaRaw,
  windows: CiclicaWindowVM[],
): CiclicaStrategiaCompatVM | undefined {
  if (!raw.setup_principale) return undefined;

  const s = raw.setup_principale;
  const mainSetupId = s.id_setup ?? "main";

  const tfKey = s.tf ?? "";
  const tfLabel = tfKey;

  const directionKey = s.direction ?? "";
  const directionLabel = directionKey === "SHORT" ? "Short" : "Long";

  const timingKey = s.giudizio_ciclico ?? "neutro";
  const timingLabel = mapStrategiaTimingLabel(timingKey);

  const windowById = new Map<string, CiclicaWindowVM>();
  for (const w of windows) windowById.set(w.id, w);

  const windowsRelevant =
    s.finestre_rilevanti?.map((f) => {
      const w = f.finestra_id ? windowById.get(f.finestra_id) : undefined;
      return {
        windowId: f.finestra_id ?? "",
        tfKey: w?.tfKey ?? (f.tf ?? ""),
        tfLabel: w?.tfLabel ?? (f.tf ?? ""),
        typeKey: w?.typeKey ?? (f.tipo ?? "nodo_transizione"),
        typeLabel: w?.typeLabel ?? "Finestra ciclica",
        timingRelation: f.timing ?? "in_finestra",
      };
    }) ?? [];

  const uiSummary =
    s.commento_ciclico_breve ??
    `Setup ${directionLabel} su ${tfLabel} con giudizio ciclico ${timingLabel.toLowerCase()}.`;

  return {
    mainSetupId,
    tfKey,
    tfLabel,
    directionKey,
    directionLabel,
    timingKey,
    timingLabel,
    windowsRelevant,
    uiSummary,
  };
}

// -----------------------------------------------------------------------------
// 8) Helpers di label / mapping (tutti in un unico posto per coerenza gassosa)
// -----------------------------------------------------------------------------

function describeTf(tfKey: string): string {
  switch (tfKey) {
    case "1h":
      return "Ciclo breve operativo";
    case "4h":
      return "Ciclo strutturale";
    case "12h":
      return "Ciclo di conferma";
    case "1d":
    case "1D":
      return "Ciclo macro";
    default:
      return "Timeframe";
  }
}

function mapPhaseLabel(fase?: string | null): string {
  switch (fase) {
    case "early_up":
      return "Inizio fase rialzista";
    case "mid_up":
      return "Fase rialzista in sviluppo";
    case "late_up":
      return "Fase rialzista matura";
    case "early_down":
      return "Inizio fase ribassista";
    case "mid_down":
      return "Fase ribassista in sviluppo";
    case "late_down":
      return "Fase ribassista matura";
    default:
      return "Fase neutra o non definita";
  }
}

function mapRangePositionLabel(pos?: string | null): string {
  switch (pos) {
    case "alta":
      return "In alto nel range";
    case "media":
      return "In zona centrale";
    case "bassa":
      return "In basso nel range";
    default:
      return "Posizione non definita";
  }
}

function mapConvergenceLabel(z?: string | null): string {
  switch (z) {
    case "forte":
      return "Convergenza forte";
    case "media":
      return "Convergenza media";
    case "debole":
      return "Convergenza debole";
    default:
      return "Convergenza non definita";
  }
}

function mapDistortionLabel(d?: string | null): string {
  switch (d) {
    case "bassa":
      return "Distorsione contenuta";
    case "moderata":
      return "Distorsione moderata";
    case "alta":
      return "Distorsione elevata";
    default:
      return "Distorsione non definita";
  }
}

function mapWindowTypeLabels(typeKey: string): { typeLabel: string; typeShortLabel: string } {
  switch (typeKey) {
    case "cuspide_breve":
      return { typeLabel: "Cuspide Breve", typeShortLabel: "Cuspide" };
    case "valle_medio_orizzonte":
      return { typeLabel: "Valle di Medio Orizzonte", typeShortLabel: "Valle" };
    case "nodo_transizione":
      return { typeLabel: "Nodo di Transizione", typeShortLabel: "Nodo" };
    case "sforzo_estremo":
      return { typeLabel: "Sforzo Estremo", typeShortLabel: "Estremo" };
    default:
      return { typeLabel: "Finestra Ciclica", typeShortLabel: "Finestra" };
  }
}

function mapStateLabel(stateKey: string): string {
  switch (stateKey) {
    case "attiva":
      return "Attiva";
    case "in_arrivo":
      return "In arrivo";
    case "storica":
      return "Storica";
    default:
      return "Stato non definito";
  }
}

function mapDirectionLabel(dirKey: string): string {
  switch (dirKey) {
    case "max":
      return "Massimo locale probabile";
    case "min":
      return "Minimo locale probabile";
    case "reversal":
      return "Probabile cambio di fase";
    case "eccesso":
      return "Zona di eccesso";
    default:
      return "Direzione non definita";
  }
}

function mapIntensityLabel(conf: number): string {
  if (conf >= 85) return "Molto forte";
  if (conf >= 70) return "Forte";
  if (conf >= 40) return "Media";
  if (conf > 0) return "Debole";
  return "Non valutata";
}

function buildTimeRangeLabel(tfKey: string, startIso: string, endIso: string): string {
  // per ora testo generico; in futuro puoi calcolare quante candele sono
  if (!startIso || !endIso) return `Timeframe ${tfKey}`;
  return `Finestra su TF ${tfKey}`;
}

function buildPriceRangeLabel(min: number | null, max: number | null): string {
  if (min == null || max == null) return "Range prezzo non definito";
  return `Zona ${min.toFixed(2)} – ${max.toFixed(2)}`;
}

function buildConfluenceInfo(confluenze?: FinestraCiclicaRaw["confluenze"]): {
  confluenzeBadges: string[];
  scenariosSupported: string[];
  hasMultiConfluence: boolean;
} {
  const badges: string[] = [];
  const scenariosSupported: string[] = confluenze?.scenari_supportati ?? [];

  if (!confluenze) {
    return { confluenzeBadges: badges, scenariosSupported, hasMultiConfluence: false };
  }

  if (confluenze.liquidita_sopra) badges.push("Liquidità sopra");
  if (confluenze.liquidita_sotto) badges.push("Liquidità sotto");
  if (confluenze.sr_resistenza) badges.push("Resistenza");
  if (confluenze.sr_supporto) badges.push("Supporto");
  if (confluenze.ema_cluster) badges.push("Cluster EMA");
  if (confluenze.fvg) badges.push("FVG");
  if (confluenze.bb_compressione) badges.push("Compressione BB");
  if ((confluenze.pattern_rilevanti ?? []).length) badges.push("Pattern");

  const hasMultiConfluence = badges.length >= 3;

  return { confluenzeBadges: badges, scenariosSupported, hasMultiConfluence };
}

function defaultWindowSubtitle(
  typeKey: string,
  tfLabel: string,
  directionLabel: string,
): string {
  switch (typeKey) {
    case "cuspide_breve":
      return `Finestra di possibile massimo locale su ${tfLabel}.`;
    case "valle_medio_orizzonte":
      return `Finestra di possibile minimo strutturale su ${tfLabel}.`;
    case "nodo_transizione":
      return `Zona di possibile cambio di fase su ${tfLabel}.`;
    case "sforzo_estremo":
      return `Finestra di eccesso rispetto all'equilibrio ciclico.`;
    default:
      return directionLabel;
  }
}

// Ordering helpers ------------------------------------------------------------

function compareTf(a: string, b: string): number {
  const order = ["4h", "1h", "1d", "1D", "12h"];
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  if (ia === -1 && ib === -1) return a.localeCompare(b);
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

function compareTypePriority(a: string, b: string): number {
  const order = ["nodo_transizione", "cuspide_breve", "valle_medio_orizzonte", "sforzo_estremo"];
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  if (ia === -1 && ib === -1) return 0;
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

function compareStatePriority(a: string, b: string): number {
  const order = ["attiva", "in_arrivo", "storica"];
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  if (ia === -1 && ib === -1) return 0;
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

// Timeline label helpers ------------------------------------------------------

function buildTimelineLabel(
  typeLabel: string,
  tfKeys: string[],
  multiTfTag: "" | "x2" | "multi-tf",
): string {
  if (!tfKeys.length) return typeLabel;
  if (!multiTfTag) return `${typeLabel} ${tfKeys[0]}`;
  return `${typeLabel} ${multiTfTag}`;
}

function buildTimelineSubLabel(
  tfKeys: string[],
  multiTfTag: "" | "x2" | "multi-tf",
): string | undefined {
  if (!tfKeys.length) return undefined;
  if (!multiTfTag) return undefined;
  return tfKeys.join(" + ");
}

// Scenario / strategia timing -------------------------------------------------

function mapScenarioTimingLabel(key: string): string {
  switch (key) {
    case "favorevole":
      return "Timing favorevole";
    case "tardivo":
      return "Timing tardivo";
    case "precoce":
      return "Timing precoce";
    case "neutro":
    default:
      return "Timing neutro";
  }
}

function mapStrategiaTimingLabel(key: string): string {
  switch (key) {
    case "coerente":
      return "Coerente con la lettura ciclica";
    case "incoerente":
      return "Incoerente con la lettura ciclica";
    case "neutro":
    default:
      return "Neutro rispetto alla lettura ciclica";
  }
}
