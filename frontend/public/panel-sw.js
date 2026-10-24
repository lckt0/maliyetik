/**
 * Masaüstü panelin service worker'ı.
 *
 * Tek işi uygulamayı KURULABİLİR kılmak: tarayıcılar manifest'in yanında fetch olayını
 * dinleyen (ve çevrimdışıyken bir yanıt üretebilen) bir service worker arıyor. Mobil
 * PWA'nın service worker'ı yalnızca /app/ kapsamında olduğu için panelin kendi kaydı
 * gerekiyor (bkz. src/utils/appWindow.ts, vite.config.ts).
 *
 * Bilerek ASGARİ ve önce-ağ: sayfa gezinmeleri her zaman ağdan gelir, cache yalnızca
 * ağ yokken devreye girer. Eski bir index.html'in cache'ten servis edilmesi, silinmiş
 * hash'li chunk adlarına atıf yapıp BOŞ EKRAN üretiyordu (bkz. frontend/nginx.conf
 * `location = /index.html` notu) — bu service worker o hatayı tekrar etmiyor.
 * /assets/, /api/ ve /files/ hiç ellenmiyor.
 */
const SHELL_CACHE = 'maliyetik-panel-shell-v1';
const SHELL_URL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.add(SHELL_URL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('maliyetik-panel-shell-') && k !== SHELL_CACHE)
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Mobil PWA'nın kendi service worker'ı var; API ve dosya yolları asla cache'lenmez.
  if (/^\/(app|api|files)\//.test(url.pathname)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy)).catch(() => undefined);
        return response;
      })
      .catch(() => caches.match(SHELL_URL).then((cached) => cached ?? Response.error())),
  );
});
