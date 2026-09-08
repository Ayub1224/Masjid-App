export const mosque = {
  name: 'Gausul wara masjid',
  hindiName: 'गौसुल वरा मस्जिद',
  location: 'Potiya Kala, Durg',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  demo: true,
} as const;
export const initialPrayers = [
  { id: 'fajr', name: 'Fajr', hindi: 'फ़ज्र', adhan: '05:00', jamaat: '05:30' },
  { id: 'dhuhr', name: 'Dhuhr', hindi: 'ज़ुहर', adhan: '13:00', jamaat: '13:30' },
  { id: 'asr', name: 'Asr', hindi: 'अस्र', adhan: '16:30', jamaat: '17:00' },
  {
    id: 'maghrib',
    name: 'Maghrib',
    hindi: 'मग़रिब',
    adhan: '18:15',
    jamaat: '18:20',
  },
  { id: 'isha', name: 'Isha', hindi: 'इशा', adhan: '19:45', jamaat: '20:15' },
];
export type Prayer = (typeof initialPrayers)[number];
