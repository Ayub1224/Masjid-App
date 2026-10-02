-- Local invitations can identify an admin by a real Indian mobile number alone.
-- The invitation establishes account access, not SMS ownership verification.
alter table auth.users alter column email drop not null;
alter table auth.users add column phone text unique;
alter table auth.users add column activated_at timestamptz;
alter table public.mosque_profiles alter column email drop not null;
alter table mosque_private.invitations alter column email drop not null;

create or replace function mosque_private.live_session() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid()
 and (s.not_after is null or s.not_after>now()) and (u.email_confirmed_at is not null or u.activated_at is not null))
$$;
-- Preserve existing owner access on upgrade. Subsequent switches are authoritative.
update public.mosque_profiles set permissions=array['members','record','verify','expenses','reports','prayers','news','receiving'] where role='owner';
create or replace function mosque_private.allowed(power text) returns boolean language sql stable security definer set search_path='' as $$
 select mosque_private.live_session() and exists(select 1 from public.mosque_profiles where id=auth.uid() and active and
 ((role='super-admin' and auth.jwt()->>'aal'='aal2' and power='administrators') or
 (role='owner' and auth.jwt()->>'aal'='aal2' and (power='administrators' or power=any(permissions) or (power in ('reverse','opening') and 'expenses'=any(permissions)))) or
 (role='admin' and power=any(permissions) and power not in ('record','verify','expenses','receiving'))))
$$;
-- Keep the audited transaction/idempotency implementation, adapting its local
-- identity rules without copying or changing historical hosted migrations.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('mosque_private.mosque_command(uuid,jsonb)'::regprocedure);
 definition:=replace(definition,
  'if email is null or email!~',
  'if (email is null and newrole<>''admin'') or (email is not null and email!~');
 definition:=replace(definition,
  'or length(email)>254 or token is null',
  ') or length(email)>254 or token is null');
 definition:=replace(definition, 'case newrole when ''admin'' then grants else ''{}'' end', 'case when newrole in (''admin'',''owner'') then grants else ''{}'' end');
 definition:=replace(definition, 'and role=''admin'' and active', 'and role in (''admin'',''owner'') and active');
 definition:=replace(definition,
  'email_confirmed_at is not null and lower(auth.users.email)=invitation.email',
  '(email_confirmed_at is not null and lower(auth.users.email)=invitation.email or activated_at is not null and invitation.email is null and auth.users.phone=invitation.phone)');
 execute definition;
end $$;
create or replace function public.mosque_command(request_id uuid,body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text; target_role text; admin_phone text; grants text[];
begin
 perform pg_advisory_xact_lock(91240909);
 if exists(select 1 from mosque_private.commands c where c.actor=auth.uid() and c.request_id=mosque_command.request_id) then
  return public.mosque_command_local_original(request_id,body);
 end if;
 select role into actor_role from public.mosque_profiles where id=auth.uid() and active;
 if body->>'type'='invite' then target_role:=body->>'role';
 elsif body->>'type'='revoke-invite' then select role into target_role from mosque_private.invitations where id=(body->>'id')::uuid;
 elsif body->>'type' in ('deactivate','reactivate','update-member','permissions') then select role into target_role from public.mosque_profiles where id=(body->>'id')::uuid;
 end if;
 if target_role='owner' and actor_role is distinct from 'super-admin' then raise exception 'Only super administrator manages owner' using errcode='42501'; end if;
 if body->>'type' in ('invite','permissions') and not mosque_private.allowed(case when target_role='member' then 'members' else 'administrators' end) then raise exception 'Permission denied' using errcode='42501'; end if;
 if body->>'type' in ('invite','permissions') and target_role='admin' and body->'permissions' ?| array['record','verify','expenses','receiving'] then raise exception 'Payment permissions unavailable to admins' using errcode='22023'; end if;
 if body->>'type'='permissions' then
  select coalesce(array_agg(value),'{}') into grants from jsonb_array_elements_text(body->'permissions');
  if not(grants <@ array['members','record','verify','expenses','reports','prayers','news','receiving']::text[]) then raise exception 'Unknown permission' using errcode='22023'; end if;
 end if;
 if body->>'type'='invite' and target_role in ('admin','owner') then
  admin_phone:=body->>'phone';
  if admin_phone is null or admin_phone!~'^\+91[6-9][0-9]{9}$' or nullif(btrim(body->>'address'),'') is null then raise exception 'Indian mobile number and address required' using errcode='22023'; end if;
  if exists(select 1 from public.mosque_profiles p where regexp_replace(p.phone,'[^0-9]','','g')=regexp_replace(admin_phone,'[^0-9]','','g')) or exists(select 1 from mosque_private.invitations i where i.phone=admin_phone and accepted_at is null and revoked_at is null and expires_at>now()) then raise exception 'Phone number already registered or invited' using errcode='23505'; end if;
 end if;
 return public.mosque_command_local_original(request_id,body);
end $$;
-- A phone-only login is gated by the same private attempt counter as email login.
create or replace function public.mosque_login_identity(identifier text,gate text) returns text language plpgsql security definer set search_path='' as $$
declare account text; key bytea; count_attempts integer;
begin
 if length(gate)<64 or not exists(select 1 from mosque_private.login_config where secret_hash=sha256(convert_to(gate,'UTF8'))) then raise exception 'Unavailable' using errcode='42501'; end if;
 if identifier is null or length(identifier)>254 then return null; end if;
 if position('@' in identifier)>0 then account:=lower(btrim(identifier));
 else
  select case when count(*)=1 then min(coalesce(p.email,p.id::text)) else null end into account from public.mosque_profiles p
  where p.active and regexp_replace(p.phone,'[^0-9]','','g')=regexp_replace(identifier,'[^0-9]','','g');
 end if;
 key:=sha256(convert_to(coalesce(account,lower(btrim(identifier))),'UTF8'));
 insert into mosque_private.login_attempts(identity_hash,started_at,attempts) values(key,now(),1)
 on conflict(identity_hash) do update set attempts=case when mosque_private.login_attempts.started_at<now()-interval '15 minutes' then 1 else mosque_private.login_attempts.attempts+1 end,
 started_at=case when mosque_private.login_attempts.started_at<now()-interval '15 minutes' then now() else mosque_private.login_attempts.started_at end returning attempts into count_attempts;
 if count_attempts>5 then return null; end if;
 return account;
end $$;
