'use client';
/* oxlint-disable next/no-img-element -- optional event images are user-managed content and may be remote. */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/data/api';
import type { MosqueDetails } from '@/lib/mosque-details';
import { PrayerOrbit } from './prayer-orbit';
import { SoftSelect } from '@/components/app/soft-select';
import { mosqueDate, scheduleCalendar } from '@/lib/prayer/calculated';
import type { Notice } from '@/lib/data/domain';
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Megaphone, MoonStar } from 'lucide-react';
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
  visitor = false,
  member = false,
  prayers = [],
  notices = [],
}: {
  visitor?: boolean;
  member?: boolean;
  prayers?: Prayer[];
  notices?: Notice[];
}) {
  const {
    t,
    language,
    prayerCalculation,
    prayerSource: source,
  } = usePreferences();
  const details = useQuery({
    queryKey: ['mosque-details'],
    queryFn: () => api<MosqueDetails | null>('mosque'),
  });
  const coordinates = details.data ?? mosque.coordinates;
  const timetable = useMemo(
    () =>
      visitor
        ? [
            ...initialPrayers.map((p) => ({ ...p, jamaat: '' })),
            {
              id: 'sunrise',
              name: 'Sunrise',
              hindi: 'सूर्योदय',
              adhan: '',
              jamaat: '',
            },
          ].sort(
            (a, b) =>
              ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].indexOf(
                a.id,
              ) -
              ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].indexOf(
                b.id,
              ),
          )
        : prayers,
    [visitor, prayers],
  );
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
  const date = now ? mosqueDate(now) : null;
  const calendar = useMemo(
    () =>
      date && timetable.length > 0 && (visitor || source === 'calculated')
        ? scheduleCalendar(date, timetable, prayerCalculation, coordinates)
        : undefined,
    [date, source, timetable, prayerCalculation, visitor, coordinates],
  );
  const shownPrayers =
    calendar?.find((d) => d.offset === 0)?.prayers ?? timetable;
  const next = now
    ? nextPrayer(shownPrayers, now)
    : { prayer: timetable[1], tomorrow: false };
  const p = next.prayer;
  return (
    <div className="space-y-5">
      {shownPrayers.length > 0 ? (
        <>
          <PrayerOrbit
            prayers={shownPrayers}
            visitor={visitor}
            coordinates={coordinates}
            now={now}
            calendar={calendar}
            calculated={visitor || source === 'calculated'}
          />
          {details.data && prayers.length > 0 && (
            <Accordion className="overflow-hidden rounded-xl border bg-card">
              <AccordionItem value="prayers">
                <AccordionTrigger className="items-center px-5 py-5 text-base hover:no-underline">
                  <span className="flex items-center gap-3">
                    <CalendarDays className="size-5 text-primary" />
                    {visitor
                      ? t('Prayer periods', 'नमाज़ अवधि')
                      : t("Today's prayer times", 'आज की नमाज़ का समय')}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-5">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-3 font-normal">
                          {t('Prayer', 'नमाज़')}
                        </th>
                        <th className="py-3 font-normal">
                          {visitor || source === 'calculated'
                            ? t('Calculated start', 'गणना किया समय')
                            : t('Adhan', 'अज़ान')}
                        </th>
                        <th className="py-3 text-right font-normal">
                          {visitor ? t('Until', 'तक') : t('Jamaat', 'जमात')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownPrayers.map((row, index) => (
                        <tr
                          key={row.id}
                          className={
                            row.id === p?.id
                              ? 'bg-accent text-primary'
                              : 'border-b last:border-0'
                          }
                        >
                          <td className="py-3 font-medium">
                            {language === 'hi' ? row.hindi : row.name}
                          </td>
                          <td className="tabular-nums">
                            {displayTime(row.adhan)}
                          </td>
                          <td className="text-right font-medium tabular-nums">
                            {displayTime(
                              visitor
                                ? (shownPrayers[index + 1]?.adhan ??
                                    calendar?.find((d) => d.offset === 1)
                                      ?.prayers[0]?.adhan ??
                                    shownPrayers[0].adhan)
                                : row.jamaat,
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-4 text-xs text-muted-foreground">
                    {t(
                      `Calculated starts: Adhan JS, ${prayerCalculation === 'karachi-shafai' ? 'Karachi / Shafi' : 'Karachi / Hanafi'}, approximate Durg coordinates. Jamaat times follow the mosque timetable.`,
                      'गणना आपकी चुनी हुई विधि और दुर्ग के अनुमानित निर्देशांक पर आधारित है। जमात का समय मस्जिद की समय-सारणी के अनुसार है।',
                    )}
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </>
      ) : (
        <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          {t(
            'Prayer times have not been published yet. Please check with the mosque.',
            'नमाज़ के समय अभी प्रकाशित नहीं हुए हैं। कृपया मस्जिद से संपर्क करें।',
          )}
        </p>
      )}

      {member && (
        <Link href="/contribute" className="soft-action-link">
          {t('Make a contribution', 'योगदान करें')}
        </Link>
      )}
      {details.data && notices.some((n) => n.published) && (
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
      )}
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
      {details.data && (
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <MoonStar className="size-3.5" />
          {t(
            'Hijri date awaiting local confirmation',
            'हिजरी तारीख की स्थानीय पुष्टि बाकी है',
          )}
        </p>
      )}
    </div>
  );
}
export function MosqueSelector() {
  const { data } = useQuery({
    queryKey: ['mosque-details'],
    queryFn: () => api<MosqueDetails | null>('mosque'),
  });
  const { t } = usePreferences();
  if (!data) return null;
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
        <option value="local">{data?.name ?? mosque.name}</option>
      </SoftSelect>
    </div>
  );
}
