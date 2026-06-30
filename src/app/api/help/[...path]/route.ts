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
  const key = process.env.CASSANDRA_API_KEY ?? process.env.BACKEND_KEY ?? process.env.API_KEY;
  const h: Record<string, string> = {};
  if (key) { h["Authorization"] = `Bearer ${key}`; h["X-API-Key"] = key; }
  return h;
}

type Ctx = { params: Promise<{ path?: string[] }> };

async function handler(req: Request, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  const url = new URL(req.url);
  const upstream = `${backendBase()}/api/help/${path.join("/")}${url.search}`;

  const fwdHeaders: Record<string, string> = {
    ...authHeaders(),
    "accept": "application/json",
    "content-type": req.headers.get("content-type") || "application/json",
  };

  const res = await fetch(upstream, {
    method: req.method,
    headers: fwdHeaders,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
    cache: "no-store",
  });

  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}

export const GET = handler;
export const PUT = handler;
