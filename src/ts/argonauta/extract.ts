// src/ts/argonauta/extract.ts
//
// Porting da backend/builders/argonauta_engine.py (Cassandra-2.0), tenuto
// sincronizzato a mano — vedi li' per la cronologia completa di ogni fix
// (date nei commenti sotto). Fino al 2026-09-15 questo file era fermo alla
// versione di luglio (nessuno dei 5 interventi elencati sotto era mai stato
// portato qui, solo nel motore Python usato per il backtest offline):
//   1. Pool allargato sr_extras_by_tf (13/9)
//   2. Calibrazione contro-trend (11/9, fix tp1/tp2 scambiati 13/9)
//   3. Floor stop/TP minimo + forza minima per pullback ravvicinati (13-14/9)
//   4. Score v2 (8-9/9)
//   5. Fix selezione stop: filtra i candidati PRIMA di scegliere, non dopo (15/9)
export type Dir = "LONG" | "SHORT";
export type Level = { price: number; tf?: string; forza?: number; fonte?: string; famiglia?: string };
export type ScoreV2 = {
  raw: number;
  score100: number;
  affidabilita: "bassa" | "media" | "alta";
  // Non mostrare mai affidabilitaWrStoricoPct in UI (decisione esplicita
  // "niente WR in UI", stesso motivo gia' applicato alle fasce Strategia
  // AI, vedi src/ts/strategia/scoreBands.ts) - usare affidabilitaEv.
  affidabilitaWrStoricoPct: number;
  affidabilitaNStorico: number;
  affidabilitaEv: number;
  breakdown: Record<string, number>;
};
export type Suggestion = {
  dir: Dir; kind: "pullback" | "breakout";
  entry: number; stop?: number; tp1?: number; tp2?: number;
  tf?: string; rr?: number | null; rr2?: number | null; score?: number | null;
  scoreBreakdown?: { near: number; levelScore: number; biasBonus: number };
  scoreV2?: ScoreV2;
  forzaEntry?: number | null; forzaTp1?: number | null;
  desc?: string;
  tag?: "vicino" | "forte";
  isControtrend?: boolean;
};

const toNum = (x: any): number | null => {
  if (x == null) return null;
  const n = Number(String(x).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export function winnerDirection(data: any): Dir {
  const direct = String(data?.longshort?.direzione ?? data?.longshort?.direction ?? "").toUpperCase();
  if (direct === "LONG" || direct === "SHORT") return direct as Dir;

  const tfs = Object.keys(data?.trend_tf_score ?? {});
  if (tfs.length) {
    let acc = 0; // >0 ⇒ SHORT, <0 ⇒ LONG
    for (const tf of tfs) {
      const r = data.trend_tf_score[tf] ?? {};
      acc += Number(r.short ?? 0) - Number(r.long ?? 0);
    }
    if (acc > 0) return "SHORT";
    if (acc < 0) return "LONG";
  }
  const delta = Number(data?.liquidity_summary?.delta ?? data?.diagnostica?.liquidity_bias?.delta ?? 0);
  return Number.isFinite(delta) ? (delta >= 0 ? "LONG" : "SHORT") : "LONG";
}

function tfW(tf?: string): number {
  const t = (tf ?? "").toLowerCase();
  if (/15m/.test(t)) return 1;
  if (/1h/.test(t)) return 2;
  if (/4h/.test(t)) return 3;
  if (/12h/.test(t)) return 4;
  if (/1d|1g/.test(t)) return 5;
  if (/1w/.test(t)) return 6;
  return 1;
}

// FIX 2026-09-13: prima leggeva solo data.liquidity (famiglia LIQUIDITY,
// pochi livelli cross-TF - su BTC 15m appena 5 per lato su tutti i TF
// insieme), costringendo TP1/TP2 a saltare su livelli di TF molto piu' alti
// del segnale per mancanza di alternative piu' vicine. Ora usa
// sr_extras_by_tf (tutte le famiglie: SWING/FIBONACCI/FVG/LIQUIDITY, per TF)
// se il chiamante l'ha costruito - fallback al vecchio pool altrimenti, per
// non rompere chiamanti che non lo passano.
function liquidityLevels(data: any): { above: Level[]; below: Level[] } {
  const srByTf = data?.sr_extras_by_tf ?? {};

  const mapSr = (arr: any, tfFallback?: string): Level[] =>
    Array.isArray(arr)
      ? (arr.map((v: any) => {
        const price = toNum(v?.mid ?? v?.livello);
        if (price == null) return null;
        return {
          price,
          tf: v?.tf ?? tfFallback,
          forza: Number(v?.forza) || 0,
          fonte: v?.source ?? v?.fonte,
          famiglia: v?.famiglia,
        };
      }).filter(Boolean) as Level[])
      : [];

  if (srByTf && Object.keys(srByTf).length) {
    const above: Level[] = [];
    const below: Level[] = [];
    for (const [tf, sr] of Object.entries<any>(srByTf)) {
      if (!sr || typeof sr !== "object") continue;
      above.push(...mapSr(sr.sopra, tf));
      below.push(...mapSr(sr.sotto, tf));
    }
    return { above, below };
  }

  const liq = data?.liquidity ?? {};
  const map = (arr: any): Level[] =>
    Array.isArray(arr)
      ? (arr.map((v: any) => {
        const price = toNum(v?.livello ?? v?.level ?? v?.price ?? v?.prezzo);
        if (price == null) return null;
        return {
          price,
          tf: v?.tf ?? v?.timeframe,
          forza: Number(v?.forza) || 0,
          fonte: v?.source ?? v?.fonte ?? v?.tipo,
          famiglia: "LIQUIDITY",
        };
      }).filter(Boolean) as Level[])
      : [];
  return { above: map(liq.sopra ?? liq.above ?? []), below: map(liq.sotto ?? liq.below ?? []) };
}

function nearest(levels: Level[], px: number, dir: Dir, kind: "pullback" | "breakout") {
  const c = dir === "LONG"
    ? (kind === "pullback" ? levels.filter(l => l.price < px) : levels.filter(l => l.price > px))
    : (kind === "pullback" ? levels.filter(l => l.price > px) : levels.filter(l => l.price < px));
  return c.sort((a, b) => Math.abs(a.price - px) - Math.abs(b.price - px))[0] ?? null;
}

function strongest(levels: Level[]): Level | null {
  if (!levels.length) return null;
  return levels
    .slice()
    .sort((a, b) => ((b.forza ?? 0) + tfW(b.tf)) - ((a.forza ?? 0) + tfW(a.tf)))[0]!;
}

function signalScore(entry: number, price: number, lvl: Level | null, bias: Dir, dir: Dir): number {
  const distPct = Math.abs(entry - price) / price * 100;
  const near = Math.max(0, 40 - Math.min(distPct * 200, 40));
  const levelScore = Math.min(40, (lvl?.forza ?? 0) * 3 + tfW(lvl?.tf) * 3);
  const biasBonus = bias === dir ? 20 : 5;
  return Math.round(Math.min(100, near + levelScore + biasBonus));
}

function signalScoreBreakdown(entry: number, price: number, lvl: Level | null, bias: Dir, dir: Dir) {
  const distPct = Math.abs(entry - price) / price * 100;
  const near = Math.max(0, 40 - Math.min(distPct * 200, 40));
  const levelScore = Math.min(40, (lvl?.forza ?? 0) * 3 + tfW(lvl?.tf) * 3);
  const biasBonus = bias === dir ? 20 : 5;
  return { near, levelScore, biasBonus };
}

// ─────────────────────────────────────────────────────────────────────────
// SCORE V2 — 2026-09-08, rifittato 2026-09-09. Scorecard additivo (stile
// credit-scoring, Information Value + Weight of Evidence) validato con
// forward selection + leave-one-block-out su 6 blocchi temporali
// indipendenti: monotono in TUTTI e 6, lift bassa->alta 8.3pp-10.5pp per
// blocco. 4 feature (n_tf_concordi, famiglia_resistenza, tipo_supporto_sw,
// vol_20b) - dettaglio calibrazione completo in argonauta_engine.py, non
// duplicato qui.
const SCORE_V2_WEIGHTS: Record<string, Record<string, number>> = {
  n_tf_concordi: { "0": -0.4311, "1": -0.2151, "2": 0.0015, "3": 0.0557, "4": 0.1745 },
  famiglia_resistenza: { FIBONACCI: 0.0875, FVG: 0.0061, SWING: -0.0200, NA: -0.0727, LIQUIDITY: -0.0733 },
  tipo_supporto_sw: { SWING_L: 0.0329, SWING_H: -0.0286, NA: -0.2965 },
  vol_20b: { "false": 0.0413, "true": -0.0431 },
};
const SCORE_V2_DEFAULT: Record<string, number> = Object.fromEntries(
  Object.entries(SCORE_V2_WEIGHTS).map(([k, v]) => {
    const vals = Object.values(v);
    return [k, vals.reduce((a, b) => a + b, 0) / vals.length];
  })
);
// scaling lineare raw->0-100 (min/max ai percentili 1/99 del dataset di fit)
const SCORE_V2_SCALE_LO = -0.5761;
const SCORE_V2_SCALE_HI = 0.3363;
// soglie terzili (raw score) e statistiche storiche associate, mostrate come
// "affidabilita' storica" invece di un WR puntuale per singolo segnale
const SCORE_V2_TERTILES: [number, number] = [-0.0287, 0.1099];
const SCORE_V2_TERTILE_STATS: Record<"bassa" | "media" | "alta", { n: number; wrPct: number; ev: number }> = {
  bassa: { n: 61156, wrPct: 48.4, ev: 0.207 },
  media: { n: 62350, wrPct: 55.6, ev: 0.501 },
  alta: { n: 57033, wrPct: 59.2, ev: 0.646 },
};

function woe(feature: string, key: any): number {
  const table = SCORE_V2_WEIGHTS[feature];
  if (key == null) return SCORE_V2_DEFAULT[feature];
  const v = table[String(key)];
  return v != null ? v : SCORE_V2_DEFAULT[feature];
}

function signalScoreV2(opts: {
  nTfConcordi: number | null;
  famigliaResistenza: string | null;
  tipoSupportoSw: string | null;
  volAumento20b: boolean | null;
}): ScoreV2 {
  const parts: Record<string, number> = {
    n_tf_concordi: woe("n_tf_concordi", opts.nTfConcordi),
    famiglia_resistenza: woe("famiglia_resistenza", opts.famigliaResistenza ?? "NA"),
    tipo_supporto_sw: woe("tipo_supporto_sw", opts.tipoSupportoSw ?? "NA"),
    vol_20b: woe("vol_20b", opts.volAumento20b != null ? opts.volAumento20b : "NA"),
  };
  const raw = Object.values(parts).reduce((a, b) => a + b, 0);
  const span = SCORE_V2_SCALE_HI - SCORE_V2_SCALE_LO;
  const score100 = span ? Math.round(Math.max(0, Math.min(100, (raw - SCORE_V2_SCALE_LO) / span * 100))) : 50;

  let bucket: "bassa" | "media" | "alta";
  if (raw <= SCORE_V2_TERTILES[0]) bucket = "bassa";
  else if (raw <= SCORE_V2_TERTILES[1]) bucket = "media";
  else bucket = "alta";
  const stats = SCORE_V2_TERTILE_STATS[bucket];

  return {
    raw: Number(raw.toFixed(4)),
    score100,
    affidabilita: bucket,
    affidabilitaWrStoricoPct: stats.wrPct,
    affidabilitaNStorico: stats.n,
    affidabilitaEv: stats.ev,
    breakdown: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Number(v.toFixed(4))])),
  };
}

// Calibrazione RR contro-trend (2026-09-11) — risk = MAE p75 a 10 barre,
// TP1 = mediana MFE a 10 barre, TP2 = MFE al 30% superiore, misurati
// sull'entry 1 barra dopo l'invalidazione di un trade trend-following.
// FIX 2026-09-13: tp1Pct/tp2Pct erano scambiati (tp1 > tp2 su tutti e 4 i
// TF) - la convenzione usata ovunque nel resto del codice/dataset e'
// inequivocabile (TP2 sempre il target piu' lontano, confermato nel 90.6%
// dei trade del dataset). Valori scambiati di conseguenza.
const CONTROTREND_RR: Record<string, { riskPct: number; tp1Pct: number; tp2Pct: number }> = {
  "15m": { riskPct: 1.9561, tp1Pct: 0.4574, tp2Pct: 0.8550 },
  "1h": { riskPct: 3.9009, tp1Pct: 0.8727, tp2Pct: 1.6779 },
  "4h": { riskPct: 7.5331, tp1Pct: 1.9906, tp2Pct: 3.6974 },
  "1d": { riskPct: 19.0025, tp1Pct: 6.0357, tp2Pct: 10.6910 },
};

// Distanza minima entry-stop per TF (2026-09-13) — soglia sotto cui un
// livello candidato viene scartato in favore del fallback percentuale.
// Nell'ordine di grandezza di CONTROTREND_RR sopra (dati reali calibrati) ma
// rivista al ribasso sul 1d (19% -> 5%, troppo largo per essere utile) su
// indicazione esplicita dell'utente: un TF piu' lento di Tifide (0.60% su
// 1m/3m/5m) deve avere uno stop piu' largo, non piu' stretto, altrimenti lo
// invalida il rumore normale del mercato invece di un vero cambio di
// direzione.
const MIN_STOP_PCT_BY_TF: Record<string, number> = { "15m": 1.0, "1h": 2.0, "4h": 3.5, "1d": 5.0 };
const MIN_STOP_PCT_DEFAULT = 2.0;
function minStopPct(tf?: string): number {
  return MIN_STOP_PCT_BY_TF[tf ?? ""] ?? MIN_STOP_PCT_DEFAULT;
}

// Distanza minima entry-TP1/TP2 per i pullback trend-following (2026-09-14).
// nearest() prende il livello S/R opposto piu' vicino senza nessuna soglia
// di forza ne' di distanza, quindi il TP1 puo' finire a 0.15-0.33% mediano
// dall'entry - molto piu' vicino persino del floor dello stop. WR altissimo
// (87-98%) ma EV quasi nullo (0.01-0.09). Riusa direttamente i valori
// tp1Pct/tp2Pct di CONTROTREND_RR (stessa fonte empirica del floor dello
// stop) invece di inventare una nuova tabella. Solo per i pullback: il
// breakout ha gia' un floor equivalente (nextsAll filtrato a distanza >=
// risk, quindi RR>=1 di suo).
function minTpPct(tf: string | undefined, key: "tp1Pct" | "tp2Pct"): number {
  const rr = CONTROTREND_RR[tf ?? ""] ?? CONTROTREND_RR["1h"];
  return rr[key];
}

// Forza minima per TF (2026-09-14) - scoperto analizzando la distribuzione
// reale di forza_entry/forza_tp1: sul 15m il 62.1% dei livelli di entry
// usati da "vicino" ha forza<=1 - un livello cosi' debole probabilmente non
// e' un vero supporto/resistenza, viene "toccato" per caso invece che
// rispettato. Soglie decise sulla distribuzione reale osservata.
const MIN_FORZA_BY_TF: Record<string, number> = { "15m": 2.0, "1h": 2.0, "4h": 3.0, "1d": 5.0 };
const MIN_FORZA_DEFAULT = 2.0;
function minForza(tf?: string): number {
  return MIN_FORZA_BY_TF[tf ?? ""] ?? MIN_FORZA_DEFAULT;
}

export function buildSuggestions(data: any): Suggestion[] {
  const px = toNum(data?.prezzo ?? data?.price) ?? 0;
  const liq = liquidityLevels(data);
  const bias = winnerDirection(data);

  const sopra = liq.above.filter(l => (l.forza ?? 0) >= minForza(l.tf));
  const sotto = liq.below.filter(l => (l.forza ?? 0) >= minForza(l.tf));

  // Contesto per score_v2 (2026-09-08) — stessi campi gia' costruiti dalla
  // pipeline backend per il gate Tifide, qui solo letti, non ricalcolati.
  // Se assenti dal payload, score_v2 degrada ai pesi medi di fallback
  // (comportamento robusto, non un errore).
  const trendTfScore = data?.trend_tf_score ?? {};
  const srExtrasByTf = data?.sr_extras_by_tf ?? {};
  const ichiByTf = data?._ichi_rich_by_tf ?? {};

  const nearPullLong = nearest(sotto, px, "LONG", "pullback");
  const nearBreakLong = nearest(sopra, px, "LONG", "breakout");
  const nearPullShort = nearest(sopra, px, "SHORT", "pullback");
  const nearBreakShort = nearest(sotto, px, "SHORT", "breakout");

  const poolStrong = bias === "LONG" ? sotto : sopra;
  const strongWin = strongest(poolStrong);

  const out: Suggestion[] = [];

  const push = (dir: Dir, kind: "pullback" | "breakout", lvl: Level | null, tag?: "vicino" | "forte", isControtrend = false) => {
    if (!lvl || px <= 0) return;
    // Calibrazione contro-trend 2026-09-11: su backtest reale il rimbalzo
    // SHORT (dopo un LONG fallito) e' profittevole su tutti i TF, il
    // rimbalzo LONG (dopo uno SHORT fallito) lo e' solo su 15m e in perdita
    // su 1h/4h/1d (asimmetria consistente, non rumore). Finche' non
    // validato anche sul meccanismo "livello piu' vicino" usato qui,
    // sopprimiamo la proposta contro-trend LONG oltre il 15m invece di
    // mostrare un segnale con EV storicamente negativo.
    if (isControtrend && (lvl.tf ?? "") !== "15m" && dir === "LONG") return;

    const buffer = 0.0015;
    const entry = dir === "LONG"
      ? (kind === "breakout" ? lvl.price * (1 + buffer) : lvl.price)
      : (kind === "breakout" ? lvl.price * (1 - buffer) : lvl.price);

    let stop: number;
    let tp1: number;
    let tp2: number;
    let nexts: Level[] = [];

    if (isControtrend) {
      // Calibrazione dedicata (CONTROTREND_RR sopra) invece della logica a
      // livelli usata per le proposte trend-following: quella logica non e'
      // mai stata validata per il contro-trend, la calibrazione qui si'.
      const rr = CONTROTREND_RR[lvl.tf ?? ""] ?? CONTROTREND_RR["1h"];
      const risk0 = entry * rr.riskPct / 100;
      if (dir === "LONG") {
        stop = entry - risk0;
        tp1 = entry + entry * rr.tp1Pct / 100;
        tp2 = entry + entry * rr.tp2Pct / 100;
      } else {
        stop = entry + risk0;
        tp1 = entry - entry * rr.tp1Pct / 100;
        tp2 = entry - entry * rr.tp2Pct / 100;
      }
    } else {
      if (kind === "breakout") {
        // Breakout: NON il livello appena rotto (troppo stretto, colpito
        // quasi sempre dal retest fisiologico post-breakout, WR 0-5% nel
        // backtest) — cerchiamo il prossimo livello oltre quello di
        // breakout, preferendo uno di forza comparabile (>= meta' di quella
        // del livello di breakout).
        const refForza = lvl.forza ?? 0;
        const pool = dir === "LONG"
          ? sotto.filter(l => l.price < lvl.price)
          : sopra.filter(l => l.price > lvl.price);
        const byDist = [...pool].sort((a, b) => Math.abs(a.price - lvl.price) - Math.abs(b.price - lvl.price));
        const strongEnough = byDist.filter(l => (l.forza ?? 0) >= refForza * 0.5);
        const invLevel = strongEnough[0] ?? byDist[0];
        if (invLevel) {
          stop = dir === "LONG" ? invLevel.price * 0.998 : invLevel.price * 1.002;
        } else {
          stop = dir === "LONG" ? lvl.price * 0.998 : lvl.price * 1.003;
        }
      } else {
        // Distanza minima entry-stop (2026-09-13, rivista 2026-09-15): con
        // il pool allargato (sr_extras_by_tf) c'e' quasi sempre un livello
        // candidato praticamente adiacente all'entry — non un caso raro, ma
        // la NORMA (distanza mediana naturale 0.06-0.10% su tutti i TF,
        // soglia applicata sul 69-98% dei trade invece dei rari outlier per
        // cui era stata pensata). Fix: la soglia filtra i candidati PRIMA
        // della scelta, non dopo — un vero livello piu' lontano viene
        // preferito quando esiste, il floor a percentuale fissa resta un
        // fallback per i casi in cui davvero non c'e' alternativa.
        const minPct = minStopPct(lvl.tf);
        const minDist = entry * minPct / 100;
        const cand = dir === "LONG"
          ? [...sotto].filter(l => l.price < entry - minDist).sort((a, b) => b.price - a.price)
          : [...sopra].filter(l => l.price > entry + minDist).sort((a, b) => a.price - b.price);
        if (cand[0]) {
          stop = cand[0].price;
        } else {
          stop = dir === "LONG" ? entry * (1 - minPct / 100) : entry * (1 + minPct / 100);
        }
      }

      // Target: stessa idea dello stop — un livello troppo debole potrebbe
      // non rappresentare una vera resistenza/supporto. Preferiamo livelli
      // di forza comparabile (>= meta' di quella del livello di entry);
      // fallback al piu' vicino disponibile se nessuno qualifica. Per il
      // breakout richiediamo un target almeno quanto il rischio dello stop
      // (misurato: senza questo, RR mediano 0.10-0.27, EV sempre negativo
      // nonostante WR 70-86%).
      const risk = Math.abs(entry - stop);
      const refForzaTp = lvl.forza ?? 0;
      let nextsAll = dir === "LONG"
        ? [...sopra].filter(l => l.price > entry).sort((a, b) => a.price - b.price)
        : [...sotto].filter(l => l.price < entry).sort((a, b) => b.price - a.price);
      if (kind === "breakout" && risk > 0) {
        nextsAll = nextsAll.filter(l => Math.abs(l.price - entry) >= risk);
      }
      const nextsStrong = nextsAll.filter(l => (l.forza ?? 0) >= refForzaTp * 0.5);
      nexts = (nextsStrong.length ? nextsStrong : nextsAll).slice(0, 2);

      const fallbackTp1 = kind === "breakout" && risk > 0
        ? (dir === "LONG" ? entry + risk * 1.2 : entry - risk * 1.2)
        : (dir === "LONG" ? entry * 1.0075 : entry * 0.9925);
      const fallbackTp2 = kind === "breakout" && risk > 0
        ? (dir === "LONG" ? entry + risk * 2.0 : entry - risk * 2.0)
        : (dir === "LONG" ? entry * 1.0175 : entry * 0.9825);

      tp1 = nexts[0]?.price ?? fallbackTp1;
      tp2 = nexts[1]?.price ?? fallbackTp2;

      // Guardia distanza minima entry-TP per i pullback (2026-09-14) - non
      // per il breakout, che ha gia' il suo floor equivalente sopra.
      if (kind === "pullback") {
        const minTp1Pct = minTpPct(lvl.tf, "tp1Pct");
        const minTp2Pct = minTpPct(lvl.tf, "tp2Pct");
        if (Math.abs(tp1 - entry) < entry * minTp1Pct / 100) {
          tp1 = dir === "LONG" ? entry * (1 + minTp1Pct / 100) : entry * (1 - minTp1Pct / 100);
        }
        if (Math.abs(tp2 - entry) < entry * minTp2Pct / 100) {
          tp2 = dir === "LONG" ? entry * (1 + minTp2Pct / 100) : entry * (1 - minTp2Pct / 100);
        }
      }
    }

    const risk = Math.abs(entry - stop);
    const rr1 = risk > 0 ? Number((Math.abs(tp1 - entry) / risk).toFixed(2)) : null;
    const rr2 = risk > 0 ? Number((Math.abs(tp2 - entry) / risk).toFixed(2)) : null;

    const tf = lvl.tf;
    const nTfConcordi = Object.keys(trendTfScore).length
      ? Object.values<any>(trendTfScore).filter((row) => row?.direction === dir).length
      : null;
    const srTf = srExtrasByTf?.[tf ?? ""] ?? {};
    const srSopra: any[] = Array.isArray(srTf?.sopra) ? srTf.sopra : [];
    const srSotto: any[] = Array.isArray(srTf?.sotto) ? srTf.sotto : [];
    const famigliaResistenza: string | null = srSopra[0]?.famiglia ?? null;
    const swSotto = srSotto.filter((e) => e?.famiglia === "SWING");
    const tipoSupportoSw: string | null = swSotto[0]?.source ?? null;
    const volAumento20b: boolean | null = ichiByTf?.[tf ?? ""]?.volume_rich?.vol_aumento_20b ?? null;

    const s: Suggestion = {
      dir, kind, entry, stop, tp1, tp2, tf,
      rr: rr1, rr2,
      // diagnostico 2026-09-14: forza del livello di entry e del livello
      // scelto come TP1, per capire il range reale di forza usato
      forzaEntry: lvl.forza ?? null,
      forzaTp1: (!isControtrend && nexts.length > 0) ? (nexts[0].forza ?? null) : null,
      score: signalScore(entry, px, lvl, bias, dir),
      scoreBreakdown: signalScoreBreakdown(entry, px, lvl, bias, dir),
      scoreV2: signalScoreV2({ nTfConcordi, famigliaResistenza, tipoSupportoSw, volAumento20b }),
      desc: lvl.fonte ? (kind === "pullback" ? `Rimbalzo su ${lvl.fonte}` : `Breakout di ${lvl.fonte}`) : undefined,
      tag,
      isControtrend,
    };
    out.push(s);
  };

  if (bias === "LONG") {
    if (nearPullLong) push("LONG", "pullback", nearPullLong, "vicino");
    if (nearBreakLong) push("LONG", "breakout", nearBreakLong, "vicino");
  } else {
    if (nearPullShort) push("SHORT", "pullback", nearPullShort, "vicino");
    if (nearBreakShort) push("SHORT", "breakout", nearBreakShort, "vicino");
  }

  const opp = (bias === "LONG"
    ? [["pullback", nearPullShort], ["breakout", nearBreakShort]]
    : [["pullback", nearPullLong], ["breakout", nearBreakLong]]
  ) as ["pullback" | "breakout", Level | null][];
  const bestOpp = opp
    .filter((o): o is ["pullback" | "breakout", Level] => !!o[1])
    .sort((a, b) => Math.abs(a[1].price - px) - Math.abs(b[1].price - px))[0];
  if (bestOpp) {
    const [kind, lvl] = bestOpp;
    push(bias === "LONG" ? "SHORT" : "LONG", kind, lvl, "vicino", true);
  }

  if (strongWin) push(bias, "pullback", strongWin, "forte");

  return out.slice(0, 4).sort((a, b) => Math.abs(a.entry - px) - Math.abs(b.entry - px));
}
