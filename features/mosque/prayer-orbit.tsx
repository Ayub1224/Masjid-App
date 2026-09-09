'use client';
import { useId, useState } from 'react';
import { getPosition } from 'suncalc';
import { Pause, Play, MapPin } from 'lucide-react';
import { type Prayer, mosque } from '@/config/mosque';
import { usePreferences } from '@/components/app/preferences';
import { prayerInterval, countdown } from '@/lib/prayer/clock';
export function PrayerOrbit({
  prayers,
  now,
  calendar,
  calculated = false,
}: {
  prayers: Prayer[];
  now: Date | null;
  calendar?: { offset: number; prayers: Prayer[] }[];
  calculated?: boolean;
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
    ? getPosition(
        now,
        mosque.coordinates.latitude,
        mosque.coordinates.longitude,
      )
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="orbit-toggle"
          aria-label={t('Countdown target', 'उलटी गिनती का लक्ष्य')}
        >
          {(['jamaat', 'adhan'] as const).map((v) => (
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
        <svg viewBox="0 0 360 332" className="w-full overflow-visible">
          <defs>
            <radialGradient
              id={`${id}-earth`}
              cx={`${sun ? 50 + Math.sin((sun.azimuth * Math.PI) / 180) * 35 : 30}%`}
              cy={day ? '20%' : '75%'}
              r="80%"
            >
              <stop offset="0%" stopColor="var(--orbit-land)" />
              <stop offset="52%" stopColor="var(--primary)" />
              <stop offset="100%" stopColor="var(--orbit-night)" />
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
          {prayers.map((p, i) => {
            const fraction = minuteOf(p[mode]) / 1440;
            const inner = point(fraction, 73),
              outer = point(fraction, 130),
              label = point(fraction, i % 2 ? 144 : 151);
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
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="11"
                  fill="var(--muted-foreground)"
                >
                  {name(p)}
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
            <g
              fill="var(--orbit-land)"
              opacity=".68"
              className="orbit-continents"
            >
              <path d="M129 125l15-14 20 2 6 9-7 11 9 6-4 14-15-1-6 11-15-8 3-15-10-6z M158 158l16 6 9 12-7 12-3 18-9 12-8-16-1-16-9-13z M188 119l15-7 20 8 11 14-8 12-13-2-9 10-9-4-4-15-10-7z M191 153l15 1 9 14-7 16-8 15-10-11-5-18z M223 190l11-5 14 9-7 12-16-3z" />
            </g>
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
            y="324"
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
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-sm text-muted-foreground">
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
      <details className="mt-3 text-sm text-muted-foreground">
        <summary className="min-h-11 cursor-pointer py-2">
          {t('About this display', 'इस दृश्य के बारे में')}
        </summary>
        <p className="pb-2">
          {t(
            'The dotted ring is a 24-hour clock: each spoke marks a prayer, and the glowing marker shows the current time. Globe lighting uses the estimated sun position for Durg. Calculated starts use Adhan JS (Karachi / Hanafi); mosque confirmation is pending. Jamaat times remain samples. This is not a prayer-validity guide.',
            'बिंदुओं का घेरा 24 घंटे की घड़ी है: रेखाएँ नमाज़ों के समय और चमकता बिंदु वर्तमान समय दिखाते हैं। ग्लोब का प्रकाश दुर्ग की अनुमानित सूर्य स्थिति पर आधारित है। गणना Adhan JS (कराची / हनफ़ी) से है; मस्जिद की पुष्टि बाकी है। जमात के समय नमूने हैं। यह नमाज़ की वैध अवधि का मार्गदर्शक नहीं है।',
          )}
        </p>
      </details>
    </section>
  );
}
