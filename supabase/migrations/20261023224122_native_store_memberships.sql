create table public.store_subscriptions (
  source text not null check (source in ('apple','google')),
  external_reference text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  premium_until timestamptz not null,
  checked_at timestamptz not null,
  verification_reference text not null,
  primary key (source,external_reference)
);
create index store_subscriptions_user_idx on public.store_subscriptions(user_id);
alter table public.store_subscriptions enable row level security;
revoke all on public.store_subscriptions from public,anon,authenticated;
grant all on public.store_subscriptions to service_role;

-- Only the server can bind a verified purchase. A purchase cannot be transferred
-- to a different app account, and older concurrent checks cannot overwrite newer ones.
create function public.apply_store_subscription(p_source text,p_reference text,p_user_id uuid,p_product_id text,p_until timestamptz,p_checked_at timestamptz,p_verification_reference text,p_previous_reference text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare owner_id uuid; expiry timestamptz;
begin
  if p_source not in ('apple','google') then raise exception 'Invalid store'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_source||':'||p_reference,3));
  select user_id into owner_id from public.store_subscriptions where source=p_source and external_reference=p_reference;
  if owner_id is not null and owner_id<>p_user_id then raise exception 'Purchase belongs to another account' using errcode='42501';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text||p_source,4));
  if p_previous_reference is not null then
    select user_id into owner_id from public.store_subscriptions where source=p_source and external_reference=p_previous_reference;
    if owner_id is not null and owner_id<>p_user_id then raise exception 'Previous purchase belongs to another account' using errcode='42501';end if;
    update public.store_subscriptions set premium_until='epoch',checked_at=p_checked_at where source=p_source and external_reference=p_previous_reference and user_id=p_user_id and checked_at<=p_checked_at;
  end if;
  insert into public.store_subscriptions(source,external_reference,user_id,product_id,premium_until,checked_at,verification_reference)
  values(p_source,p_reference,p_user_id,p_product_id,p_until,p_checked_at,p_verification_reference)
  on conflict(source,external_reference) do update set product_id=excluded.product_id,premium_until=excluded.premium_until,checked_at=excluded.checked_at,verification_reference=excluded.verification_reference
  where public.store_subscriptions.checked_at<=excluded.checked_at;
  select coalesce(max(premium_until),'epoch'::timestamptz) into expiry from public.store_subscriptions where user_id=p_user_id and source=p_source;
  insert into public.membership_entitlements(user_id,source,premium_until,updated_at) values(p_user_id,p_source,expiry,now())
  on conflict(user_id,source) do update set premium_until=excluded.premium_until,updated_at=excluded.updated_at;
end $$;
revoke all on function public.apply_store_subscription(text,text,uuid,text,timestamptz,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.apply_store_subscription(text,text,uuid,text,timestamptz,timestamptz,text,text) to service_role;
