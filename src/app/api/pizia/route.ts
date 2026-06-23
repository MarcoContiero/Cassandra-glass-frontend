import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND =
  (process.env.BACKEND_BASE || process.env.CASSANDRA_API_BASE || 'http://localhost:8000').replace(/\/+$/, '');

export async function POST(req: NextRequest): Promise<Response> {
  const body = await req.text();

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND}/api/pizia/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
