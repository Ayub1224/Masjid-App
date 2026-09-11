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
import {
  prayerCalculationOptions,
  type PrayerCalculationId,
} from '@/config/prayer-calculation';
type PrayerSource = 'calculated' | 'mosque';
type Preferences = {
  prayerSource: PrayerSource;
  setPrayerSource: (v: PrayerSource) => void;
  theme: ThemeName;
  setTheme: (v: ThemeName) => void;
  language: 'en' | 'hi';
  setLanguage: (v: 'en' | 'hi') => void;
  t: (en: string, hi: string) => string;
  prayerCalculation: PrayerCalculationId;
  setPrayerCalculation: (v: PrayerCalculationId) => void;
};
const Context = createContext<Preferences | null>(null);
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(defaultTheme);
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [prayerCalculation, setPrayerCalculation] =
    useState<PrayerCalculationId>('karachi-hanafi');
  const [prayerSource, setPrayerSource] = useState<PrayerSource>('calculated');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const source = localStorage.getItem('mosque-prayer-source');
        if (source === 'calculated' || source === 'mosque')
          setPrayerSource(source);
        const saved = localStorage.getItem('mosque-theme');
        if (saved && isThemeName(saved)) setTheme(saved);
        if (localStorage.getItem('mosque-language') === 'hi') setLanguage('hi');
        const calculation = localStorage.getItem(
          'mosque-prayer-calculation',
        ) as PrayerCalculationId | null;
        if (
          calculation &&
          prayerCalculationOptions.some((option) => option.id === calculation)
        )
          setPrayerCalculation(calculation);
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
      localStorage.setItem('mosque-prayer-source', prayerSource);
      localStorage.setItem('mosque-theme', theme);
      localStorage.setItem('mosque-language', language);
      localStorage.setItem('mosque-prayer-calculation', prayerCalculation);
    } catch {}
  }, [theme, language, prayerCalculation, prayerSource, ready]);
  return (
    <Context.Provider
      value={{
        prayerSource,
        setPrayerSource,
        theme,
        setTheme,
        language,
        setLanguage,
        t: (en, hi) => (language === 'hi' ? hi : en),
        prayerCalculation,
        setPrayerCalculation,
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
