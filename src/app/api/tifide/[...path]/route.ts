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

async function handler(
  req: Request,
  ctx: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await ctx.params;
  const isSSE = path[0] === "events";

  const url = new URL(req.url);
  const upstreamUrl = `${backendBase()}/api/tifide/${path.join("/")}${url.search}`;

  const headers = new Headers(req.headers);

  // Evita header che spesso rompono streaming/proxy
  headers.delete("host");
  headers.delete("content-length");
  headers.delete("accept-encoding"); // utile per evitare gzip su stream

  // Auth server-side
  const ah = authHeaders();
  for (const [k, v] of Object.entries(ah)) headers.set(k, v);

  // SSE: SOLO qui
  if (isSSE) {
    headers.set("accept", "text/event-stream");
    headers.set("cache-control", "no-cache");
    headers.set("connection", "keep-alive");
  } else {
    // Per JSON normali: lascia accept originale (o fallback)
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
  respHeaders.set("cache-control", "no-store, no-cache, no-transform");
  respHeaders.set("x-accel-buffering", "no");

  if (isSSE) {
    respHeaders.set("content-type", "text/event-stream; charset=utf-8");
    respHeaders.set("connection", "keep-alive");
    // Non mettere content-length su SSE
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

