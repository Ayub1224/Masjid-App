'use client';
/* oxlint-disable next/no-img-element -- optional event images are user-managed content and may be remote. */
import Link from 'next/link';
import { PrayerOrbit } from './prayer-orbit';
import { SoftSelect } from '@/components/app/soft-select';
import { mosqueDate, scheduleCalendar } from '@/lib/prayer/calculated';
import type { Notice } from '@/lib/data/domain';
import { useEffect, useMemo, useState } from 'react';
import { Clock3, CalendarDays, Megaphone, MoonStar } from 'lucide-react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { initialPrayers, mosque, type Prayer } from '@/config/mosque';
import { usePreferences } from '@/components/app/preferences';
import { Modal } from '@/components/app/primitives';
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
  estimated = false,
}: {
  member?: boolean;
  prayers?: Prayer[];
  notices?: Notice[];
  estimated?: boolean;
}) {
  const { t, language } = usePreferences();
  const timetable = prayers.length ? prayers : initialPrayers;
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setNow(new Date()));
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(id);
      cancelAnimationFrame(frame);
    };
  }, []);
  const [source, setSource] = useState('calculated');
  const date = now ? mosqueDate(now) : null;
  const calendar = useMemo(
    () =>
      date && source === 'calculated'
        ? scheduleCalendar(date, timetable)
        : undefined,
    [date, source, timetable],
  );
  const shownPrayers =
    calendar?.find((d) => d.offset === 0)?.prayers ?? timetable;
  const next = now
    ? nextPrayer(shownPrayers, now)
    : { prayer: timetable[1], tomorrow: false };
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
      <SoftSelect
        label={t('Prayer timing source', 'नमाज़ समय का स्रोत')}
        value={source}
        onChange={setSource}
        className="w-full"
      >
        <option value="calculated">
          {t(
            'Calculated starts · Karachi / Hanafi',
            'गणना किए समय · कराची / हनफ़ी',
          )}
        </option>
        <option value="mosque">
          {t('Mosque timetable', 'मस्जिद समय-सारणी · डेमो')}
        </option>
      </SoftSelect>
      <PrayerOrbit
        prayers={shownPrayers}
        now={now}
        calendar={calendar}
        calculated={source === 'calculated'}
      />
      {estimated && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          General prayer times shown until the mosque publishes its Jamaat timetable.
        </p>
      )}
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
                  <th className="py-3 font-normal">
                    {source === 'calculated'
                      ? t('Calculated start', 'गणना किया समय')
                      : t('Adhan', 'अज़ान')}
                  </th>
                  <th className="py-3 text-right font-normal">
                    {t('Jamaat', 'जमात')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {shownPrayers.map((row) => (
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
                'Calculated starts: Adhan JS, Karachi / Hanafi, approximate Durg coordinates. Method awaits mosque confirmation. Jamaat times are samples; Jumu’ah awaits confirmation.',
                'गणना: Adhan JS, कराची / हनफ़ी, दुर्ग के अनुमानित निर्देशांक। विधि की पुष्टि बाकी है। जमात के समय नमूने हैं; जुमा की पुष्टि बाकी है।',
              )}
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      {member && (
        <Link href="/contribute" className="soft-action-link">
          {t('Make a contribution', 'योगदान करें')}
        </Link>
      )}
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
                <button
                  type="button"
                  key={n.id}
                  className="event-row w-full border-b pb-4 text-left last:border-0 last:pb-0"
                  onClick={() => setSelectedNotice(n)}
                >
                  <p className="font-medium">
                    {language === 'hi' ? n.hindiTitle || n.title : n.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {language === 'hi' ? n.hindiBody || n.body : n.body}
                  </p>
                </button>
              ))}
            {!notices.some((n) => n.published) && (
              <p className="text-sm text-muted-foreground">
                {t('No announcements right now.', 'अभी कोई सूचना नहीं है।')}
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <Modal
        open={!!selectedNotice}
        onOpenChange={(open) => !open && setSelectedNotice(null)}
        title={
          selectedNotice
            ? language === 'hi'
              ? selectedNotice.hindiTitle || selectedNotice.title
              : selectedNotice.title
            : ''
        }
        description={selectedNotice?.date}
      >
        {selectedNotice && (
          <div className="space-y-4">
            {selectedNotice.image && (
              <img
                src={selectedNotice.image}
                alt=""
                className="max-h-64 w-full rounded-xl object-cover"
              />
            )}
            <p className="whitespace-pre-wrap text-base leading-7">
              {language === 'hi'
                ? selectedNotice.hindiBody || selectedNotice.body
                : selectedNotice.body}
            </p>
          </div>
        )}
      </Modal>
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
      <SoftSelect
        id="mosque"
        label={t('Your mosque', 'आपकी मस्जिद')}
        className="w-full"
        defaultValue="local"
      >
        <option value="local">{mosque.name}</option>
      </SoftSelect>
    </div>
  );
}
