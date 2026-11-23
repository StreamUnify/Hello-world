-- Temporary free launch is a service-managed access policy, not a paid grant.
-- Default OFF: applying this migration never enables the promotion by itself.
create table if not exists streamunify_private.free_launch_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into streamunify_private.free_launch_settings(singleton,enabled)
values(true,false) on conflict(singleton) do nothing;
alter table streamunify_private.free_launch_settings enable row level security;
revoke all on streamunify_private.free_launch_settings from public,anon,authenticated;
grant usage on schema streamunify_private to service_role;
grant select,insert,update,delete on streamunify_private.free_launch_settings to service_role;

-- This intentionally public, argument-free RPC reveals only whether the public
-- promotion is active. Definer access reads the otherwise inaccessible flag;
-- no account information, keys, expiry, or entitlement rows are exposed.
create or replace function public.free_launch_status()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select enabled and (expires_at is null or expires_at>now())
    from streamunify_private.free_launch_settings where singleton),false);
$$;
revoke all on function public.free_launch_status() from public;
grant execute on function public.free_launch_status() to anon,authenticated,service_role;

create or replace function streamunify_private.has_premium()
returns boolean language plpgsql stable security definer set search_path='' as $$
declare actor uuid := streamunify_private.verified_actor();
begin
  -- PL/pgSQL declaration executes before the promotion branch. A SQL OR could
  -- short-circuit verification and accidentally authorize a guest.
  if public.free_launch_status() then return true; end if;
  return streamunify_private.premium_until(actor) is not null;
end;
$$;

create or replace function streamunify_private.member_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := streamunify_private.verified_actor(); until_at timestamptz; usage public.search_usage%rowtype;
begin
  if public.free_launch_status() then
    return jsonb_build_object('plan','premium','free_launch',true,'access_source','free_launch',
      'premium_until',null,'watchlist',true,'remaining',null,'reset_at',null);
  end if;
  -- Preserve paid and approved sandbox-review access exactly as before.
  until_at:=streamunify_private.premium_until(actor);
  if until_at is not null then
    return jsonb_build_object('plan','premium','free_launch',false,'premium_until',until_at,
      'watchlist',true,'remaining',null,'reset_at',null);
  end if;
  select * into usage from public.search_usage where user_id=actor;
  if usage.user_id is null then
    return jsonb_build_object('plan','free','free_launch',false,'watchlist',false,'remaining',10,'reset_at',null);
  end if;
  if now()>=usage.period_end then
    select ends_at into usage.period_end from streamunify_private.search_window(usage.anchor_at,now());
    usage.searches_used:=0;
  end if;
  return jsonb_build_object('plan','free','free_launch',false,'watchlist',false,
    'remaining',10-usage.searches_used,'reset_at',usage.period_end);
end;
$$;
-- Existing authenticated-only grants and verified session checks remain intact.
-- No paid or sandbox subscription/entitlement records are created or modified.
