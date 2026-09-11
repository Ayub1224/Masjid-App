begin;
alter table public.mosque_prayers add constraint jamaat_after_adhan check(jamaat>=adhan);
create function public.mosque_activity() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not (mosque_private.allowed('members') or mosque_private.allowed('record') or mosque_private.allowed('verify') or mosque_private.allowed('expenses') or mosque_private.allowed('reports') or mosque_private.allowed('prayers') or mosque_private.allowed('news') or mosque_private.allowed('receiving') or mosque_private.allowed('administrators')) then raise exception 'Permission required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(x) from (select action,target,created_at from mosque_private.audit where actor=auth.uid() or mosque_private.allowed('reverse') order by id desc limit 50) x),'[]'::jsonb);
end $$;
revoke all on function public.mosque_activity() from public,anon;
grant execute on function public.mosque_activity() to authenticated;
commit;
