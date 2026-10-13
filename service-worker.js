/* P2-14: versioned, same-origin app shell. User data and Supabase API responses are NEVER cached. */
const CACHE_PREFIX = 'gastronomap-';
const VERSION = 'p3-16-20261013-1';
const SHELL_CACHE = CACHE_PREFIX + 'shell-' + VERSION;
const SHELL_FILES = [
  './', './index.html', './manifest.json', './config.js',
  './assets/css/design-system.css', './assets/css/app.css',
  './assets/css/navigation.css', './assets/css/leaderboard.css',
  './assets/css/community.css', './assets/css/moderation.css',
  './assets/css/profile.css', './assets/css/social-profile.css',
  './assets/css/pwa.css',
  './assets/js/core.js', './assets/js/services.js',
  './assets/js/personalization.js', './assets/js/map.js', './assets/js/restaurants.js',
  './assets/js/events.js', './assets/js/moderation.js',
  './assets/js/community.js', './assets/js/profile.js',
  './assets/js/social-profile.js', './assets/js/bootstrap.js',
  './assets/js/pwa.js', './assets/icons/ui.svg',
  './icons/icon-180.png', './icons/icon-192.png',
  './icons/icon-512.png', './icons/icon-maskable.svg'
];
// Exact CDN dependencies needed to initialize the shell. Not tile/data requests.
// Fonts use their browser/system fallbacks when offline.
const CDN_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet-routing-machine/3.2.12/leaflet-routing-machine.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet-routing-machine/3.2.12/leaflet-routing-machine.js'
];
const SHELL_PATHS = new Set(SHELL_FILES.map(path => new URL(path, self.registration.scope).pathname));
const CDN_URLS = new Set(CDN_FILES);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // All required local files must succeed, or the previous SW remains active.
    await cache.addAll(SHELL_FILES.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' })));
    // CDN assets may be opaque and are optional; cache.put supports opaque responses.
    await Promise.allSettled(CDN_FILES.map(async url => {
      const request = new Request(url, { mode: 'no-cors', credentials: 'omit' });
      const response = await fetch(request);
      await cache.put(request, response);
    }));
    // Do not skipWaiting automatically: wait for an explicit Update click.
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== SHELL_CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const inScope = url.href.startsWith(self.registration.scope);
  if (url.origin === self.location.origin && request.mode === 'navigate' && inScope) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match('./index.html');
      if (cached) return cached;
      try { return await fetch(request); }
      catch (_) {
        return new Response('<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GastronoMap</title><main style="font:16px system-ui;padding:24px"><h1>Tidak ada koneksi</h1><p>Hubungkan internet untuk membuka GastronoMap.</p><a href="./index.html">Coba lagi</a></main></html>', {
          status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    })());
    return;
  }
  if (url.origin === self.location.origin && SHELL_PATHS.has(url.pathname)) {
    // Cache-first keeps JS/CSS/HTML on the SAME version until a user accepts an update.
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
    return;
  }
  if (CDN_URLS.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      const response = await fetch(request);
      event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
      return response;
    })());
  }
  // Maps, images, authenticated responses, PostgREST and other requests: network/browser only.
});
