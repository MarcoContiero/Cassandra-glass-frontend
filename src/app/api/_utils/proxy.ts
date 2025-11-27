export function buildTargetUrl(path: string): string {
  const base = process.env.BACKEND_BASE ?? "http://localhost:8000";
  return `${base.replace(/\/+$/, "")}${path}`;
}

export function authHeaders(): Record<string, string> {
  const out: Record<string, string> = {};
  const key =
    process.env.CASSANDRA_API_KEY ??
    process.env.BACKEND_KEY ??
    process.env.API_KEY;

  if (key) {
    out["Authorization"] = `Bearer ${key}`;
    out["X-API-Key"] = key;
  }
  return out;
}

export async function proxyToBackend(
  req: Request,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const target = buildTargetUrl(path);
  const u = new URL(target);
  const origin = `${u.protocol}//${u.host}`;

  // 1) warm-up: sveglia il backend free-tier (non bloccare se fallisce)
  async function warmUp() {
    try {
      await fetch(`${origin}/ping`, { cache: "no-store" });
    } catch {
      /* ignore */
    }
  }

  // 2) retry/backoff su 502/503/504 o network error
  const MAX_TRIES = 3;
  const RETRY_STATUSES = new Set([502, 503, 504]);

  const method = req.method || "GET";
  const isBodyMethod = !["GET", "HEAD"].includes(method.toUpperCase());

  const headers: Record<string, string> = { ...authHeaders() };
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;

  const baseInit: RequestInit = {
    method,
    headers,
    body: isBodyMethod ? await req.clone().arrayBuffer() : undefined,
    cache: "no-store",
    ...init,
  };

  await warmUp(); // chiamata una sola volta prima del primo tentativo

  let lastErr: any = null;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    try {
      const res = await fetch(target, baseInit);
      if (!RETRY_STATUSES.has(res.status)) {
        // ok oppure errore “definitivo” che non richiede retry
        return res;
      }
      // status 502/503/504 → ritenta
      const delay = attempt === 0 ? 400 : attempt === 1 ? 1200 : 2500;
      await new Promise((r) => setTimeout(r, delay));
      continue;
    } catch (e) {
      lastErr = e;
      const delay = attempt === 0 ? 400 : attempt === 1 ? 1200 : 2500;
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
  }

  return new Response(
    JSON.stringify({
      error: "upstream_unavailable",
      retried: MAX_TRIES,
      target,
      details: String(lastErr ?? "retry_exceeded"),
    }),
    { status: 502, headers: { "content-type": "application/json" } }
  );
}

// --- Compat wrappers: manteniamo la vecchia API usata dalle route --- //
export async function proxyGET(
  req: Request,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return proxyToBackend(req, path, { ...(init ?? {}), method: "GET" });
}

export async function proxyPOST(
  req: Request,
  path: string,
  init?: RequestInit
): Promise<Response> {
  // il body viene già letto dentro proxyToBackend se method !== GET/HEAD
  return proxyToBackend(req, path, { ...(init ?? {}), method: "POST" });
}
