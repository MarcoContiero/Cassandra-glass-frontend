export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function backendBase() {
  return (
    process.env.BACKEND_BASE ||
    process.env.CASSANDRA_API_BASE ||
    "http://localhost:8000"
  ).replace(/\/+$/, "");
}

type Ctx = { params: Promise<{ path?: string[] }> };

async function handler(req: Request, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  const url = new URL(req.url);
  const upstream = `${backendBase()}/api/admin/${path.join("/")}${url.search}`;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  if (!headers.get("accept")) headers.set("accept", "application/json");

  const adminKey = process.env.ADMIN_KEY;
  if (adminKey) headers.set("x-admin-key", adminKey);

  const res = await fetch(upstream, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer(),
    cache: "no-store",
  });

  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export const GET = handler;
export const POST = handler;
