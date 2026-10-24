import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json';

const entry = (file: string) => fileURLToPath(new URL(file, import.meta.url));

/**
 * index.html, robots.txt ve sitemap.xml içindeki __SITE_URL__ yer tutucusunu
 * VITE_SITE_URL ile doldurur (canonical/og etiketleri, site haritası).
 */
const siteUrlHtml = (siteUrl: string): Plugin => ({
  name: 'site-url-html',
  transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
  writeBundle(options) {
    for (const file of ['robots.txt', 'sitemap.xml']) {
      const path = `${options.dir ?? 'dist'}/${file}`;
      if (existsSync(path)) writeFileSync(path, readFileSync(path, 'utf8').replaceAll('__SITE_URL__', siteUrl));
    }
  },
});

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const siteUrl = (env.VITE_SITE_URL || 'http://localhost:3340').replace(/\/+$/, '');
  return {
  plugins: [
    react(),
    siteUrlHtml(siteUrl),
    VitePWA({
      // Kullanıcı onaylayınca güncelle. Otomatik skipWaiting, oturum ortasında yeni SW'yi
      // devreye alıp eski lazy chunk isteklerini 404'e düşürebiliyor; "Güncelleme hazır"
      // çubuğu hem daha öngörülebilir hem de kullanıcı tarama ortasındayken kesmiyor.
      registerType: 'prompt',
      // Service worker /sw.js'te durur ama YALNIZCA /app/ altını kontrol eder — masaüstü
      // panel service worker'sız çalışmaya devam eder (kapsam dışı = sıfır risk).
      scope: '/app/',
      // Manifest ve kayıt betiği ELLE yönetiliyor: plugin bunları enjekte etseydi kök
      // index.html'e de girer ve masaüstü ziyaretçilere kurulum teklif edilirdi.
      // Manifest: public/manifest.webmanifest, kayıt: src/app/pwa.ts
      manifest: false,
      injectRegister: null,
      workbox: {
        // Yalnızca uygulama kabuğu precache edilir; hash'li paketler aşağıdaki
        // runtimeCaching kuralıyla ilk kullanımda cache'lenir. Böylece service worker
        // kurulumu birkaç yüz KB'la sınırlı kalır.
        globDirectory: 'dist',
        globPatterns: ['app/index.html', 'app/manifest.webmanifest', 'icons/*.png'],
        navigateFallback: '/app/index.html',
        navigateFallbackAllowlist: [/^\/app\//],
        // /api/ ve /files/ hiçbir kurala girmez → her zaman ağdan (imzalı URL'ler ve
        // yetkilendirilmiş yanıtlar asla cache'lenmemeli).
        navigateFallbackDenylist: [/^\/api\//, /^\/files\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Hash'li uygulama paketleri — cache'ten anında aç, arka planda tazele.
            urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'maliyetik-assets-v1',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: { host: true, port: 5173 },
  build: {
    rollupOptions: {
      // İki giriş noktası: masaüstü panel (/) ve mobil PWA (/app/). Ortak modüller
      // (api/client, auth, uploadManager, utils) Vite tarafından paylaşılan chunk'a
      // çıkarılır — kod tekrarı yok, mobil paket landing/admin kodunu çekmez.
      input: {
        main: entry('./index.html'),
        app: entry('./app/index.html'),
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  };
});
