import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import * as OTPAuth from 'otpauth';
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const databaseName = 'mosque_journeys_' + randomUUID().replaceAll('-', '');
await admin.query(`create database ${databaseName}`);
const url = new URL(process.env.DATABASE_URL!);
url.pathname = '/' + databaseName;
process.env.DATABASE_URL = url.toString();
process.env.LOCAL_TEST = 'true';
delete process.env.LOCAL_TEST_DATABASE;
process.env.APP_ORIGIN = 'http://localhost:3000';
let close: (() => Promise<void>) | undefined;
try {
  const migrated = spawnSync('node', ['--import', 'tsx', 'local/migrate.ts'], {
    env: process.env,
    encoding: 'utf8',
  });
  assert.equal(migrated.status, 0, migrated.stderr);
  const { pool } = await import('./db');
  close = () => pool.end();
  const { handle } = await import('./server');
  const { pinHash, hash, newSession } = await import('./security');
  let checks = 0;
  async function call(
    path: string,
    body?: unknown,
    cookie = '',
    expected = 200,
    key = randomUUID(),
  ) {
    const response = await handle(
      new Request(process.env.APP_ORIGIN + '/api/backend/' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Origin: process.env.APP_ORIGIN!,
          Cookie: cookie,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    const data = (await response.json()) as {
      id: string;
      userId: string;
      invitationUrl: string;
      name: string;
      existingAccount: boolean;
      method: { kind: string; digits: number };
      destination: string;
      aal: string;
      profile: { id: string; name: string; phone: string; role: string };
      totp: { uri: string };
    };
    assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
    checks++;
    return {
      data,
      cookie: response.headers.get('set-cookie')?.split(';')[0] ?? cookie,
    };
  }
  const superId = randomUUID();
  await pool.query(
    "insert into auth.users(id,email,email_confirmed_at,pin_hash,credential_role) values($1,'super@journey.test',now(),$2,'super-admin')",
    [superId, await pinHash('Fixture-super-password!')],
  );
  await pool.query(
    "insert into mosque_profiles(id,name,email,role) values($1,'Test super','super@journey.test','super-admin')",
    [superId],
  );
  const superSession = await newSession(superId);
  await pool.query("update auth.sessions set aal='aal2' where user_id=$1", [
    superId,
  ]);
  const superCookie = 'mosque-local-session=' + superSession.token;
  async function invite(
    role: string,
    n: number,
    cookie = superCookie,
    email = true,
  ) {
    const res = await call(
      'command',
      {
        type: 'invite',
        role,
        name: `Journey ${role} ${n}`,
        email: email ? `${role}${n}@journey.test` : '',
        phone: `+91980000${String(n).padStart(4, '0')}`,
        address: 'Durg, India',
        permissions:
          role === 'owner'
            ? ['members', 'prayers', 'news', 'reports', 'expenses']
            : role === 'admin'
              ? ['members', 'news']
              : [],
      },
      cookie,
      201,
    );
    return {
      id: res.data.id as string,
      token: new URL(res.data.invitationUrl).hash.slice(7),
    };
  }
  const owner = await invite('owner', 1);
  const greeting = await call('auth/invitation', { token: owner.token });
  assert.equal(greeting.data.name, 'Journey owner 1');
  assert.equal(greeting.data.method.kind, 'password');
  assert.equal(greeting.data.existingAccount, false);
  await call(
    'auth/register',
    { invitationToken: owner.token, password: 'short' },
    '',
    400,
  );
  await call(
    'auth/register',
    { invitationToken: owner.token, password: 'Fixture-owner-password!' },
    superCookie,
    409,
  );
  const ownerJoined = await call('auth/register', {
    invitationToken: owner.token,
    password: 'Fixture-owner-password!',
  });
  assert.equal(ownerJoined.data.destination, '/admin');
  const ownerMe = await call('me', undefined, ownerJoined.cookie);
  assert.equal(ownerMe.data.profile.role, 'owner');
  assert.equal(ownerMe.data.aal, 'aal1');
  await call(
    'command',
    {
      type: 'invite',
      role: 'admin',
      name: 'Denied',
      email: 'denied@journey.test',
      phone: '+919899999999',
      address: 'Durg',
      permissions: [],
    },
    ownerJoined.cookie,
    403,
  );
  // Exercise the actual MFA enrollment and verification instead of elevating the owner fixture.
  const factor = await call('auth/mfa/enroll', {}, ownerJoined.cookie);
  const totp = OTPAuth.URI.parse(factor.data.totp.uri);
  const mfa = await call(
    'auth/mfa/verify',
    { factorId: factor.data.id, code: totp.generate() },
    ownerJoined.cookie,
  );
  const ownerCookie = mfa.cookie;
  // Real expense API: empty accounts, draft CRUD, funding, atomic posting and reversal.
  const expenseDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
  const expenseBody = {
    type: 'expense',
    amountPaise: 500000,
    date: expenseDate,
    category: 'Maintenance',
    description: 'Masjid Cleaning',
    account: 'Cash',
    status: 'paid',
  };
  const insufficient = await call('command', expenseBody, ownerCookie, 400);
  assert.equal(
    (insufficient.data as unknown as { error: string }).error,
    'INSUFFICIENT_BALANCE',
  );
  await call('command', { ...expenseBody, account: 'Bank' }, ownerCookie, 400);
  const draftExpense = await call(
    'command',
    { ...expenseBody, status: 'draft' },
    ownerCookie,
    201,
  );
  await call(
    'command',
    { type: 'post-expense', id: draftExpense.data.id },
    ownerCookie,
    400,
  );
  await call(
    'command',
    {
      date: expenseDate,
      category: 'Maintenance',
      description: 'Masjid Cleaning',
      account: 'Cash',
      type: 'update-expense',
      id: draftExpense.data.id,
      amountPaise: 400000,
    },
    ownerCookie,
    201,
  );
  await call(
    'command',
    { type: 'delete-expense', id: draftExpense.data.id },
    ownerCookie,
    201,
  );
  await call('command', { ...expenseBody, amountPaise: 0 }, ownerCookie, 400);
  await call(
    'command',
    { ...expenseBody, date: '1999-01-01' },
    ownerCookie,
    400,
  );
  await call(
    'command',
    {
      type: 'opening',
      amountPaise: 100000,
      cashPaise: 500000,
      date: expenseDate,
    },
    ownerCookie,
    201,
  );
  const paidKey = randomUUID();
  const paidExpense = await call(
    'command',
    expenseBody,
    ownerCookie,
    201,
    paidKey,
  );
  await call('command', expenseBody, ownerCookie, 201, paidKey);
  assert.equal(
    Number(
      (
        await pool.query(
          'select sum(cash_paise) balance from mosque_private.ledger',
        )
      ).rows[0].balance,
    ),
    0,
  );
  await call(
    'command',
    { type: 'delete-expense', id: paidExpense.data.id },
    ownerCookie,
    400,
  );
  await call(
    'command',
    {
      type: 'reverse',
      id: paidExpense.data.id,
      reason: 'Fixture correction',
    },
    ownerCookie,
    201,
  );
  assert.equal(
    Number(
      (
        await pool.query(
          'select sum(cash_paise) balance from mosque_private.ledger',
        )
      ).rows[0].balance,
    ),
    500000,
  );
  await call('auth/invitation', { token: owner.token }, '', 410);
  await call(
    'auth/register',
    { invitationToken: owner.token, password: 'Fixture-owner-password!' },
    '',
    410,
  );
  const adminInvite = await invite('admin', 2, ownerCookie);
  const adminPreview = await call('auth/invitation', {
    token: adminInvite.token,
  });
  assert.equal(adminPreview.data.method.digits, 6);
  const adminJoined = await call('auth/register', {
    invitationToken: adminInvite.token,
    pin: '482619',
  });
  const adminMe = await call('me', undefined, adminJoined.cookie);
  const adminId = adminMe.data.userId;
  assert.equal(adminMe.data.profile.role, 'admin');
  assert.equal(adminMe.data.aal, 'aal1');
  const phoneInvite = await invite('admin', 3, ownerCookie, false);
  const phoneJoined = await call('auth/register', {
    invitationToken: phoneInvite.token,
    pin: '638291',
  });
  const phoneId = (await call('me', undefined, phoneJoined.cookie)).data.userId;
  await call('auth/login', { identifier: '9800000003', pin: '638291' });
  const memberInvite = await invite('member', 4, adminJoined.cookie, false);
  const memberPreview = await call('auth/invitation', {
    token: memberInvite.token,
  });
  assert.equal(memberPreview.data.method.digits, 4);
  await call(
    'auth/register',
    { invitationToken: memberInvite.token, pin: '123456' },
    '',
    400,
  );
  const memberJoined = await call('auth/register', {
    invitationToken: memberInvite.token,
    pin: '7391',
  });
  assert.equal(memberJoined.data.destination, '/home');
  await call('auth/login', { identifier: '9800000004', pin: '7391' });
  const memberId = (await call('me', undefined, memberJoined.cookie)).data
    .userId;
  // Update/read, field validation, normalized aliases, duplicate rejection and permissions.
  await call(
    'command',
    {
      type: 'update-member',
      id: adminId,
      name: 'Edited admin',
      phone: '9800000022',
      address: 'New address',
    },
    ownerCookie,
    201,
  );
  const updated = (await call('me', undefined, adminJoined.cookie)).data
    .profile;
  assert.equal(updated.name, 'Edited admin');
  assert.equal(updated.phone, '+919800000022');
  await call(
    'command',
    {
      type: 'update-member',
      id: adminId,
      name: 'Invalid',
      phone: '+12025550123',
      address: 'Durg',
    },
    ownerCookie,
    400,
  );
  await call(
    'command',
    {
      type: 'update-member',
      id: adminId,
      name: 'Invalid',
      phone: '9800000022',
      address: '',
    },
    ownerCookie,
    400,
  );
  await call(
    'command',
    {
      type: 'update-member',
      id: adminId,
      name: 'Duplicate',
      phone: '9800000003',
      address: 'Durg',
    },
    ownerCookie,
    409,
  );
  await call(
    'command',
    {
      type: 'update-member',
      id: phoneId,
      name: 'Phone admin',
      phone: '9800000033',
      address: 'Durg',
    },
    ownerCookie,
    201,
  );
  await call(
    'auth/login',
    { identifier: '9800000003', pin: '638291' },
    '',
    401,
  );
  await call('auth/login', { identifier: '9800000033', pin: '638291' });
  await call(
    'command',
    { type: 'permissions', id: adminId, permissions: ['verify'] },
    ownerCookie,
    400,
  );
  await call(
    'command',
    { type: 'permissions', id: adminId, permissions: ['members'] },
    ownerCookie,
    201,
  );
  await call(
    'command',
    {
      type: 'update-member',
      id: memberId,
      name: 'Updated member',
      phone: '9800000044',
      address: 'Updated',
    },
    adminJoined.cookie,
    201,
  );
  await call(
    'command',
    {
      type: 'permissions',
      id: ownerMe.data.userId,
      permissions: ['members', 'prayers'],
    },
    ownerCookie,
    403,
  );
  await call(
    'command',
    {
      type: 'permissions',
      id: ownerMe.data.userId,
      permissions: ['members', 'prayers'],
    },
    superCookie,
    201,
  );
  // Delete means remove access while preserving audit history; old sessions stay revoked after reactivation.
  await call('command', { type: 'deactivate', id: adminId }, ownerCookie, 201);
  await call('me', undefined, adminJoined.cookie, 401);
  await call(
    'auth/login',
    { identifier: 'admin2@journey.test', pin: '482619' },
    '',
    401,
  );
  await call('command', { type: 'reactivate', id: adminId }, ownerCookie, 201);
  await call('me', undefined, adminJoined.cookie, 401);
  await call('auth/login', {
    identifier: 'admin2@journey.test',
    pin: '482619',
  });
  const revoked = await invite('member', 5, ownerCookie);
  await call(
    'command',
    { type: 'revoke-invite', id: revoked.id },
    ownerCookie,
    201,
  );
  await call('auth/invitation', { token: revoked.token }, '', 410);
  await call(
    'auth/register',
    { invitationToken: revoked.token, pin: '4821' },
    '',
    410,
  );
  const expired = await invite('member', 6, ownerCookie);
  await pool.query(
    "update mosque_private.invitations set expires_at=now()-interval '1 minute' where id=$1",
    [expired.id],
  );
  await call('auth/invitation', { token: expired.token }, '', 410);
  await call(
    'auth/register',
    { invitationToken: expired.token, pin: '4821' },
    '',
    410,
  );
  await call('auth/invitation', { token: 'not-a-token' }, '', 400);
  await call('auth/invitation', { token: 'f'.repeat(64) }, '', 410);
  // Legacy account with a saved password: no overwrite and no duplicate-account dead end.
  const unfinished = await invite('member', 7, ownerCookie);
  const unfinishedId = randomUUID();
  await pool.query(
    "insert into auth.users(id,email,pin_hash,credential_role) values($1,'member7@journey.test',$2,'member')",
    [unfinishedId, await pinHash('8492')],
  );
  assert.equal(
    (await call('auth/invitation', { token: unfinished.token })).data
      .existingAccount,
    true,
  );
  await call(
    'auth/register',
    { invitationToken: unfinished.token, pin: '0000' },
    '',
    401,
  );
  await call('auth/register', {
    invitationToken: unfinished.token,
    pin: '8492',
  });
  // A confirmation link already issued by the old flow joins the matching invitation atomically.
  const legacy = await invite('member', 8, ownerCookie);
  const legacyId = randomUUID();
  const legacyToken = 'a'.repeat(64);
  await pool.query(
    "insert into auth.users(id,email,pin_hash,credential_role) values($1,'member8@journey.test',$2,'member')",
    [legacyId, await pinHash('9628')],
  );
  await pool.query(
    "insert into auth.links(hash,user_id,type,expires_at) values($1,$2,'signup',now()+interval '1 hour')",
    [hash(legacyToken), legacyId],
  );
  await call(
    'auth/confirm',
    { tokenHash: legacyToken, type: 'signup' },
    superCookie,
    409,
  );
  const legacyJoined = await call('auth/confirm', {
    tokenHash: legacyToken,
    type: 'signup',
  });
  assert.equal(legacyJoined.data.destination, '/home');
  assert.equal(
    (await call('me', undefined, legacyJoined.cookie)).data.profile.name,
    'Journey member 8',
  );
  await call(
    'auth/confirm',
    { tokenHash: legacyToken, type: 'signup' },
    '',
    400,
  );
  assert.ok(
    (
      await pool.query(
        'select accepted_at from mosque_private.invitations where id=$1',
        [legacy.id],
      )
    ).rows[0].accepted_at,
  );
  // Concurrent registration consumes the invitation once and creates one profile.
  const concurrent = await invite('member', 9, ownerCookie);
  const responses = await Promise.all(
    [0, 1].map(() =>
      handle(
        new Request(process.env.APP_ORIGIN + '/api/backend/auth/register', {
          method: 'POST',
          headers: {
            Origin: process.env.APP_ORIGIN!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            invitationToken: concurrent.token,
            pin: '1597',
          }),
        }),
      ),
    ),
  );
  assert.deepEqual(
    responses.map((r) => r.status).sort((a, b) => a - b),
    [200, 410],
  );
  checks++;
  assert.equal(
    (
      await pool.query(
        "select count(*)::int count from mosque_profiles where email='member9@journey.test'",
      )
    ).rows[0].count,
    1,
  );
  console.log(
    `Invitation and people CRUD journeys passed: ${checks} API checks; owner MFA, email/phone admins, members, legacy links, validation, permissions, deactivation/reactivation, revoked/expired/reused links and concurrent acceptance.`,
  );
} finally {
  await close?.();
  await admin.query(`drop database ${databaseName} with (force)`);
  await admin.end();
}
