import { auth, currentUser } from '@clerk/nextjs/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handler(req: Request) {
  const { userId, getToken } = await auth();
  if (!userId) return Response.json({ detail: 'unauthorized' }, { status: 401 });
  const user = await currentUser();
  if (!user || user.id !== userId) return Response.json({ detail: 'unauthorized' }, { status: 401 });
  const owner = user.primaryEmailAddress?.emailAddress === 'marcopd80@gmail.com';
  const metadataTier = String(user.publicMetadata.tier ?? 'orione');
  const tier = owner ? 'galassia' : ['orione', 'argonauta', 'agema'].includes(metadataTier) ? metadataTier : 'orione';
  const token = await getToken();
  if (!token) return Response.json({ detail: 'unauthorized' }, { status: 401 });
  const base = (process.env.BACKEND_BASE || process.env.CASSANDRA_API_BASE || 'http://localhost:8000').replace(/\/+$/, '');
  const key = process.env.CASSANDRA_API_KEY ?? process.env.BACKEND_KEY ?? process.env.API_KEY;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-User-Tier': tier };
  if (key) headers['X-API-Key'] = key;
  try {
    const upstream = await fetch(`${base}/api/user/watchlist`, {
      method: req.method, headers, cache: 'no-store',
      body: req.method === 'PUT' ? JSON.stringify(await req.json()) : undefined,
    });
    return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ detail: 'Watchlist temporaneamente non disponibile' }, { status: 502 });
  }
}
export const GET = handler;
export const PUT = handler;
