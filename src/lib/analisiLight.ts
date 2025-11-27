// analisiLight.ts

/**
 * Controlli opzionali per la sezione "Livelli di liquidità" e filtri generali.
 */
export interface LiquidityControls {
  /** numero massimo livelli per lato (sopra/sotto) */
  n?: number;
  /** percentuale distanza massima (0–100) */
  pct?: number;
  /** peso/alpha per ranking interno */
  alpha?: number;
  /** moltiplicatore distanza (per SR/round ecc.) */
  mult?: number;
  /** scope di ricerca (es. "near,mid,far") */
  scope?: string;
  /** sorgenti livelli es. ["sr","fvg","swing","round"] */
  sources?: string[];
  /** filtro forza livelli (>=) */
  levelsMinForza?: number;
}

type FetchOpts = {
  /** aggiunge ?compare_btc=1 */
  compareBTC?: boolean;
  /** alt coin per comparazione (es. "SOLUSDT"); se falsy non invia il parametro */
  compareAlt?: string | null;
  /** override del path (default "/api/analisi_light") */
  base?: string;
};

/** helper: aggiunge al querystring solo se definito/non vuoto */
function add(q: URLSearchParams, key: string, val: unknown) {
  if (val === undefined || val === null) return;
  if (typeof val === "string" && val.trim() === "") return;
  q.set(key, String(val));
}

/**
 * Chiama l'endpoint /api/analisi_light garantendo i parametri minimi
 * e forzando programma/tipo attesi dal backend.
 */
export async function fetchAnalisiLight(
  coin: string,
  timeframes: string[] = ["1h"],
  ctrl: LiquidityControls = {},
  opts: FetchOpts = {}
) {
  const base = opts.base ?? "/api/analisi_light";
  const q = new URLSearchParams();

  // core
  add(q, "coin", coin);
  q.set("timeframes", (timeframes?.length ? timeframes : ["1h"]).join(","));

  // forza i due selettori per attivare il ramo corretto nel BE
  q.set("programma", "cassandra");
  q.set("tipo", "riepilogo_totale");

  // --- SCENARI: modalità senza filtri (debug) ---
  q.set("scenari_min_score", "0");        // nessuna soglia di forza TF
  q.set("scenari_min_rr", "0");           // RR minimo 0 → passa tutto
  q.set("scenari_max_move_pct", "100");   // livello anche lontanissimo dal prezzo
  q.set("scenari_min_goal_atr", "0");     // nessun vincolo su ATR
  q.set("scenari_entry_offset_pct", "0"); // entry esattamente sul livello
  q.set("scenari_sl_buffer_pct", "0.0001"); // stop quasi sul livello → RR più alto
  q.set("scenari_rr1", "0.1");            // TP1 blando
  q.set("scenari_rr2", "0.2");            // TP2 blando
  q.set("scenari_max", "5");              // fino a 5 scenari

  // comparazioni opzionali
  if (opts.compareBTC) q.set("compare_btc", "1");
  if (opts.compareAlt && opts.compareAlt.trim()) q.set("compare_alt", opts.compareAlt.trim());

  // controlli/liquidity
  add(q, "liquidity_n", ctrl.n);
  add(q, "liquidity_pct", ctrl.pct);
  add(q, "liquidity_alpha", ctrl.alpha);
  add(q, "liquidity_mult", ctrl.mult);
  add(q, "liquidity_scope", ctrl.scope);
  if (ctrl.sources && ctrl.sources.length) {
    q.set("liquidity_sources", ctrl.sources.join(","));
  }

  // filtri livelli
  add(q, "levels_min_forza", ctrl.levelsMinForza);

  const url = `${base}?${q.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`analisi_light ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}

export default fetchAnalisiLight;
