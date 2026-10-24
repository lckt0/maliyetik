import { useEffect, useState } from 'react';
import { Sheet } from './Sheet';
import { PlusSquareIcon, ShareIosIcon } from '../icons';
import { isIos, isStandalone } from './InstallHint';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Ana siteden "Kuruluma Devam Et" ile gelindiğinde adres `/app/?install=1` olur. Rota
 * eşleşmesi bunu hemen `/yukle`'ye çevirdiği için parametre modül yüklenirken, herhangi
 * bir yönlendirme çalışmadan okunur — effect'e bırakılsaydı çoktan silinmiş olurdu.
 */
const FORCED_BY_URL = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('install');

const DISMISS_KEY = 'maliyetik:mobile-install-dismissed';
const DISMISS_DAYS = 14;

function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return !!raw && Date.now() - Number(raw) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * `/app/` açıldığında kurulum davetini kendiliğinden gösteren alt sayfa.
 *
 * Kurulum yönergesi eskiden yalnızca Profil sekmesinin dibinde duruyordu; ana siteden
 * gelen ya da ilk kez giren kullanıcı uygulamayı nasıl kuracağını hiç görmüyordu. Artık
 * uygulama tarayıcı sekmesinde (standalone değil) açıldığında, giriş ekranında bile,
 * kurulum daveti öne çıkıyor. Kapatılırsa 14 gün tekrar sorulmaz.
 *
 * Android/Chrome: `beforeinstallprompt` yakalanır → tek dokunuşla kurulum.
 * iOS Safari: bu olay hiç yoktur → "Paylaş → Ana Ekrana Ekle" adımları anlatılır.
 */
export function InstallSheet() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      if (!dismissedRecently()) setOpen(true);
    };
    const onInstalled = () => { setOpen(false); setPromptEvent(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // iOS'ta beforeinstallprompt hiç gelmez — olayı beklemeden adımları göstermeliyiz.
    // Ana siteden "Kuruluma Devam Et" ile gelindiyse (?install=1) kapatma geçmişine
    // bakılmaksızın açılır: kullanıcı bunu bilerek istedi.
    if (FORCED_BY_URL || (isIos() && !dismissedRecently())) setOpen(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!open) return null;

  function close() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* özel mod */ }
    setOpen(false);
  }

  return (
    <Sheet
      title="Uygulamayı ana ekrana ekle"
      description="Maliyetik ana ekranınızdan tek dokunuşla, tam ekran açılır. Mağazadan indirmenize gerek yok."
      onClose={close}
    >
      {promptEvent ? (
        <div className="m-btn-row">
          <button type="button" className="m-btn secondary" onClick={close}>Şimdi değil</button>
          <button type="button" className="m-btn" onClick={async () => {
            await promptEvent.prompt();
            const { outcome } = await promptEvent.userChoice;
            setPromptEvent(null);   // olay bir kez kullanılabilir
            if (outcome === 'accepted') setOpen(false); else close();
          }}>
            Ana Ekrana Ekle
          </button>
        </div>
      ) : isIos() ? (
        <>
          <div className="m-rows">
            <div className="m-row static">
              <ShareIosIcon width={20} height={20} />
              <span className="label">1. Safari&apos;de alttaki <strong>Paylaş</strong> düğmesine dokunun</span>
            </div>
            <div className="m-row static">
              <PlusSquareIcon width={20} height={20} />
              <span className="label">2. <strong>Ana Ekrana Ekle</strong>&apos;yi seçin</span>
            </div>
          </div>
          <div className="m-btn-row" style={{ marginTop: '1rem' }}>
            <button type="button" className="m-btn secondary" onClick={close}>Anladım</button>
          </div>
        </>
      ) : (
        <>
          <p className="m-hint" style={{ margin: '0 0 1rem' }}>
            Tarayıcınızın menüsünden (⋮) <strong>&quot;Uygulamayı yükle&quot;</strong> ya da
            <strong> &quot;Ana ekrana ekle&quot;</strong> seçeneğine dokunun.
          </p>
          <div className="m-btn-row">
            <button type="button" className="m-btn secondary" onClick={close}>Anladım</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
