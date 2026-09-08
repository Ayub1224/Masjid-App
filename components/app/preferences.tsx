'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import {
  defaultTheme,
  isThemeName,
  themeVariables,
  type ThemeName,
} from '@/config/themes';
type Preferences = {
  theme: ThemeName;
  setTheme: (v: ThemeName) => void;
  language: 'en' | 'hi';
  setLanguage: (v: 'en' | 'hi') => void;
  t: (en: string, hi: string) => string;
};
const Context = createContext<Preferences | null>(null);
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(defaultTheme);
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem('mosque-theme');
        if (saved && isThemeName(saved)) setTheme(saved);
        if (localStorage.getItem('mosque-language') === 'hi') setLanguage('hi');
      } catch {}
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!ready) return;
    Object.entries(themeVariables(theme)).forEach(([k, v]) =>
      document.documentElement.style.setProperty(k, v),
    );
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = language;
    try {
      localStorage.setItem('mosque-theme', theme);
      localStorage.setItem('mosque-language', language);
    } catch {}
  }, [theme, language, ready]);
  return (
    <Context.Provider
      value={{
        theme,
        setTheme,
        language,
        setLanguage,
        t: (en, hi) => (language === 'hi' ? hi : en),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePreferences() {
  const c = useContext(Context);
  if (!c) throw Error('Preferences provider missing');
  return c;
}
