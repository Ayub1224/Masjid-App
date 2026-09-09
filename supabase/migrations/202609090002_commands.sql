begin;
create function public.mosque_command(request_id uuid, body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<cmd>>
declare
 actor uuid := auth.uid(); op text := body->>'type'; result jsonb; fingerprint bytea := sha256(convert_to(body::text,'UTF8'));
 old mosque_private.commands; me public.mosque_profiles; person public.mosque_profiles;
 payment public.mosque_payments; expense public.mosque_expenses; entry mosque_private.ledger; invitation mosque_private.invitations;
 target uuid := gen_random_uuid(); amount bigint; day date; power text; reason text; acct text; bank bigint; cash bigint;
 newrole text; grants text[]; token text; email text; obj jsonb;
begin
 if not mosque_private.live_session() then raise exception 'Session expired' using errcode='42501'; end if;
 if actor is null or request_id is null or jsonb_typeof(body)<>'object' or octet_length(body::text)>20000 then raise exception 'Invalid request' using errcode='22023'; end if;
 -- Serialize this small single-mosque register. Seat counts, overdraft checks and idempotency are atomic.
 perform pg_advisory_xact_lock(91240909);
 select * into me from public.mosque_profiles where id=actor and active;
 if op<>'accept-invite' and me.id is null then raise exception 'Membership required' using errcode='42501'; end if;
 select * into old from mosque_private.commands c where c.actor=cmd.actor and c.request_id=mosque_command.request_id;
 if found then
  if old.body_hash<>fingerprint then raise exception 'Request id already used' using errcode='23505'; end if;
  return old.result;
 end if;
 if (select count(*) from mosque_private.commands c where c.actor=cmd.actor and c.created_at>now()-interval '1 minute')>=60 then raise exception 'Rate limit' using errcode='P0001'; end if;
 power := case op when 'cash' then 'record' when 'review' then 'verify' when 'expense' then 'expenses'
 when 'post-expense' then 'expenses' when 'reverse' then 'reverse' when 'transfer' then 'expenses'
 when 'balance-check' then 'expenses' when 'opening' then 'opening' when 'permissions' then 'administrators'
 when 'prayers' then 'prayers' when 'notice' then 'news' when 'toggle-notice' then 'news' when 'receiving' then 'receiving' end;
 if power is not null and not mosque_private.allowed(power) then raise exception 'Permission or MFA required' using errcode='42501'; end if;
 if op in ('submit','cash','expense','transfer','balance-check','opening') then
  amount := (body->>'amountPaise')::bigint;
  if amount is null or amount<0 or amount>100000000 or (amount=0 and op not in ('balance-check','opening')) or (body->>'amountPaise')!~'^\d+$' then raise exception 'Invalid amount' using errcode='22023'; end if;
  day := (body->>'date')::date;
  if day is null or day>(now() at time zone 'Asia/Kolkata')::date or day<'2000-01-01'::date then raise exception 'Invalid date' using errcode='22023'; end if;
 end if;
 select coalesce(sum(bank_paise),0),coalesce(sum(cash_paise),0) into bank,cash from mosque_private.ledger;
 case op
 when 'submit' then
  if me.role='super-admin' then raise exception 'Member account required' using errcode='42501'; end if;
  if not exists(select 1 from storage.objects where bucket_id='payment-evidence' and name=body->>'evidencePath' and owner_id=actor::text)
   or split_part(body->>'evidencePath','/',1)<>actor::text then raise exception 'Owned evidence required' using errcode='22023'; end if;
  insert into public.mosque_payments(id,member_id,amount_paise,paid_on,purpose,method,reference,evidence_path,status,created_by)
   values(target,actor,amount,day,btrim(body->>'purpose'),'UPI',upper(btrim(body->>'reference')),body->>'evidencePath','pending',actor);
 when 'cash' then
  if not exists(select 1 from public.mosque_profiles where id=(body->>'memberId')::uuid and active and role<>'super-admin') then raise exception 'Member unavailable' using errcode='22023'; end if;
  insert into public.mosque_payments(id,member_id,amount_paise,paid_on,purpose,method,status,created_by,reviewed_by,reviewed_at)
   values(target,(body->>'memberId')::uuid,amount,day,btrim(body->>'purpose'),'Cash','verified',actor,actor,now());
  insert into mosque_private.ledger(source_id,kind,cash_paise,effective_on,created_by) values(target,'payment',amount,day,actor);
 when 'review' then
  select * into payment from public.mosque_payments where id=(body->>'id')::uuid for update;
  if not found or payment.status<>'pending' then raise exception 'Payment already reviewed or unavailable' using errcode='22023'; end if;
  if payment.member_id=actor or payment.created_by=actor then raise exception 'Cannot verify your own submission' using errcode='42501'; end if;
  reason := nullif(btrim(body->>'reason'),'');
  if body->>'status' not in ('verified','rejected') or body->>'status' is null or (body->>'status'='rejected' and reason is null) then raise exception 'Invalid review' using errcode='22023'; end if;
  update public.mosque_payments set status=body->>'status',reviewed_by=actor,reviewed_at=now(),reason=cmd.reason where id=payment.id;
  target:=payment.id;
  if body->>'status'='verified' then insert into mosque_private.ledger(source_id,kind,bank_paise,effective_on,created_by) values(target,'payment',payment.amount_paise,payment.paid_on,actor); end if;
 when 'expense' then
  acct:=body->>'account';
  if body->>'status' not in ('draft','paid') or body->>'status' is null then raise exception 'Invalid status' using errcode='22023'; end if;
  if body->>'status'='paid' and amount>(case acct when 'Bank' then bank when 'Cash' then cash else -1 end) then raise exception 'Insufficient balance' using errcode='22023'; end if;
  insert into public.mosque_expenses(id,amount_paise,paid_on,category,description,account,status,created_by)
   values(target,amount,day,btrim(body->>'category'),btrim(body->>'description'),acct,body->>'status',actor);
  if body->>'status'='paid' then insert into mosque_private.ledger(source_id,kind,bank_paise,cash_paise,effective_on,created_by)
   values(target,'expense',case acct when 'Bank' then -amount else 0 end,case acct when 'Cash' then -amount else 0 end,day,actor); end if;
 when 'post-expense' then
  select * into expense from public.mosque_expenses where id=(body->>'id')::uuid for update;
  if not found or expense.status<>'draft' then raise exception 'Expense unavailable' using errcode='22023'; end if;
  if expense.amount_paise>(case expense.account when 'Bank' then bank else cash end) then raise exception 'Insufficient balance' using errcode='22023'; end if;
  target:=expense.id;
  update public.mosque_expenses set status='paid' where id=target;
  insert into mosque_private.ledger(source_id,kind,bank_paise,cash_paise,effective_on,created_by)
   values(target,'expense',case expense.account when 'Bank' then -expense.amount_paise else 0 end,case expense.account when 'Cash' then -expense.amount_paise else 0 end,expense.paid_on,actor);
 when 'reverse' then
  reason:=nullif(btrim(body->>'reason'),'');
  if reason is null or length(reason)>500 then raise exception 'Reason required' using errcode='22023'; end if;
  select * into entry from mosque_private.ledger where source_id=(body->>'id')::uuid and kind in ('payment','expense');
  if not found or exists(select 1 from mosque_private.ledger where reverses=entry.id) then raise exception 'Entry already reversed or unavailable' using errcode='22023'; end if;
  insert into mosque_private.ledger(source_id,kind,bank_paise,cash_paise,effective_on,created_by,reverses,reason)
   values(target,'reversal',-entry.bank_paise,-entry.cash_paise,(now() at time zone 'Asia/Kolkata')::date,actor,entry.id,reason);
  if entry.kind='payment' then update public.mosque_payments set status='reversed',reason=cmd.reason where id=entry.source_id;
  else update public.mosque_expenses set status='reversed',reason=cmd.reason where id=entry.source_id; end if;
 when 'transfer' then
  if amount>cash then raise exception 'Insufficient cash' using errcode='22023'; end if;
  insert into mosque_private.ledger(source_id,kind,bank_paise,cash_paise,effective_on,created_by) values(target,'transfer',amount,-amount,day,actor);
 when 'opening' then
  if exists(select 1 from mosque_private.ledger) then raise exception 'Opening balance must be the first ledger entry' using errcode='22023'; end if;
  cash:=(body->>'cashPaise')::bigint;
  if cash is null or cash<0 or cash>100000000 or amount+cash=0 or (body->>'cashPaise')!~'^\d+$' then raise exception 'Invalid cash' using errcode='22023'; end if;
  insert into mosque_private.ledger(source_id,kind,bank_paise,cash_paise,effective_on,created_by) values(target,'opening',amount,cash,day,actor);
 when 'balance-check' then
  select coalesce(sum(bank_paise),0) into bank from mosque_private.ledger where effective_on<=day;
  insert into public.mosque_balance_checks(id,observed_paise,recorded_paise,as_of,note,created_by) values(target,amount,bank,day,btrim(body->>'note'),actor);
 when 'invite' then
  newrole:=body->>'role';
  if newrole not in ('member','admin','owner') or newrole is null then raise exception 'Invalid role' using errcode='22023'; end if;
  if not mosque_private.allowed(case newrole when 'member' then 'members' else 'administrators' end) then raise exception 'Permission or MFA required' using errcode='42501'; end if;
  email:=lower(btrim(body->>'email')); token:=body->>'token';
  if email is null or email!~'^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(email)>254 or token is null or token!~'^[a-f0-9]{64}$' or nullif(btrim(body->>'name'),'') is null or length(body->>'name')>120 or length(coalesce(body->>'phone',''))>25 or length(coalesce(body->>'address',''))>500 then raise exception 'Invalid invitation' using errcode='22023'; end if;
  if exists(select 1 from public.mosque_profiles p where p.email=cmd.email) or exists(select 1 from mosque_private.invitations i where i.email=cmd.email and accepted_at is null and revoked_at is null and expires_at>now()) then raise exception 'Invitation or member already exists' using errcode='23505'; end if;
  if newrole in ('admin','owner') and
   (select count(*) from public.mosque_profiles where role=newrole and active)+(select count(*) from mosque_private.invitations where role=newrole and accepted_at is null and revoked_at is null and expires_at>now())>=(case newrole when 'owner' then 1 else 4 end) then raise exception 'No administrator seats available' using errcode='22023'; end if;
  select coalesce(array_agg(value),'{}') into grants from jsonb_array_elements_text(coalesce(body->'permissions','[]'));
  if not(grants <@ array['members','record','verify','expenses','reports','prayers','news','receiving']::text[]) then raise exception 'Unknown permission' using errcode='22023'; end if;
  insert into mosque_private.invitations(id,token_hash,email,name,phone,address,role,permissions,invited_by)
   values(target,sha256(convert_to(token,'UTF8')),email,btrim(body->>'name'),coalesce(body->>'phone',''),coalesce(body->>'address',''),newrole,case newrole when 'admin' then grants else '{}' end,actor);
 when 'accept-invite' then
  if exists(select 1 from public.mosque_profiles where id=actor) then raise exception 'Membership already exists' using errcode='23505'; end if;
  select * into invitation from mosque_private.invitations where token_hash=sha256(convert_to(body->>'token','UTF8')) and accepted_at is null and revoked_at is null and expires_at>now() for update;
  if not found or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null and lower(auth.users.email)=invitation.email) then raise exception 'Invitation unavailable' using errcode='42501'; end if;
  insert into public.mosque_profiles(id,name,email,phone,address,role,permissions) values(actor,invitation.name,invitation.email,invitation.phone,invitation.address,invitation.role,invitation.permissions);
  update mosque_private.invitations set accepted_at=now() where id=invitation.id;
  target:=actor;
 when 'revoke-invite' then
  select * into invitation from mosque_private.invitations where id=(body->>'id')::uuid;
  if not found or not mosque_private.allowed(case invitation.role when 'member' then 'members' else 'administrators' end) then raise exception 'Permission denied' using errcode='42501'; end if;
  update mosque_private.invitations set revoked_at=now() where id=invitation.id and accepted_at is null;
  target:=invitation.id;
 when 'deactivate' then
  select * into person from public.mosque_profiles where id=(body->>'id')::uuid;
  if not found or person.role='super-admin' or not mosque_private.allowed(case person.role when 'member' then 'members' else 'administrators' end) then raise exception 'Permission denied' using errcode='42501'; end if;
  update public.mosque_profiles set active=false where id=person.id; target:=person.id;
 when 'permissions' then
  select coalesce(array_agg(value),'{}') into grants from jsonb_array_elements_text(body->'permissions');
  update public.mosque_profiles set permissions=grants where id=(body->>'id')::uuid and role='admin' and active;
  if not found then raise exception 'Admin unavailable' using errcode='22023'; end if;
  target:=(body->>'id')::uuid;
 when 'prayers' then
  if not (body->'prayers' @> '[{"name":"Fajr"},{"name":"Dhuhr"},{"name":"Asr"},{"name":"Maghrib"},{"name":"Isha"}]'::jsonb) or jsonb_array_length(body->'prayers') not between 5 and 6 or (select count(distinct value->>'name') from jsonb_array_elements(body->'prayers'))<>jsonb_array_length(body->'prayers') then raise exception 'Invalid schedule' using errcode='22023'; end if;
  for obj in select value from jsonb_array_elements(body->'prayers') loop
   insert into public.mosque_prayers(name,adhan,jamaat) values(obj->>'name',(obj->>'adhan')::time,(obj->>'jamaat')::time)
    on conflict(name) do update set adhan=excluded.adhan,jamaat=excluded.jamaat,updated_at=now();
  end loop;
 when 'notice' then
  insert into public.mosque_news(id,title,body,hindi_title,hindi_body,event_on,published,created_by)
   values(target,body->>'title',body->>'text',coalesce(body->>'hindiTitle',''),coalesce(body->>'hindiBody',''),(body->>'date')::date,(body->>'published')::boolean,actor);
 when 'toggle-notice' then
  target:=(body->>'id')::uuid; update public.mosque_news set published=not published where id=target;
  if not found then raise exception 'News unavailable' using errcode='22023'; end if;
 when 'receiving' then
  if not exists(select 1 from storage.objects where bucket_id='mosque-qr' and name=body->>'qrPath' and owner_id=actor::text) then raise exception 'Owned QR required' using errcode='22023'; end if;
  insert into public.mosque_receiving(singleton,upi,recipient,qr_path,updated_by) values(true,btrim(body->>'upi'),btrim(body->>'recipient'),body->>'qrPath',actor)
   on conflict(singleton) do update set upi=excluded.upi,recipient=excluded.recipient,qr_path=excluded.qr_path,updated_by=actor,updated_at=now();
 else raise exception 'Unknown command' using errcode='22023';
 end case;
 result:=jsonb_build_object('id',target);
 insert into mosque_private.audit(actor,action,target) values(actor,op,target);
 insert into mosque_private.commands(actor,request_id,body_hash,result) values(actor,request_id,fingerprint,result);
 return result;
end $$;
revoke all on function public.mosque_command(uuid,jsonb) from public,anon;
grant execute on function public.mosque_command(uuid,jsonb) to authenticated;
create function public.mosque_finances() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not mosque_private.active_member() then raise exception 'Membership required' using errcode='42501'; end if;
 return (select jsonb_build_object('bankPaise',coalesce(sum(bank_paise),0),'cashPaise',coalesce(sum(cash_paise),0)) from mosque_private.ledger);
end $$;
revoke all on function public.mosque_finances() from public,anon;
grant execute on function public.mosque_finances() to authenticated;
commit;
