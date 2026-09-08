'use client';
import { PreferencesProvider, usePreferences } from './preferences';
import { Brand } from './brand';
import { Button } from '@/components/ui/button';
import { PrayerHome, MosqueSelector } from '@/features/mosque/public-home';
function Home() {
  const { language, setLanguage, t } = usePreferences();
  return (
    <>
      <header className="border-b bg-card/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-5">
          <Brand />
          <Button
            variant="ghost"
            className="h-11"
            onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
          >
            {language === 'en' ? 'हिन्दी' : 'English'}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-5 pb-12 pt-8 sm:pt-12">
        <div className="mb-7">
          <p className="mb-2 text-xs uppercase tracking-[.18em] text-muted-foreground">
            {t('Your local mosque', 'आपकी स्थानीय मस्जिद')}
          </p>
          <MosqueSelector />
        </div>
        <PrayerHome />
        <p className="mt-9 text-center text-xs text-muted-foreground">
          {t(
            'Frontend preview · Sample timetable and data',
            'फ़्रंटएंड पूर्वावलोकन · नमूना समय और डेटा',
          )}
        </p>
      </main>
    </>
  );
}
export function FirstPreview() {
  return (
    <PreferencesProvider>
      <Home />
    </PreferencesProvider>
  );
}
