begin;
-- The operator inserts sha256(LOGIN_GATE_SECRET), never the plaintext secret.
create table mosque_private.login_config(singleton boolean primary key default true check(singleton), secret_hash bytea not null);
create table mosque_private.login_attempts(identity_hash bytea primary key,started_at timestamptz not null,attempts integer not null);
alter table mosque_private.login_config enable row level security;
alter table mosque_private.login_attempts enable row level security;
revoke all on mosque_private.login_config,mosque_private.login_attempts from public,anon,authenticated;
create function public.mosque_login_identity(identifier text, gate text) returns text
language plpgsql security definer set search_path='' as $$
declare email text; key bytea; count_attempts integer;
begin
 if length(gate)<64 or not exists(select 1 from mosque_private.login_config where secret_hash=sha256(convert_to(gate,'UTF8'))) then raise exception 'Unavailable' using errcode='42501'; end if;
 if identifier is null or length(identifier)>254 then return null; end if;
 if position('@' in identifier)>0 then email:=lower(btrim(identifier));
 else
  -- A phone alias must identify exactly one active member. No SMS verification is implied.
  select case when count(*)=1 then min(p.email) else null end into email from public.mosque_profiles p
  where p.active and regexp_replace(p.phone,'[^0-9]','','g')=regexp_replace(identifier,'[^0-9]','','g') and length(regexp_replace(identifier,'[^0-9]','','g'))>=10;
 end if;
 key:=sha256(convert_to(coalesce(email,lower(btrim(identifier))),'UTF8'));
 insert into mosque_private.login_attempts(identity_hash,started_at,attempts) values(key,now(),1)
 on conflict(identity_hash) do update set
 attempts=case when mosque_private.login_attempts.started_at<now()-interval '15 minutes' then 1 else mosque_private.login_attempts.attempts+1 end,
 started_at=case when mosque_private.login_attempts.started_at<now()-interval '15 minutes' then now() else mosque_private.login_attempts.started_at end
 returning attempts into count_attempts;
 -- Return null instead of raising: rejected attempts must commit their counter.
 if count_attempts>5 then return null; end if;
 return email;
end $$;
revoke all on function public.mosque_login_identity(text,text) from public;
grant execute on function public.mosque_login_identity(text,text) to anon,authenticated;
commit;
