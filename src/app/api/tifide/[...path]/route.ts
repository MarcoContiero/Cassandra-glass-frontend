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

// Hop-by-hop headers (da non inoltrare)
function stripHopByHop(headers: Headers) {
  headers.delete("host");
  headers.delete("connection");
  headers.delete("keep-alive");
  headers.delete("proxy-authenticate");
  headers.delete("proxy-authorization");
  headers.delete("te");
  headers.delete("trailer");
  headers.delete("transfer-encoding");
  headers.delete("upgrade");
  headers.delete("content-length");
  headers.delete("accept-encoding"); // evita gzip su stream
}

type Ctx = { params: Promise<{ path?: string[] }> };

async function handler(req: Request, ctx: Ctx) {
  const { path = [] } = await ctx.params;   // ✅ Next 15: params va awaited
  const isSSE = path[0] === "events";

  const url = new URL(req.url);
  const upstreamUrl = `${backendBase()}/api/tifide/${path.join("/")}${url.search}`;

  const headers = new Headers(req.headers);
  stripHopByHop(headers);

  // Auth server-side verso BE
  const ah = authHeaders();
  for (const [k, v] of Object.entries(ah)) headers.set(k, v);

  if (isSSE) {
    headers.set("accept", "text/event-stream");
    headers.set("cache-control", "no-cache");
    headers.set("connection", "keep-alive");
  } else {
    if (!headers.get("accept")) headers.set("accept", "application/json");
  }

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body:
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : await req.arrayBuffer(),
    cache: "no-store",
  });

  const respHeaders = new Headers(upstream.headers);

  // no-cache forte (utile su Render / proxy vari)
  respHeaders.set("cache-control", "no-store, no-cache, no-transform");
  respHeaders.set("x-accel-buffering", "no");

  if (isSSE) {
    respHeaders.set("content-type", "text/event-stream; charset=utf-8");
    respHeaders.set("connection", "keep-alive");
    respHeaders.delete("content-length");
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