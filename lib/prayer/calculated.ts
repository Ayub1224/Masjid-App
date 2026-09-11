import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from 'adhan';
import { mosque, type Prayer } from '@/config/mosque';
import {
  calculationFor,
  type PrayerCalculationId,
} from '@/config/prayer-calculation';
export function mosqueDate(now: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: mosque.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function calculatedSchedule(
  date: string,
  base: Prayer[],
  offset = 0,
  calculation: PrayerCalculationId = 'karachi-hanafi',
  coordinates = mosque.coordinates as { latitude: number; longitude: number },
) {
  const [year, month, day] = date.split('-').map(Number);
  // Adhan consumes LOCAL calendar fields, then returns UTC instants. Construct
  // those calendar fields explicitly rather than interpreting an ISO date as UTC.
  const calendar = new Date(year, month - 1, day + offset, 12);
  const selected = calculationFor(calculation);
  const params = CalculationMethod[selected.method]();
  params.madhab = Madhab[selected.madhab];
  const times = new PrayerTimes(
    new Coordinates(coordinates.latitude, coordinates.longitude),
    calendar,
    params,
  );
  const format = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: mosque.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(d);
  return base.map((p) => {
    const key = p.id as
      | 'fajr'
      | 'sunrise'
      | 'dhuhr'
      | 'asr'
      | 'maghrib'
      | 'isha';
    return { ...p, adhan: format(times[key]) };
  });
}
export function scheduleCalendar(
  date: string,
  base: Prayer[],
  calculation: PrayerCalculationId = 'karachi-hanafi',
  coordinates = mosque.coordinates as { latitude: number; longitude: number },
) {
  return [-1, 0, 1].map((offset) => ({
    offset,
    prayers: calculatedSchedule(date, base, offset, calculation, coordinates),
  }));
}
