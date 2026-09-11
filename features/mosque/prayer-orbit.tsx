'use client';
import { useId, useState } from 'react';
import { getPosition } from 'suncalc';
import { Pause, Play, MapPin, Clock3, CalendarDays } from 'lucide-react';
import { type Prayer, mosque } from '@/config/mosque';
import { usePreferences } from '@/components/app/preferences';
import { prayerInterval, countdown } from '@/lib/prayer/clock';
export function PrayerOrbit({
  prayers,
  now,
  calendar,
  calculated = false,
  visitor = false,
  coordinates = mosque.coordinates,
}: {
  prayers: Prayer[];
  now: Date | null;
  calendar?: { offset: number; prayers: Prayer[] }[];
  calculated?: boolean;
  visitor?: boolean;
  coordinates?: { latitude: number; longitude: number };
}) {
  const { t, language } = usePreferences();
  const [mode, setMode] = useState<'adhan' | 'jamaat'>('adhan');
  const [paused, setPaused] = useState(false);
  const id = useId().replaceAll(':', '');
  const interval = now
    ? prayerInterval(
        prayers,
        now,
        mode,
        mode === 'adhan' ? calendar : undefined,
      )
    : null;
  const sun = now
    ? getPosition(now, coordinates.latitude, coordinates.longitude)
    : null;
  const day = !!sun && sun.altitude >= 0;
  const minuteOf = (value: string) => {
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  };
  const local = now
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: mosque.timezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).format(now)
    : '00:00:00';
  const [hour, minute, second] = local.split(':').map(Number);
  const position = (hour * 60 + minute + second / 60) / 1440;
  const point = (fraction: number, radius: number) => ({
    x: 180 + Math.sin(fraction * Math.PI * 2) * radius,
    y: 166 - Math.cos(fraction * Math.PI * 2) * radius,
  });
  const marker = point(position, 113);
  const name = (p: Prayer) => (language === 'hi' ? p.hindi : p.name);
  const time = (value: string) => {
    const [h, m] = value.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  return (
    <section
      className={`prayer-orbit ${paused ? 'orbit-paused' : ''}`}
      aria-label={t(
        'Prayer countdown and sun position',
        'नमाज़ की उलटी गिनती और सूर्य की स्थिति',
      )}
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5" />
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
      <div className="mb-5 flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <MapPin size={14} />
          {t('Durg sky', 'दुर्ग का आकाश')}
        </span>
        <span>
          {sun
            ? day
              ? t('Sun above the horizon', 'सूर्य क्षितिज के ऊपर')
              : t('Sun below the horizon', 'सूर्य क्षितिज के नीचे')
            : '—'}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="orbit-toggle"
          aria-label={t('Countdown target', 'उलटी गिनती का लक्ष्य')}
        >
          {(visitor
            ? (['adhan'] as const)
            : (['jamaat', 'adhan'] as const)
          ).map((v) => (
            <button
              type="button"
              key={v}
              aria-pressed={mode === v}
              onClick={() => setMode(v)}
            >
              {v === 'jamaat'
                ? t('Jamaat', 'जमात')
                : calculated
                  ? t('Prayer start', 'नमाज़ आरंभ')
                  : t('Adhan', 'अज़ान')}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="orbit-motion"
          aria-pressed={paused}
          aria-label={
            paused
              ? t('Resume decorative motion', 'सजावटी गति चालू करें')
              : t('Pause decorative motion', 'सजावटी गति रोकें')
          }
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
      </div>
      <div className="mt-6 flex items-end justify-between gap-3">
        <div>
          <p className="mb-1 text-sm text-muted-foreground">
            {mode === 'jamaat'
              ? t('Next jamaat', 'अगली जमात')
              : calculated
                ? t('Next prayer', 'अगली नमाज़')
                : t('Next adhan', 'अगली अज़ान')}
            {interval?.tomorrow ? ' · ' + t('Tomorrow', 'कल') : ''}
          </p>
          <h1 className="font-heading text-4xl text-primary sm:text-5xl">
            {interval ? name(interval.next.prayer) : '—'}
          </h1>
        </div>
        <p className="pb-1 text-xl font-medium tabular-nums text-primary sm:text-2xl">
          {interval ? time(interval.next.prayer[mode]) : '—'}
        </p>
      </div>
      <div className="orbit-dial" aria-hidden="true">
        <svg viewBox="0 0 360 350" className="w-full overflow-visible">
          <defs>
            <radialGradient id={`${id}-shade`} cx="32%" cy="28%" r="75%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity=".16" />
              <stop offset="55%" stopColor="#051723" stopOpacity="0" />
              <stop offset="100%" stopColor="#020c17" stopOpacity=".75" />
            </radialGradient>
            <radialGradient
              id={`${id}-earth`}
              cx={`${sun ? 50 + Math.sin(sun.azimuth) * 35 : 30}%`}
              cy={day ? '20%' : '75%'}
              r="80%"
            >
              <stop offset="0%" stopColor="#397e98" />
              <stop offset="52%" stopColor="#15415d" />
              <stop offset="100%" stopColor="#061a30" />
            </radialGradient>
            <radialGradient id={`${id}-sun`}>
              <stop
                offset="0%"
                stopColor="var(--orbit-sun)"
                stopOpacity=".55"
              />
              <stop
                offset="100%"
                stopColor="var(--orbit-sun)"
                stopOpacity="0"
              />
            </radialGradient>
            <clipPath id={`${id}-clip`}>
              <circle cx="180" cy="166" r="64" />
            </clipPath>
          </defs>
          <circle
            cx="180"
            cy="166"
            r="101"
            fill="none"
            stroke="var(--border)"
            strokeWidth=".7"
          />
          <circle
            cx="180"
            cy="166"
            r="126"
            fill="none"
            stroke="var(--border)"
            strokeWidth=".7"
          />
          {Array.from({ length: 120 }, (_, i) => {
            const p = point(i / 120, 113);
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={i % 5 === 0 ? 2 : 1.15}
                fill={i / 120 <= position ? 'var(--primary)' : 'var(--border)'}
                opacity={i / 120 <= position ? 0.7 : 1}
              />
            );
          })}
          {prayers.map((p) => {
            const fraction = minuteOf(p[mode]) / 1440;
            const inner = point(fraction, 73),
              outer = point(fraction, 130),
              label = point(fraction, 145),
              labelX = label.x < 160 ? 28 : label.x > 200 ? 332 : label.x,
              labelAnchor =
                label.x < 160 ? 'end' : label.x > 200 ? 'start' : 'middle';
            return (
              <g key={p.id}>
                <title>
                  {name(p)} {time(p[mode])}
                </title>
                <line
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke="var(--primary)"
                  opacity=".4"
                  strokeDasharray="1 5"
                  strokeLinecap="round"
                />
                {p.id === 'sunrise' ||
                p.id === 'dhuhr' ||
                p.id === 'maghrib' ? (
                  <g
                    transform={`translate(${outer.x - 7},${outer.y - 7})`}
                    fill="none"
                    stroke={
                      interval?.next.prayer.id === p.id
                        ? 'var(--orbit-sun)'
                        : 'var(--primary)'
                    }
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  >
                    <circle cx="7" cy="7" r="3.2" fill="var(--background)" />
                    {p.id === 'dhuhr' ? (
                      <>
                        <path d="M7 1V3M7 11V13M1 7H3M11 7H13M2.7 2.7l1.4 1.4M9.9 9.9l1.4 1.4M11.3 2.7l-1.4 1.4M4.1 9.9l-1.4 1.4" />
                      </>
                    ) : p.id === 'sunrise' ? (
                      <path d="M1.5 9.5h11M3.5 7.5a3.5 3.5 0 0 1 7 0M7 1v2M2.7 3.2l1.2 1.2M11.3 3.2l-1.2 1.2" />
                    ) : (
                      <path d="M1.5 8.5h11M3.5 6.5a3.5 3.5 0 0 1 7 0M7 1v2M2.7 2.2l1.2 1.2M11.3 2.2l-1.2 1.2" />
                    )}
                  </g>
                ) : (
                  <circle
                    cx={outer.x}
                    cy={outer.y}
                    r="3"
                    fill={
                      interval?.next.prayer.id === p.id
                        ? 'var(--orbit-sun)'
                        : 'var(--primary)'
                    }
                  />
                )}
                <text
                  x={labelX}
                  y={label.y}
                  textAnchor={labelAnchor}
                  dominantBaseline="middle"
                  fontSize="12"
                  fill="var(--muted-foreground)"
                >
                  {name(p)}
                </text>
                <text
                  x={labelX}
                  y={label.y + 15}
                  textAnchor={labelAnchor}
                  dominantBaseline="middle"
                  fontSize="10"
                  fill="var(--muted-foreground)"
                  opacity=".82"
                >
                  {time(p[mode])}
                </text>
              </g>
            );
          })}
          <circle
            cx="180"
            cy="166"
            r="71"
            fill="var(--background)"
            className="orbit-globe-rim"
          />
          <circle cx="180" cy="166" r="64" fill={`url(#${id}-earth)`} />
          <g clipPath={`url(#${id}-clip)`}>
            <g
              fill="none"
              stroke="var(--orbit-land)"
              strokeWidth=".6"
              opacity=".23"
            >
              <ellipse cx="180" cy="166" rx="28" ry="64" />
              <ellipse cx="180" cy="166" rx="52" ry="64" />
              <path d="M116 166H244 M124 138Q180 120 236 138 M124 194Q180 212 236 194" />
            </g>
            <image
              href="/earth-land.svg"
              x="116"
              y="102"
              width="128"
              height="128"
            />
            <circle cx="180" cy="166" r="64" fill={`url(#${id}-shade)`} />
          </g>
          {now && (
            <g transform={`translate(${marker.x},${marker.y})`}>
              <circle r="23" fill={`url(#${id}-sun)`} className="orbit-glow" />
              <circle
                r="9"
                fill={day ? 'var(--orbit-sun)' : 'var(--primary)'}
                stroke="var(--background)"
                strokeWidth="3"
              />
              {!day && <circle cx="3" cy="-3" r="4" fill="var(--background)" />}
            </g>
          )}
          <text
            x="180"
            y="16"
            textAnchor="middle"
            fontSize="10"
            letterSpacing="2"
            fill="var(--muted-foreground)"
          >
            00:00
          </text>
          <text
            x="180"
            y="344"
            textAnchor="middle"
            fontSize="10"
            letterSpacing="2"
            fill="var(--muted-foreground)"
          >
            12:00
          </text>
        </svg>
      </div>
      <div className="relative mt-1 text-center">
        <p className="text-sm text-muted-foreground">
          {t('Time remaining', 'शेष समय')}
        </p>
        <p
          className="my-1 font-mono text-4xl font-medium tabular-nums tracking-tight text-primary sm:text-5xl"
          role="timer"
          aria-live="off"
        >
          {interval ? countdown(interval.remainingSeconds) : '--:--:--'}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('hours · minutes · seconds', 'घंटे · मिनट · सेकंड')}
        </p>
      </div>
      <div className="mt-6">
        <progress
          className="sr-only"
          max={100}
          value={Math.round((interval?.progress ?? 0) * 100)}
          aria-label={t(
            'Progress between scheduled prayers',
            'निर्धारित नमाज़ों के बीच प्रगति',
          )}
        />
        <div className="orbit-track" aria-hidden="true">
          <span style={{ width: `${(interval?.progress ?? 0) * 100}%` }} />
        </div>
        <div className="mt-2 flex justify-between gap-4 text-sm text-muted-foreground">
          <span>
            {interval
              ? `${name(interval.previous.prayer)} · ${time(interval.previous.prayer[mode])}`
              : '—'}
          </span>
          <span className="text-right">
            {interval
              ? `${name(interval.next.prayer)} · ${time(interval.next.prayer[mode])}`
              : '—'}
          </span>
        </div>
      </div>
      <details className="mt-3 text-sm text-muted-foreground">
        <summary className="min-h-11 cursor-pointer py-2">
          {t('About this display', 'इस दृश्य के बारे में')}
        </summary>
        <p className="pb-2">
          {t(
            'The dotted ring is a 24-hour clock: each spoke marks a prayer, and the glowing marker shows the current time. Globe lighting uses the estimated sun position for Durg. Calculated starts follow your selected method. Jamaat times follow the mosque timetable. This is not a prayer-validity guide.',
            'बिंदुओं का घेरा 24 घंटे की घड़ी है: रेखाएँ नमाज़ों के समय और चमकता बिंदु वर्तमान समय दिखाते हैं। ग्लोब का प्रकाश दुर्ग की अनुमानित सूर्य स्थिति पर आधारित है। गणना आपकी चुनी हुई विधि से है। जमात का समय मस्जिद की समय-सारणी के अनुसार है। यह नमाज़ की वैध अवधि का मार्गदर्शक नहीं है।',
          )}
        </p>
      </details>
    </section>
  );
}
