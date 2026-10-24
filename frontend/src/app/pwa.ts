import { registerSW } from 'virtual:pwa-register';

type UpdateHandler = (applyUpdate: () => void) => void;

/**
 * Service worker kaydı ve güncelleme akışı.
 *
 * `registerType: 'prompt'` kullanıldığı için yeni sürüm indirildiğinde otomatik devreye
 * girmez; `onNeedRefresh` tetiklenir, kullanıcı "Yenile"ye basınca `applyUpdate()` çağrılır
 * (skipWaiting + reload). Böylece kullanıcı belge tararken uygulama altından değişmez.
 */
export function setupPwa(onNeedRefresh: UpdateHandler): void {
  if (!('serviceWorker' in navigator)) return;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => onNeedRefresh(() => void updateSW(true)),
    onRegisterError: (err) => console.warn('[pwa] service worker kaydedilemedi', err),
  });
}

const RELOAD_FLAG = 'maliyetik:chunk-reload';

/**
 * Yeni sürüm yayınlandığında eski `index.html` hâlâ açık olan sekmeler, artık sunucuda
 * bulunmayan hash'li chunk'ları istemeye devam eder ve lazy route'lar beyaz ekrana düşer.
 * Böyle bir hatada tek seferlik zorlu yeniden yükleme yapılır — bayrak sessionStorage'da
 * tutulur ki gerçek (ağdan bağımsız) bir hata sonsuz reload döngüsüne dönüşmesin.
 */
export function installChunkErrorRecovery(): void {
  const isChunkError = (message: string) =>
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);

  const recover = (message: string) => {
    if (!isChunkError(message)) return;
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, '1');
    window.location.reload();
  };

  window.addEventListener('error', (e) => recover(e.message ?? ''));
  window.addEventListener('unhandledrejection', (e) => recover(String((e.reason as Error)?.message ?? e.reason ?? '')));
  // Uygulama sorunsuz açıldıysa bayrağı temizle — sonraki deploy'da tekrar kullanılabilsin.
  window.addEventListener('load', () => sessionStorage.removeItem(RELOAD_FLAG));
}
