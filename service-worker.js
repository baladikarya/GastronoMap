// Service worker sederhana: cache "shell" aplikasi supaya cepat dibuka & tetap
// bisa muncul walau koneksi lemot. Data resto sendiri TETAP butuh internet
// (diambil live dari Supabase), jadi ini bukan mode "penuh offline".
const CACHE_NAME = 'gastronomap-v113'; // naikkan angka ini tiap kali deploy versi baru
const SHELL_FILES = [
  './index.html',
  './manifest.json',
  './config.js',
  './assets/css/design-system.css',
  './assets/css/app.css',
  './assets/css/navigation.css',
  './assets/js/core.js',
  './assets/js/services.js',
  './assets/js/map.js',
  './assets/js/restaurants.js',
  './assets/js/events.js',
  './assets/js/bootstrap.js',
  './assets/icons/ui.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // File shell memakai network-first agar setiap deploy UI langsung terlihat.
  // Jika offline / jaringan gagal, baru gunakan versi cache terakhir.
  // Request lain (termasuk Supabase) tetap langsung ke network.
  const url = new URL(event.request.url);
  const isShellFile = SHELL_FILES.some((f) => url.pathname.endsWith(f.replace('./', '')));
  if (isShellFile) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
