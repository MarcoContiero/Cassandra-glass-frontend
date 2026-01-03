// src/app/api/tifide/[...path]/route.ts
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

async function handler(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  const upstreamUrl = `${backendBase()}/api/tifide/${path.join("/")}${new URL(req.url).search}`;

  const headers = new Headers(req.headers);
  // Non forwardare host/encoding che a volte rompe lo streaming
  headers.delete("host");
  headers.delete("content-length");

  // Auth server-side
  const ah = authHeaders();
  for (const [k, v] of Object.entries(ah)) headers.set(k, v);

  // Per SSE: chiediamo esplicitamente stream
  headers.set("accept", "text/event-stream");
  headers.set("cache-control", "no-cache");

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
    // IMPORTANTISSIMO: no cache
    cache: "no-store",
  });

  // Pass-through streaming body (fondamentale per SSE)
  const respHeaders = new Headers(upstream.headers);
  respHeaders.set("cache-control", "no-cache, no-transform");
  respHeaders.set("x-accel-buffering", "no"); // utile su alcuni proxy
  // se è SSE, forza content-type giusto
  if (path[0] === "events") {
    respHeaders.set("content-type", "text/event-stream; charset=utf-8");
    respHeaders.set("connection", "keep-alive");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
