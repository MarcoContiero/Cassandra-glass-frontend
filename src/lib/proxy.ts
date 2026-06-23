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

  let res: Response;
  let bodyText: string;

  try {
    res = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
    });
    bodyText = await res.text();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[proxy.callBackend] network error →", url, detail);
    return new Response(
      JSON.stringify({ error: "network_error", detail, url }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  if (!res.ok) {
    console.error(
      "[proxy.callBackend] backend error",
      res.status,
      bodyText.slice(0, 500),
    );
    return new Response(
      JSON.stringify({
        error: `backend_${res.status}`,
        body: bodyText,
      }),
      {
        status: 502,
        headers: { "content-type": "application/json" },
      },
    );
  }

  return new Response(bodyText, {
    status: res.status,
    headers: {
      "content-type":
        res.headers.get("content-type") ?? "application/json; charset=utf-8",
    },
  });
}
