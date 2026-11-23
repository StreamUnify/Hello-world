-- Review purchases are deliberately separate from paid production subscriptions.
-- Only trusted service-role operations may approve an account, and every approval
-- expires. No client metadata, request environment, or purchase payload adds users.
create table if not exists public.store_review_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  approved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > approved_at and expires_at <= approved_at + interval '30 days')
);
create table if not exists public.store_sandbox_subscriptions (
  source text not null check (source in ('apple','google')),
  external_reference text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  premium_until timestamptz not null,
  checked_at timestamptz not null,
  verification_reference text not null,
  primary key (source,external_reference)
);
create index if not exists store_sandbox_subscriptions_user_idx on public.store_sandbox_subscriptions(user_id);
alter table public.store_review_accounts enable row level security;
alter table public.store_sandbox_subscriptions enable row level security;
revoke all on public.store_review_accounts,public.store_sandbox_subscriptions from public,anon,authenticated;
grant all on public.store_review_accounts,public.store_sandbox_subscriptions to service_role;

create or replace function public.store_review_access(p_user_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.store_review_accounts where user_id=p_user_id and approved_at<=now() and expires_at>now());
$$;
revoke all on function public.store_review_access(uuid) from public,anon,authenticated;
grant execute on function public.store_review_access(uuid) to service_role;

create or replace function public.apply_store_sandbox_subscription(p_source text,p_reference text,p_user_id uuid,p_product_id text,p_until timestamptz,p_checked_at timestamptz,p_verification_reference text,p_previous_reference text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare owner_id uuid;
begin
  if p_source not in ('apple','google') then raise exception 'Invalid store'; end if;
  -- Repeat the server gate in the same database transaction as persistence.
  -- Lock the approval row so a concurrent revocation cannot race this write.
  perform 1 from public.store_review_accounts where user_id=p_user_id and approved_at<=now() and expires_at>now() for share;
  if not found then raise exception 'Approved review account required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sandbox:'||p_source||':'||p_reference,3));
  select user_id into owner_id from public.store_sandbox_subscriptions where source=p_source and external_reference=p_reference;
  if owner_id is not null and owner_id<>p_user_id then raise exception 'Purchase belongs to another account' using errcode='42501';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sandbox:'||p_user_id::text||p_source,4));
  if p_previous_reference is not null then
    select user_id into owner_id from public.store_sandbox_subscriptions where source=p_source and external_reference=p_previous_reference;
    if owner_id is not null and owner_id<>p_user_id then raise exception 'Previous purchase belongs to another account' using errcode='42501';end if;
    update public.store_sandbox_subscriptions set premium_until='epoch',checked_at=p_checked_at where source=p_source and external_reference=p_previous_reference and user_id=p_user_id and checked_at<=p_checked_at;
  end if;
  insert into public.store_sandbox_subscriptions(source,external_reference,user_id,product_id,premium_until,checked_at,verification_reference)
  values(p_source,p_reference,p_user_id,p_product_id,p_until,p_checked_at,p_verification_reference)
  on conflict(source,external_reference) do update set product_id=excluded.product_id,premium_until=excluded.premium_until,checked_at=excluded.checked_at,verification_reference=excluded.verification_reference
  where public.store_sandbox_subscriptions.checked_at<=excluded.checked_at;
  -- Never write a sandbox expiry into production membership_entitlements.
end $$;
revoke all on function public.apply_store_sandbox_subscription(text,text,uuid,text,timestamptz,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.apply_store_sandbox_subscription(text,text,uuid,text,timestamptz,timestamptz,text,text) to service_role;

create or replace function streamunify_private.premium_until(p_user_id uuid)
returns timestamptz language sql stable security invoker set search_path='' as $$
  select max(expiry) from (
    select e.premium_until as expiry from public.membership_entitlements e where e.user_id=p_user_id and e.premium_until>now()
    union all
    select least(s.premium_until,r.expires_at) as expiry
      from public.store_sandbox_subscriptions s join public.store_review_accounts r on r.user_id=s.user_id
      where s.user_id=p_user_id and s.premium_until>now() and r.approved_at<=now() and r.expires_at>now()
  ) entitlements;
$$;
revoke all on function streamunify_private.premium_until(uuid) from public,anon,authenticated;

create or replace function streamunify_private.has_premium()
returns boolean language sql stable security definer set search_path='' as $$
  select streamunify_private.premium_until(streamunify_private.verified_actor()) is not null;
$$;

create or replace function streamunify_private.member_status()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := streamunify_private.verified_actor(); until_at timestamptz; usage public.search_usage%rowtype;
begin
  until_at:=streamunify_private.premium_until(actor);
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
-- CREATE OR REPLACE preserves the existing narrow authenticated grants on these
-- two functions, which are also used by watchlist/search RLS and quota checks.
