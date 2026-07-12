// src/app/api/macro-calendar/upcoming/route.ts
import type { NextRequest } from 'next/server';
import { proxyGET } from '../../_utils/proxy';

export const runtime = "nodejs";
export const maxDuration = 60; // secondi — aumenta il timeout su Render/Vercel (allinea a /api/agema)

export async function GET(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  return proxyGET(req, pathname + search);
}
