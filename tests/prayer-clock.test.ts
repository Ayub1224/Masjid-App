import { it, expect } from 'vitest';
import { prayerInterval, countdown } from '../lib/prayer/clock';
import { initialPrayers } from '../config/mosque';
import { getPosition } from 'suncalc';
it('counts down by mosque IST independently of browser timezone', () => {
  const v = prayerInterval(
    initialPrayers,
    new Date('2026-09-09T08:00:00Z'),
    'adhan',
  );
  expect(v?.next.prayer.id).toBe('asr');
  expect(v?.remainingSeconds).toBe(3 * 3600);
  expect(v?.progress).toBeCloseTo(1 / 7);
});
it('distinguishes jamaat from adhan and advances exactly at the boundary', () => {
  const now = new Date('2026-09-09T07:40:00Z');
  expect(prayerInterval(initialPrayers, now, 'adhan')?.next.prayer.id).toBe(
    'asr',
  );
  expect(prayerInterval(initialPrayers, now, 'jamaat')?.next.prayer.id).toBe(
    'dhuhr',
  );
  expect(
    prayerInterval(initialPrayers, new Date('2026-09-09T08:00:00Z'), 'jamaat')
      ?.next.prayer.id,
  ).toBe('asr');
});
it('wraps overnight, sorts times, and safely handles missing schedules', () => {
  const now = new Date('2026-09-09T18:00:00Z');
  const v = prayerInterval([...initialPrayers].reverse(), now, 'adhan');
  expect(v?.tomorrow).toBe(true);
  expect(v?.next.prayer.id).toBe('fajr');
  expect(v?.remainingSeconds).toBe(19800);
  expect(prayerInterval([], now, 'adhan')).toBeNull();
});
it('formats seconds without negative values and uses solar angles in degrees', () => {
  expect(countdown(3661)).toBe('01:01:01');
  expect(countdown(-1)).toBe('00:00:00');
  expect(
    getPosition(new Date('2026-09-09T06:30:00Z'), 21.19, 81.28).altitude,
  ).toBeGreaterThan(50);
  expect(
    getPosition(new Date('2026-09-09T18:30:00Z'), 21.19, 81.28).altitude,
  ).toBeLessThan(0);
});
