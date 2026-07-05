const CACHE_NAME = 'cassandra-v1';

// App shell — risorse critiche per il funzionamento offline
const SHELL = [
  '/',
  '/app',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Bypassa richieste API, Clerk, PostHog — solo network
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('clerk') ||
    url.hostname.includes('posthog') ||
    url.hostname.includes('anthropic') ||
    request.method !== 'GET'
  ) {
    return;
  }

  // Navigazione: network-first con fallback cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/app') || caches.match('/'))
    );
    return;
  }

  // Asset statici: cache-first
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icon-') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg')
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) => cached || fetch(request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
      )
    );
    return;
  }
});
