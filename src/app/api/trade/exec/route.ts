// src/app/api/trade/exec/route.ts
import type { NextRequest } from 'next/server';
import { proxyPOST } from '../../_utils/proxy';

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return proxyPOST(req);
}
