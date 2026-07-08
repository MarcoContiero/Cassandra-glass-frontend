import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND =
  (process.env.BACKEND_BASE || process.env.CASSANDRA_API_BASE || 'http://localhost:8000').replace(/\/+$/, '');

export async function GET(): Promise<Response> {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const token = await getToken();

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND}/api/pizia/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'backend_unreachable' }, { status: 502 });
  }

  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
