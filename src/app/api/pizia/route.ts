import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND =
  (process.env.BACKEND_BASE || process.env.CASSANDRA_API_BASE || 'http://localhost:8000').replace(/\/+$/, '');

export async function POST(req: NextRequest): Promise<Response> {
  const { userId, getToken } = await auth();
  if (!userId) {
    return _errSSE('unauthorized');
  }
  const token = await getToken(); // token di sessione Clerk default — sub/iss/exp/azp, verificato da require_clerk_user

  const body = await req.text();

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND}/api/pizia/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body,
    });
  } catch (err: any) {
    return _errSSE('backend_unreachable');
  }

  if (!upstream.ok) {
    return _errSSE(`backend_${upstream.status}`);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}

function _errSSE(code: string): Response {
  const body = `data: ${JSON.stringify({ error: code })}\n\n`;
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
