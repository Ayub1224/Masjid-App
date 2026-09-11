begin;
-- Reviewing a payment needs its contributor name, not their private contact
-- details. Do not broaden the profiles SELECT policy for payment verifiers.
create function public.mosque_payment_names() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not (mosque_private.allowed('verify') or mosque_private.allowed('record') or mosque_private.allowed('reports')) then raise exception 'Permission required' using errcode='42501'; end if;
 return coalesce((select jsonb_object_agg(p.id::text,p.name) from public.mosque_profiles p
 where exists(select 1 from public.mosque_payments payment where payment.member_id=p.id)),'{}'::jsonb);
end $$;
revoke all on function public.mosque_payment_names() from public,anon;
grant execute on function public.mosque_payment_names() to authenticated;
commit;
