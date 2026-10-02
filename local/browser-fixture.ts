// Disposable, deterministic browser fixtures. Never uses the application database.
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as OTPAuth from 'otpauth';
const name = 'mosque_browser_qa';
const mode = process.argv[2] ?? 'setup';
const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const fixtureSecret = 'JBSWY3DPEHPK3PXP';
if (mode === 'otp') {
  console.log(new OTPAuth.TOTP({ secret: fixtureSecret }).generate());
  await admin.end();
  process.exit(0);
}
if (mode === 'cleanup') {
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.end();
  process.exit(0);
}
if (mode === 'setup') await admin.query(`create database ${name}`);
process.env.LOCAL_TEST = 'true';
process.env.LOCAL_TEST_DATABASE = name;
process.env.APP_ORIGIN = 'http://localhost:3100';
if (mode === 'setup') {
  const result = spawnSync('node', ['--import', 'tsx', 'local/migrate.ts'], {
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw Error(result.stderr);
}
const { pool } = await import('./db');
try {
  const { pinHash, hash } = await import('./security');
  if (mode === 'setup') {
    const superId = randomUUID();
    await pool.query(
      "insert into auth.users(id,email,pin_hash,email_confirmed_at,credential_role) values($1,'super@browser.test',$2,now(),'super-admin')",
      [superId, await pinHash('Browser-fixture-password!')],
    );
    await pool.query(
      "insert into mosque_profiles(id,name,email,role) values($1,'QA Super Admin','super@browser.test','super-admin')",
      [superId],
    );
    await pool.query(
      'insert into auth.factors(id,user_id,secret,verified) values($1,$2,$3,true)',
      [randomUUID(), superId, fixtureSecret],
    );
    await pool.query(
      "insert into mosque_details(name,address,latitude,longitude) values('Gausul wara masjid','Durg',21.19,81.28)",
    );
    for (const [index, role] of ['member', 'admin', 'owner'].entries()) {
      await pool.query(
        'insert into mosque_private.invitations(token_hash,email,name,phone,address,role,permissions,invited_by) values($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          Buffer.from(hash(String(index + 1).repeat(64)), 'hex'),
          `${role}@browser.test`,
          role === 'owner'
            ? 'Aamir Yusuf'
            : role === 'admin'
              ? 'Zaid Khan'
              : 'Sameer Ahmed',
          `+91987777000${index}`,
          'Durg, Chhattisgarh',
          role,
          role === 'owner'
            ? [
                'members',
                'record',
                'verify',
                'expenses',
                'reports',
                'prayers',
                'news',
                'receiving',
              ]
            : role === 'admin'
              ? ['members', 'prayers']
              : [],
          superId,
        ],
      );
    }
    console.log(
      'Browser fixtures ready: localhost:3100. Invitation tokens are 1, 2 or 3 repeated 64 times for member, admin and owner.',
    );
  } else if (mode === 'join') {
    const { registerInvitation } = await import('./invitations');
    for (const [index, role] of ['member', 'admin', 'owner'].entries())
      await registerInvitation({
        invitationToken: String(index + 1).repeat(64),
        ...(role === 'owner'
          ? { password: 'Browser-owner-password!' }
          : { pin: role === 'admin' ? '738291' : '7382' }),
      });
    console.log(
      'Disposable owner/admin/member fixtures joined through the real registration service.',
    );
  }
} finally {
  await pool.end();
  await admin.end();
}
