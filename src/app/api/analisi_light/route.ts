// app/api/analisi_light/route.ts
import { NextRequest } from "next/server";
import { callBackend } from "@/lib/proxy";

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
    const backendRes = await callBackend(path, { method: "GET" });

    if (backendRes.ok) {
      const bodyText = await backendRes.text();

      // Argonauta alert hook — fire-and-forget, non blocca la risposta
      void (async () => {
        try {
          const data = JSON.parse(bodyText);
          const strategia: Array<Record<string, unknown>> = Array.isArray(data?.strategia_ai)
            ? data.strategia_ai
            : [];
          const coin = (
            url.searchParams.get("coin") ||
            url.searchParams.get("symbol") ||
            ""
          ).toUpperCase();

          if (strategia.length > 0 && coin) {
            // Prende il singolo item con score più alto per il check
            const best = strategia.reduce<Record<string, unknown> | null>((b, item) => {
              return ((item.score as number) ?? 0) > (((b?.score) as number) ?? -1) ? item : b;
            }, null);

            if (best) {
              await callBackend("/api/alerts/check", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  modulo: "argonauta",
                  event: {
                    coin,
                    score: (best.score as number) ?? 0,
                    fonte: String(best.source || best.sorgente || "").toUpperCase(),
                    rr: best.rr1 ?? null,
                    direction: String(best.direction || "").toUpperCase(),
                  },
                }),
              });
            }
          }
        } catch {
          /* ignore */
        }
      })();

      return new Response(bodyText, {
        status: backendRes.status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    return backendRes;
  } catch (err) {
    console.error("[api/analisi_light] unexpected error", err);
    return new Response(
      JSON.stringify({ error: "proxy_error", detail: "unexpected error" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}
