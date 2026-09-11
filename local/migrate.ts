import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { pool } from './db';
import { sendLink } from './security';
await pool.query(
  `create table if not exists public.local_migrations(name text primary key, applied_at timestamptz default now());`,
);
const done = new Set(
  (await pool.query('select name from public.local_migrations')).rows.map(
    (r) => r.name,
  ),
);
if (!done.has('local-base')) {
  await pool.query(`begin;
 do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text unique not null,email_confirmed_at timestamptz,pin_hash text);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz not null,token_hash text unique not null,aal text not null default 'aal1',recovery boolean not null default false);
 create table auth.links(hash text primary key,user_id uuid references auth.users(id),type text not null,expires_at timestamptz not null);
 create table auth.factors(id uuid primary key,user_id uuid unique references auth.users(id),secret text not null,verified boolean default false,last_step bigint default -1);
 create table auth.attempts(key text primary key,started_at timestamptz default now(),attempts int default 1);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 grant usage on schema public,auth,storage to anon,authenticated;
 grant execute on all functions in schema auth to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,created_at timestamptz default now(),unique(bucket_id,name));
 alter table storage.objects enable row level security;
 grant select,insert on storage.objects to authenticated;
 insert into public.local_migrations(name) values('local-base'); commit;`);
}
for (const name of readdirSync('supabase/migrations')
  .filter((n) => n.endsWith('.sql'))
  .sort()) {
  if (done.has(name)) continue;
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query(
      readFileSync(`supabase/migrations/${name}`, 'utf8')
        .replace(/^begin;\s*/i, '')
        .replace(/commit;\s*$/i, ''),
    );
    await db.query('insert into public.local_migrations(name) values($1)', [
      name,
    ]);
    await db.query('commit');
  } catch (e) {
    await db.query('rollback');
    throw e;
  } finally {
    db.release();
  }
  console.log(`Applied ${name}`);
}
await pool.query(
  `insert into mosque_private.login_config(singleton,secret_hash) values(true,$1) on conflict(singleton) do update set secret_hash=excluded.secret_hash`,
  [createHash('sha256').update(process.env.LOGIN_GATE_SECRET!).digest()],
);
if (!done.has('local-roles-v1')) {
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query(readFileSync('local/roles.sql', 'utf8'));
    await db.query(
      "insert into local_migrations(name) values('local-roles-v1')",
    );
    await db.query('commit');
  } catch (e) {
    await db.query('rollback');
    throw e;
  } finally {
    db.release();
  }
}
const email = process.env.BOOTSTRAP_EMAIL!;
const existing = await pool.query('select id from auth.users where email=$1', [
  email,
]);
if (!existing.rowCount && process.env.LOCAL_TEST !== 'true') {
  const id = randomUUID();
  await pool.query("insert into auth.users(id,email,credential_role) values($1,$2,'super-admin')", [
    id,
    email,
  ]);
  await pool.query(
    "insert into mosque_profiles(id,name,email,role) values($1,'Ayub',$2,'super-admin')",
    [id, email],
  );
  if (!process.env.BOOTSTRAP_PASSWORD_HASH)
    await sendLink(id, email, 'recovery');
  console.log(
    'First administrator created. Open http://localhost:8025 for the activation link.',
  );
}
if (
  process.env.LOCAL_TEST !== 'true' &&
  process.env.BOOTSTRAP_PASSWORD_HASH &&
  !done.has('local-superadmin-password-v1')
) {
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query(
      "update auth.users set pin_hash=$1,credential_role='super-admin',email_confirmed_at=now() where email=$2",
      [process.env.BOOTSTRAP_PASSWORD_HASH, email],
    );
    await db.query(
      "update mosque_profiles set phone='+917415216315' where email=$1 and role='super-admin'",
      [email],
    );
    await db.query(
      'delete from auth.sessions where user_id=(select id from auth.users where email=$1)',
      [email],
    );
    await db.query(
      'delete from auth.links where user_id=(select id from auth.users where email=$1)',
      [email],
    );
    await db.query(
      "insert into local_migrations(name) values('local-superadmin-password-v1')",
    );
    await db.query('commit');
  } catch (e) {
    await db.query('rollback');
    throw e;
  } finally {
    db.release();
  }
}
await pool.end();
