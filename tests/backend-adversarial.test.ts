import { beforeAll, afterAll, it, expect } from 'vitest';
import { database, seed, as, command, ids } from '../supabase/tests/harness';
import type { PGlite } from '@electric-sql/pglite';
let db: PGlite;
beforeAll(async () => {
  db = await database();
  await seed(db);
}, 30000);
afterAll(() => db.close());
it('rejects owner privilege escalation, unknown grants and unowned evidence through direct RPC calls', async () => {
  await as(db, ids.member);
  await expect(
    command(db, {
      type: 'permissions',
      id: ids.member,
      permissions: ['verify'],
    }),
  ).rejects.toThrow();
  await expect(
    command(db, {
      type: 'submit',
      amountPaise: 1,
      date: '2026-01-01',
      purpose: 'X',
      reference: '123456',
      evidencePath: `${ids.other}/${crypto.randomUUID()}.png`,
    }),
  ).rejects.toThrow();
  await as(db, ids.super);
  await expect(
    command(db, {
      type: 'permissions',
      id: ids.admin,
      permissions: ['administrators'],
    }),
  ).rejects.toThrow();
});
it('blocks a revoked session at the database boundary, even if its JWT has not expired', async () => {
  await db.exec('reset role');
  await db.query('delete from auth.sessions where id=$1', [ids.other]);
  await as(db, ids.other);
  expect((await db.query('select * from public.mosque_profiles')).rows).toEqual(
    [],
  );
  await expect(db.query('select public.mosque_finances()')).rejects.toThrow();
  await expect(
    command(db, { type: 'accept-invite', token: 'x'.repeat(64) }),
  ).rejects.toThrow('Session expired');
});
it('permission revocation applies to an existing admin session', async () => {
  await as(db, ids.super);
  await command(db, {
    type: 'permissions',
    id: ids.admin,
    permissions: ['members'],
  });
  await as(db, ids.admin);
  await expect(
    command(db, {
      type: 'cash',
      memberId: ids.member,
      amountPaise: 1,
      date: '2026-01-01',
      purpose: 'X',
    }),
  ).rejects.toThrow();
});
it('rejects expired, revoked and wrong-email invitations without allocating profiles', async () => {
  await as(db, ids.admin);
  const token = 'c'.repeat(64);
  const invite = await command(db, {
    type: 'invite',
    role: 'member',
    email: 'invitee@example.com',
    name: 'Invitee',
    token,
  });
  await db.exec('reset role');
  const id = crypto.randomUUID();
  await db.query('insert into auth.users values($1,$2,now())', [
    id,
    'wrong@example.com',
  ]);
  await db.query('insert into auth.sessions values($1,$1,null)', [id]);
  await as(db, id);
  await expect(command(db, { type: 'accept-invite', token })).rejects.toThrow();
  await db.exec('reset role');
  await db.query('update auth.users set email=$1 where id=$2', [
    'invitee@example.com',
    id,
  ]);
  await db.query(
    "update mosque_private.invitations set expires_at=now()-interval '1 minute' where id=$1",
    [invite.id],
  );
  await as(db, id);
  await expect(command(db, { type: 'accept-invite', token })).rejects.toThrow();
  await db.exec('reset role');
  await db.query(
    "update mosque_private.invitations set expires_at=now()+interval '1 hour',revoked_at=now() where id=$1",
    [invite.id],
  );
  await as(db, id);
  await expect(command(db, { type: 'accept-invite', token })).rejects.toThrow();
  expect((await db.query('select * from public.mosque_profiles')).rows).toEqual(
    [],
  );
});
it('enforces values at the SQL boundary without relying on Zod', async () => {
  await as(db, ids.owner);
  for (const amount of [-1, 1.5, 100000001])
    await expect(
      command(db, {
        type: 'cash',
        memberId: ids.member,
        amountPaise: amount,
        date: '2026-01-01',
        purpose: 'X',
      }),
    ).rejects.toThrow();
  await expect(
    command(db, {
      type: 'cash',
      memberId: ids.member,
      amountPaise: 1,
      date: '2999-01-01',
      purpose: 'X',
    }),
  ).rejects.toThrow();
});
it('rolls back failed reviews without adding audit rows or ledger entries', async () => {
  await as(db, ids.owner);
  await command(db, {
    type: 'opening',
    amountPaise: 100,
    cashPaise: 100,
    date: '2026-01-01',
  });
  const before = (await db.query('select public.mosque_finances() as value'))
    .rows;
  await expect(
    command(db, {
      type: 'expense',
      amountPaise: 101,
      date: '2026-01-01',
      category: 'Maintenance',
      description: 'Test',
      account: 'Cash',
      status: 'paid',
    }),
  ).rejects.toThrow();
  expect(
    (await db.query('select public.mosque_finances() as value')).rows,
  ).toEqual(before);
});
it('does not expose invitation token hashes through the privileged roster',async()=>{
 await as(db,ids.admin);
 const result=await db.query<{value:object[]}>('select public.mosque_invitation_list(0) as value');
 expect(JSON.stringify(result.rows)).not.toContain('token_hash');
 await as(db,ids.member);await expect(db.query('select public.mosque_invitation_list(0)')).rejects.toThrow();
});
it('prevents even an owner from verifying their own UPI submission',async()=>{
 await as(db,ids.owner);const path=`${ids.owner}/${crypto.randomUUID()}.png`;
 await db.query("insert into storage.objects(bucket_id,name,owner_id) values('payment-evidence',$1,$2)",[path,ids.owner]);
 const payment=await command(db,{type:'submit',amountPaise:10,date:'2026-01-01',purpose:'Self donation',reference:'OWN123456',evidencePath:path});
 await expect(command(db,{type:'review',id:payment.id,status:'verified'})).rejects.toThrow('own submission');
});
