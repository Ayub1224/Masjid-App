import { afterAll, beforeAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { database, seed, as, command, ids } from '../supabase/tests/harness';
import type { PGlite } from '@electric-sql/pglite';
import {
  indianMobile,
  invitationInput,
  profileInput,
} from '../lib/administrator-invitation';
let db: PGlite;
beforeAll(async () => {
  db = await database();
  await seed(db);
  await db.exec(readFileSync('local/roles.sql', 'utf8'));
  await db.exec(readFileSync('local/administrator-rules.sql', 'utf8'));
}, 30000);
afterAll(async () => {
  await db?.close();
});
it('normalizes Indian mobiles and rejects foreign, landline and malformed numbers', () => {
  for (const input of ['9876543210', '+91 98765 43210', '919876543210'])
    expect(indianMobile(input)).toBe('+919876543210');
  for (const input of [
    '+1 9876543210',
    '+44 9876543210',
    '1234567890',
    '09876543210',
    '98765abc43210',
    '987654321',
    '98765432100',
  ])
    expect(indianMobile(input)).toBeNull();
});
it('requires owner email, both roles phone/address, and validates optional admin email', () => {
  const base = {
    name: 'Admin',
    email: '',
    phone: '9876543210',
    address: 'Durg',
    role: 'admin',
    permissions: ['members'],
  };
  expect(invitationInput.safeParse(base).success).toBe(true);
  for (const change of [
    { role: 'owner' },
    { phone: '' },
    { address: '  ' },
    { email: 'bad email' },
    { permissions: ['verify'] },
  ])
    expect(invitationInput.safeParse({ ...base, ...change }).success).toBe(
      false,
    );
  expect(
    invitationInput.safeParse({
      ...base,
      role: 'owner',
      email: 'owner@example.com',
      permissions: ['verify'],
    }).success,
  ).toBe(true);
});
it('accepts phone-only admin invitation and preserves idempotency', async () => {
  await as(db, ids.super);
  const requestId = '00000000-0000-4000-8000-000000000090';
  const body = {
    type: 'invite',
    name: 'Phone admin',
    email: null,
    phone: '+919812345678',
    address: 'Durg',
    role: 'admin',
    permissions: ['members'],
    token: 'a'.repeat(64),
  };
  const first = await command(db, body, requestId);
  expect(await command(db, body, requestId)).toEqual(first);
  await as(db, null);
  await db.exec('reset role');
  const id = '00000000-0000-4000-8000-000000000091';
  await db.query(
    'insert into auth.users(id,email,phone,activated_at) values($1,null,$2,now())',
    [id, body.phone],
  );
  await db.query(
    'insert into auth.sessions(id,user_id,not_after) values($1,$1,null)',
    [id],
  );
  await as(db, id, 'aal1');
  await command(db, { type: 'accept-invite', token: body.token });
  expect(
    (
      await db.query(
        'select email,phone,permissions from public.mosque_profiles where id=$1',
        [id],
      )
    ).rows,
  ).toEqual([{ email: null, phone: body.phone, permissions: ['members'] }]);
});
it('enforces owner toggles and rejects admin financial permission escalation', async () => {
  await as(db, ids.super);
  await command(db, {
    type: 'permissions',
    id: ids.owner,
    permissions: ['prayers'],
  });
  await as(db, ids.owner);
  await db.exec('reset role');
  expect(
    (await db.query("select mosque_private.allowed('verify') permitted"))
      .rows[0],
  ).toEqual({ permitted: false });
  expect(
    (await db.query("select mosque_private.allowed('prayers') permitted"))
      .rows[0],
  ).toEqual({ permitted: true });
  await as(db, ids.super);
  await expect(
    command(db, {
      type: 'permissions',
      id: ids.admin,
      permissions: ['verify'],
    }),
  ).rejects.toThrow('Payment permissions');
  await as(db, ids.admin, 'aal1');
  await db.exec('reset role');
  expect(
    (await db.query("select mosque_private.allowed('verify') permitted"))
      .rows[0],
  ).toEqual({ permitted: false });
});

it('requires member phone and address without requiring email', () => {
  const member = {
    name: 'Member',
    role: 'member',
    phone: '9876543210',
    address: 'Durg',
  };
  expect(invitationInput.parse(member)).toMatchObject({
    email: '',
    phone: '+919876543210',
  });
  for (const change of [
    { phone: '' },
    { phone: '+1 9876543210' },
    { address: '  ' },
  ]) {
    expect(invitationInput.safeParse({ ...member, ...change }).success).toBe(
      false,
    );
    expect(
      profileInput('member').safeParse({ ...member, ...change }).success,
    ).toBe(false);
  }
});
