-- Development foundation. All upgrades are written by trusted billing handlers,
-- never by user metadata or client-side tier flags.
create schema if not exists streamunify_private;
revoke all on schema streamunify_private from public, anon, authenticated;
grant usage on schema streamunify_private to authenticated;

create table public.membership_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('stripe','apple','google','manual_test')),
  premium_until timestamptz not null,
  external_reference text,
  updated_at timestamptz not null default now(),
  primary key (user_id, source),
  unique (source, external_reference)
);
create table public.search_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  anchor_at timestamptz not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  searches_used integer not null default 0 check (searches_used between 0 and 10),
  check (period_start < period_end)
);
create table public.watchlist_items (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title_id text not null check (length(title_id) between 1 and 100),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=30000),
  saved_at timestamptz not null default now(),
  primary key (user_id, title_id)
);
create index watchlist_items_user_saved_idx on public.watchlist_items(user_id, saved_at desc);

alter table public.membership_entitlements enable row level security;
alter table public.search_usage enable row level security;
alter table public.watchlist_items enable row level security;
revoke all on public.membership_entitlements, public.search_usage, public.watchlist_items from public, anon, authenticated;
grant select on public.membership_entitlements, public.search_usage to authenticated;
grant select, insert, update, delete on public.watchlist_items to authenticated;
grant all on public.membership_entitlements, public.search_usage, public.watchlist_items to service_role;

-- Privilege is needed only for auth/session checks and quota writes. The
-- implementation is in a non-exposed schema; wrappers remain SECURITY INVOKER.
create function streamunify_private.verified_actor()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid := auth.uid(); sid uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  sid := nullif(auth.jwt()->>'session_id','')::uuid;
  if not exists (
    select 1 from auth.users u join auth.sessions s on s.user_id=u.id
    where u.id=actor and u.email_confirmed_at is not null
      and not u.is_anonymous and s.id=sid
  ) then raise exception 'Verified active session required' using errcode='42501'; end if;
  return actor;
end;
$$;
create function streamunify_private.has_premium()
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.membership_entitlements e
    where e.user_id=streamunify_private.verified_actor() and e.premium_until>now()
  );
$$;

create policy entitlement_owner_read on public.membership_entitlements for select to authenticated
using (user_id=(select streamunify_private.verified_actor()));
create policy usage_owner_read on public.search_usage for select to authenticated
using (user_id=(select streamunify_private.verified_actor()));
create policy watchlist_premium_read on public.watchlist_items for select to authenticated
using (user_id=(select streamunify_private.verified_actor()) and (select streamunify_private.has_premium()));
create policy watchlist_premium_insert on public.watchlist_items for insert to authenticated
with check (user_id=(select streamunify_private.verified_actor()) and (select streamunify_private.has_premium()));
create policy watchlist_premium_update on public.watchlist_items for update to authenticated
using (user_id=(select streamunify_private.verified_actor()) and (select streamunify_private.has_premium()))
with check (user_id=(select streamunify_private.verified_actor()) and (select streamunify_private.has_premium()));
create policy watchlist_premium_delete on public.watchlist_items for delete to authenticated
using (user_id=(select streamunify_private.verified_actor()) and (select streamunify_private.has_premium()));

-- Anchor each period to the original first search in UTC. Jan 31 -> Feb 28 ->
-- Mar 31, rather than drifting permanently to the 28th. Empty months do not
-- require a scheduled reset job and changing devices cannot reset the quota.
create function streamunify_private.search_window(anchor timestamptz, moment timestamptz)
returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql immutable security invoker set search_path='' set timezone='UTC' as $$
declare months integer;
begin
  months := (extract(year from moment)::integer-extract(year from anchor)::integer)*12
          + extract(month from moment)::integer-extract(month from anchor)::integer;
  if anchor+make_interval(months=>months)>moment then months:=months-1; end if;
  return query select anchor+make_interval(months=>months),anchor+make_interval(months=>months+1);
end;
$$;
create function streamunify_private.member_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := streamunify_private.verified_actor(); until_at timestamptz; usage public.search_usage%rowtype;
begin
  select max(e.premium_until) into until_at from public.membership_entitlements e where e.user_id=actor and e.premium_until>now();
  if until_at is not null then return jsonb_build_object('plan','premium','premium_until',until_at,'watchlist',true,'remaining',null,'reset_at',null); end if;
  select * into usage from public.search_usage where user_id=actor;
  if usage.user_id is null then return jsonb_build_object('plan','free','watchlist',false,'remaining',10,'reset_at',null); end if;
  if now()>=usage.period_end then
    select ends_at into usage.period_end from streamunify_private.search_window(usage.anchor_at,now());
    usage.searches_used:=0;
  end if;
  return jsonb_build_object('plan','free','watchlist',false,'remaining',10-usage.searches_used,'reset_at',usage.period_end);
end;
$$;
create function streamunify_private.consume_search()
returns jsonb language plpgsql volatile security definer set search_path='' set timezone='UTC' as $$
declare actor uuid := streamunify_private.verified_actor(); usage public.search_usage%rowtype; status jsonb;
begin
  if streamunify_private.has_premium() then return streamunify_private.member_status()||'{"allowed":true}'::jsonb; end if;
  insert into public.search_usage(user_id,anchor_at,period_start,period_end)
  values(actor,now(),now(),now()+interval '1 month') on conflict(user_id) do nothing;
  select * into usage from public.search_usage where user_id=actor for update;
  if now()>=usage.period_end then
    select starts_at,ends_at into usage.period_start,usage.period_end from streamunify_private.search_window(usage.anchor_at,now());
    usage.searches_used:=0;
  end if;
  if usage.searches_used>=10 then return streamunify_private.member_status()||'{"allowed":false}'::jsonb; end if;
  update public.search_usage set period_start=usage.period_start,period_end=usage.period_end,searches_used=usage.searches_used+1 where user_id=actor;
  status:=streamunify_private.member_status();
  return status||'{"allowed":true}'::jsonb;
end;
$$;
create function public.membership_status()
returns jsonb language sql stable security invoker set search_path='' as $$ select streamunify_private.member_status(); $$;
create function public.consume_search()
returns jsonb language sql volatile security invoker set search_path='' as $$ select streamunify_private.consume_search(); $$;

revoke all on all functions in schema streamunify_private from public, anon, authenticated;
grant execute on function streamunify_private.verified_actor(),streamunify_private.has_premium(),streamunify_private.member_status(),streamunify_private.consume_search() to authenticated;
revoke all on function public.membership_status(),public.consume_search() from public, anon;
grant execute on function public.membership_status(),public.consume_search() to authenticated;
