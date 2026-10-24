import { useEffect, useState } from 'react';
import { PlusSquareIcon, ShareIosIcon } from '../icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Uygulama ana ekrandan (standalone) mı açıldı? */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    // iOS Safari `display-mode` yerine kendi eski bayrağını kullanır.
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    // iPadOS 13+ kendini Mac olarak tanıtır; dokunmatik desteği ayırt eder.
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Kurulum yönergesi.
 *
 * Android/Chrome `beforeinstallprompt` olayını verir → tek dokunuşla kurulum sunulur.
 * iOS Safari bu olayı HİÇ desteklemez; oradaki tek yol "Paylaş → Ana Ekrana Ekle"
 * olduğundan kullanıcıya adımlar görsel olarak anlatılır.
 * Uygulama zaten ana ekrandan açıldıysa hiçbir şey gösterilmez.
 */
export function InstallHint() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();   // Chrome'un kendi mini çubuğunu bastır, kendi düğmemizi gösterelim
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setPromptEvent(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  if (promptEvent) {
    return (
      <div className="m-card">
        <h3>Uygulamayı telefonuna kur</h3>
        <p className="m-hint" style={{ margin: '0 0 .875rem' }}>
          Ana ekrandan tek dokunuşla açılır, tam ekran çalışır.
        </p>
        <button type="button" className="m-btn" onClick={async () => {
          await promptEvent.prompt();
          const { outcome } = await promptEvent.userChoice;
          if (outcome === 'accepted') setInstalled(true);
          setPromptEvent(null);   // olay bir kez kullanılabilir
        }}>
          Ana Ekrana Ekle
        </button>
      </div>
    );
  }

  if (isIos()) {
    return (
      <div className="m-card">
        <h3>Uygulamayı telefonuna kur</h3>
        <p className="m-hint" style={{ margin: '0 0 .75rem' }}>
          Safari'de alttaki adımları izleyin — uygulama ana ekranınıza eklenir ve tam ekran açılır.
        </p>
        <div className="m-rows">
          <div className="m-row static">
            <ShareIosIcon width={20} height={20} />
            <span className="label">1. Alttaki <strong>Paylaş</strong> düğmesine dokunun</span>
          </div>
          <div className="m-row static">
            <PlusSquareIcon width={20} height={20} />
            <span className="label">2. <strong>Ana Ekrana Ekle</strong>'yi seçin</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
