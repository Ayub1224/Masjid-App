-- Keep identity aliases synchronized with profile edits and invalidate removed access.
alter function public.mosque_command(uuid,jsonb) rename to mosque_command_people_v2;
do $$ begin execute replace(pg_get_functiondef('public.mosque_command_people_v2(uuid,jsonb)'::regprocedure), 'mosque_command.request_id', 'mosque_command_people_v2.request_id'); end $$;
revoke all on function public.mosque_command_people_v2(uuid,jsonb) from public,anon,authenticated;
create function public.mosque_command(request_id uuid,body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare target_role text; actor_role text; result jsonb; normalized_phone text;
begin
 perform pg_advisory_xact_lock(91240909);
 if exists(select 1 from mosque_private.commands c where c.actor=auth.uid() and c.request_id=mosque_command.request_id) then
  return public.mosque_command_people_v2(request_id,body);
 end if;
 if body->>'type'='update-member' then
  select role into target_role from public.mosque_profiles where id=(body->>'id')::uuid;
  select role into actor_role from public.mosque_profiles where id=auth.uid() and active;
  if not mosque_private.allowed(case target_role when 'member' then 'members' else 'administrators' end) or (target_role='owner' and actor_role is distinct from 'super-admin') or target_role='super-admin' then raise exception 'Permission denied' using errcode='42501'; end if;
  normalized_phone:=body->>'phone';
  if normalized_phone is null or (normalized_phone<>'' and normalized_phone!~'^\+91[6-9][0-9]{9}$') or (target_role in ('admin','owner') and (normalized_phone='' or nullif(btrim(body->>'address'),'') is null)) then raise exception 'Invalid contact details' using errcode='22023'; end if;
  if normalized_phone<>'' and (exists(select 1 from public.mosque_profiles p where p.id<>(body->>'id')::uuid and regexp_replace(p.phone,'[^0-9]','','g') in (right(normalized_phone,10),substring(normalized_phone from 2))) or exists(select 1 from mosque_private.invitations i where i.phone=normalized_phone and i.accepted_at is null and i.revoked_at is null and i.expires_at>now())) then raise exception 'Phone number already registered or invited' using errcode='23505'; end if;
 end if;
 result:=public.mosque_command_people_v2(request_id,body);
 if body->>'type'='update-member' then
  update auth.users set phone=nullif(body->>'phone','') where id=(body->>'id')::uuid;
 elsif body->>'type'='deactivate' then
  delete from auth.sessions where user_id=(body->>'id')::uuid;
 end if;
 return result;
end $$;
revoke all on function public.mosque_command(uuid,jsonb) from public,anon;
grant execute on function public.mosque_command(uuid,jsonb) to authenticated;
