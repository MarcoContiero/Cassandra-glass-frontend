import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

type Ctx = { params: Promise<{ path: string[] }> };

async function handler(req: NextRequest, ctx: Ctx) {
  const { path: parts } = await ctx.params;   // ✅ fix Next 15
  const path = (parts || []).join("/");

  const url = new URL(req.url);
  const target = `${BASE.replace(/\/+$/, "")}/api/orione2/${path}${url.search}`;

  // passa anche l'api key se la usi lato backend
  const headers: Record<string, string> = {};
  const k = process.env.SECRET_API_KEY || process.env.NEXT_PUBLIC_SECRET_API_KEY;
  if (k) headers["X-API-Key"] = k;

  const r = await fetch(target, { method: req.method, headers });
  const text = await r.text();

  return new NextResponse(text, {
    status: r.status,
    headers: { "content-type": r.headers.get("content-type") || "application/json" },
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;