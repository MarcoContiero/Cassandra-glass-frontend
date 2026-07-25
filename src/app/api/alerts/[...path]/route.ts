import { auth } from '@clerk/nextjs/server';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function backendBase() {
  return (
    process.env.BACKEND_BASE ||
    process.env.CASSANDRA_API_BASE ||
    "http://localhost:8000"
  ).replace(/\/+$/, "");
}

// Prima Authorization portava la API key del server anche qui, e X-User-Id
// (impostato dal client, mai verificato) decideva di chi erano i dati letti/
// scritti — chiunque poteva mandare un X-User-Id arbitrario e leggere/gestire
// i filtri o gli eventi di un altro utente. X-API-Key resta per
// require_api_key (server-to-server); Authorization ora porta il token di
// sessione Clerk reale dell'utente, verificato lato backend da
// require_clerk_user (backend/auth_clerk.py). Fix 2026-07-25.
function serverAuthHeaders(): Record<string, string> {
  const key =
    process.env.CASSANDRA_API_KEY ??
    process.env.BACKEND_KEY ??
    process.env.API_KEY;
  return key ? { "X-API-Key": key } : {};
}

type Ctx = { params: Promise<{ path?: string[] }> };

async function handler(req: Request, ctx: Ctx) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ detail: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const token = await getToken();

  const { path = [] } = await ctx.params;
  const url = new URL(req.url);
  const upstreamUrl = `${backendBase()}/api/alerts/${path.join("/")}${url.search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("transfer-encoding");
  headers.delete("content-length");
  headers.delete("x-user-id"); // non più letto dal backend, non serve inoltrarlo

  for (const [k, v] of Object.entries(serverAuthHeaders())) headers.set(k, v);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.get("accept")) headers.set("accept", "application/json");

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
    cache: "no-store",
  });

  const respHeaders = new Headers(upstream.headers);
  respHeaders.set("cache-control", "no-store, no-cache");
  respHeaders.delete("content-encoding");
  respHeaders.delete("content-length");

  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
