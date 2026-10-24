import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export interface FavItem { path: string; label: string; }
export interface RecentItem { path: string; label: string; ts: number; }
export interface SectionVisibility { recent: boolean; favorites: boolean; notes: boolean; }

const DEFAULT_SECTIONS: SectionVisibility = { recent: true, favorites: true, notes: true };
const RECENT_LIMIT = 8;

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

interface RightPanelState {
  recent: RecentItem[];
  favorites: FavItem[];
  sections: SectionVisibility;
  isFavorite: (path: string) => boolean;
  toggleFavorite: (path: string, label: string) => void;
  removeFavorite: (path: string) => void;
  pinRecentAsFavorite: (item: RecentItem) => void;
  toggleSection: (key: keyof SectionVisibility) => void;
}

const RightPanelCtx = createContext<RightPanelState | null>(null);

/**
 * Sağ panel verileri (son işlemler, favoriler) — kullanıcı bazlı localStorage'da tutulur.
 * NOT: notlar buradan çıkarıldı; sunucuda tutuluyor (bkz. notes.tsx) — cihazlar arası
 * senkron olmaları ve hatırlatıcı kurulabilmesi için.
 */
export function RightPanelProvider({ userId, currentPath, currentLabel, children }: {
  userId: string; currentPath: string; currentLabel: string; children: ReactNode;
}) {
  const [recent, setRecent] = useState<RecentItem[]>(() => loadJSON(`rsidebar-recent:${userId}`, []));
  const [favorites, setFavorites] = useState<FavItem[]>(() => loadJSON(`rsidebar-favorites:${userId}`, []));
  const [sections, setSections] = useState<SectionVisibility>(() => loadJSON(`rsidebar-sections:${userId}`, DEFAULT_SECTIONS));

  useEffect(() => { saveJSON(`rsidebar-recent:${userId}`, recent); }, [recent, userId]);
  useEffect(() => { saveJSON(`rsidebar-favorites:${userId}`, favorites); }, [favorites, userId]);
  useEffect(() => { saveJSON(`rsidebar-sections:${userId}`, sections); }, [sections, userId]);

  useEffect(() => {
    if (!currentPath) return;
    setRecent((prev) => {
      const filtered = prev.filter((r) => r.path !== currentPath);
      return [{ path: currentPath, label: currentLabel, ts: Date.now() }, ...filtered].slice(0, RECENT_LIMIT);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const value = useMemo<RightPanelState>(() => ({
    recent,
    favorites,
    sections,
    isFavorite: (path) => favorites.some((f) => f.path === path),
    toggleFavorite: (path, label) => setFavorites((prev) => (
      prev.some((f) => f.path === path) ? prev.filter((f) => f.path !== path) : [{ path, label }, ...prev]
    )),
    removeFavorite: (path) => setFavorites((prev) => prev.filter((f) => f.path !== path)),
    pinRecentAsFavorite: (item) => setFavorites((prev) => (
      prev.some((f) => f.path === item.path) ? prev : [{ path: item.path, label: item.label }, ...prev]
    )),
    toggleSection: (key) => setSections((prev) => ({ ...prev, [key]: !prev[key] })),
  }), [recent, favorites, sections]);

  return <RightPanelCtx.Provider value={value}>{children}</RightPanelCtx.Provider>;
}

export function useRightPanel(): RightPanelState {
  const ctx = useContext(RightPanelCtx);
  if (!ctx) throw new Error('useRightPanel must be used within RightPanelProvider');
  return ctx;
}
