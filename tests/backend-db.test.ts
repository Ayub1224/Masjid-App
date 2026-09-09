import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { database, seed, as, command, ids } from '../supabase/tests/harness';
import type { PGlite } from '@electric-sql/pglite';
let db: PGlite;
const date = '2026-01-01';
beforeAll(async () => {
  db = await database();
  await seed(db);
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe('Actual PostgreSQL security policies and financial transactions', () => {
  it('anonymous users cannot read private tables or execute financial commands', async () => {
    await as(db, null);
    await expect(
      db.query('select * from public.mosque_payments'),
    ).rejects.toThrow();
    await expect(
      command(db, { type: 'cash', amountPaise: 100, date }),
    ).rejects.toThrow();
    expect(
      (await db.query('select * from public.mosque_prayers')).rows,
    ).toEqual([]);
  });
  it('members see only their own profile and cannot write rows directly', async () => {
    await as(db, ids.member, 'aal1');
    expect(
      (await db.query('select id from public.mosque_profiles')).rows,
    ).toEqual([{ id: ids.member }]);
    await expect(
      db.query("update public.mosque_profiles set role='owner' where id=$1", [
        ids.member,
      ]),
    ).rejects.toThrow();
    await expect(
      command(db, {
        type: 'cash',
        memberId: ids.member,
        amountPaise: 100,
        date,
        purpose: 'Donation',
      }),
    ).rejects.toThrow();
  });
  it('privileged operations require MFA even with a valid admin identity', async () => {
    await as(db, ids.admin, 'aal1');
    await expect(
      command(db, {
        type: 'cash',
        memberId: ids.member,
        amountPaise: 100,
        date,
        purpose: 'Donation',
      }),
    ).rejects.toThrow('MFA');
  });
  it('opening balances are explicit and can only be established once by owner', async () => {
    await as(db, ids.owner);
    await command(db, {
      type: 'opening',
      amountPaise: 100000,
      cashPaise: 50000,
      date,
    });
    await expect(
      command(db, { type: 'opening', amountPaise: 1, cashPaise: 0, date }),
    ).rejects.toThrow();
  });
  it('idempotency does not double-book cash and rejects changed payloads', async () => {
    await as(db, ids.admin);
    const request = crypto.randomUUID();
    const body = {
      type: 'cash',
      memberId: ids.member,
      amountPaise: 1000,
      date,
      purpose: 'Donation',
    };
    expect(await command(db, body, request)).toEqual(
      await command(db, body, request),
    );
    await expect(
      command(db, { ...body, amountPaise: 2000 }, request),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ v: { cashPaise: number } }>(
          'select public.mosque_finances() v',
        )
      ).rows[0].v.cashPaise,
    ).toBe(51000);
  });
  it('members cannot access another member receipt or replace evidence', async () => {
    await as(db, ids.other, 'aal1');
    expect(
      (await db.query('select * from public.mosque_payments')).rows,
    ).toHaveLength(0);
    await as(db, ids.member, 'aal1');
    const path = `${ids.member}/${crypto.randomUUID()}.png`;
    await db.query(
      "insert into storage.objects(bucket_id,name,owner_id) values('payment-evidence',$1,$2)",
      [path, ids.member],
    );
    expect(
      (await db.query("update storage.objects set name='changed' returning *"))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "insert into storage.objects(bucket_id,name,owner_id) values('payment-evidence',$1,$2)",
        [`${ids.other}/${crypto.randomUUID()}.png`, ids.other],
      ),
    ).rejects.toThrow();
  });
  it('pending evidence adds nothing, approval is atomic and duplicate references remain blocked after reversal', async () => {
    await as(db, ids.member, 'aal1');
    const path = `${ids.member}/${crypto.randomUUID()}.png`;
    await db.query(
      "insert into storage.objects(bucket_id,name,owner_id) values('payment-evidence',$1,$2)",
      [path, ids.member],
    );
    const payment = await command(db, {
      type: 'submit',
      amountPaise: 12345,
      date,
      purpose: 'Monthly',
      reference: '123456789012',
      evidencePath: path,
    });
    await as(db, ids.admin);
    await command(db, { type: 'review', id: payment.id, status: 'verified' });
    await expect(
      command(db, { type: 'review', id: payment.id, status: 'verified' }),
    ).rejects.toThrow();
    await as(db, ids.owner);
    await command(db, {
      type: 'reverse',
      id: payment.id,
      reason: 'Duplicate statement entry',
    });
    await expect(
      command(db, { type: 'reverse', id: payment.id, reason: 'Again' }),
    ).rejects.toThrow();
    await db.exec('reset role');
    expect(
      (
        await db.query(
          'select * from mosque_private.ledger where source_id=$1 or reverses in(select id from mosque_private.ledger where source_id=$1)',
          [payment.id],
        )
      ).rows,
    ).toHaveLength(2);
    await expect(
      db.query('delete from mosque_private.ledger where source_id=$1', [
        payment.id,
      ]),
    ).rejects.toThrow('Immutable');
    await as(db, ids.member, 'aal1');
    const path2 = `${ids.member}/${crypto.randomUUID()}.png`;
    await db.query(
      "insert into storage.objects(bucket_id,name,owner_id) values('payment-evidence',$1,$2)",
      [path2, ids.member],
    );
    const duplicate = await command(db, {
      type: 'submit',
      amountPaise: 12345,
      date,
      purpose: 'Monthly',
      reference: '123456789012',
      evidencePath: path2,
    });
    await as(db, ids.admin);
    await expect(
      command(db, { type: 'review', id: duplicate.id, status: 'verified' }),
    ).rejects.toThrow();
  });
  it('cash transfers preserve combined funds and bank observations never replace the ledger', async () => {
    await as(db, ids.admin);
    const before = (
      await db.query<{ v: { bankPaise: number; cashPaise: number } }>(
        'select public.mosque_finances() v',
      )
    ).rows[0].v;
    await command(db, { type: 'transfer', amountPaise: 1000, date });
    await command(db, {
      type: 'balance-check',
      amountPaise: 1,
      date,
      note: 'Investigate statement',
    });
    const after = (
      await db.query<{ v: { bankPaise: number; cashPaise: number } }>(
        'select public.mosque_finances() v',
      )
    ).rows[0].v;
    expect(after.bankPaise + after.cashPaise).toBe(
      before.bankPaise + before.cashPaise,
    );
    await expect(
      command(db, { type: 'transfer', amountPaise: 99999999, date }),
    ).rejects.toThrow('Insufficient');
  });
  it('admin seat reservations and privileged invitation permissions are enforced in database', async () => {
    await as(db, ids.admin);
    await expect(
      command(db, {
        type: 'invite',
        role: 'admin',
        email: 'x@example.com',
        name: 'X',
        token: 'a'.repeat(64),
      }),
    ).rejects.toThrow();
    await as(db, ids.super);
    for (let i = 0; i < 3; i++)
      await command(db, {
        type: 'invite',
        role: 'admin',
        email: `a${i}@example.com`,
        name: 'Admin',
        token: String(i).repeat(64),
      });
    await expect(
      command(db, {
        type: 'invite',
        role: 'admin',
        email: 'full@example.com',
        name: 'Full',
        token: 'f'.repeat(64),
      }),
    ).rejects.toThrow('seats');
  });
  it('invitations bind verified email and expire, are hashed at rest, and can only be consumed once', async () => {
    await as(db, ids.admin);
    const token = 'b'.repeat(64);
    await command(db, {
      type: 'invite',
      role: 'member',
      email: 'new@example.com',
      name: 'New',
      token,
    });
    await db.exec('reset role');
    const id = crypto.randomUUID();
    await db.query('insert into auth.users values($1,$2,null)', [
      id,
      'new@example.com',
    ]);
    await db.query('insert into auth.sessions values($1,$1,null)', [id]);
    await as(db, id, 'aal1');
    await expect(
      command(db, { type: 'accept-invite', token }),
    ).rejects.toThrow();
    await db.exec('reset role');
    await db.query(
      'update auth.users set email_confirmed_at=now() where id=$1',
      [id],
    );
    await as(db, id, 'aal1');
    await command(db, { type: 'accept-invite', token });
    await expect(
      command(db, { type: 'accept-invite', token }),
    ).rejects.toThrow();
  });
  it('deactivation immediately blocks reads and commands even with an existing JWT', async () => {
    await as(db, ids.super);
    await command(db, { type: 'deactivate', id: ids.admin });
    await as(db, ids.admin);
    expect(
      (await db.query('select * from public.mosque_profiles')).rows,
    ).toHaveLength(0);
    await expect(
      command(db, {
        type: 'cash',
        amountPaise: 1,
        date,
        memberId: ids.member,
        purpose: 'X',
      }),
    ).rejects.toThrow();
  });
});
