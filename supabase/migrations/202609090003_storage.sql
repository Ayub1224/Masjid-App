begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('payment-evidence','payment-evidence',false,5242880,array['image/jpeg','image/png','image/webp']),
 ('mosque-qr','mosque-qr',false,5242880,array['image/jpeg','image/png','image/webp']);
create function mosque_private.upload_allowed(bucket text) returns boolean language sql stable security definer set search_path='' as $$
 select mosque_private.active_member() and
 (bucket='payment-evidence' or (bucket='mosque-qr' and mosque_private.allowed('receiving'))) and
 (select count(*) from storage.objects where bucket_id=bucket and owner_id=auth.uid()::text and created_at>now()-interval '1 day')<30
$$;
revoke all on function mosque_private.upload_allowed(text) from public;
grant execute on function mosque_private.upload_allowed(text) to authenticated;
create policy mosque_evidence_upload on storage.objects for insert to authenticated with check (
 bucket_id in ('payment-evidence','mosque-qr') and mosque_private.upload_allowed(bucket_id)
 and split_part(name,'/',1)=auth.uid()::text and owner_id=auth.uid()::text
 and name ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp)$');
create policy mosque_evidence_read on storage.objects for select to authenticated using (
 bucket_id='payment-evidence' and mosque_private.active_member() and
 (owner_id=auth.uid()::text or (mosque_private.allowed('verify') and exists(select 1 from public.mosque_payments where evidence_path=name))));
create policy mosque_qr_read on storage.objects for select to authenticated using (
 bucket_id='mosque-qr' and mosque_private.active_member() and
 (owner_id=auth.uid()::text or exists(select 1 from public.mosque_receiving where qr_path=name)));
-- No client UPDATE or DELETE policy: submitted evidence cannot be replaced or erased.
commit;
