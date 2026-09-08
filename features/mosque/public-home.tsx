'use client';
import Link from 'next/link';
import type { Notice } from '@/lib/data/domain';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Clock3,
  CalendarDays,
  Megaphone,
  MapPin,
  ChevronDown,
  MoonStar,
  Sun,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { initialPrayers, mosque, type Prayer } from '@/config/mosque';
import { usePreferences } from '@/components/app/preferences';
export const displayTime = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
export function nextPrayer(prayers: Prayer[], now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: mosque.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const candidate = prayers.find((p) => p.jamaat > parts);
  return { prayer: candidate ?? prayers[0], tomorrow: !candidate };
}
export function PrayerHome({
  member = false,
  prayers = initialPrayers,
  notices = [],
}: {
  member?: boolean;
  prayers?: Prayer[];
  notices?: Notice[];
}) {
  const { t, language } = usePreferences();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setNow(new Date()));
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => {
      clearInterval(id);
      cancelAnimationFrame(frame);
    };
  }, []);
  const next = now
    ? nextPrayer(prayers, now)
    : { prayer: prayers[1], tomorrow: false };
  const p = next.prayer;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {now
            ? new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
                timeZone: mosque.timezone,
                weekday: 'short',
                day: 'numeric',
                month: 'long',
              }).format(now)
            : '—'}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock3 className="size-3.5" />
          {now
            ? new Intl.DateTimeFormat('en-IN', {
                timeZone: mosque.timezone,
                hour: 'numeric',
                minute: '2-digit',
              }).format(now)
            : '—'}{' '}
          <span className="text-xs">IST</span>
        </span>
      </div>
      <div className="rounded-2xl bg-primary px-6 py-7 text-primary-foreground shadow-sm sm:px-8">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-[.18em] opacity-80">
            {t('Next jamaat', 'अगली जमात')}
            {next.tomorrow ? ' · ' + t('Tomorrow', 'कल') : ''}
          </span>
          <Sun className="size-5 opacity-70" strokeWidth={1.5} />
        </div>
        <div className="flex items-end justify-between gap-3">
          <h1 className="font-heading text-4xl sm:text-5xl">
            {language === 'hi' ? p.hindi : p.name}
          </h1>
          <p className="text-3xl font-medium tabular-nums tracking-tight sm:text-4xl">
            {displayTime(p.jamaat).split(' ')[0]}
            <span className="ml-1.5 text-sm opacity-75">
              {displayTime(p.jamaat).split(' ')[1]}
            </span>
          </p>
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-primary-foreground/20 pt-4 text-sm opacity-85">
          <span>
            {t('Adhan', 'अज़ान')} {displayTime(p.adhan)}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5" />
            {t('At your mosque', 'आपकी मस्जिद में')}
          </span>
        </div>
      </div>
      <Accordion className="overflow-hidden rounded-xl border bg-card">
        <AccordionItem value="prayers">
          <AccordionTrigger className="items-center px-5 py-5 text-base hover:no-underline">
            <span className="flex items-center gap-3">
              <CalendarDays className="size-5 text-primary" />
              {t("Today's prayer times", 'आज की नमाज़ का समय')}
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-5 pb-5">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-3 font-normal">{t('Prayer', 'नमाज़')}</th>
                  <th className="py-3 font-normal">{t('Adhan', 'अज़ान')}</th>
                  <th className="py-3 text-right font-normal">
                    {t('Jamaat', 'जमात')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {prayers.map((row) => (
                  <tr
                    key={row.id}
                    className={
                      row.id === p.id
                        ? 'bg-accent text-primary'
                        : 'border-b last:border-0'
                    }
                  >
                    <td className="py-3 font-medium">
                      {language === 'hi' ? row.hindi : row.name}
                    </td>
                    <td className="tabular-nums">{displayTime(row.adhan)}</td>
                    <td className="text-right font-medium tabular-nums">
                      {displayTime(row.jamaat)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 text-xs text-muted-foreground">
              {t(
                'Sample timetable · Jumu’ah schedule to be confirmed.',
                'नमूना समय-सारणी · जुमा के समय की पुष्टि बाकी है।',
              )}
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <Button
        className="h-12 w-full text-base"
        render={<Link href={member ? '/contribute' : '/login'} />}
      >
        {t(
          member ? 'Make a contribution' : 'Member login',
          member ? 'योगदान करें' : 'सदस्य लॉगिन',
        )}
        <ArrowRight className="ml-2 size-4" />
      </Button>
      <Accordion className="overflow-hidden rounded-xl border bg-card">
        <AccordionItem value="news">
          <AccordionTrigger className="items-center px-5 py-5 text-base hover:no-underline">
            <span className="flex items-center gap-3">
              <Megaphone className="size-5 text-primary" />
              {t('News & events', 'समाचार और कार्यक्रम')}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {notices.filter((n) => n.published).length}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 px-5 pb-5">
            {notices
              .filter((n) => n.published)
              .map((n) => (
                <div
                  key={n.id}
                  className="border-b pb-4 last:border-0 last:pb-0"
                >
                  <p className="font-medium">
                    {language === 'hi' ? n.hindiTitle || n.title : n.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {language === 'hi' ? n.hindiBody || n.body : n.body}
                  </p>
                </div>
              ))}
            {!notices.some((n) => n.published) && (
              <p className="text-sm text-muted-foreground">
                {t('No announcements right now.', 'अभी कोई सूचना नहीं है।')}
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <MoonStar className="size-3.5" />
        {t(
          'Hijri date awaiting local confirmation',
          'हिजरी तारीख की स्थानीय पुष्टि बाकी है',
        )}
      </p>
    </div>
  );
}
export function MosqueSelector() {
  const { t } = usePreferences();
  return (
    <div className="relative">
      <label htmlFor="mosque" className="sr-only">
        {t('Your mosque', 'आपकी मस्जिद')}
      </label>
      <select
        id="mosque"
        className="h-12 w-full appearance-none rounded-xl border bg-card pl-4 pr-10 text-sm font-medium"
      >
        <option>{mosque.name}</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-4 size-4 text-muted-foreground" />
    </div>
  );
}
