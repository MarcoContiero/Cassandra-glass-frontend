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

// Vedi commento gemello in api/alerts/[...path]/route.ts — stesso fix
// 2026-07-25: X-User-Id non era mai verificato, chiunque poteva impostarlo
// e leggere/scrivere i flag (es. onboarding_completed) di un altro utente.
function serverAuthHeaders(): Record<string, string> {
  const key =
    process.env.CASSANDRA_API_KEY ??
    process.env.BACKEND_KEY ??
    process.env.API_KEY;
  return key ? { "X-API-Key": key } : {};
}

async function handler(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ detail: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const token = await getToken();

  const upstreamUrl = `${backendBase()}/api/user/flags`;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("transfer-encoding");
  headers.delete("content-length");
  headers.delete("x-user-id");

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
