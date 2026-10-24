import { useEffect, useState } from 'react';
import { XIcon, ScanIcon, DownloadIcon } from './Icons';

const DISMISS_KEY = 'maliyetik:install-prompt-dismissed';
/** Kapatıldıktan sonra tekrar sorulmadan geçecek süre — ısrarcı olmadan hatırlatmak için. */
const DISMISS_DAYS = 14;
/** Sayfa açılır açılmaz basmasın; kullanıcı içeriği görsün diye kısa gecikme. */
const SHOW_DELAY_MS = 2500;

/** Uygulama ana ekrandan (standalone) mı açıldı? */
function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIosDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Ziyaretçi gerçekten bir telefon/tablet mi? Sadece pencere darlığına bakmak masaüstünde
 * pencereyi küçülten kullanıcıya da kurulum önerirdi; dokunmatik + kaba işaretçi şartı
 * eklendi.
 */
function isMobileDevice(): boolean {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const touch = navigator.maxTouchPoints > 0;
  const narrow = window.innerWidth <= 900;
  const ua = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini/i.test(navigator.userAgent);
  return (coarse && touch && narrow) || (ua && narrow);
}

function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Mobil ziyaretçiye "Maliyetik'i uygulama olarak kur" davetini gösterir — hem her sayfada
 * duran küçük bir yüzen düğme, hem de ilk ziyarette (ve 14 günde bir) açılan bir alt sayfa.
 *
 * Kurulum ekranı neden burada değil de /app/ altında: PWA manifest'i ve service worker'ı
 * kapsam olarak `/app/` ile sınırlı (bkz. vite.config.ts) — tarayıcı `beforeinstallprompt`
 * olayını yalnızca kapsam içindeki bir sayfada verir. Bu yüzden düğme kullanıcıyı `/app/`
 * adresine götürür; asıl "Ana Ekrana Ekle" akışı orada (MobileInstallSheet) çalışır.
 * Masaüstünde hiçbir şey gösterilmez.
 */
export function InstallAppPrompt() {
  const [eligible, setEligible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (isStandalone() || !isMobileDevice()) return;
    setEligible(true);
    if (dismissedRecently()) return;
    const t = setTimeout(() => setSheetOpen(true), SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  if (!eligible) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* özel mod */ }
    setSheetOpen(false);
  }

  return (
    <>
      {!sheetOpen && (
        <button type="button" className="install-fab" onClick={() => setSheetOpen(true)}>
          <DownloadIcon /> Uygulamayı Yükle
        </button>
      )}

      {sheetOpen && (
        <div className="install-sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="install-sheet-title">
          <div className="install-sheet">
            <button type="button" className="install-sheet-close" onClick={dismiss} aria-label="Kapat"><XIcon /></button>
            <div className="install-sheet-icon" aria-hidden="true">M</div>
            <h2 id="install-sheet-title">Maliyetik&apos;i telefonunuza kurun</h2>
            <p>
              Evraklarınızı <b>kameranızla tarayıp</b> anında yükleyin. Uygulama ana ekranınızdan tek dokunuşla
              açılır, tam ekran çalışır — mağazadan indirmenize gerek yok.
            </p>
            <ul className="install-sheet-points">
              <li><ScanIcon /> Kamerayla belge tarama ve otomatik kırpma</li>
              <li><DownloadIcon /> Yüklediğiniz evraklara her yerden erişim</li>
            </ul>
            <a className="btn install-sheet-cta" href="/app/?install=1">Kuruluma Devam Et</a>
            <button type="button" className="btn secondary install-sheet-later" onClick={dismiss}>
              Şimdi değil
            </button>
            <p className="install-sheet-note">
              {isIosDevice()
                ? 'iPhone/iPad: açılan sayfada Safari’nin Paylaş düğmesinden “Ana Ekrana Ekle”yi seçin.'
                : 'Android: açılan sayfada “Ana Ekrana Ekle” düğmesine dokunmanız yeterli.'}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
