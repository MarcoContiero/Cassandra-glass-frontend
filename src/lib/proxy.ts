// src/lib/proxy.ts
const backendBase =
  process.env.BACKEND_BASE ||
  process.env.CASSANDRA_API_BASE ||
  "http://localhost:8000";

/**
 * Costruisce gli header di autenticazione da mandare al backend.
 * Usa SOLO env lato server: la chiave non finisce mai nel browser.
 */
export function authHeaders(): Record<string, string> {
  const key =
    process.env.CASSANDRA_API_KEY ??
    process.env.BACKEND_KEY ??
    process.env.API_KEY;

  const headers: Record<string, string> = {};

  if (key) {
    headers["Authorization"] = `Bearer ${key}`;
    headers["X-API-Key"] = key;
  }

  // Log minimo lato server (non stampa mai la chiave)
  console.log("[proxy.authHeaders] hasKey?", Boolean(key));

  return headers;
}

/**
 * Chiama il backend Cassandra passando sempre gli header di autenticazione.
 */
export async function callBackend(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url =
    backendBase.replace(/\/+$/, "") +
    "/" +
    path.replace(/^\/+/, "");

  const headers = {
    ...(init?.headers ?? {}),
    ...authHeaders(),
  };

  console.log("[proxy.callBackend] URL:", url, "headers:", Object.keys(headers));

  const res = await fetch(url, {
    ...init,
    headers,
    // niente cache per queste chiamate
    cache: "no-store",
  });

  const bodyText = await res.text();

  if (!res.ok) {
    console.error(
      "[proxy.callBackend] backend error",
      res.status,
      bodyText.slice(0, 500),
    );
    // propaghiamo l'errore come 502 verso il client
    return new Response(
      JSON.stringify({
        error: `backend ${res.status}`,
        body: bodyText,
      }),
      {
        status: 502,
        headers: { "content-type": "application/json" },
      },
    );
  }

  // risposta OK, manteniamo content-type
  return new Response(bodyText, {
    status: res.status,
    headers: {
      "content-type":
        res.headers.get("content-type") ?? "application/json; charset=utf-8",
    },
  });
}
