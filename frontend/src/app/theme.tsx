import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { appStorage } from '../api/client';

type ThemeChoice = 'system' | 'light' | 'dark';

interface ThemeState {
  choice: ThemeChoice;
  /** Sistem tercihi çözümlendikten sonra fiilen uygulanan tema. */
  resolved: 'light' | 'dark';
  setChoice: (c: ThemeChoice) => void;
}

const ThemeCtx = createContext<ThemeState>(null as unknown as ThemeState);
export const useTheme = () => useContext(ThemeCtx);

const STORAGE_KEY = 'theme';
const query = () => window.matchMedia('(prefers-color-scheme: dark)');

function load(): ThemeChoice {
  const raw = appStorage.get(STORAGE_KEY);
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

/**
 * Mobil uygulamanın teması. Masaüstündeki `preferences.tsx` bilinçli olarak kullanılmıyor:
 * o modül tercihi `PATCH /users/me` ile sunucuya da yazıyor ve kenar çubuğu sabitleme gibi
 * mobilde karşılığı olmayan alanlar taşıyor. Burada tercih yalnızca cihazda tutulur ve
 * varsayılan olarak sistem ayarını izler.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(load);
  const [systemDark, setSystemDark] = useState(() => query().matches);

  useEffect(() => {
    const mq = query();
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: 'light' | 'dark' = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
    // Adres/durum çubuğu rengi tema ile birlikte değişsin (Android Chrome).
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])')
      ?? Object.assign(document.createElement('meta'), { name: 'theme-color' });
    if (!meta.parentNode) document.head.appendChild(meta);
    meta.content = resolved === 'dark' ? '#0b1220' : '#ffffff';
  }, [resolved]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    if (c === 'system') appStorage.remove(STORAGE_KEY);
    else appStorage.set(STORAGE_KEY, c);
  }, []);

  return <ThemeCtx.Provider value={{ choice, resolved, setChoice }}>{children}</ThemeCtx.Provider>;
}
