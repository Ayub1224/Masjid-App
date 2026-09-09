begin;
create function public.mosque_invitation_list(page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not (mosque_private.allowed('members') or mosque_private.allowed('administrators')) then raise exception 'Permission or MFA required' using errcode='42501'; end if;
 if page is null or page<0 or page>10000 then raise exception 'Invalid page' using errcode='22023'; end if;
 return coalesce((select jsonb_agg(to_jsonb(i)) from (
 select id,email,name,phone,address,role,permissions,expires_at,accepted_at,revoked_at,created_at
 from mosque_private.invitations
 where (role='member' and mosque_private.allowed('members')) or (role in ('owner','admin') and mosque_private.allowed('administrators'))
 order by created_at desc,id limit 50 offset page*50
 ) i),'[]'::jsonb);
end $$;
revoke all on function public.mosque_invitation_list(integer) from public,anon;
grant execute on function public.mosque_invitation_list(integer) to authenticated;
commit;
