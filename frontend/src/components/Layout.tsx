import { ReactNode, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { useMyTaxpayers } from '../taxpayers';
import { useDocumentTitle } from '../hooks';
import { navFor, pageIdentityFor, ROLE_LABEL, ROLE_PANEL_LABEL } from '../nav';
import { usePreferences } from '../preferences';
import { RightPanelProvider, useRightPanel } from '../rightPanel';
import { useTabTitle } from '../tabs';
import { TaxpayerSwitcher } from './TaxpayerSwitcher';
import { taxpayerColor } from '../utils/taxpayerColor';
import { NotificationBell } from './NotificationBell';
import { RightSidebar } from './RightSidebar';
import { ImpersonationBanner } from './ImpersonationBanner';
import { AiAssistant } from './AiAssistant';
import {
  ChevronRightIcon, LogoutIcon, MoonIcon, PinIcon, SettingsIcon, StarIcon, SunIcon,
} from './Icons';

function initialsFor(fullName?: string, email?: string): string {
  if (fullName?.trim()) {
    const parts = fullName.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return (email?.[0] ?? '?').toUpperCase();
}

/**
 * Pencere başlığını ve SEKME şeridindeki adı günceller. Ayrı bir bileşen olmasının sebebi
 * teknik: Layout içinde başlık, `if (!user) return null` erken çıkışından SONRA
 * hesaplanıyor; hook'u orada çağırmak koşullu hook olurdu ve kullanıcı oturumu
 * değiştiğinde React ağacı çökerdi.
 *
 * Pencere başlığını yalnızca AKTİF sekme yazar (bkz. hooks.ts useDocumentTitle); arka
 * plandaki sekmeler de canlı olduğu için aksi halde hepsi aynı anda başlığı ezerdi.
 */
function DocumentTitle({ taxpayer, page }: { taxpayer?: string | null; page: string }) {
  useDocumentTitle(taxpayer, page);
  useTabTitle(page, taxpayer ?? null);
  return null;
}

function TopbarTitle({ icon, title, path }: { icon: ReactNode; title: string; path: string }) {
  const { isFavorite, toggleFavorite } = useRightPanel();
  const isFav = isFavorite(path);
  return (
    <div className="topbar-title">
      <span className="topbar-title-icon">{icon}</span>
      <span className="title">{title}</span>
      <button type="button" className={`icon-btn sm topbar-fav ${isFav ? 'active' : ''}`}
        onClick={() => toggleFavorite(path, title)} title={isFav ? 'Favorilerden çıkar' : 'Bu sayfayı favorile'}>
        <StarIcon className={isFav ? 'pinned' : ''} />
      </button>
    </div>
  );
}

export function Layout() {
  const { user, profile, logout, activeTaxpayerId } = useAuth();
  const {
    sidebarLeftDocked: docked, setSidebarLeftDocked: setDocked, sidebarRightDocked,
    hideRightSidebar, resolvedTheme, toggleTheme,
  } = usePreferences();
  const [hovered, setHovered] = useState(false);
  const location = useLocation();
  const { current } = useMyTaxpayers();

  if (!user) return null;
  // Mükellefi olmayan müşavir sekmesi = ofis sekmesi (bkz. tabs.tsx).
  const links = navFor(user.role, !!activeTaxpayerId);
  const expanded = docked || hovered;
  const iconOnly = !expanded;
  // Sayfa adı ve ikonu menü tanımlarıyla aynı kaynaktan gelir; sekme şeridi de aynı
  // fonksiyonu kullanır (bkz. nav.tsx pageIdentityFor).
  const { title, icon: titleIcon } = pageIdentityFor(user.role, !!activeTaxpayerId, location.pathname);
  const tabColor = taxpayerColor(activeTaxpayerId);

  // Mükellef adı yalnızca müşavirin MÜKELLEF sekmesinde başlığa girer: ofis sekmesinde
  // bir mükellef yok, mükellef rolündeki kullanıcıda ise tek şirket olduğu için ad her
  // başlıkta tekrar eden gürültü olurdu.
  const tabTaxpayer = user.role === 'accountant' && activeTaxpayerId
    ? current?.taxpayer?.companyTitle
    : null;

  return (
    <RightPanelProvider userId={user.userId} currentPath={location.pathname} currentLabel={title}>
      <div className="app">
        <div className={`sidebar-rail ${docked ? 'docked' : ''}`}>
          <aside
            className={`sidebar ${docked ? 'docked' : 'floating'} ${expanded ? 'expanded' : ''} ${iconOnly ? 'icon-only' : ''}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <div className="sidebar-header">
              <div className="brand">
                <span className="brand-mark">M</span>
                <span className="brand-text">
                  <span className="brand-word">Maliyetik</span>
                  <span className="brand-sub">{ROLE_PANEL_LABEL[user.role]}</span>
                </span>
              </div>
              <button type="button" className="icon-btn sidebar-pin" onClick={() => setDocked(!docked)}
                title={docked ? 'Kenar çubuğunu otomatik gizle' : 'Kenar çubuğunu sabitle'}>
                <PinIcon className={docked ? 'pinned' : ''} />
              </button>
            </div>
            <nav className="thin-scroll">
              {links.map((section) => (
                <div key={section.label} className="nav-section">
                  <div className="nav-section-head">
                    <span className="nav-section-label">{section.label}</span>
                    <span className="nav-section-line" aria-hidden="true" />
                  </div>
                  {section.items.map((l) => (
                    <NavLink key={l.to} to={l.to} end={l.end} title={l.label}
                      className={({ isActive }) => (isActive ? 'active' : '')}>
                      {l.icon}
                      <span className="nav-label">{l.label}</span>
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
            <div className="spacer" />
            <Link to="/hesap" className={`sidebar-profile ${location.pathname.startsWith('/hesap') ? 'active' : ''}`}
              title={profile?.fullName || user.fullName || user.email}>
              <span className="sidebar-profile-avatar">
                {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : initialsFor(profile?.fullName || user.fullName, profile?.email || user.email)}
              </span>
              <span className="sidebar-profile-info">
                <span className="sidebar-profile-name">{profile?.fullName || user.fullName || user.email || ROLE_LABEL[user.role]}</span>
                <span className="sidebar-profile-email">{profile?.username ? `@${profile.username}` : (profile?.email || user.email)}</span>
              </span>
              <ChevronRightIcon className="sidebar-profile-chevron" />
            </Link>
            <button className="logout" onClick={logout} title="Çıkış">
              <LogoutIcon /> <span className="nav-label">Çıkış</span>
            </button>
            <span className="app-version">v{__APP_VERSION__}</span>
          </aside>
        </div>
        <DocumentTitle taxpayer={tabTaxpayer} page={title} />
        <div className="main">
          {/* Müşavir aynı anda birden fazla mükellefle çalışıyor; bu şerit hangi mükellefin
              sekmesinde olduğunu yazı okumadan gösterir — sekme şeridindeki renk noktasıyla
              aynı renk (bkz. utils/taxpayerColor.ts). */}
          {user.role === 'accountant' && tabColor && (
            <div className="tp-window-stripe" style={{ background: tabColor }} aria-hidden="true" />
          )}
          <header className="topbar">
            <TopbarTitle icon={titleIcon} title={title} path={location.pathname} />
            <div className="topbar-actions">
              {user.role === 'accountant' && <TaxpayerSwitcher />}
              {/* Sağ kenar çubuğu dock'u kapalıyken tema düğmesi buraya taşınır (bkz. RightSidebar.tsx). */}
              {(!sidebarRightDocked || hideRightSidebar) && (
                <button type="button" className="icon-btn" onClick={toggleTheme}
                  title={resolvedTheme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}>
                  {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
                </button>
              )}
              <Link to="/ayarlar" className={`icon-btn ${location.pathname.startsWith('/ayarlar') ? 'active' : ''}`}
                title="Ayarlar" aria-label="Ayarlar">
                <SettingsIcon />
              </Link>
              <NotificationBell />
            </div>
          </header>
          <ImpersonationBanner />
          <div className={`content ${docked ? 'content-full' : ''}`}>
            <Outlet />
          </div>
        </div>
        {!hideRightSidebar && <RightSidebar currentPath={location.pathname} currentLabel={title} />}
        {/* Yapay zeka deneyimi kapalıysa kendini hiç göstermez (bkz. ai.tsx useAiStatus). */}
        <AiAssistant />
      </div>
    </RightPanelProvider>
  );
}
