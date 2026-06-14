// src/app/api/moire/[...path]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { proxyToBackend } from "../../_utils/proxy";

type Ctx = { params: Promise<{ path?: string[] }> };

async function handler(req: Request, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  const url = new URL(req.url);
  const upstreamPath = `/api/moire/${path.join("/")}${url.search}`;
  return proxyToBackend(req, upstreamPath);
}

export const GET  = handler;
export const POST = handler;
