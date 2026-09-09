-- Run once through the protected Supabase SQL editor after Ayub has created and
-- email-verified his Supabase Auth account. No password is set or stored here.
begin;
do $$
declare uid uuid;
begin
 perform pg_advisory_xact_lock(91240909);
 if exists(select 1 from public.mosque_profiles where role='super-admin') then
  raise exception 'Super admin already exists; use a reviewed recovery procedure';
 end if;
 select id into strict uid from auth.users
 where lower(email)='aaayyub30@gmail.com' and email_confirmed_at is not null;
 insert into public.mosque_profiles(id,name,email,role) values(uid,'Ayub','aaayyub30@gmail.com','super-admin');
 insert into mosque_private.audit(actor,action,target) values(uid,'bootstrap-super-admin',uid);
end $$;
commit;
