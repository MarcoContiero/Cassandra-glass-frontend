// src/lib/api.ts

"use client";

import type { AnalisiLightResponse } from "@/types/analisiLight";

/**
 * Base URL del backend.
 *
 * - In produzione: es. "https://cassandra-2-0.onrender.com"
 *   (impostato in NEXT_PUBLIC_BACKEND_BASE)
 * - In dev: se vuoto, usiamo le route interne di Next (/api/...)
 */
const BACKEND_BASE =
  process.env.NEXT_PUBLIC_BACKEND_BASE?.replace(/\/+$/, "") || "";

/**
 * Costruisce una query string a partire da un oggetto params.
 * Supporta anche valori array (es. timeframes=["1h","4h"]).
 */
function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      for (const v of value) {
        if (v === undefined || v === null) continue;
        search.append(key, String(v));
      }
    } else {
      search.append(key, String(value));
    }
  }

  return search.toString();
}

/**
 * Helper generico per chiamare il backend.
 *
 * - Se BACKEND_BASE è settato → chiama direttamente il BE (Render).
 * - Se BACKEND_BASE è vuoto → chiama la route interna di Next (/api/...).
 */
async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  // Se path è già assoluto (http/https) non tocchiamo niente
  let url = path;

  if (!/^https?:\/\//i.test(path)) {
    if (BACKEND_BASE) {
      // Chiamata diretta al backend esterno
      const cleanPath = path.startsWith("/") ? path : `/${path}`;
      url = `${BACKEND_BASE}${cleanPath}`;
    } else {
      // Chiamata alle API interne di Next
      const cleanPath = path.startsWith("/") ? path : `/${path}`;
      url = cleanPath;
    }
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    // Per sicurezza, niente cache aggressiva di default
    cache: init.cache ?? "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[apiFetch] Errore ${res.status} per ${url}`,
      text || res.statusText,
    );
    throw new Error(`Errore API (${res.status}) su ${url}`);
  }

  // Se non c'è body (204, ecc.), evitiamo errori
  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

/* -------------------------------------------------------------------------- */
/*  ENDPOINT SPECIFICI                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Chiama il backend per ottenere l'analisi completa (riepilogo_totale) di Cassandra.
 *
 * Esempio:
 *   fetchAnalisiLight({
 *     coin: "BTCUSDT",
 *     timeframes: ["15m", "1h", "4h", "12h", "1d", "1w"],
 *   })
 */
export interface FetchAnalisiLightParams {
  coin: string;
  timeframes: string[];
  tipo?: string; // default: "riepilogo_totale"
}

/**
 * NB:
 * - Se usi il proxy di Next, crea una route /api/analisi_light che a sua volta
 *   chiama il backend su Render.
 * - Se NON usi il proxy, questa funzione parlerà direttamente con il backend
 *   usando NEXT_PUBLIC_BACKEND_BASE.
 */
export async function fetchAnalisiLight(
  params: FetchAnalisiLightParams,
): Promise<AnalisiLightResponse> {
  const queryString = buildQuery({
    coin: params.coin,
    timeframes: params.timeframes,
    tipo: params.tipo ?? "riepilogo_totale",
  });

  // Se usi proxy interno, qui metti "/api/analisi_light"
  // Se chiami direttamente il backend, puoi mettere "/api/analisi_light"
  // e ci penserà BACKEND_BASE a pre-pendere il dominio corretto.
  const path = `/api/analisi_light?${queryString}`;

  return apiFetch<AnalisiLightResponse>(path);
}

/**
 * Eventuale ping/healthcheck del backend (opzionale ma utile per debug UI).
 * Puoi creare una route /api/health sul backend che ritorna { status: "ok" }.
 */
export interface HealthResponse {
  status: string;
  version?: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  try {
    return await apiFetch<HealthResponse>("/api/health");
  } catch (err) {
    console.error("[fetchHealth] errore:", err);
    throw err;
  }
}
