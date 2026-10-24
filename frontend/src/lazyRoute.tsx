import { ComponentType, lazy, LazyExoticComponent } from 'react';

const RELOAD_KEY = 'maliyetik:chunk-reload-at';
/** Bu süre içinde ikinci kez yenileme yapılmaz — sonsuz yenileme döngüsünü keser. */
const RELOAD_COOLDOWN_MS = 30_000;

function reloadOnceForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage kapalıysa (gizli sekme, katı gizlilik ayarı) yine de bir kez dene.
  }
  window.location.reload();
  return true;
}

/**
 * `React.lazy` yerine kullanılır: chunk indirilemezse önce bir kez daha dener, yine
 * olmazsa sayfayı BİR KEZ yeniler.
 *
 * NEDEN: Vite chunk dosyalarını içerik hash'iyle adlandırıyor ve her yayında eskileri
 * siliniyor. Kullanıcının tarayıcısında açık duran sekme ise ESKİ `index.html`i tutuyor,
 * yani artık var olmayan dosya adlarına atıf yapıyor. Böyle bir sekmede herhangi bir
 * rotaya geçmek dinamik import'un reddedilmesine yol açıyordu; hata yakalanmadığı ve
 * `Suspense` fallback'i `null` olduğu için ekran tamamen boşalıyor, ancak elle yenileme
 * düzeltiyordu. Yenileme yeni index.html'i getirir ve doğru chunk adlarını çözer.
 *
 * Asıl kalıcı düzeltme nginx tarafında `index.html`in no-cache olarak servis edilmesi
 * (bkz. frontend/nginx.conf); buradaki kurtarma, yayın anında SAYFASI AÇIK olan
 * kullanıcılar içindir — onların HTML'i zaten belleğe alınmış durumdadır.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRoute<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await load();
    } catch {
      try {
        return await load();
      } catch (err) {
        // Yenileme başlatıldıysa bileşeni asla çözme: React bu arada hata sınırını
        // tetiklemesin, kullanıcı yalnızca yeniden yüklenen sayfayı görsün.
        if (reloadOnceForStaleChunk()) await new Promise(() => {});
        throw err;
      }
    }
  });
}
