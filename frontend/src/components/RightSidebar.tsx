import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePreferences } from '../preferences';
import { useRightPanel, RecentItem } from '../rightPanel';
import { NotesPanel } from './NotesPanel';
import { relativeTime } from '../utils/time';
import {
  ClockIcon, MoonIcon, NoteIcon, PinIcon, SettingsIcon, StarIcon, SunIcon, XIcon,
} from './Icons';

interface Props {
  currentPath: string;
  currentLabel: string;
}

/** Sağ kenar çubuğu: tema, son gezilen sayfalar, favoriler ve kişisel notlar. */
export function RightSidebar({ currentPath, currentLabel }: Props) {
  // `resolvedTheme`: kullanıcı 'sistem' seçtiyse o an gerçekten uygulanan tema.
  const { resolvedTheme, toggleTheme, sidebarRightDocked: docked, setSidebarRightDocked: setDocked } = usePreferences();
  const {
    recent, favorites, sections,
    isFavorite, toggleFavorite, removeFavorite, pinRecentAsFavorite, toggleSection,
  } = useRightPanel();
  const [hovered, setHovered] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const expanded = docked || hovered;
  const iconOnly = !expanded;
  const isFav = isFavorite(currentPath);

  return (
    <div className={`right-sidebar-rail ${docked ? 'docked' : ''}`}>
      <aside
        className={`right-sidebar ${docked ? 'docked' : 'floating'} ${expanded ? 'expanded' : ''} ${iconOnly ? 'icon-only' : ''}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setSettingsOpen(false); }}
      >
        <div className="rs-header">
          <span className="rs-title">Panelim</span>
          <div className="rs-header-actions">
            {/* Dock kapalıyken tema düğmesi üst bara (zil ikonunun yanına) taşınır — bkz. Layout.tsx. */}
            {docked && (
              <button type="button" className="icon-btn" onClick={toggleTheme}
                title={resolvedTheme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}>
                {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
              </button>
            )}
            <button type="button" className="icon-btn" onClick={() => setSettingsOpen((v) => !v)} title="Kişiselleştir">
              <SettingsIcon />
            </button>
            <button type="button" className="icon-btn rs-pin" onClick={() => setDocked(!docked)}
              title={docked ? 'Kenar çubuğunu otomatik gizle' : 'Kenar çubuğunu sabitle'}>
              <PinIcon className={docked ? 'pinned' : ''} />
            </button>
          </div>
        </div>

        {settingsOpen && (
          <div className="rs-settings-pop">
            <p className="rs-settings-title">Görünür bölümler</p>
            <label className="checkbox-field"><input type="checkbox" checked={sections.favorites} onChange={() => toggleSection('favorites')} /> Favori Sayfalar</label>
            <label className="checkbox-field"><input type="checkbox" checked={sections.recent} onChange={() => toggleSection('recent')} /> Son İşlemler</label>
            <label className="checkbox-field"><input type="checkbox" checked={sections.notes} onChange={() => toggleSection('notes')} /> Notlarım</label>
          </div>
        )}

        {iconOnly ? (
          <div className="rs-icon-rail">
            <span className="rs-icon-item"><StarIcon className={isFav ? 'pinned' : ''} /></span>
            <span className="rs-icon-item"><ClockIcon /></span>
            <span className="rs-icon-item"><NoteIcon /></span>
          </div>
        ) : (
          <div className="rs-body thin-scroll">
            <button type="button" className={`btn secondary sm rs-fav-toggle ${isFav ? 'active' : ''}`}
              onClick={() => toggleFavorite(currentPath, currentLabel)}>
              <StarIcon className={isFav ? 'pinned' : ''} /> {isFav ? 'Favorilerden çıkar' : 'Bu sayfayı favorile'}
            </button>

            {sections.favorites && (
              <div className="rs-section">
                <div className="rs-section-head"><StarIcon /> <span>Favori Sayfalar</span></div>
                {favorites.length === 0 && <p className="rs-empty">Henüz favori sayfa yok.</p>}
                <ul className="rs-list">
                  {favorites.map((f) => (
                    <li key={f.path} className="rs-item">
                      <Link to={f.path} className="rs-item-link">
                        <span className="rs-item-label">{f.label}</span>
                      </Link>
                      <button type="button" className="icon-btn sm" title="Kaldır" onClick={() => removeFavorite(f.path)}>
                        <XIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sections.recent && (
              <div className="rs-section">
                <div className="rs-section-head"><ClockIcon /> <span>Son İşlemler</span></div>
                {recent.length === 0 && <p className="rs-empty">Henüz gezinti geçmişi yok.</p>}
                <ul className="rs-list">
                  {recent.map((r: RecentItem) => (
                    <li key={r.path} className="rs-item">
                      <Link to={r.path} className="rs-item-link">
                        <span className="rs-item-label">{r.label}</span>
                        <span className="rs-item-time">{relativeTime(r.ts)}</span>
                      </Link>
                      <button type="button" className="icon-btn sm" title="Favorile" onClick={() => pinRecentAsFavorite(r)}>
                        <PinIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sections.notes && (
              <div className="rs-section">
                <div className="rs-section-head"><NoteIcon /> <span>Notlarım</span></div>
                {/* Notlar sunucuda: hatırlatıcı kurulabiliyor ve cihazlar arası senkron (bkz. notes.tsx). */}
                <NotesPanel variant="compact" />
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
