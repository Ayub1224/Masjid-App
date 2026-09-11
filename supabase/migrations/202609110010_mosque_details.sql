begin;
create table public.mosque_details (
 singleton boolean primary key default true check(singleton),
 name text not null check(length(name) between 1 and 160),
 address text not null check(length(address) between 1 and 500),
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 picture text not null default '' check(length(picture)<=700000 and (picture='' or picture ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$')),
 updated_at timestamptz not null default now()
);
alter table public.mosque_details enable row level security;
create policy mosque_details_read on public.mosque_details for select to anon,authenticated using(true);
grant select on public.mosque_details to anon,authenticated;
create function public.mosque_save_details(input jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not (mosque_private.allowed('administrators') or mosque_private.allowed('receiving')) then raise exception 'Permission required' using errcode='42501'; end if;
 insert into public.mosque_details(singleton,name,address,latitude,longitude,picture)
 values(true,input->>'name',input->>'address',(input->>'latitude')::double precision,(input->>'longitude')::double precision,coalesce(input->>'picture',''))
 on conflict(singleton) do update set name=excluded.name,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,picture=excluded.picture,updated_at=now();
end $$;
revoke all on function public.mosque_save_details(jsonb) from public,anon;
grant execute on function public.mosque_save_details(jsonb) to authenticated;
commit;
