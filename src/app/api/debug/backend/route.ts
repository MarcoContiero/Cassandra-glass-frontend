// src/app/api/debug/backend/route.ts
export const dynamic = 'force-dynamic';      // ok insieme a runtime
export const runtime = 'nodejs';             // <<< un solo runtime

import { NextResponse } from 'next/server';
import { proxyToBackend } from '@/app/api/_utils/proxy';

function getBase() {
  const raw =
    process.env.CASSANDRA_API_BASE ||
    process.env.BACKEND_BASE ||
    '';
  return raw.replace(/\/+$/, '');
}

export async function GET() {
  const base = getBase();
  const url = `${base}/ping`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'backend_unreachable', message: String(err?.message ?? err) },
      { status: 502 }
    );
  }
}
