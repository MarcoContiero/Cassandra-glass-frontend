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

type Ctx = { params: Promise<{ path?: string[] }> };

async function handler(req: Request, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  const isSSE = path[0] === "events";

  const url = new URL(req.url);
  const upstreamUrl = `${backendBase()}/api/tifide/${path.join("/")}${url.search}`;

  // Costruisci header di forwarding minimali
  const fwdHeaders: Record<string, string> = { ...authHeaders() };
  const xUserId = req.headers.get("x-user-id");
  if (xUserId) fwdHeaders["x-user-id"] = xUserId;
  const ct = req.headers.get("content-type");
  if (ct) fwdHeaders["content-type"] = ct;

  if (isSSE) {
    fwdHeaders["accept"] = "text/event-stream";
    fwdHeaders["cache-control"] = "no-cache";
  } else {
    fwdHeaders["accept"] = "application/json";
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: fwdHeaders,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
      cache: "no-store",
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: "backend_unavailable", detail: String(err) }),
      { status: 503, headers: { "content-type": "application/json" } }
    );
  }

  // SSE: passa body come stream
  if (isSSE) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store, no-cache",
        "x-accel-buffering": "no",
      },
    });
  }

  // JSON: bufferizza per evitare problemi con transfer-encoding/content-length
  let body: string;
  try {
    body = await upstream.text();
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: "body_read_error", detail: String(err) }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  // Se il backend ha risposto con HTML (pagina di errore), wrappa in JSON
  if (body.trimStart().startsWith("<")) {
    return new Response(
      JSON.stringify({ ok: false, error: "backend_error", status: upstream.status }),
      { status: upstream.status >= 400 ? upstream.status : 502,
        headers: { "content-type": "application/json" } }
    );
  }

  return new Response(body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") || "application/json",
      "cache-control": "no-store, no-cache",
    },
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
