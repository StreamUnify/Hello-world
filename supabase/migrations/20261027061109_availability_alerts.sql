create table public.availability_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 country text not null check (country ~ '^[A-Z]{2}$'),
 service_ids text[] not null check (cardinality(service_ids)<=100),
 updated_at timestamptz not null default now()
);
create table public.availability_alerts (
 user_id uuid not null references auth.users(id) on delete cascade,
 title_id text not null check (title_id ~ '^[0-9]{2,11}$'),
 source_id integer not null check (source_id>0),
 media_type text not null check (media_type in ('movie','series')),
 snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=30000),
 matched_services text[] not null default '{}',
 checked_at timestamptz,
 created_at timestamptz not null default now(),
 primary key(user_id,title_id),
 check (title_id=(source_id::bigint*10+case when media_type='series' then 1 else 0 end)::text)
);
create index availability_alerts_due_idx on public.availability_alerts(checked_at nulls first);
create table public.availability_notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 title_id text not null,
 snapshot jsonb not null,
 service_ids text[] not null,
 country text not null,
 created_at timestamptz not null default now(),
 read_at timestamptz,
 foreign key(user_id,title_id) references public.availability_alerts(user_id,title_id) on delete cascade
);
create index availability_notifications_owner_idx on public.availability_notifications(user_id,created_at desc);
alter table public.availability_preferences enable row level security;
alter table public.availability_alerts enable row level security;
alter table public.availability_notifications enable row level security;
revoke all on public.availability_preferences, public.availability_alerts, public.availability_notifications from public,anon,authenticated;
grant select,insert,update,delete on public.availability_preferences to authenticated;
grant select,delete on public.availability_alerts to authenticated;
grant insert(user_id,title_id,source_id,media_type,snapshot) on public.availability_alerts to authenticated;
grant select on public.availability_notifications to authenticated;
grant update(read_at) on public.availability_notifications to authenticated;
grant all on public.availability_preferences,public.availability_alerts,public.availability_notifications to service_role;
create policy availability_preferences_owner on public.availability_preferences for all to authenticated
 using(user_id=(select streamunify_private.verified_actor())) with check(user_id=(select streamunify_private.verified_actor()));
create policy availability_alerts_owner_read on public.availability_alerts for select to authenticated using(user_id=(select streamunify_private.verified_actor()));
create policy availability_alerts_owner_insert on public.availability_alerts for insert to authenticated with check(user_id=(select streamunify_private.verified_actor()));
create policy availability_alerts_owner_delete on public.availability_alerts for delete to authenticated using(user_id=(select streamunify_private.verified_actor()));
create policy availability_notifications_owner_read on public.availability_notifications for select to authenticated using(user_id=(select streamunify_private.verified_actor()));
create policy availability_notifications_owner_update on public.availability_notifications for update to authenticated
 using(user_id=(select streamunify_private.verified_actor())) with check(user_id=(select streamunify_private.verified_actor()));
-- Only the trusted server can record provider observations. Row locking makes
-- simultaneous checks idempotent and preserves a baseline across restarts.
create function public.record_availability_check(p_user_id uuid,p_title_id text,p_services text[],p_country text)
returns void language plpgsql security invoker set search_path='' as $$
declare current_alert public.availability_alerts%rowtype; prefs public.availability_preferences%rowtype; added text[];
begin
 select * into current_alert from public.availability_alerts where user_id=p_user_id and title_id=p_title_id for update;
 if not found then return; end if;
 select * into prefs from public.availability_preferences where user_id=p_user_id;
 if not found or prefs.country<>p_country or not p_services <@ prefs.service_ids then return; end if;
 select coalesce(array_agg(s order by s),'{}') into added from (select distinct unnest(p_services) s except select unnest(current_alert.matched_services)) changes;
 if current_alert.checked_at is not null and cardinality(added)>0 then
  insert into public.availability_notifications(user_id,title_id,snapshot,service_ids,country)
  values(p_user_id,p_title_id,current_alert.snapshot,added,p_country);
 end if;
 update public.availability_alerts set matched_services=p_services,checked_at=now() where user_id=p_user_id and title_id=p_title_id;
end;
$$;
revoke all on function public.record_availability_check(uuid,text,text[],text) from public,anon,authenticated;
grant execute on function public.record_availability_check(uuid,text,text[],text) to service_role;
