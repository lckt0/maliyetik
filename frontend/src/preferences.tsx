import { createContext, ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './auth';
import { apiPatch } from './api/client';
import { UiPreferences } from './types';

export type ThemeSetting = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';
export type PageSize = 10 | 20 | 50 | 100;
export type LandingPage = 'home' | 'documents' | 'upload';

type Preferences = Required<UiPreferences>;

const STORAGE_KEY = 'ui-preferences';

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  sidebarLeftDocked: true,
  sidebarRightDocked: false,
  uiScale: 1,
  density: 'comfortable',
  pageSize: 20,
  reduceMotion: false,
  landingPage: 'home',
  hideRightSidebar: false,
  emailReminders: true,
  emailDocumentActivity: false,
  aiExperience: true,
};

export const UI_SCALE_MIN = 0.85;
export const UI_SCALE_MAX = 1.4;

function clampScale(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return DEFAULT_PREFERENCES.uiScale;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, n));
}

/** Kaydedilmiş/gelen kısmi tercihleri güvenli, tam bir nesneye indirger. */
function normalize(raw: Partial<Preferences> | undefined, base: Preferences): Preferences {
  if (!raw) return base;
  return {
    theme: raw.theme === 'dark' || raw.theme === 'light' || raw.theme === 'system' ? raw.theme : base.theme,
    sidebarLeftDocked: raw.sidebarLeftDocked ?? base.sidebarLeftDocked,
    sidebarRightDocked: raw.sidebarRightDocked ?? base.sidebarRightDocked,
    uiScale: raw.uiScale == null ? base.uiScale : clampScale(raw.uiScale),
    density: raw.density === 'compact' || raw.density === 'comfortable' ? raw.density : base.density,
    pageSize: ([10, 20, 50, 100] as const).includes(raw.pageSize as PageSize) ? (raw.pageSize as PageSize) : base.pageSize,
    reduceMotion: raw.reduceMotion ?? base.reduceMotion,
    landingPage: raw.landingPage === 'documents' || raw.landingPage === 'upload' || raw.landingPage === 'home'
      ? raw.landingPage : base.landingPage,
    hideRightSidebar: raw.hideRightSidebar ?? base.hideRightSidebar,
    emailReminders: raw.emailReminders ?? base.emailReminders,
    emailDocumentActivity: raw.emailDocumentActivity ?? base.emailDocumentActivity,
    aiExperience: raw.aiExperience ?? base.aiExperience,
  };
}

/**
 * Mali müşavir varsayılan olarak SIKIŞIK yoğunlukla açılır: gün boyu tablo tarayan,
 * Luca alışkanlığı olan bir kullanıcı için ekranda tek seferde görülebilen satır sayısı
 * rahat aralıktan daha değerli. Kullanıcı Ayarlar'dan değiştirdiği anda tercihi kaydedilir
 * ve bu varsayılan bir daha uygulanmaz.
 */
function roleDefaults(): Preferences {
  try {
    const raw = localStorage.getItem('user');
    const role = raw ? (JSON.parse(raw) as { role?: string }).role : undefined;
    if (role === 'accountant') return { ...DEFAULT_PREFERENCES, density: 'compact', pageSize: 50 };
  } catch { /* okunamadı — genel varsayılan */ }
  return DEFAULT_PREFERENCES;
}

function loadCached(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw) as Partial<Preferences>, roleDefaults());
  } catch { /* düş: varsayılanlara devam */ }
  // Eski sürümden kalan bağımsız anahtar (theme.tsx / eski sidebar state'leri).
  const legacyTheme = localStorage.getItem('theme');
  if (legacyTheme === 'dark' || legacyTheme === 'light') {
    return { ...roleDefaults(), theme: legacyTheme };
  }
  return roleDefaults();
}

interface Ctx extends Preferences {
  /** Uygulanan gerçek tema — 'system' seçiliyken işletim sisteminin o anki tercihi. */
  resolvedTheme: 'light' | 'dark';
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  setPreferences: (patch: Partial<Preferences>) => void;
  resetPreferences: () => void;
  /** Üst bardaki hızlı düğme — açık/koyu arasında geçiş yapar (system'i terk eder). */
  toggleTheme: () => void;
  setSidebarLeftDocked: (v: boolean) => void;
  setSidebarRightDocked: (v: boolean) => void;
}

const PreferencesCtx = createContext<Ctx | null>(null);

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/**
 * Arayüz tercihleri — localStorage'da anında, oturum açıksa sunucuda kalıcı
 * (`users.ui_preferences`, cihazlar arası senkron). Panel > Ayarlar sayfası bu
 * bağlamı düzenler; tema/ölçek/yoğunluk/animasyon doğrudan `<html>` üzerine
 * uygulanır, böylece tüm CSS tek yerden etkilenir.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [prefs, setPrefs] = useState<Preferences>(loadCached);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const appliedProfileId = useRef<string | null>(null);

  // 'system' seçiliyken işletim sistemi teması değişirse anında takip et.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme: 'light' | 'dark' = prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : prefs.theme;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.density = prefs.density;
    root.dataset.reduceMotion = prefs.reduceMotion ? 'true' : 'false';
    // Kök yazı boyutu: tüm rem tabanlı ölçüler bununla birlikte büyür/küçülür.
    root.style.setProperty('--ui-scale', String(prefs.uiScale));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs, resolvedTheme]);

  // Sunucudaki tercihleri profil ilk yüklendiğinde uygula (cihazlar arası senkron); sonraki
  // yerel değişiklikleri ezmemek için kullanıcı başına yalnızca bir kez.
  useEffect(() => {
    if (!profile || appliedProfileId.current === profile.userId) return;
    appliedProfileId.current = profile.userId;
    if (profile.uiPreferences) setPrefs((prev) => normalize(profile.uiPreferences ?? undefined, prev));
  }, [profile]);

  const value = useMemo<Ctx>(() => {
    function persist(patch: Partial<Preferences>) {
      setPrefs((prev) => ({ ...prev, ...patch }));
      if (user) apiPatch('/users/me/preferences', patch).catch(() => undefined);
    }
    return {
      ...prefs,
      resolvedTheme,
      setPreference: (key, val) => persist({ [key]: val } as Partial<Preferences>),
      setPreferences: persist,
      resetPreferences: () => persist(DEFAULT_PREFERENCES),
      toggleTheme: () => persist({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' }),
      setSidebarLeftDocked: (v) => persist({ sidebarLeftDocked: v }),
      setSidebarRightDocked: (v) => persist({ sidebarRightDocked: v }),
    };
  }, [prefs, resolvedTheme, user]);

  return <PreferencesCtx.Provider value={value}>{children}</PreferencesCtx.Provider>;
}

export function usePreferences(): Ctx {
  const ctx = useContext(PreferencesCtx);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
