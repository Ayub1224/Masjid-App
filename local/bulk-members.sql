alter table auth.users add column if not exists must_change_pin boolean not null default false;
-- Temporary credentials cannot access records, including through direct SQL RPCs.
create or replace function mosque_private.live_session() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid()
 and (s.not_after is null or s.not_after>now())
 and (u.email_confirmed_at is not null or u.activated_at is not null)
 and not u.must_change_pin)
$$;
