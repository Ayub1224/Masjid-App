import {it,expect} from 'vitest';
import {calculatedSchedule,mosqueDate,scheduleCalendar} from '../lib/prayer/calculated';
import {prayerInterval} from '../lib/prayer/clock';
import {initialPrayers} from '../config/mosque';
it('calculates ordered starts while preserving the mosque jamaat values',()=>{
 const values=calculatedSchedule('2026-09-09',initialPrayers);
 expect(values.map(p=>p.adhan)).toEqual(values.map(p=>p.adhan).sort());
 expect(values.map(p=>p.jamaat)).toEqual(initialPrayers.map(p=>p.jamaat));
 expect(values[0].adhan).not.toEqual(initialPrayers[0].adhan);
 expect(values.every(p=>/^\d{2}:\d{2}$/.test(p.adhan))).toBe(true);
});
it('uses the mosque calendar date even when the UTC date differs',()=>{
 expect(mosqueDate(new Date('2026-09-09T20:00:00Z'))).toBe('2026-09-10');
});
it('uses tomorrow’s independently calculated Fajr after the last prayer',()=>{
 const calendar=scheduleCalendar('2026-09-09',initialPrayers);
 const next=prayerInterval(calendar[1].prayers,new Date('2026-09-09T17:00:00Z'),'adhan',calendar);
 expect(next?.tomorrow).toBe(true);
 expect(next?.next.prayer.adhan).toBe(calculatedSchedule('2026-09-10',initialPrayers)[0].adhan);
});
it('returns the same timings for browsers in different timezones',()=>{
 const previous=process.env.TZ;
 try{
 process.env.TZ='America/Los_Angeles';const west=calculatedSchedule('2026-09-09',initialPrayers);
 process.env.TZ='Asia/Tokyo';expect(calculatedSchedule('2026-09-09',initialPrayers)).toEqual(west);
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
});
