alter table auth.users add column if not exists credential_role text not null default 'member';
update auth.users u set credential_role=p.role from mosque_profiles p where p.id=u.id;
create or replace function mosque_private.allowed(power text) returns boolean language sql stable security definer set search_path='' as $$
 select mosque_private.live_session() and exists(select 1 from public.mosque_profiles where id=auth.uid() and active and
 ((role='super-admin' and auth.jwt()->>'aal'='aal2' and power='administrators') or
 (role='owner' and auth.jwt()->>'aal'='aal2' and power in ('administrators','members','record','verify','expenses','reports','prayers','news','receiving','reverse','opening')) or
 (role='admin' and power=any(permissions))))
$$;
-- Guard owner lifecycle separately: an owner can manage admins, never create or replace an owner.
alter function public.mosque_command(uuid,jsonb) rename to mosque_command_local_original;
do $$ begin execute replace(pg_get_functiondef('public.mosque_command_local_original(uuid,jsonb)'::regprocedure),'mosque_command.','mosque_command_local_original.'); end $$;
revoke all on function public.mosque_command_local_original(uuid,jsonb) from public,anon,authenticated;
create function public.mosque_command(request_id uuid,body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text; target_role text;
begin
 select role into actor_role from public.mosque_profiles where id=auth.uid() and active;
 if body->>'type'='invite' then target_role:=body->>'role';
 elsif body->>'type'='revoke-invite' then select role into target_role from mosque_private.invitations where id=(body->>'id')::uuid;
 elsif body->>'type' in ('deactivate','reactivate','update-member','permissions') then select role into target_role from public.mosque_profiles where id=(body->>'id')::uuid;
 end if;
 if target_role='owner' and actor_role is distinct from 'super-admin' then raise exception 'Only super administrator manages owner' using errcode='42501'; end if;
 return public.mosque_command_local_original(request_id,body);
end $$;
revoke all on function public.mosque_command(uuid,jsonb) from public,anon;
grant execute on function public.mosque_command(uuid,jsonb) to authenticated;
