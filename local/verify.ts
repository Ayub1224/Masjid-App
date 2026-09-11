import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as OTPAuth from 'otpauth';
const original = process.env.DATABASE_URL!;
const admin = new pg.Pool({ connectionString: original });
const name = 'mosque_check_' + randomUUID().replaceAll('-', '');
await admin.query(`create database ${name}`);
const url = new URL(original);
url.pathname = '/' + name;
process.env.DATABASE_URL = url.toString();
process.env.LOCAL_TEST = 'true';
let close: (() => Promise<void>) | undefined;
try {
  const migration = spawnSync('node', ['--import', 'tsx', 'local/migrate.ts'], {
    env: process.env,
    encoding: 'utf8',
  });
  assert.equal(migration.status, 0, migration.stderr);
  const { pool } = await import('./db');
  close = () => pool.end();
  const { pinHash } = await import('./security');
  const { handle } = await import('./server');
  const origin = process.env.APP_ORIGIN!;
  let checks = 0;
  async function call(
    path: string,
    body?: unknown,
    cookie = '',
    expected = 200,
    headers: Record<string, string> = {},
  ) {
    const res = await handle(
      new Request(origin + '/api/backend/' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          Cookie: cookie,
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    assert.equal(res.status, expected, `${path}: ${await res.clone().text()}`);
    checks++;
    return {
      data: (await res.json()) as {
        local: boolean;
        kind: string;
        digits: number;
        id: string;
        totp: { uri: string };
        records: { id: string; status: string; paid_on: string }[];
        url: string;
        invitationUrl: string;
      },
      cookie: res.headers.get('set-cookie')?.split(';')[0] ?? cookie,
    };
  }
  const ids = {
    owner: randomUUID(),
    member: randomUUID(),
    other: randomUUID(),
  };
  for (const [role, id] of Object.entries(ids)) {
    await pool.query(
      'insert into auth.users(id,email,email_confirmed_at,pin_hash) values($1,$2,now(),$3)',
      [
        id,
        role + '@local.test',
        await pinHash(role === 'owner' ? 'Owner-test-password!' : '4938'),
      ],
    );
    await pool.query(
      'insert into mosque_profiles(id,email,name,role,phone) values($1,$2,$3,$4,$5)',
      [
        id,
        role + '@local.test',
        role,
        role === 'owner' ? 'owner' : 'member',
        role === 'member' ? '+919876543210' : '',
      ],
    );
  }
  assert.equal((await call('settings')).data.local, true);
  await call('public');
  await call('me', undefined, '', 401);
  await call(
    'auth/login',
    {
      identifier: 'owner@local.test',
      password: 'Owner-test-password!',
      captchaToken: 'local',
    },
    '',
    403,
    { Origin: 'http://evil.test' },
  );
  const owner = await call('auth/login', {
    identifier: 'owner@local.test',
    password: 'Owner-test-password!',
    captchaToken: 'local',
  });
  const member = await call('auth/login', {
    identifier: '+919876543210',
    pin: '4938',
    captchaToken: 'local',
  });
  const other = await call('auth/login', {
    identifier: 'other@local.test',
    pin: '4938',
    captchaToken: 'local',
  });
  const cmd = (
    body: unknown,
    cookie: string,
    expected = 201,
    id = randomUUID(),
  ) => call('command', body, cookie, expected, { 'Idempotency-Key': id });
  await cmd(
    {
      type: 'cash',
      memberId: ids.member,
      amountPaise: 10000,
      date: '2026-01-01',
      purpose: 'UAT',
    },
    owner.cookie,
    403,
  );
  const factor = await call('auth/mfa/enroll', {}, owner.cookie);
  const otp = OTPAuth.URI.parse(factor.data.totp.uri).generate();
  await call(
    'auth/mfa/verify',
    { factorId: factor.data.id, code: otp },
    owner.cookie,
  );
  await call(
    'auth/mfa/verify',
    { factorId: factor.data.id, code: otp },
    owner.cookie,
    400,
  );
  const id = randomUUID(),
    cash = {
      type: 'cash',
      memberId: ids.member,
      amountPaise: 10000,
      date: '2026-01-01',
      purpose: 'UAT',
    };
  await cmd(cash, owner.cookie, 201, id);
  await cmd(cash, owner.cookie, 201, id);
  const rows = (
    await call('records?table=mosque_payments', undefined, member.cookie)
  ).data.records;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].paid_on, '2026-01-01');
  assert.equal(
    (await call('records?table=mosque_payments', undefined, other.cookie)).data
      .records.length,
    0,
  );
  await cmd(cash, member.cookie, 403);
  await call('records?table=auth.users', undefined, owner.cookie, 400);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9S8AAAAASUVORK5CYII=',
    'base64',
  );
  const upload = await handle(
    new Request(origin + '/api/backend/files/upload?bucket=payment-evidence', {
      method: 'POST',
      headers: {
        Origin: origin,
        Cookie: member.cookie,
        'Content-Type': 'image/png',
      },
      body: png,
    }),
  );
  assert.equal(upload.status, 201);
  checks++;
  const file = (await upload.json()) as { path: string };
  await call(
    'files/download',
    { bucket: 'payment-evidence', path: file.path },
    other.cookie,
    404,
  );
  const dl = await call(
    'files/download',
    { bucket: 'payment-evidence', path: file.path },
    member.cookie,
  );
  assert.equal(
    (
      await handle(
        new Request(dl.data.url, { headers: { Cookie: member.cookie } }),
      )
    ).status,
    200,
  );
  checks++;
  await cmd(
    {
      type: 'submit',
      amountPaise: 2500,
      date: '2026-01-01',
      purpose: 'UAT UPI',
      reference: 'UAT123456',
      evidencePath: file.path,
    },
    member.cookie,
  );
  const payments = (
    await call('records?table=mosque_payments', undefined, owner.cookie)
  ).data.records;
  const pending = payments.find(
    (p: { status: string }) => p.status === 'pending',
  );
  assert.ok(pending);
  await cmd(
    { type: 'bulk-review', ids: [pending.id], status: 'verified' },
    owner.cookie,
  );
  await call('finances', undefined, owner.cookie);
  await call('activity', undefined, owner.cookie);
  assert.equal(
    (await call('auth/identify', { identifier: 'owner@local.test' })).data.kind,
    'password',
  );
  assert.equal(
    (await call('auth/identify', { identifier: '9876543210' })).data.digits,
    4,
  );
  await call(
    'auth/login',
    { identifier: 'other@local.test', pin: '493827' },
    '',
    400,
  );
  const adminId = randomUUID();
  await pool.query(
    'insert into auth.users(id,email,email_confirmed_at,pin_hash,credential_role) values($1,$2,now(),$3,$4)',
    [adminId, 'admin@local.test', await pinHash('827364'), 'admin'],
  );
  await pool.query(
    "insert into mosque_profiles(id,email,name,role,permissions) values($1,'admin@local.test','UAT admin','admin',array['expenses'])",
    [adminId],
  );
  const adminSession = await call('auth/login', {
    identifier: 'admin@local.test',
    pin: '827364',
  });
  assert.equal(
    (await call('auth/identify', { identifier: 'admin@local.test' })).data
      .digits,
    6,
  );
  await call('auth/mfa/enroll', {}, adminSession.cookie, 403);
  await cmd(
    {
      type: 'expense',
      amountPaise: 100,
      date: '2026-01-01',
      category: 'UAT',
      description: 'Granted admin expense',
      account: 'Cash',
      status: 'draft',
    },
    adminSession.cookie,
  );
  await cmd(
    {
      type: 'cash',
      memberId: ids.member,
      amountPaise: 100,
      date: '2026-01-01',
      purpose: 'Not granted',
    },
    adminSession.cookie,
    403,
  );
  const adminInvite = {
    type: 'invite',
    email: 'newadmin@local.test',
    name: 'New admin',
    phone: '',
    address: '',
    role: 'admin',
    permissions: ['news'],
  };
  await cmd(adminInvite, owner.cookie);
  await cmd(
    { ...adminInvite, email: 'notallowed@local.test' },
    adminSession.cookie,
    403,
  );
  await cmd(
    { ...adminInvite, email: 'owner2@local.test', role: 'owner' },
    owner.cookie,
    403,
  );
  await cmd(
    {
      type: 'update-member',
      id: ids.owner,
      name: 'Changed owner',
      phone: '',
      address: '',
    },
    owner.cookie,
    403,
  );

  const invite = await cmd(
    {
      type: 'invite',
      email: 'invited@local.test',
      name: 'Invited UAT',
      phone: '',
      address: '',
      role: 'member',
      permissions: [],
    },
    owner.cookie,
  );
  const invitationToken = new URL(invite.data.invitationUrl).hash.slice(7);
  await call(
    'auth/register',
    {
      identifier: 'invited@local.test',
      pin: '5839',
      captchaToken: 'local',
      invitationToken,
    },
    '',
    202,
  );
  await call(
    'auth/login',
    { identifier: 'invited@local.test', pin: '5839', captchaToken: 'local' },
    '',
    401,
  );
  // Issue a known one-use token in the isolated test DB to exercise confirmation.
  const { hash } = await import('./security');
  const confirmation = 'a'.repeat(64);
  const invited = (
    await pool.query(
      "select id from auth.users where email='invited@local.test'",
    )
  ).rows[0].id;
  await pool.query(
    "insert into auth.links(hash,user_id,type,expires_at) values($1,$2,'signup',now()+interval '1 hour')",
    [hash(confirmation), invited],
  );
  const confirmed = await call('auth/confirm', {
    tokenHash: confirmation,
    type: 'signup',
  });
  await call(
    'auth/confirm',
    { tokenHash: confirmation, type: 'signup' },
    '',
    400,
  );
  await cmd(
    { type: 'accept-invite', token: invitationToken },
    confirmed.cookie,
  );
  await call('auth/password', { pin: '123456' }, confirmed.cookie, 403);
  await call(
    'auth/recover',
    { email: 'invited@local.test', captchaToken: 'local' },
    '',
    202,
  );
  const recovery = 'b'.repeat(64);
  await pool.query(
    "insert into auth.links(hash,user_id,type,expires_at) values($1,$2,'recovery',now()+interval '1 hour')",
    [hash(recovery), invited],
  );
  const recovering = await call('auth/confirm', {
    tokenHash: recovery,
    type: 'recovery',
  });
  await call('auth/password', { pin: '7218' }, recovering.cookie);
  await call('me', undefined, confirmed.cookie, 401);
  for (let i = 0; i < 5; i++)
    await call(
      'auth/login',
      { identifier: 'member@local.test', pin: '0000', captchaToken: 'local' },
      '',
      401,
    );
  await call(
    'auth/login',
    { identifier: '+919876543210', pin: '4938', captchaToken: 'local' },
    '',
    401,
  );
  await call('auth/logout', {}, member.cookie);
  await call('me', undefined, member.cookie, 401);
  console.log(
    `Local PostgreSQL/API verification passed: ${checks} checks (authentication, MFA, replay prevention, RLS, cash idempotency, private files, UPI and bulk review).`,
  );
} finally {
  await close?.();
  await admin.query(`drop database ${name} with (force)`);
  await admin.end();
}
