import { NextResponse } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Route pubbliche per design: health check, form di contatto pre-login,
// trigger di un cron esterno. Tutto il resto sotto /api/* proxya verso il
// backend (trade reali, admin, dati di trading) e va dietro login Clerk —
// altrimenti è raggiungibile da chiunque sul web senza autenticazione.
const isPublicApiRoute = createRouteMatcher([
  '/api/ping',
  '/api/segnala',
  '/api/orione/scan',
]);
const isProtectedRoute = createRouteMatcher([
  '/app(.*)',
  '/api(.*)',
  '/tifide(.*)',
  '/tifide3(.*)',
  '/orione2(.*)',
  '/chart(.*)',
  '/onboarding(.*)',
]);

// FIX 2026-09-17: backend/scheduler.py chiama /api/analisi_light (hook
// alert Argonauta) e /api/agema (hook alert Agema) da due cron
// server-to-server, senza sessione Clerk — finivano tutte 404 (middleware
// le riscriveva verso la pagina di login) da chissa' quanto, scoperto
// indagando un problema non collegato (redesign pannello Agema). Un header
// condiviso, confrontato con un secret presente SOLO nell'env di entrambi i
// Render (mai nel codice), fa bypassare Clerk — ma SOLO per queste due
// route specifiche, non globalmente: se il secret venisse mai esposto,
// il danno resta limitato a due endpoint di sola lettura, non a tutto
// /api/* (trade reali, admin inclusi).
const isInternalCronRoute = createRouteMatcher([
  '/api/analisi_light',
  '/api/agema',
]);
const INTERNAL_CRON_HEADER = 'x-cassandra-internal-token';

export default clerkMiddleware(async (auth, req) => {
  if (isInternalCronRoute(req)) {
    const internalSecret = process.env.INTERNAL_CRON_SECRET;
    if (internalSecret && req.headers.get(INTERNAL_CRON_HEADER) === internalSecret) {
      return NextResponse.next();
    }
  }
  if (isPublicApiRoute(req)) return;
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
