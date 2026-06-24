export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TO = "cassandra@cassandra-acas.com";
const FROM = process.env.RESEND_FROM || "onboarding@resend.dev";

interface SegnalaBody {
  userName?: string;
  userEmail?: string;
  userId?: string;
  descrizione: string;
  pagina?: string;
}

export async function POST(req: Request) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return Response.json({ error: "Email service non configurato" }, { status: 503 });
  }

  let body: SegnalaBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body non valido" }, { status: 400 });
  }

  if (!body.descrizione?.trim()) {
    return Response.json({ error: "Descrizione obbligatoria" }, { status: 400 });
  }

  const html = `
<p><strong>Segnalazione problema — Cassandra</strong></p>
<hr/>
<p><strong>Utente:</strong> ${body.userName || "—"} &lt;${body.userEmail || "—"}&gt;</p>
<p><strong>User ID:</strong> ${body.userId || "—"}</p>
${body.pagina ? `<p><strong>Pagina:</strong> ${body.pagina}</p>` : ""}
<hr/>
<p><strong>Descrizione:</strong></p>
<p style="white-space:pre-wrap">${body.descrizione.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
`.trim();

  const text = [
    "Segnalazione problema — Cassandra",
    "",
    `Utente: ${body.userName || "—"} <${body.userEmail || "—"}>`,
    `User ID: ${body.userId || "—"}`,
    body.pagina ? `Pagina: ${body.pagina}` : "",
    "",
    "Descrizione:",
    body.descrizione,
  ].filter(l => l !== undefined).join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [TO],
      reply_to: body.userEmail || undefined,
      subject: `[Cassandra] Segnalazione da ${body.userName || body.userEmail || body.userId || "utente"}`,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error("[segnala] Resend error:", res.status, err);
    return Response.json({ error: "Invio fallito, riprova" }, { status: 502 });
  }

  return Response.json({ ok: true });
}
