import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND =
  (process.env.BACKEND_BASE || process.env.CASSANDRA_API_BASE || 'http://localhost:8000').replace(/\/+$/, '');

export async function POST(req: NextRequest): Promise<Response> {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const token = await getToken();
  const body = await req.text();

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND}/api/pizia/alias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'backend_unreachable' }, { status: 502 });
  }

  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
