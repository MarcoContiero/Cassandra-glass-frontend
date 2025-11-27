// src/app/api/klines/route.ts
import type { NextRequest } from 'next/server';
import { proxyGET } from '../_utils/proxy';

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return proxyGET(req);
}
