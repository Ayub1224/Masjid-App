begin;
create schema if not exists mosque_private;
revoke create on schema public from public, anon, authenticated;
revoke all on schema mosque_private from public, anon, authenticated;
create table public.mosque_profiles (
 id uuid primary key references auth.users(id),
 name text not null check(length(name) between 1 and 120),
 email text not null unique check(email=lower(email)), phone text not null default '' check(length(phone)<=25),
 address text not null default '' check(length(address)<=500),
 role text not null check(role in ('member','admin','owner','super-admin')),
 active boolean not null default true,
 permissions text[] not null default '{}' check(permissions <@ array['members','record','verify','expenses','reports','prayers','news','receiving']::text[]),
 created_at timestamptz not null default now()
);
create unique index mosque_one_owner on public.mosque_profiles(role) where role='owner' and active;
create unique index mosque_one_super_admin on public.mosque_profiles(role) where role='super-admin' and active;
create table mosque_private.invitations (
 id uuid primary key default gen_random_uuid(), token_hash bytea not null unique,
 email text not null, name text not null, phone text not null, address text not null,
 role text not null check(role in ('member','admin','owner')),
 permissions text[] not null default '{}',
 expires_at timestamptz not null default now()+interval '48 hours',
 accepted_at timestamptz, revoked_at timestamptz,
 invited_by uuid not null references public.mosque_profiles(id), created_at timestamptz not null default now()
);
create table public.mosque_payments (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.mosque_profiles(id),
 amount_paise bigint not null check(amount_paise between 1 and 100000000), paid_on date not null,
 purpose text not null check(length(purpose) between 1 and 200),
 method text not null check(method in ('UPI','Cash')),
 reference text check(length(reference) between 6 and 100),
 evidence_path text unique,
 status text not null check(status in ('pending','verified','rejected','reversed')),
 reason text check(length(reason)<=500), created_by uuid not null references public.mosque_profiles(id),
 reviewed_by uuid references public.mosque_profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 check((method='Cash' and reference is null and evidence_path is null) or (method='UPI' and reference is not null and evidence_path is not null))
);
-- A reversed receipt still reserves its bank reference: the same incoming transfer cannot be counted again.
create unique index mosque_verified_reference on public.mosque_payments(lower(reference)) where status in ('verified','reversed') and method='UPI';
create index mosque_payment_member on public.mosque_payments(member_id,created_at desc);
create table public.mosque_expenses (
 id uuid primary key default gen_random_uuid(), amount_paise bigint not null check(amount_paise between 1 and 100000000),
 paid_on date not null, category text not null check(length(category) between 1 and 80),
 description text not null check(length(description) between 1 and 500), account text not null check(account in ('Bank','Cash')),
 status text not null check(status in ('draft','paid','reversed')), reason text,
 created_by uuid not null references public.mosque_profiles(id), created_at timestamptz not null default now()
);
create table mosque_private.ledger (
 id uuid primary key default gen_random_uuid(), source_id uuid not null,
 kind text not null check(kind in ('payment','expense','transfer','reversal','opening')),
 bank_paise bigint not null default 0, cash_paise bigint not null default 0,
 effective_on date not null, created_by uuid not null references public.mosque_profiles(id),
 reverses uuid unique references mosque_private.ledger(id), reason text,
 created_at timestamptz not null default now(), unique(source_id,kind),
 check(bank_paise<>0 or cash_paise<>0),
 check(kind<>'transfer' or bank_paise+cash_paise=0),
 check((kind='reversal')=(reverses is not null))
);
create table public.mosque_balance_checks (
 id uuid primary key default gen_random_uuid(), observed_paise bigint not null check(observed_paise>=0),
 recorded_paise bigint not null, as_of date not null, note text not null check(length(note) between 1 and 500),
 created_by uuid not null references public.mosque_profiles(id), created_at timestamptz not null default now()
);
create table public.mosque_prayers (
 name text primary key check(name in ('Fajr','Dhuhr','Asr','Maghrib','Isha','Jumuah')),
 adhan time not null, jamaat time not null, updated_at timestamptz not null default now()
);
create table public.mosque_news (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 160),
 body text not null check(length(body) between 1 and 4000), hindi_title text not null default '', hindi_body text not null default '',
 event_on date not null, published boolean not null default false,
 created_by uuid not null references public.mosque_profiles(id), created_at timestamptz not null default now()
);
create table public.mosque_receiving (
 singleton boolean primary key default true check(singleton), upi text not null check(length(upi) between 3 and 200),
 recipient text not null check(length(recipient) between 1 and 120), qr_path text not null,
 updated_by uuid not null references public.mosque_profiles(id), updated_at timestamptz not null default now()
);
create table mosque_private.audit (
 id bigint generated always as identity primary key, actor uuid not null, action text not null, target uuid,
 created_at timestamptz not null default now()
);
create table mosque_private.commands (
 actor uuid not null, request_id uuid not null, body_hash bytea not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(actor,request_id)
);
create function mosque_private.immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Immutable record' using errcode='42501'; end $$;
create trigger ledger_immutable before update or delete on mosque_private.ledger for each row execute function mosque_private.immutable();
create trigger audit_immutable before update or delete on mosque_private.audit for each row execute function mosque_private.immutable();
create function mosque_private.live_session() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.id::text=(select auth.jwt()->>'session_id') and s.user_id=(select auth.uid())
 and (s.not_after is null or s.not_after>now()) and u.email_confirmed_at is not null)
$$;
create function mosque_private.active_member() returns boolean language sql stable security definer set search_path='' as $$
 select mosque_private.live_session() and exists(select 1 from public.mosque_profiles where id=(select auth.uid()) and active)
$$;
create function mosque_private.allowed(power text) returns boolean language sql stable security definer set search_path='' as $$
 select mosque_private.live_session() and exists(select 1 from public.mosque_profiles where id=(select auth.uid()) and active
 and (select auth.jwt()->>'aal')='aal2' and
 ((role='super-admin' and power='administrators') or
 (role='owner' and power in ('members','record','verify','expenses','reports','prayers','news','receiving','reverse','opening')) or
 (role='admin' and power=any(permissions))))
$$;
-- Explicit SELECT-only policies. All writes go through bounded transactional commands.
alter table public.mosque_profiles enable row level security;
alter table public.mosque_payments enable row level security;
alter table public.mosque_expenses enable row level security;
alter table public.mosque_balance_checks enable row level security;
alter table public.mosque_prayers enable row level security;
alter table public.mosque_news enable row level security;
alter table public.mosque_receiving enable row level security;
create policy profile_read on public.mosque_profiles for select to authenticated using (
 mosque_private.active_member() and (id=auth.uid() or (role='member' and (mosque_private.allowed('members') or mosque_private.allowed('record'))) or (role in ('owner','admin') and mosque_private.allowed('administrators'))));
create policy payment_read on public.mosque_payments for select to authenticated using (
 mosque_private.active_member() and (member_id=auth.uid() or mosque_private.allowed('verify') or mosque_private.allowed('reports') or mosque_private.allowed('record')));
create policy expense_read on public.mosque_expenses for select to authenticated using (mosque_private.active_member() and (status<>'draft' or mosque_private.allowed('expenses')));
create policy check_read on public.mosque_balance_checks for select to authenticated using (mosque_private.allowed('expenses') or mosque_private.allowed('reports'));
create policy prayer_read on public.mosque_prayers for select to anon,authenticated using (true);
create policy news_read on public.mosque_news for select to anon,authenticated using (published or mosque_private.allowed('news'));
create policy receiving_read on public.mosque_receiving for select to authenticated using (mosque_private.active_member());
revoke all on public.mosque_profiles,public.mosque_payments,public.mosque_expenses,public.mosque_balance_checks,public.mosque_prayers,public.mosque_news,public.mosque_receiving from anon,authenticated;
grant select on public.mosque_profiles,public.mosque_payments,public.mosque_expenses,public.mosque_balance_checks,public.mosque_prayers,public.mosque_news,public.mosque_receiving to authenticated;
grant select on public.mosque_prayers,public.mosque_news to anon;
grant usage on schema mosque_private to anon,authenticated;
revoke all on all functions in schema mosque_private from public,anon,authenticated;
grant execute on function mosque_private.active_member(),mosque_private.allowed(text) to anon,authenticated;
-- Every private table also has RLS with zero user policies.
alter table mosque_private.invitations enable row level security;
alter table mosque_private.ledger enable row level security;
alter table mosque_private.audit enable row level security;
alter table mosque_private.commands enable row level security;
commit;
