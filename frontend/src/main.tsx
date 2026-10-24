import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { App } from './App';
import { AuthProvider, useAuth } from './auth';
import { PreferencesProvider } from './preferences';
import { TaxpayersProvider } from './taxpayers';
import { MaintenanceProvider } from './maintenance';
import { DialogProvider } from './components/DialogProvider';
import { InstallAppPrompt } from './components/InstallAppPrompt';
import { TabbedWorkspace } from './components/TabbedWorkspace';
import { markAppWindowFromUrl, startInstallCapture } from './utils/appWindow';
import './index.css';

// React'tan ÖNCE: popup ile açılan pencere kendini işaretler, kurulum teklifi olayı
// (beforeinstallprompt yalnızca bir kez tetiklenir) yakalanır. Bkz. utils/appWindow.ts.
markAppWindowFromUrl();
startInstallCapture();

/**
 * Herkese açık yüzey: anasayfa, giriş/kayıt akışı, ücretsiz araçlar ve profil sayfaları.
 * Bunlar adres tabanlı tek sayfa olarak çalışır — ziyaretçinin sekme şeridiyle işi yok,
 * adreslerin paylaşılabilir ve indekslenebilir kalması ise şart.
 */
const PUBLIC_PREFIXES = ['/login', '/kayit', '/dogrula', '/sifre-sifirla', '/araclar', '/u/'];

function isPublicSurface(pathname: string): boolean {
  return pathname === '/' || PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

/**
 * Herkese açık kabuktan panele geçişi yakalar.
 *
 * `BrowserRouter`'ın İÇİNDE durur, çünkü geçiş çoğu zaman bir istemci tarafı gezinmesiyle
 * olur (girişten sonraki yönlendirme, anasayfadaki "Panele Git"): adres değişir ama dıştaki
 * kabuk bunu duymaz. Burada duyulur ve kabuk sekmeli pencereye devreder.
 */
function PanelHandoff({ onEnter }: { onEnter: () => void }) {
  const { user } = useAuth();
  const location = useLocation();
  useEffect(() => {
    if (user && !isPublicSurface(location.pathname)) onEnter();
  }, [user, location.pathname, onEnter]);
  return null;
}

/**
 * Uygulama iki kabuktan birinde çalışır ve İKİSİ AYNI ANDA MOUNT OLMAZ:
 *
 *  - PANEL: sekmeli uygulama penceresi. Her sekme kendi `MemoryRouter`'ını taşır
 *    (bkz. TabbedWorkspace).
 *  - HERKESE AÇIK: tek bir `BrowserRouter` ile klasik tek sayfa.
 *
 * Ayrım şart: react-router bir `<Router>`'ın içinde ikinci bir `<Router>` render
 * edilmesine izin vermiyor. Bu yüzden dışta kalıcı bir router YOK — hangi kabuk
 * gerekiyorsa o kuruluyor.
 */
function Shell() {
  const { user } = useAuth();
  const [handoff, setHandoff] = useState(false);

  // Çıkışta panel kabuğu bırakılır; sonraki girişte karar yeniden verilir.
  useEffect(() => { if (!user) setHandoff(false); }, [user]);

  // İlk açılışta karar adresten verilir (yer imi, kısayol, uygulama ikonu); sonraki
  // geçişleri PanelHandoff bildirir.
  if (user && (handoff || !isPublicSurface(window.location.pathname))) {
    return <TabbedWorkspace />;
  }

  return (
    <BrowserRouter>
      <PanelHandoff onEnter={() => setHandoff(true)} />
      <App />
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MaintenanceProvider>
      <AuthProvider>
        <PreferencesProvider>
          <TaxpayersProvider>
            <DialogProvider>
              <Shell />
              <InstallAppPrompt />
            </DialogProvider>
          </TaxpayersProvider>
        </PreferencesProvider>
      </AuthProvider>
    </MaintenanceProvider>
  </React.StrictMode>,
);
