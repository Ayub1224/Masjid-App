begin;
-- Token possession permits signup only for the nominated address. No profile or role is created at signup.
create function public.mosque_invitation_valid(token text,email text) returns boolean
language sql stable security definer set search_path='' as $$
 select length(token)=64 and exists(select 1 from mosque_private.invitations i where
 i.token_hash=sha256(convert_to(token,'UTF8')) and i.email=lower(btrim(mosque_invitation_valid.email))
 and i.accepted_at is null and i.revoked_at is null and i.expires_at>now())
$$;
revoke all on function public.mosque_invitation_valid(text,text) from public;
grant execute on function public.mosque_invitation_valid(text,text) to anon,authenticated;
commit;
