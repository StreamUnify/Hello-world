create table public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now()
);
create table public.billing_subscriptions (
  subscription_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  premium_until timestamptz not null,
  event_created bigint not null
);
create index billing_subscriptions_user_idx on public.billing_subscriptions(user_id);
create table public.billing_events (event_id text primary key, received_at timestamptz not null default now());
alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_events enable row level security;
revoke all on public.billing_customers,public.billing_subscriptions,public.billing_events from public,anon,authenticated;
grant all on public.billing_customers,public.billing_subscriptions,public.billing_events to service_role;

-- Service-only transaction: deduplicate events, ignore stale state, serialize
-- updates per account and recompute entitlement across all its subscriptions.
create function public.apply_billing_event(p_event_id text,p_created bigint,p_user_id uuid,p_customer_id text,p_subscription_id text,p_until timestamptz)
returns void language plpgsql security invoker set search_path='' as $$
declare newest bigint; expiry timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,0));
  if not exists(select 1 from public.billing_customers where user_id=p_user_id and customer_id=p_customer_id) then raise exception 'Unknown billing owner';end if;
  insert into public.billing_events(event_id) values(p_event_id) on conflict do nothing;
  if not found then return;end if;
  select event_created into newest from public.billing_subscriptions where subscription_id=p_subscription_id;
  if newest is not null and newest>p_created then return;end if;
  insert into public.billing_subscriptions(subscription_id,user_id,premium_until,event_created)
  values(p_subscription_id,p_user_id,p_until,p_created)
  on conflict(subscription_id) do update set premium_until=excluded.premium_until,event_created=excluded.event_created
  where public.billing_subscriptions.user_id=excluded.user_id;
  select greatest(coalesce(max(premium_until),now()),now()) into expiry from public.billing_subscriptions where user_id=p_user_id;
  insert into public.membership_entitlements(user_id,source,premium_until,updated_at)
  values(p_user_id,'stripe',expiry,now())
  on conflict(user_id,source) do update set premium_until=excluded.premium_until,updated_at=excluded.updated_at;
end $$;
revoke all on function public.apply_billing_event(text,bigint,uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_billing_event(text,bigint,uuid,text,text,timestamptz) to service_role;

create table streamunify_private.search_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  query text not null,
  created_at timestamptz not null default now(),
  result jsonb not null,
  primary key(user_id,request_id)
);
alter table streamunify_private.search_receipts enable row level security;
revoke all on streamunify_private.search_receipts from public,anon,authenticated;
create function streamunify_private.consume_search_once(p_request_id uuid,p_query text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=streamunify_private.verified_actor(); receipt streamunify_private.search_receipts; result jsonb;
begin
  if p_request_id is null or p_query is null or length(p_query)>130 then raise exception 'Invalid search';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,1));
  select * into receipt from streamunify_private.search_receipts where user_id=actor and request_id=p_request_id;
  if found then
    if receipt.query<>p_query or receipt.created_at<now()-interval '10 minutes' then raise exception 'Search request expired' using errcode='22023';end if;
    return receipt.result;
  end if;
  result:=streamunify_private.consume_search();
  insert into streamunify_private.search_receipts(user_id,request_id,query,result) values(actor,p_request_id,p_query,result);
  -- Retain a short retry window; old IDs cannot be reused for free searches.
  delete from streamunify_private.search_receipts where user_id=actor and created_at<now()-interval '1 day';
  return result;
end $$;
revoke all on function streamunify_private.consume_search_once(uuid,text) from public,anon;
grant execute on function streamunify_private.consume_search_once(uuid,text) to authenticated;
create function public.consume_search_once(p_request_id uuid,p_query text)
returns jsonb language sql security invoker set search_path='' as $$ select streamunify_private.consume_search_once(p_request_id,p_query) $$;
revoke all on function public.consume_search_once(uuid,text) from public,anon;
grant execute on function public.consume_search_once(uuid,text) to authenticated;
