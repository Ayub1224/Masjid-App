import { beforeAll, afterAll, it, expect } from 'vitest';
import { database, seed, as, ids } from '../supabase/tests/harness';
import type { PGlite } from '@electric-sql/pglite';
import { mosqueDetailsSchema } from '../lib/mosque-details';
let db: PGlite;
const details = {
  name: 'Local mosque',
  address: 'Durg',
  latitude: 21.19,
  longitude: 81.28,
  picture: '',
};
beforeAll(async () => {
  db = await database();
  await seed(db);
}, 30000);
afterAll(async () => {
  await db?.close();
});
it('allows public read of empty setup, but rejects anonymous/member writes and unverified owners', async () => {
  await as(db, null);
  expect((await db.query('select * from mosque_details')).rows).toEqual([]);
  for (const [id, aal] of [
    [null, 'aal1'],
    [ids.member, 'aal2'],
    [ids.owner, 'aal1'],
  ] as const) {
    await as(db, id, aal);
    await expect(
      db.query('select mosque_save_details($1)', [details]),
    ).rejects.toThrow();
  }
});
it('saves a single mosque for all accounts and permits public reads', async () => {
  await as(db, ids.super, 'aal2');
  await db.query('select mosque_save_details($1)', [details]);
  await as(db, ids.owner, 'aal2');
  await db.query('select mosque_save_details($1)', [
    { ...details, name: 'Updated mosque' },
  ]);
  await as(db, null);
  const result = await db.query('select name from mosque_details');
  expect(result.rows).toEqual([{ name: 'Updated mosque' }]);
});
it('rejects invalid coordinates and executable image formats', () => {
  expect(
    mosqueDetailsSchema.safeParse({ ...details, latitude: 91 }).success,
  ).toBe(false);
  expect(
    mosqueDetailsSchema.safeParse({
      ...details,
      picture: 'data:image/svg+xml;base64,AAAA',
    }).success,
  ).toBe(false);
});
