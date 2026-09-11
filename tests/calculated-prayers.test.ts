import { it, expect } from 'vitest';
import {
  calculatedSchedule,
  mosqueDate,
  scheduleCalendar,
} from '../lib/prayer/calculated';
import { prayerInterval } from '../lib/prayer/clock';
import { initialPrayers } from '../config/mosque';
it('calculates ordered starts while preserving the mosque jamaat values', () => {
  const values = calculatedSchedule('2026-09-09', initialPrayers);
  expect(values.map((p) => p.adhan)).toEqual(values.map((p) => p.adhan).sort());
  expect(values.map((p) => p.jamaat)).toEqual(
    initialPrayers.map((p) => p.jamaat),
  );
  expect(values[0].adhan).not.toEqual(initialPrayers[0].adhan);
  expect(values.every((p) => /^\d{2}:\d{2}$/.test(p.adhan))).toBe(true);
});
it('uses the mosque calendar date even when the UTC date differs', () => {
  expect(mosqueDate(new Date('2026-09-09T20:00:00Z'))).toBe('2026-09-10');
});
it('uses tomorrow’s independently calculated Fajr after the last prayer', () => {
  const calendar = scheduleCalendar('2026-09-09', initialPrayers);
  const next = prayerInterval(
    calendar[1].prayers,
    new Date('2026-09-09T17:00:00Z'),
    'adhan',
    calendar,
  );
  expect(next?.tomorrow).toBe(true);
  expect(next?.next.prayer.adhan).toBe(
    calculatedSchedule('2026-09-10', initialPrayers)[0].adhan,
  );
});
it('returns the same timings for browsers in different timezones', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/Los_Angeles';
    const west = calculatedSchedule('2026-09-09', initialPrayers);
    process.env.TZ = 'Asia/Tokyo';
    expect(calculatedSchedule('2026-09-09', initialPrayers)).toEqual(west);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
it('supports both Karachi Hanafi and Karachi Shafi settings', () => {
  const hanafi = calculatedSchedule(
    '2026-09-09',
    initialPrayers,
    0,
    'karachi-hanafi',
  );
  const shafi = calculatedSchedule(
    '2026-09-09',
    initialPrayers,
    0,
    'karachi-shafai',
  );
  expect(hanafi.map((prayer) => prayer.adhan)).not.toEqual(
    shafi.map((prayer) => prayer.adhan),
  );
});

it('calculates visitor periods without a mosque timetable and ends Fajr at sunrise', () => {
  const base = [
    { id: 'fajr', name: 'Fajr', hindi: 'फ़ज्र', adhan: '', jamaat: '' },
    { id: 'sunrise', name: 'Sunrise', hindi: 'सूर्योदय', adhan: '', jamaat: '' },
    { id: 'dhuhr', name: 'Dhuhr', hindi: 'ज़ुहर', adhan: '', jamaat: '' },
  ];
  const times = calculatedSchedule('2026-09-11', base);
  expect(times[0].adhan < times[1].adhan).toBe(true);
  expect(times[1].adhan < times[2].adhan).toBe(true);
  expect(times.every((p) => p.jamaat === '')).toBe(true);
  const elsewhere = calculatedSchedule(
    '2026-09-11',
    base,
    0,
    'karachi-hanafi',
    { latitude: 28.61, longitude: 77.21 },
  );
  expect(elsewhere.map((p) => p.adhan)).not.toEqual(times.map((p) => p.adhan));
});
