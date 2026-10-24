import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { App } from '../App';
import { panelPathFor, TaxpayerScopeProvider, useAuth } from '../auth';
import { usePreferences } from '../preferences';
import {
  AppTab, activateByIndex, activateRelative, bootTabs, closeTab, getTabs, openHomeTab,
  registerTabNavigator, setTabPath, setTabTaxpayer, TabScopeProvider, useTabs,
} from '../tabs';
import { enableDesktopInstall } from '../utils/appWindow';
import { TabStrip } from './TabStrip';

/**
 * Sekmeli uygulama penceresi.
 *
 * Her sekme kendi `MemoryRouter`'ını taşır — yani kendi adres geçmişini, kendi ileri/geri
 * yığınını ve (mount kaldığı için) kendi sayfa durumunu. Tarayıcının adresi yalnızca
 * AKTİF sekmeyi yansıtır (aşağıdaki TabRouteSync): sekme değiştirmek gerçek bir gezinme
 * olmadığı için `replaceState` ile yazılır, geçmişe kayıt bırakmaz.
 *
 * Sekme içerikleri kapanana kadar mount kalır; görünmeyenler `content-visibility: hidden`
 * ile boyanmaz (bkz. index.css). Bu, `display: none`'dan farklı olarak scroll konumunu ve
 * bileşen ağacını korur — sekmeye dönmek anlıktır.
 */
export function TabbedWorkspace() {
  const { user } = useAuth();
  const { landingPage } = usePreferences();
  const { tabs, activeId } = useTabs();
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  // Sekmeleri kur. Render'dan hemen sonra (layout efektinde) çalışır ki ilk boyamada
  // sekme şeridi zaten dolu olsun.
  useLayoutEffect(() => {
    if (!user) return;
    const url = new URL(window.location.href);
    const urlTaxpayerId = url.searchParams.get('mukellef');
    url.searchParams.delete('mukellef');
    const search = url.searchParams.toString();
    bootTabs({
      userId: user.userId,
      role: user.role,
      homePath: panelPathFor(user.role, landingPage),
      // Mükellef rolünde her sekme kendi şirketine bağlıdır; müşavirin yeni sekmesi
      // ofis sekmesidir (mükellefi olmayan sekme = ofis, bkz. tabs.tsx).
      homeTaxpayerId: user.role === 'taxpayer' ? user.taxpayerId ?? null : null,
      urlPath: `${url.pathname}${search ? `?${search}` : ''}`,
      urlTaxpayerId,
    });
  }, [user, landingPage]);

  // Kurulum teklifi ancak panele girildikten sonra tanıtılır (bkz. utils/appWindow.ts).
  useEffect(() => { enableDesktopInstall(); }, []);

  /**
   * Şerit yüksekliği CSS'e değişken olarak verilir: sabit bir sayı yazmak,
   * pencere kontrolleri şeridin içine bindiğinde (window-controls-overlay) ve arayüz
   * ölçeği büyütüldüğünde yanlış olurdu. Kenar çubuğunun `sticky` yüksekliği buna bağlı.
   */
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const root = rootRef.current;
    if (!strip || !root) return;
    const apply = () => root.style.setProperty('--tabstrip-h', `${strip.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);

  /**
   * Klavye kısayolları. Ctrl+T/Ctrl+W bilerek KULLANILMADI: tarayıcı bunları kendi
   * sekmesi/penceresi için ayırıyor ve engellenemiyorlar — kurulmuş uygulama
   * penceresinde bile Ctrl+W pencereyi kapatır. Alt tabanlı kısayollar her iki modda
   * da bize ulaşıyor.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 't') { e.preventDefault(); openHomeTab(); return; }
        if (key === 'w') { e.preventDefault(); closeTab(getTabs().activeId); return; }
        if (e.code.startsWith('Digit')) {
          const n = Number(e.code.slice(5));
          if (n >= 1 && n <= 9) { e.preventDefault(); activateByIndex(n - 1); }
        }
        return;
      }
      if (e.ctrlKey && e.key === 'Tab') { e.preventDefault(); activateRelative(e.shiftKey ? -1 : 1); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // İlk layout efekti sekmeleri kurana kadar (tek kare) boş.
  if (!tabs.length) return null;

  return (
    <div className="tabbed-window" ref={rootRef}>
      <div ref={stripRef}><TabStrip /></div>
      <div className="tab-panes">
        {/* Yalnızca bir kez açılmış sekmeler mount edilir (bkz. AppTab.loaded). */}
        {tabs.filter((t) => t.loaded).map((tab) => (
          <TabPane key={tab.id} tab={tab} active={tab.id === activeId} />
        ))}
      </div>
    </div>
  );
}

function TabPane({ tab, active }: { tab: AppTab; active: boolean }) {
  // `initialEntries` yalnızca mount anında okunur — sekmenin sonraki gezintileri kendi
  // geçmişinde birikir. Sekme tembel yüklendiği için buradaki adres, sekme ilk kez
  // etkinleştirildiği andaki adrestir (geri yüklenen oturumda: kapatılırkenki sayfa).
  const initialEntries = useRef([tab.path]).current;
  const setTaxpayer = useCallback((id: string | null) => setTabTaxpayer(tab.id, id), [tab.id]);

  return (
    <div className={`tab-pane thin-scroll ${active ? 'active' : ''}`}>
      <TabScopeProvider tabId={tab.id} active={active}>
        {/* Mükellef bağlamı SEKME başına: bir sekmede mükellef değiştirmek diğerlerini
            etkilemez (bkz. auth.tsx useAuth). */}
        <TaxpayerScopeProvider taxpayerId={tab.taxpayerId} onChange={setTaxpayer}>
          <MemoryRouter initialEntries={initialEntries}>
            <TabRouteSync tabId={tab.id} active={active} taxpayerId={tab.taxpayerId} />
            <App />
          </MemoryRouter>
        </TaxpayerScopeProvider>
      </TabScopeProvider>
    </div>
  );
}

/**
 * Sekmenin router'ı ile sekme deposunu birbirine bağlar:
 *  - gezinilen adres depoya yazılır (şerit başlığı + yenilemede geri yükleme),
 *  - sekmenin `navigate`'i kaydedilir (şeritten/başka sekmeden yönlendirme),
 *  - aktif sekmenin adresi tarayıcının adres çubuğuna yansıtılır.
 *
 * Adres çubuğu `replaceState` ile yazılır, dıştaki router'a haber verilmez: haber
 * verilseydi çalışma alanı yeniden kurulur ve tüm sekmeler mount'unu kaybederdi.
 * Adres yine de doğru kalır — yenileme/paylaşım o sayfayı açar.
 */
function TabRouteSync({ tabId, active, taxpayerId }: { tabId: string; active: boolean; taxpayerId: string | null }) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = `${location.pathname}${location.search}`;

  useEffect(() => registerTabNavigator(tabId, (to) => navigate(to)), [tabId, navigate]);

  useEffect(() => { setTabPath(tabId, path); }, [tabId, path]);

  useEffect(() => {
    if (!active) return;
    const url = taxpayerId
      ? `${path}${path.includes('?') ? '&' : '?'}mukellef=${encodeURIComponent(taxpayerId)}`
      : path;
    window.history.replaceState(null, '', url);
  }, [active, path, taxpayerId]);

  return null;
}
