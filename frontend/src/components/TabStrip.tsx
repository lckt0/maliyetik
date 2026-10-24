import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { pageIdentityFor } from '../nav';
import {
  AppTab, activateTab, closeOtherTabs, closeTab, closeTabsToRight, duplicateTab,
  moveTab, openHomeTab, useTabs,
} from '../tabs';
import { useMyTaxpayers } from '../taxpayers';
import { taxpayerColor } from '../utils/taxpayerColor';
import {
  canInstallApp, isAppWindow, openAppWindow, promptInstall, subscribeInstall,
} from '../utils/appWindow';
import { DownloadIcon, ExternalWindowIcon, PlusIcon, XIcon } from './Icons';

interface MenuState { tabId: string; x: number; y: number; }

/**
 * Pencerenin sekme şeridi.
 *
 * Şerit uygulamanın en üstünde, içeriğin DIŞINDA durur: her sekmenin kendi kenar
 * çubuğu, üst barı ve sayfası vardır (bkz. TabbedWorkspace) — şerit bir seviye
 * yukarıdadır, tıpkı bir tarayıcı penceresinde olduğu gibi.
 *
 * Sekme etiketi müşavirde MÜKELLEF ADIYLA başlar: dar bir sekmede yalnızca başlangıç
 * görünür ve ayırt edici olan mükelleftir — "Evraklar" yazan üç sekme birbirinden
 * ayrılmaz (pencere başlığındaki aynı karar, bkz. hooks.ts useDocumentTitle).
 */
export function TabStrip() {
  const { user } = useAuth();
  const { tabs, activeId, notice } = useTabs();
  const { active: authorizations } = useMyTaxpayers();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [installable, setInstallable] = useState(canInstallApp());
  const [popupBlocked, setPopupBlocked] = useState(false);
  const ownWindow = isAppWindow();

  useEffect(() => subscribeInstall(() => setInstallable(canInstallApp())), []);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    // `capture`: menü öğesinin kendi onClick'i çalıştıktan sonra kapansın diye değil,
    // menü dışına yapılan İLK tıklamayı kaçırmamak için (sayfa içi bileşenler tıklamayı
    // yutabiliyor).
    window.addEventListener('mousedown', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  /**
   * Sekmede mükellef adı YALNIZCA müşavirde yazılır: mükellef rolündeki kullanıcının tek
   * şirketi var, her sekmede aynı adı tekrarlamak yer kaplayan gürültü olurdu (pencere
   * başlığındaki aynı karar, bkz. hooks.ts useDocumentTitle).
   */
  function taxpayerNameFor(tab: AppTab): string | null {
    if (!tab.taxpayerId || user?.role !== 'accountant') return null;
    const found = authorizations.find((a) => a.taxpayerId === tab.taxpayerId);
    return found?.taxpayer?.companyTitle ?? tab.taxpayerTitle ?? 'Mükellef';
  }

  async function onAppWindowClick() {
    if (installable) {
      const accepted = await promptInstall();
      if (accepted) return;
    }
    if (!openAppWindow()) setPopupBlocked(true);
  }

  return (
    <div className="tabstrip">
      <div className="tabstrip-tabs thin-scroll" role="tablist" aria-label="Açık sekmeler">
        {tabs.map((tab, index) => {
          const name = taxpayerNameFor(tab);
          const color = name ? taxpayerColor(tab.taxpayerId) : null;
          const identity = user ? pageIdentityFor(user.role, !!tab.taxpayerId, tab.path) : null;
          const isActive = tab.id === activeId;
          return (
            <div
              key={tab.id}
              role="tab"
              tabIndex={0}
              aria-selected={isActive}
              title={name ? `${name} · ${tab.title}` : tab.title}
              className={`tab ${isActive ? 'active' : ''} ${dragging === tab.id ? 'dragging' : ''}`}
              draggable
              onDragStart={(e) => { setDragging(tab.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => { if (dragging && dragging !== tab.id) moveTab(dragging, index); }}
              onClick={() => activateTab(tab.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateTab(tab.id); } }}
              // Orta tık kapatır (tarayıcı alışkanlığı). auxclick, mousedown'daki
              // otomatik kaydırma imlecini tetiklemeden çalışır.
              onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id); } }}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ tabId: tab.id, x: e.clientX, y: e.clientY }); }}
            >
              <span className="tab-mark" aria-hidden="true">
                {color
                  ? <span className="tp-dot" style={{ background: color }} />
                  : <span className="tab-icon">{identity?.icon}</span>}
              </span>
              <span className="tab-text">
                {name && <span className="tab-taxpayer">{name}</span>}
                <span className="tab-page">{tab.title}</span>
              </span>
              <button
                type="button"
                className="tab-close"
                aria-label={`${tab.title} sekmesini kapat`}
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
              >
                <XIcon />
              </button>
            </div>
          );
        })}
        <button type="button" className="tab-new" onClick={() => openHomeTab()}
          title="Yeni sekme (Alt+T)" aria-label="Yeni sekme">
          <PlusIcon />
        </button>
      </div>

      <div className="tabstrip-actions">
        {!ownWindow && (
          <button type="button" className="tabstrip-window-btn" onClick={onAppWindowClick}
            title={installable
              ? 'Maliyetik’i uygulama olarak kurun — kendi penceresinde, adres çubuğu olmadan açılır'
              : 'Uygulamayı kendi penceresinde aç'}>
            {installable ? <DownloadIcon /> : <ExternalWindowIcon />}
            <span>{installable ? 'Uygulamayı Kur' : 'Kendi Penceresinde Aç'}</span>
          </button>
        )}
      </div>

      {menu && (
        <div className="tab-menu" style={{ left: menu.x, top: menu.y }} role="menu"
          onMouseDown={(e) => e.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => { duplicateTab(menu.tabId); setMenu(null); }}>
            Sekmeyi çoğalt
          </button>
          <button type="button" role="menuitem" onClick={() => { closeTab(menu.tabId); setMenu(null); }}>
            Sekmeyi kapat
          </button>
          <button type="button" role="menuitem" onClick={() => { closeOtherTabs(menu.tabId); setMenu(null); }}>
            Diğer sekmeleri kapat
          </button>
          <button type="button" role="menuitem" onClick={() => { closeTabsToRight(menu.tabId); setMenu(null); }}>
            Sağdaki sekmeleri kapat
          </button>
        </div>
      )}

      {(notice || popupBlocked) && (
        <div className="tabstrip-notice" role="status">
          {notice ?? 'Tarayıcı yeni pencereyi engelledi. Adres çubuğundaki açılır pencere iznini verip tekrar deneyin.'}
          {popupBlocked && (
            <button type="button" className="icon-btn sm" aria-label="Kapat" onClick={() => setPopupBlocked(false)}>
              <XIcon />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
