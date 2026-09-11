'use client';
import { Languages, Palette, Clock3, type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { PageTitle } from '@/components/app/primitives';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SoftSelect } from '@/components/app/soft-select';
import { usePreferences } from '@/components/app/preferences';
import { themes, isThemeName } from '@/config/themes';
import {
  calculationFor,
  prayerCalculationOptions,
} from '@/config/prayer-calculation';

function SettingRow({
  id,
  title,
  summary,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={id}>
      <AccordionTrigger className="items-center gap-4 rounded-xl px-5 py-6 text-base hover:no-underline sm:px-6">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          <span className="mt-1 block text-sm font-normal text-muted-foreground">
            {summary}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="h-auto px-5 pb-6 sm:px-6">
        <div className="border-t pt-5">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function Settings() {
  const {
    t,
    language,
    setLanguage,
    theme,
    setTheme,
    prayerCalculation,
    setPrayerCalculation,
    prayerSource,
    setPrayerSource,
  } = usePreferences();
  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageTitle
        title={t('Settings', 'सेटिंग्स')}
        description={t(
          'Your preferences, all in one place.',
          'आपकी पसंद, एक ही जगह।',
        )}
      />
      <Accordion className="neo-surface overflow-hidden rounded-2xl border bg-card">
        <SettingRow
          id="language"
          title={t('Language', 'भाषा')}
          summary={language === 'en' ? 'English' : 'हिन्दी'}
          icon={Languages}
        >
          <RadioGroup
            aria-label={t('App language', 'ऐप भाषा')}
            value={language}
            onValueChange={(v) => {
              if (v === 'en' || v === 'hi') setLanguage(v);
            }}
            className="grid-cols-2 gap-3"
          >
            {(
              [
                ['en', 'English'],
                ['hi', 'हिन्दी'],
              ] as const
            ).map(([id, label]) => (
              <label
                key={id}
                className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 has-data-checked:border-primary has-data-checked:bg-accent"
              >
                <RadioGroupItem value={id} />
                <span lang={id}>{label}</span>
              </label>
            ))}
          </RadioGroup>
        </SettingRow>
        <SettingRow
          id="theme"
          title={t('Color theme', 'रंग थीम')}
          summary={themes[theme].label}
          icon={Palette}
        >
          <RadioGroup
            aria-label={t('Color theme', 'रंग थीम')}
            value={theme}
            onValueChange={(v) => {
              if (typeof v === 'string' && isThemeName(v)) setTheme(v);
            }}
            className="grid-cols-1 gap-3 sm:grid-cols-3"
          >
            {Object.entries(themes).map(([id, value]) => (
              <label
                key={id}
                className="flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors has-data-checked:border-primary has-data-checked:bg-accent sm:flex-col"
              >
                <span
                  aria-hidden="true"
                  className="size-10 shrink-0 rounded-full shadow-inner"
                  style={{ background: value.colors.primary }}
                />
                <span className="flex items-center gap-2 text-sm font-medium">
                  <RadioGroupItem value={id} />
                  {value.label}
                </span>
              </label>
            ))}
          </RadioGroup>
        </SettingRow>
        <SettingRow
          id="prayer"
          title={t('Prayer settings', 'नमाज़ सेटिंग्स')}
          summary={
            prayerSource === 'mosque'
              ? t('Mosque timetable', 'मस्जिद समय-सारणी')
              : calculationFor(prayerCalculation).label
          }
          icon={Clock3}
        >
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-medium">
                {t('Timing source', 'समय का स्रोत')}
              </p>
              <SoftSelect
                label={t('Timing source', 'समय का स्रोत')}
                value={prayerSource}
                onChange={(v) => {
                  if (v === 'calculated' || v === 'mosque') setPrayerSource(v);
                }}
                className="w-full"
              >
                <option value="calculated">
                  {t('Calculated prayer times', 'गणना किए गए नमाज़ समय')}
                </option>
                <option value="mosque">
                  {t('Mosque timetable', 'मस्जिद समय-सारणी')}
                </option>
              </SoftSelect>
            </div>
            {prayerSource === 'calculated' && (
              <div>
                <p className="mb-2 text-sm font-medium">
                  {t('Calculation method', 'गणना विधि')}
                </p>
                <SoftSelect
                  label={t('Calculation method', 'गणना विधि')}
                  value={prayerCalculation}
                  onChange={(v) => {
                    const option = prayerCalculationOptions.find(
                      (option) => option.id === v,
                    );
                    if (option) setPrayerCalculation(option.id);
                  }}
                  className="w-full"
                >
                  {prayerCalculationOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </SoftSelect>
              </div>
            )}
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(
                'Calculated times change with your method. Jamaat times are always set by the mosque.',
                'गणना किए समय आपकी विधि के अनुसार बदलते हैं। जमात का समय हमेशा मस्जिद तय करती है।',
              )}
            </p>
          </div>
        </SettingRow>
      </Accordion>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        {t(
          'Preferences are saved automatically on this device.',
          'आपकी पसंद इस डिवाइस पर अपने आप सहेजी जाती है।',
        )}
      </p>
    </div>
  );
}
