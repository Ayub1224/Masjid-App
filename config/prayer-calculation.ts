/** Proposed calculation settings; mosque management must confirm before launch. */
export const prayerCalculation = {
  method: 'Karachi',
  madhab: 'Hanafi',
  confirmed: false,
  provider: 'Adhan JS',
  sourceUrl: 'https://github.com/batoulapps/adhan-js',
} as const;
export const prayerCalculationOptions = [
  {
    id: 'karachi-hanafi',
    method: 'Karachi',
    madhab: 'Hanafi',
    label: 'Karachi · Hanafi',
  },
  {
    id: 'karachi-shafai',
    method: 'Karachi',
    madhab: 'Shafi',
    label: 'Karachi · Shafi',
  },
] as const;
export type PrayerCalculationId =
  (typeof prayerCalculationOptions)[number]['id'];
export function calculationFor(id: PrayerCalculationId) {
  return (
    prayerCalculationOptions.find((option) => option.id === id) ??
    prayerCalculationOptions[0]
  );
}
