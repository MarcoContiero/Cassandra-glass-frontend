// app/api/analisi_light/route.ts
import { NextRequest } from "next/server";
import { callBackend } from "@/lib/proxy"; // ↩️ aggiorna il path se diverso

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const url = req.nextUrl;
  const search = url.searchParams.toString();
  const path = `/api/analisi_light${search ? `?${search}` : ""}`;

  console.log("[api/analisi_light] incoming", {
    pathname: url.pathname,
    search,
  });

  try {
    return await callBackend(path, { method: "GET" });
  } catch (err) {
    console.error("[api/analisi_light] unexpected error", err);
    return new Response(
      JSON.stringify({ error: "proxy_error", detail: "unexpected error" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}
