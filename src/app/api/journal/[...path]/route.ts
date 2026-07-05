export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function backendBase() {
  return (
    process.env.BACKEND_BASE ||
    process.env.CASSANDRA_API_BASE ||
    "http://localhost:8000"
  ).replace(/\/+$/, "");
}

function authHeaders() {
  const key =
    process.env.CASSANDRA_API_KEY ??
    process.env.BACKEND_KEY ??
    process.env.API_KEY;
  const h: Record<string, string> = {};
  if (key) {
    h["Authorization"] = `Bearer ${key}`;
    h["X-API-Key"] = key;
  }
  return h;
}

type Ctx = { params: Promise<{ path?: string[] }> };

async function handler(req: Request, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  const url = new URL(req.url);
  const upstreamUrl = `${backendBase()}/api/journal/${path.join("/")}${url.search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("transfer-encoding");
  headers.delete("content-length");

  const ah = authHeaders();
  for (const [k, v] of Object.entries(ah)) headers.set(k, v);
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
