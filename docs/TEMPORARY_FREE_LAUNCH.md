# Temporary free access

While commercial API approval is pending, the website and every app can offer
unlimited discovery, all supported providers, watchlists and availability alerts
to verified signed-in users. This is a temporary access policy, not a paid
subscription, a permanent Premium grant, or permission to stream provider video.
Provider subscriptions remain separate.

The migration defaults **OFF**. It never changes existing subscription,
entitlement, search-usage or watchlist records. All account and RLS checks still
require a confirmed email and an active authenticated session. Guest access is
not enabled. Existing sandbox-review isolation remains intact.

## Backend contract

`public.free_launch_status()` is a safe, argument-free read RPC returning one
boolean. It is callable by anonymous, authenticated and service roles; it
reveals no account data or configuration values. The backend should expose this
as `config.freeLaunch` and suppress new paid checkout/purchase offers during the
promotion. Scheduled availability processing must also check this flag instead
of relying only on stored paid-entitlement rows.

For a verified account while active, `membership_status()` returns:

```json
{"plan":"premium","free_launch":true,"access_source":"free_launch","premium_until":null,"watchlist":true,"remaining":null,"reset_at":null}
```

The internal `premium` value reuses existing feature gates. Customer-facing UI
should say **Free launch access**, rather than suggesting a paid subscription.
There is no fabricated subscription expiry. When the flag is disabled or its
optional expiry passes, previous paid/reviewer entitlements and ordinary free
quotas apply again. Promo searches do not consume the free allowance. Saved
watchlists are retained even if their normal access restriction returns.

## Enable after deployment and verification

Apply the migration and deploy matching backend/UI changes first. Then, in a
trusted service-role or database administration session:

```sql
update streamunify_private.free_launch_settings
set enabled=true, expires_at=null, updated_at=now()
where singleton;
select public.free_launch_status(); -- must be true
```

Use an explicit `expires_at` timestamp instead of `null` if automatic ending is
desired. Do not set an arbitrary deadline without the owner's instruction.
Verify config, a verified free account, unlimited searches, watchlist access,
availability alerts, and native app pricing labels. Verify guest/unverified
accounts remain denied and existing paid customers retain their subscriptions.

Changing this flag does **not** cancel or pause any existing Stripe, Apple or
Google renewal. Preventing new charges and decisions about existing renewals
need their own billing configuration and authorized handling.

## End the promotion

```sql
update streamunify_private.free_launch_settings
set enabled=false, updated_at=now()
where singleton;
select public.free_launch_status(); -- must be false
```

No backfill, deletion, paid entitlement rewrite or account reset is needed.
Disabling the promotion restores the previous rules immediately at the next
server/database authorization. Cached UI should refresh configuration and
membership status. Publishing updated app binaries is a separate release step.

## Tests

`node --test test/free-launch-database.test.mjs`

The PostgreSQL/PGlite test executes the actual migrations, checks default OFF,
idempotent reruns, service-only flag control, verified-session enforcement,
unlimited searches, watchlist/alert RLS, expiry, missing-row failure, and restores
the prior quota and paid/review access without mutating stored entitlements.
Production Supabase advisors and live end-to-end verification remain deployment
checks; this local test does not claim production was changed or tested.
