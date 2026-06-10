// src/app/api/trade/exec/route.ts
import type { NextRequest } from 'next/server';
import { proxyPOST } from '../../_utils/proxy';

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  return proxyPOST(req, pathname + search);
}
