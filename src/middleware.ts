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

export default clerkMiddleware(async (auth, req) => {
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
