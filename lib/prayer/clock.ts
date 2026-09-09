import type { Prayer } from '@/config/mosque';
// This mosque uses Asia/Kolkata: UTC+05:30, with no daylight saving.
const DAY = 86400000,
  OFFSET = 19800000;
export function prayerInterval(
  prayers: Prayer[],
  now: Date,
  mode: 'adhan' | 'jamaat',
  calendar?: { offset: number; prayers: Prayer[] }[],
) {
  const instant = now.getTime();
  if (!Number.isFinite(instant)) return null;
  const midnight = Math.floor((instant + OFFSET) / DAY) * DAY - OFFSET;
  const events = (calendar ?? [-1, 0, 1].map((offset) => ({ offset, prayers })))
    .flatMap(({ offset: day, prayers: daily }) =>
      daily
        .filter((p) => /^([01]\d|2[0-3]):[0-5]\d$/.test(p[mode]))
        .map((prayer) => {
          const [h, m] = prayer[mode].split(':').map(Number);
          return { prayer, at: midnight + day * DAY + (h * 60 + m) * 60000 };
        }),
    )
    .sort((a, b) => a.at - b.at);
  const next = events.find((e) => e.at > instant);
  const previous = events.filter((e) => e.at <= instant).at(-1);
  if (!next || !previous) return null;
  return {
    next,
    previous,
    remainingSeconds: Math.ceil((next.at - instant) / 1000),
    progress: Math.max(
      0,
      Math.min(1, (instant - previous.at) / (next.at - previous.at)),
    ),
    tomorrow: next.at >= midnight + DAY,
  };
}
export function countdown(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}
