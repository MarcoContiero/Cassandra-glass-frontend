import { NextRequest } from "next/server";
import { callBackend, authHeaders } from "@/lib/proxy";

async function forward(req: NextRequest, method: string, pathParts: string[]) {
  const qs = req.nextUrl.searchParams.toString();
  const path = `/api/tifide/${pathParts.join("/")}` + (qs ? `?${qs}` : "");

  const headers = {
    ...authHeaders(),
    "Content-Type": req.headers.get("content-type") ?? "application/json",
  };

  const body = method === "GET" ? undefined : await req.text().catch(() => undefined);

  const res = await callBackend(path, { method, headers, body });

  // SSE passthrough (events)
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/event-stream")) {
    return new Response(res.body, { status: res.status, headers: res.headers });
  }

  const text = await res.text();
  return new Response(text, { status: res.status, headers: res.headers });
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, "GET", ctx.params.path);
}
export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return forward(req, "POST", ctx.params.path);
}
