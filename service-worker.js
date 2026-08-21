// Service worker sederhana: cache "shell" aplikasi supaya cepat dibuka & tetap
// bisa muncul walau koneksi lemot. Data resto sendiri TETAP butuh internet
// (diambil live dari Supabase), jadi ini bukan mode "penuh offline".
const CACHE_NAME = 'gastronomap-v69'; // naikkan angka ini tiap kali deploy versi baru
const SHELL_FILES = [
  './index.html',
  './manifest.json',
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
  // Untuk file shell: coba cache dulu, fallback ke network.
  // Untuk lainnya (termasuk panggilan ke Supabase): langsung ke network saja.
  const url = new URL(event.request.url);
  const isShellFile = SHELL_FILES.some((f) => url.pathname.endsWith(f.replace('./', '')));
  if (isShellFile) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
