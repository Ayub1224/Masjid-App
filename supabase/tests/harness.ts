import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
export async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 grant usage on schema public,auth,storage to anon,authenticated;
 grant execute on all functions in schema auth to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,created_at timestamptz default now());
 alter table storage.objects enable row level security;
 grant select,insert,update,delete on storage.objects to authenticated;`);
  for (const name of [
    '202609090001_core',
    '202609090002_commands',
    '202609090003_storage',
    '202609090004_invitation_preflight',
    '202609090005_invitation_listing',
    '202609100006_crud',
    '202609100007_login_guard',
    '202609100008_activity',
    '202609100009_payment_names',
    '202609110010_mosque_details',
  ]) {
    const sql = readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
    try {
      await db.exec(sql);
    } catch (e) {
      const err = e as { message: string; position?: string };
      throw new Error(
        `${name}: ${err.message} at ${err.position}: ${sql.slice(Number(err.position) - 100, Number(err.position) + 100)}`,
      );
    }
  }
  return db;
}
export const ids = {
  member: '00000000-0000-4000-8000-000000000001',
  other: '00000000-0000-4000-8000-000000000002',
  admin: '00000000-0000-4000-8000-000000000003',
  owner: '00000000-0000-4000-8000-000000000004',
  super: '00000000-0000-4000-8000-000000000005',
};
export async function seed(db: PGlite) {
  for (const [role, id] of Object.entries(ids)) {
    await db.query('insert into auth.users values($1,$2,now())', [
      id,
      `${role}@example.com`,
    ]);
    await db.query('insert into auth.sessions values($1,$1,null)', [id]);
    await db.query(
      `insert into public.mosque_profiles(id,name,email,role,permissions) values($1,$2,$3,$4,$5)`,
      [
        id,
        role,
        `${role}@example.com`,
        role === 'other' ? 'member' : role === 'super' ? 'super-admin' : role,
        [
          'members',
          'record',
          'verify',
          'expenses',
          'reports',
          'prayers',
          'news',
          'receiving',
        ],
      ],
    );
  }
}
export async function as(db: PGlite, id: string | null, aal = 'aal2') {
  await db.exec('reset role');
  await db.query(
    `select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)`,
    [id ?? '', JSON.stringify({ sub: id, session_id: id, aal })],
  );
  await db.exec(`set role ${id ? 'authenticated' : 'anon'}`);
}
export async function command(
  db: PGlite,
  body: object,
  id = crypto.randomUUID(),
) {
  return db
    .query<{ result: { id: string } }>(
      'select public.mosque_command($1,$2) as result',
      [id, JSON.stringify(body)],
    )
    .then((r) => r.rows[0].result);
}
