import { tabStorage } from '../api/client';

/**
 * UYGULAMA PENCERESİ.
 *
 * Uygulama kendi penceresinde çalışır; sekme şeridi o pencerenin şeridi olsun,
 * tarayıcının sekmeleriyle iç içe geçmesin diye.
 * İki yol var, ikisi de destekleniyor:
 *
 *  1. KURULUM (tercih edilen): masaüstü panel kurulabilir bir uygulama. Adres çubuğu
 *     yok, görev çubuğunda kendi ikonu var, işletim sistemi onu ayrı bir uygulama gibi
 *     tanır. Manifest ve service worker YALNIZCA giriş yapmış kullanıcıya tanıtılır —
 *     anasayfayı gezen ziyaretçiye kurulum teklif edilmemesi kararı (bkz. vite.config.ts)
 *     bu yüzden bozulmuyor: `enableDesktopInstall()` panel açılınca çağrılır.
 *  2. POPUP: kurmak istemeyen ya da kurulumu desteklemeyen tarayıcıda `window.open`
 *     ile ayrı bir pencere. Adres çubuğu salt okunur bir şerit olarak kalır ama pencere
 *     yine ayrıdır ve sekme şeridi çalışır.
 *
 * `noopener` bilerek YOK (mükellef penceresinden farklı olarak, bkz. tabs.tsx):
 * pencereye ad verildiğinde ikinci kez tıklamak yeni pencere açmak yerine mevcut
 * pencereyi öne getiriyor; `noopener` ile pencere adı çalışmaz ve her tıklama yeni bir
 * pencere açardı. Hedef kendi origin'imiz olduğu için sakınca yok.
 */

const APP_WINDOW_NAME = 'maliyetik-uygulama';
const APP_WINDOW_PARAM = 'pencere';
const APP_WINDOW_KEY = 'appWindow';
const MANIFEST_HREF = '/uygulama.webmanifest';
const PANEL_SW = '/panel-sw.js';

/** Uygulamanın açılış adresi — manifest `start_url` ile aynı olmalı. */
export const APP_WINDOW_ENTRY = '/uygulama';

const FEATURES = 'popup=yes,width=1500,height=940,left=60,top=40';

/** İşletim sistemi penceresi olarak mı açıldı (kurulmuş uygulama)? */
export function isStandaloneWindow(): boolean {
  try {
    const modes = ['standalone', 'window-controls-overlay', 'minimal-ui'];
    if (modes.some((m) => window.matchMedia(`(display-mode: ${m})`).matches)) return true;
  } catch { /* matchMedia yok — aşağıdaki iOS kontrolüne düş */ }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Bu pencere uygulamanın kendi penceresi mi (kurulmuş ya da popup)? */
export function isAppWindow(): boolean {
  return isStandaloneWindow() || tabStorage.get(APP_WINDOW_KEY) === '1';
}

/**
 * Popup ile açılan pencere kendini işaretler. İşaret sessionStorage'da: PENCEREYE özel,
 * yenilemede korunur, aynı tarayıcının diğer sekmelerine bulaşmaz. Parametre adres
 * çubuğunda kalmasın diye hemen silinir.
 *
 * React render'ından ÖNCE çağrılmalı (bkz. main.tsx) — sekme şeridi ilk karede doğru
 * kararı versin.
 */
export function markAppWindowFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(APP_WINDOW_PARAM) !== '1') return;
    tabStorage.set(APP_WINDOW_KEY, '1');
    url.searchParams.delete(APP_WINDOW_PARAM);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  } catch { /* adres okunamadı — pencere normal sekme gibi davranır */ }
}

/**
 * Uygulamayı kendi penceresinde açar. Pencere ADLI olduğu için ikinci çağrı yeni bir
 * pencere açmaz, mevcudu öne getirir. Tarayıcı engellediyse false döner (çağıran taraf
 * kullanıcıya açıklama gösterir).
 */
export function openAppWindow(): boolean {
  const win = window.open(`${APP_WINDOW_ENTRY}?${APP_WINDOW_PARAM}=1`, APP_WINDOW_NAME, FEATURES);
  if (!win) return false;
  win.focus();
  return true;
}

let installEnabled = false;

/**
 * Masaüstü kurulumunu mümkün kılar: manifest bağlantısını head'e ekler ve kök kapsamlı
 * service worker'ı kaydeder.
 *
 * Service worker neden gerekli: tarayıcılar bir siteyi "kurulabilir" saymak için
 * manifest'in yanında fetch olayını dinleyen bir service worker arıyor. Mobil PWA'nın
 * service worker'ı yalnızca `/app/` kapsamında (bkz. vite.config.ts), yani masaüstü
 * panelin kendi kaydına ihtiyacı var. `public/panel-sw.js` bilerek asgari: sayfa
 * gezinmelerinde önce AĞA gider, cache'i yalnızca çevrimdışıyken yedek olarak kullanır —
 * eski index.html'in servis edilip boş ekran üretmesi riski (bkz. nginx.conf) böylece
 * ortadan kalkar.
 *
 * Geliştirmede kayıt yapılmaz: Vite HMR ile service worker'ı aynı anda çalıştırmak
 * teşhisi zor sorunlar üretiyor; geliştiricinin popup yolu zaten var.
 */
export function enableDesktopInstall(): void {
  if (installEnabled) return;
  installEnabled = true;

  if (!document.querySelector(`link[rel="manifest"][href="${MANIFEST_HREF}"]`)) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = MANIFEST_HREF;
    document.head.appendChild(link);
  }

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(PANEL_SW, { scope: '/' }).catch(() => {
      /* kurulum teklif edilemez, popup yolu çalışmaya devam eder */
    });
  }
}

// ---- Kurulum teklifi (beforeinstallprompt) ----

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

/**
 * `beforeinstallprompt` sayfa açılışında ve yalnızca BİR KEZ tetiklenir; olayı yakalayıp
 * saklamazsak kullanıcı düğmeye bastığında elimizde bir şey kalmaz. Bu yüzden dinleyici
 * React'tan bağımsız, giriş noktasında kurulur (bkz. main.tsx).
 */
export function startInstallCapture(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

export function subscribeInstall(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function canInstallApp(): boolean {
  return deferred !== null;
}

/** Kurulum penceresini açar. Kullanıcı kurmayı kabul ettiyse true. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  emit();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome === 'accepted';
  } catch {
    return false;
  }
}
