import { NextRequest } from "next/server";
import { callBackend } from "@/lib/proxy";

export async function POST(req: NextRequest): Promise<Response> {
  // leggiamo il body così com'è e lo inoltriamo al backend
  const body = await req.text();

  console.log("[api/orione/scan] incoming POST");

  return await callBackend("/api/orione/scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
  });
}