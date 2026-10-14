// Integration checks use a disposable database, never the user's mosque records.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const name = 'mosque_bulk_' + randomUUID().replaceAll('-', '');
await admin.query(`create database ${name}`);
const url = new URL(process.env.DATABASE_URL!);
url.pathname = '/' + name;
process.env.DATABASE_URL = url.toString();
process.env.LOCAL_TEST = 'true';
delete process.env.LOCAL_TEST_DATABASE;
process.env.APP_ORIGIN = 'http://localhost:3000';
let close: (() => Promise<void>) | undefined;
try {
  const migration = spawnSync('node', ['--import', 'tsx', 'local/migrate.ts'], {
    env: process.env,
    encoding: 'utf8',
  });
  assert.equal(migration.status, 0, migration.stderr);
  const { pool, asUser } = await import('./db');
  close = () => pool.end();
  const { handle } = await import('./server');
  const { pinHash, newSession, identity } = await import('./security');
  let checks = 0;
  async function call(
    path: string,
    body: unknown,
    cookie: string,
    status = 200,
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
      count: number;
      ids: string[];
      mustChangePin: boolean;
    };
    assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`);
    checks++;
    return {
      data,
      cookie: response.headers.get('set-cookie')?.split(';')[0] ?? cookie,
    };
  }
  async function account(role: string, permissions: string[], aal = 'aal1') {
    const id = randomUUID();
    await pool.query(
      'insert into auth.users(id,email,email_confirmed_at,pin_hash,credential_role) values($1,$2,now(),$3,$4)',
      [id, id + '@bulk.test', await pinHash('Fixture-password!'), role],
    );
    await pool.query(
      'insert into mosque_profiles(id,email,name,role,permissions) values($1,$2,$3,$4,$5)',
      [id, id + '@bulk.test', role, role, permissions],
    );
    const session = await newSession(id);
    await pool.query('update auth.sessions set aal=$2 where user_id=$1', [
      id,
      aal,
    ]);
    return { id, cookie: 'mosque-local-session=' + session.token };
  }
  const owner = await account('owner', ['members']);
  const manager = await account('admin', ['members']);
  const restricted = await account('admin', ['news']);
  const ordinary = await account('member', []);
  const row = {
    name: 'Bulk test',
    phone: '9876543210',
    address: 'Durg',
    pin: '0000',
  };
  const body = { members: [row] };
  await call('members/bulk-add', body, '', 401);
  await call('members/bulk-add', body, restricted.cookie, 403);
  await call('members/bulk-add', body, ordinary.cookie, 403);
  await call('members/bulk-add', body, owner.cookie, 403);
  await call('members/bulk-add', body, manager.cookie, 400); // mosque required
  await pool.query(
    "insert into mosque_details(name,address,latitude,longitude) values('Test mosque','Durg',21.19,81.28)",
  );
  await pool.query("update auth.sessions set aal='aal2' where user_id=$1", [
    owner.id,
  ]);
  const batch = {
    members: Array.from({ length: 100 }, (_, i) => ({
      ...row,
      phone: String(9000000000 + i),
      name: `Member ${i + 1}`,
      address: 'दुर्ग '.repeat(70),
    })),
  };
  const key = randomUUID();
  const created = await call('members/bulk-add', batch, owner.cookie, 200, key);
  assert.equal(created.data.count, 100);
  assert.deepEqual(
    (await call('members/bulk-add', batch, owner.cookie, 200, key)).data,
    created.data,
  );
  await call('members/bulk-add', body, owner.cookie, 409, key);
  await call(
    'members/bulk-add',
    { members: [row, batch.members[0]] },
    manager.cookie,
    409,
  );
  assert.equal(
    (
      await pool.query('select 1 from auth.users where phone=$1', [
        '+919876543210',
      ])
    ).rowCount,
    0,
  );
  await call(
    'members/bulk-add',
    { members: [{ ...row, role: 'owner' }] },
    manager.cookie,
    400,
  );
  const extra = await call('members/bulk-add', body, manager.cookie);
  const firstId = created.data.ids[0];
  const login = await call(
    'auth/login',
    { identifier: '9000000000', pin: '0000' },
    '',
  );
  assert.equal(
    (await call('me', undefined, login.cookie)).data.mustChangePin,
    true,
  );
  await call('records?table=mosque_profiles', undefined, login.cookie, 403);
  const principal = await identity(
    new Request('http://localhost:3000', { headers: { Cookie: login.cookie } }),
  );
  assert.equal(
    (await asUser(principal, (db) => db.query('select * from mosque_profiles')))
      .rowCount,
    0,
  );
  await call(
    'auth/change-pin',
    { currentPin: '0000', pin: '0000' },
    login.cookie,
    400,
  );
  await call(
    'auth/change-pin',
    { currentPin: '1111', pin: '4321' },
    login.cookie,
    403,
  );
  const changed = await call(
    'auth/change-pin',
    { currentPin: '0000', pin: '4321' },
    login.cookie,
  );
  assert.equal(
    (await call('me', undefined, changed.cookie)).data.mustChangePin,
    false,
  );
  await call('me', undefined, login.cookie, 401);
  await call('auth/login', { identifier: '9000000000', pin: '0000' }, '', 401);
  await call('auth/login', { identifier: '9000000000', pin: '4321' }, '');
  await call(
    'command',
    {
      type: 'update-member',
      id: firstId,
      name: 'Edited member',
      phone: '+919000000000',
      address: 'New address',
    },
    manager.cookie,
    201,
  );
  await call(
    'members/bulk-remove',
    { ids: [firstId, manager.id] },
    owner.cookie,
    400,
  );
  assert.equal(
    (
      await pool.query('select active from mosque_profiles where id=$1', [
        firstId,
      ])
    ).rows[0].active,
    true,
  );
  const removeKey = randomUUID();
  const removed = await call(
    'members/bulk-remove',
    { ids: created.data.ids },
    owner.cookie,
    200,
    removeKey,
  );
  assert.equal(removed.data.count, 100);
  await call(
    'members/bulk-remove',
    { ids: created.data.ids },
    owner.cookie,
    200,
    removeKey,
  );
  await call('me', undefined, changed.cookie, 401);
  assert.equal(
    (
      await pool.query(
        'select count(*)::int count from mosque_profiles where id=any($1::uuid[]) and not active',
        [created.data.ids],
      )
    ).rows[0].count,
    100,
  );
  assert.equal(
    (
      await pool.query(
        "select count(*)::int count from mosque_private.audit where action='bulk-remove-member'",
      )
    ).rows[0].count,
    100,
  );
  await call('members/bulk-remove', { ids: extra.data.ids }, manager.cookie);
  console.log(
    `Bulk members: ${checks} API checks passed, including 100-member batches, rollback, permissions, MFA, PIN rotation, single edit and bulk removal.`,
  );
} finally {
  await close?.();
  await admin.query(`drop database ${name} with (force)`);
  await admin.end();
}
