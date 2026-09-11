import { beforeAll, afterAll, it, expect } from 'vitest';
import { database, seed, as, ids, command } from '../supabase/tests/harness';
let db: Awaited<ReturnType<typeof database>>;
beforeAll(async () => {
  db = await database();
  await seed(db);
}, 30000);
afterAll(() => db?.close());
const date = '2026-01-01';
it('does not restore stale news content or an image when creation is retried', async () => {
  await as(db, ids.admin);
  const key = crypto.randomUUID();
  const body = {
    type: 'notice',
    title: 'Original',
    text: 'Original message',
    date,
    published: true,
    image: 'https://example.com/original.png',
  };
  const saved = await command(db, body, key);
  await command(db, {
    ...body,
    type: 'update-notice',
    id: saved.id,
    title: 'Revised',
    image: 'https://example.com/revised.png',
  });
  await as(db, ids.admin, 'aal1');
  expect(await command(db, body, key)).toEqual(saved);
  const row = (
    await db.query<{ title: string; image_url: string }>(
      'select title,image_url from public.mosque_news where id=$1',
      [saved.id],
    )
  ).rows[0];
  expect(row).toEqual({
    title: 'Revised',
    image_url: 'https://example.com/revised.png',
  });
});
it('lets verifiers read contributor names without exposing contact details', async () => {
  await as(db, ids.admin);
  await command(db, {
    type: 'cash',
    memberId: ids.member,
    amountPaise: 100,
    date,
    purpose: 'Test',
  });
  await db.exec('reset role');
  await db.query(
    "update public.mosque_profiles set permissions=array['verify'] where id=$1",
    [ids.admin],
  );
  await as(db, ids.admin);
  const result = await db.query<{ names: Record<string, string> }>(
    'select public.mosque_payment_names() as names',
  );
  expect(result.rows[0].names[ids.member]).toBe('member');
  expect(
    (
      await db.query('select * from public.mosque_profiles where id=$1', [
        ids.member,
      ])
    ).rows,
  ).toHaveLength(0);
  await as(db, ids.member);
  await expect(
    db.query('select public.mosque_payment_names()'),
  ).rejects.toThrow();
  await db.exec('reset role');
  await db.query(
    "update public.mosque_profiles set permissions=array['members','record','verify','expenses','reports','prayers','news','receiving'] where id=$1",
    [ids.admin],
  );
});
it('creates, updates, publishes and deletes news with an image', async () => {
  await as(db, ids.admin);
  const body = {
    type: 'notice',
    title: 'Community meeting',
    text: 'Friday after prayer',
    date,
    published: false,
    image: 'https://example.com/news.png',
  };
  const n = await command(db, body);
  await as(db, null);
  expect(
    (await db.query('select * from public.mosque_news where id=$1', [n.id]))
      .rows,
  ).toHaveLength(0);
  await as(db, ids.admin);
  await command(db, {
    ...body,
    type: 'update-notice',
    id: n.id,
    title: 'Updated meeting',
    published: true,
  });
  await as(db, null);
  expect(
    (
      await db.query<{ title: string }>(
        'select title from public.mosque_news where id=$1',
        [n.id],
      )
    ).rows[0].title,
  ).toBe('Updated meeting');
  await expect(
    command(db, { type: 'delete-notice', id: n.id }),
  ).rejects.toThrow();
  await as(db, ids.admin);
  await command(db, { type: 'delete-notice', id: n.id });
  expect(
    (await db.query('select * from public.mosque_news where id=$1', [n.id]))
      .rows,
  ).toHaveLength(0);
});
it('edits/deletes expense drafts but preserves posted entries', async () => {
  await as(db, ids.admin);
  const body = {
    type: 'expense',
    amountPaise: 100,
    date,
    category: 'Other',
    description: 'Draft',
    account: 'Cash',
    status: 'draft',
  };
  const draft = await command(db, body);
  await command(db, {
    type: 'update-expense',
    id: draft.id,
    amountPaise: 200,
    date,
    category: 'Cleaning',
    description: 'Soap',
    account: 'Cash',
  });
  expect(
    (
      await db.query<{ amount_paise: number }>(
        'select amount_paise from public.mosque_expenses where id=$1',
        [draft.id],
      )
    ).rows[0].amount_paise,
  ).toBe(200);
  await command(db, { type: 'delete-expense', id: draft.id });
  await command(db, {
    type: 'cash',
    memberId: ids.member,
    amountPaise: 10000,
    date,
    purpose: 'Donation',
  });
  const posted = await command(db, { ...body, status: 'paid' });
  await expect(
    command(db, { type: 'delete-expense', id: posted.id }),
  ).rejects.toThrow();
  await expect(
    command(db, {
      type: 'update-expense',
      id: posted.id,
      amountPaise: 1,
      date,
      category: 'Other',
      description: 'Tamper',
      account: 'Cash',
    }),
  ).rejects.toThrow();
});
it('edits/deactivates/reactivates members without changing their identity or financial history', async () => {
  await as(db, ids.admin);
  await command(db, {
    type: 'update-member',
    id: ids.member,
    name: 'Member Updated',
    phone: '+919876543210',
    address: 'Durg',
  });
  await command(db, { type: 'deactivate', id: ids.member });
  await as(db, ids.member);
  await expect(
    command(db, { type: 'delete-notice', id: crypto.randomUUID() }),
  ).rejects.toThrow();
  await as(db, ids.admin);
  await command(db, { type: 'reactivate', id: ids.member });
  await as(db, ids.member);
  expect(
    (await db.query('select * from public.mosque_payments')).rows.length,
  ).toBeGreaterThan(0);
  await expect(
    command(db, { type: 'update-member', id: ids.admin, name: 'Attack' }),
  ).rejects.toThrow();
});
it('rolls back the whole bulk review if any payment is invalid and replays success once', async () => {
  await as(db, null);
  await db.exec('reset role');
  const paymentIds = [crypto.randomUUID(), crypto.randomUUID()];
  for (const id of paymentIds)
    await db.query(
      `insert into public.mosque_payments(id,member_id,amount_paise,paid_on,purpose,method,reference,evidence_path,status,created_by) values($1::uuid,$2,100,$3,'Donation','UPI',$1::text,$1::text,'pending',$2)`,
      [id, ids.member, date],
    );
  await as(db, ids.admin);
  await expect(
    command(db, {
      type: 'bulk-review',
      ids: [paymentIds[0], crypto.randomUUID()],
      status: 'verified',
    }),
  ).rejects.toThrow();
  expect(
    (
      await db.query<{ status: string }>(
        'select status from public.mosque_payments where id=$1',
        [paymentIds[0]],
      )
    ).rows[0].status,
  ).toBe('pending');
  const key = crypto.randomUUID(),
    body = { type: 'bulk-review', ids: paymentIds, status: 'verified' };
  const first = await command(db, body, key);
  expect(await command(db, body, key)).toEqual(first);
  await db.exec('reset role');
  expect(
    (
      await db.query(
        'select * from mosque_private.ledger where source_id=any($1::uuid[])',
        [paymentIds],
      )
    ).rows,
  ).toHaveLength(2);
});
it('requires MFA for new CRUD operations and keeps underlying financial function private', async () => {
  await as(db, ids.admin, 'aal1');
  await expect(
    command(db, { type: 'update-member', id: ids.member, name: 'No MFA' }),
  ).rejects.toThrow();
  await as(db, ids.admin);
  await expect(
    db.query('select mosque_private.mosque_command($1,$2)', [
      crypto.randomUUID(),
      JSON.stringify({ type: 'cash' }),
    ]),
  ).rejects.toThrow();
});
it('limits email and phone PIN attempts together and never reveals identity without the server gate', async () => {
  await db.exec('reset role');
  const secret = 'test-only-gate-'.repeat(6);
  await db.query(
    "insert into mosque_private.login_config(secret_hash) values(sha256(convert_to($1,'UTF8')))",
    [secret],
  );
  await as(db, null);
  await expect(
    db.query('select public.mosque_login_identity($1,$2)', [
      'member@example.com',
      'wrong',
    ]),
  ).rejects.toThrow();
  for (let i = 0; i < 5; i++)
    expect(
      (
        await db.query<{ email: string }>(
          'select public.mosque_login_identity($1,$2) as email',
          [i % 2 ? ' +91 9876543210' : 'member@example.com', secret],
        )
      ).rows[0].email,
    ).toBe('member@example.com');
  expect(
    (
      await db.query<{ email: string | null }>(
        'select public.mosque_login_identity($1,$2) as email',
        ['member@example.com', secret],
      )
    ).rows[0].email,
  ).toBeNull();
});
it('returns mosque-wide totals without exposing other member payment records', async () => {
  await as(db, ids.other);
  expect(
    (await db.query('select * from public.mosque_payments')).rows,
  ).toHaveLength(0);
  const result = await db.query<{
    summary: { balance: { cashPaise: number }; months: unknown[] };
  }>('select public.mosque_financial_summary() as summary');
  expect(result.rows[0].summary.balance.cashPaise).toBe(10000);
  expect(result.rows[0].summary.months).toHaveLength(1);
});
