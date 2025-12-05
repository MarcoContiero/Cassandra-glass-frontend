// src/lib/ciclica/mockCiclica.ts
import type { CiclicaRaw } from "./ciclicaViewModel";

export const mockCiclica: CiclicaRaw = {
  timeframes_attivi: ["1h", "4h", "1d"],

  cicli_per_tf: {
    "1h": {
      tf: "1h",
      ciclo_breve: {
        fase_x: "late_up",
        posizione_y: "alta",
        convergenza_z: "media",
        distorsione_d: "moderata",
        qualita: 78,
      },
      ciclo_medio: {
        fase_x: "mid_up",
        posizione_y: "media",
        convergenza_z: "media",
        distorsione_d: "bassa",
        qualita: 72,
      },
      ciclo_lungo: null,
    },
    "4h": {
      tf: "4h",
      ciclo_breve: {
        fase_x: "mid_up",
        posizione_y: "media",
        convergenza_z: "forte",
        distorsione_d: "bassa",
        qualita: 82,
      },
      ciclo_medio: {
        fase_x: "early_up",
        posizione_y: "bassa",
        convergenza_z: "media",
        distorsione_d: "bassa",
        qualita: 75,
      },
      ciclo_lungo: null,
    },
    "1d": {
      tf: "1d",
      ciclo_breve: {
        fase_x: "early_down",
        posizione_y: "alta",
        convergenza_z: "debole",
        distorsione_d: "moderata",
        qualita: 65,
      },
      ciclo_medio: {
        fase_x: "mid_up",
        posizione_y: "media",
        convergenza_z: "media",
        distorsione_d: "bassa",
        qualita: 70,
      },
      ciclo_lungo: null,
    },
  },

  finestre_per_tf: {
    "1h": [
      {
        id: "CUSPIDE_BREVE_1H_DEMO",
        tipo: "cuspide_breve",
        nome: "Cuspide Breve",
        tf: "1h",
        ciclo_riferimento: "breve",
        stato: "attiva",
        t_inizio_iso: "2025-11-29T10:00:00Z",
        t_fine_iso: "2025-11-29T14:00:00Z",
        price_min: 2780,
        price_max: 2840,
        confidence: 82,
        direzione_attesa: "max",
        descrizione_breve: "Probabile massimo locale su 1h con rischio di reversal.",
        meta_gassosa:
          "La Cuspide Breve concentra la pressione nella parte alta del range orario.",
        confluenze: {
          liquidita_sopra: true,
          sr_resistenza: true,
          ema_cluster: true,
          fvg: true,
          bb_compressione: true,
          scenari_supportati: ["RC1", "FF1"],
          pattern_rilevanti: ["evening_star"],
        },
      },
    ],
    "4h": [
      {
        id: "VALLE_MEDIO_4H_DEMO",
        tipo: "valle_medio_orizzonte",
        nome: "Valle di Medio Orizzonte",
        tf: "4h",
        ciclo_riferimento: "medio",
        stato: "in_arrivo",
        t_inizio_iso: "2025-11-29T16:00:00Z",
        t_fine_iso: "2025-11-30T04:00:00Z",
        price_min: 2520,
        price_max: 2600,
        confidence: 76,
        direzione_attesa: "min",
        descrizione_breve:
          "Zona sensibile per possibile minimo strutturale su 4h.",
        meta_gassosa:
          "La Valle di Medio Orizzonte raccoglie l'inerzia ribassista in zona di possibile accumulo.",
        confluenze: {
          sr_supporto: true,
          liquidita_sotto: true,
          ema_cluster: true,
          scenari_supportati: ["RR1"],
        },
      },
    ],
    "1d": [
      {
        id: "NODO_1D_DEMO",
        tipo: "nodo_transizione",
        nome: "Nodo di Transizione",
        tf: "1d",
        ciclo_riferimento: "medio",
        stato: "in_arrivo",
        t_inizio_iso: "2025-11-30T00:00:00Z",
        t_fine_iso: "2025-12-02T00:00:00Z",
        price_min: 2700,
        price_max: 2900,
        confidence: 70,
        direzione_attesa: "reversal",
        descrizione_breve:
          "Zona di possibile cambio di fase sul daily.",
        meta_gassosa:
          "Il Nodo di Transizione daily collega il respiro macro con i cicli inferiori.",
        confluenze: {
          ema_cluster: true,
          fvg: true,
          scenari_supportati: ["RC1", "FF1", "RR1"],
        },
      },
    ],
  },

  timeline: {
    "1h": [
      {
        tipo: "cuspide_breve",
        t_inizio_iso: "2025-11-29T10:00:00Z",
        t_fine_iso: "2025-11-29T14:00:00Z",
        confidence: 82,
        stato: "attiva",
      },
    ],
    "4h": [
      {
        tipo: "valle_medio_orizzonte",
        t_inizio_iso: "2025-11-29T16:00:00Z",
        t_fine_iso: "2025-11-30T04:00:00Z",
        confidence: 76,
        stato: "in_arrivo",
      },
    ],
    "1d": [
      {
        tipo: "nodo_transizione",
        t_inizio_iso: "2025-11-30T00:00:00Z",
        t_fine_iso: "2025-12-02T00:00:00Z",
        confidence: 70,
        stato: "in_arrivo",
      },
    ],
  },

  compatibilita_scenari: {
    RC1: {
      timing: "favorevole",
      nota_ciclica: "RC1 appoggiato a una Cuspide Breve 1h con timing favorevole.",
      supportato_da_finestre: [
        {
          tf: "1h",
          finestra_id: "CUSPIDE_BREVE_1H_DEMO",
          allineamento: "forte",
        },
      ],
    },
    RR1: {
      timing: "favorevole",
      nota_ciclica: "RR1 coerente con la Valle di Medio Orizzonte 4h.",
      supportato_da_finestre: [
        {
          tf: "4h",
          finestra_id: "VALLE_MEDIO_4H_DEMO",
          allineamento: "forte",
        },
      ],
    },
  },

  compatibilita_strategia_ai: {
    setup_principale: {
      id_setup: "SETUP_MAIN_DEMO",
      tf: "4h",
      direction: "SHORT",
      giudizio_ciclico: "coerente",
      finestre_rilevanti: [
        {
          tf: "4h",
          tipo: "cuspide_breve",
          finestra_id: "CUSPIDE_BREVE_1H_DEMO",
          timing: "in_finestra",
        },
      ],
      commento_ciclico_breve:
        "Il setup short 4h si inserisce in una Cuspide Breve 1h con Nodo 1D in avvicinamento.",
    },
  },

  narrativa_gassosa:
    "Il ciclo breve su 1h si avvicina a una Cuspide, mentre il 4h prepara una Valle di Medio Orizzonte. " +
    "Il daily evidenzia un Nodo di Transizione in arrivo: Cassandra considera questa zona temporale ad alta sensibilità.",

  roadmap_temporale:
    "Fra 1–3 barre su 1h Cassandra segnala la chiusura della fase ciclica attuale. " +
    "Fra 7–10 barre su 4h è atteso un pivot ciclico strutturale. " +
    "Fra 35–40 barre su 1d è probabile l’avvio di una nuova struttura ciclica.",

  windows_2_5: {
    per_tf: {
      "1h": {
        tf: "1h",
        fase: "flat",
        pivot_dir: "ND",
        pivot_type: "ND",
        pivot_age_bars: 0,
        a_norm: 0.2,
        eta_norm: 0,
        over_extension: false,
        flags: {
          warning_late: false,
          warning_overext: false,
          in_fase_di_inversione: false,
        },
        proiezione: {
          bars_to_pivot: 24,
          eta_restante: 1,
        },
      },
      "4h": {
        tf: "4h",
        fase: "flat",
        pivot_dir: "ND",
        pivot_type: "ND",
        pivot_age_bars: 0,
        a_norm: 1,
        eta_norm: 0,
        over_extension: false,
        flags: {
          warning_late: false,
          warning_overext: false,
          in_fase_di_inversione: false,
        },
        proiezione: {
          bars_to_pivot: 42,
          eta_restante: 1,
        },
      },
      "1d": {
        tf: "1d",
        fase: "flat",
        pivot_dir: "ND",
        pivot_type: "ND",
        pivot_age_bars: 0,
        a_norm: 0.63,
        eta_norm: 0,
        over_extension: false,
        flags: {
          warning_late: false,
          warning_overext: false,
          in_fase_di_inversione: false,
        },
        proiezione: {
          bars_to_pivot: 28,
          eta_restante: 1,
        },
      },
    },
    multi_tf: {
      bias: "misto",
      coerenza: 0,
      conteggio: {
        long: 0,
        short: 0,
        flat: 0,
        nd: 3,
      },
      flags: {
        dissonanza_forte: false,
        inversione_probabile: false,
      },
    },
  },
};
