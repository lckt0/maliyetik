/**
 * Build çıktısı doğrulaması — `npm run build` sonrası otomatik çalışır (postbuild).
 *
 * Vite çok girişli derlemede bir HTML girişini çözemezse hata vermeden atlar (ör. proje
 * kök dizininin adı mobil girişin dizin adı `app/` ile çakıştığında). Bu kontrol iki
 * girişin de üretildiğini doğrular.
 */
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');

/** [yol, içermesi gereken imza] — dosya var mı VE doğru giriş noktasına mı bağlanıyor. */
const REQUIRED = [
  ['index.html', '/src/main.tsx', 'Masaüstü panel'],
  ['app/index.html', '/src/app/main.tsx', 'Mobil PWA'],
  ['app/manifest.webmanifest', '"scope": "/app/"', 'PWA manifest'],
  ['sw.js', 'app/index.html', 'Service worker'],
  ['uygulama.webmanifest', '"start_url": "/uygulama"', 'Masaüstü uygulama manifest'],
  ['panel-sw.js', 'maliyetik-panel-shell', 'Masaüstü service worker'],
];

const problems = [];

for (const [file, marker, label] of REQUIRED) {
  const path = resolve(dist, file);
  try {
    const { size } = await stat(path);
    if (size === 0) { problems.push(`${label}: ${file} boş`); continue; }
  } catch {
    problems.push(`${label}: ${file} ÜRETİLMEDİ`);
    continue;
  }

  // HTML girişleri derleme sırasında hash'li paket adına dönüşür; kaynak yol imzası
  // yalnızca ham dosyada bulunur. Bu yüzden imza kontrolü esnek: ya kaynak yol ya da
  // derlenmiş bir /assets/ betiği bulunmalı.
  const content = await readFile(path, 'utf8');
  const ok = content.includes(marker)
    || (file.endsWith('.html') && /<script[^>]+src="\/assets\/[^"]+\.js"/.test(content));
  if (!ok) problems.push(`${label}: ${file} beklenen içeriği taşımıyor (${marker})`);
}

if (problems.length) {
  console.error('\n✗ Build doğrulaması BAŞARISIZ:');
  problems.forEach((p) => console.error(`   - ${p}`));
  console.error('');
  process.exit(1);
}

console.log('✓ Build doğrulandı: masaüstü + mobil giriş noktaları, manifest ve service worker yerinde.');
