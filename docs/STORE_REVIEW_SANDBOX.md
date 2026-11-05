# Store review purchases

This change adds a controlled review path; it does not enable either store or
create subscription products. Website Stripe billing is unaffected.

Production purchases continue to use `store_subscriptions` and
`membership_entitlements`. Sandbox purchases use a separate
`store_sandbox_subscriptions` table, including separate purchase ownership,
replacement, and stale-update handling. Sandbox writes never change production
entitlements. An Apple transaction ID can exist independently in both stores.

The review account's UUID must have a service-managed `store_review_accounts`
approval. Approvals expire within 30 days and can be deleted immediately. Both
membership status and watchlist/search RLS require an active approval for sandbox
access. This is checked in the database on every authorization, without relying
on cached JWT claims or user-editable metadata.

The server additionally requires `STORE_REVIEW_ENABLED=true` to query/verify new
review purchases. Apple tries Sandbox only after the official Production API
reports a transaction-not-found error for an approved account. Production
outages and signature failures do not trigger fallback. Both environments use
their own Apple verifier. Google identifies test purchases from the authenticated
Google API response. A client-supplied environment or reviewer flag is ignored.

## Deployment and review setup

1. Review and apply the store-review migration after the existing membership and
   native-store migrations. Run Supabase security advisors. New tables and RPCs
   are service-role only; no anonymous/authenticated grants are needed.
2. Deploy the backend with normal store credentials and `STORE_ENVIRONMENT=Production`.
   Keep `APPLE_BILLING_ENABLED`, `GOOGLE_BILLING_ENABLED`, and
   `STORE_REVIEW_ENABLED` disabled until the corresponding store configuration is ready.
3. Configure the existing Apple products `com.streamunify.premium.monthly` and
   `com.streamunify.premium.annual`; Google product `streamunify_premium` with base
   plans `monthly` and `annual`. Verify the intended prices and store availability.
4. Confirm the verified review account UUID from the authenticated account
   record. Using a trusted service-role/database administration session, insert
   that UUID with a short expiry. Never let the client choose or write approval.

   ```sql
   -- Replace the UUID parameter using the verified review account; do not use an email.
   insert into public.store_review_accounts(user_id, approved_at, expires_at)
   values (:review_account_uuid, now(), now() + interval '7 days')
   on conflict (user_id) do update
   set approved_at=excluded.approved_at, expires_at=excluded.expires_at;
   ```

5. Enable review verification, configure authenticated notifications for both
   stores, and test on the signed store build: purchase, restore, renewal,
   cancellation, expiry, refund/revocation, interrupted fulfillment, and retry.
   Confirm a non-review account cannot obtain sandbox Premium.
6. Enable production billing only after product and real-device tests pass.
   Confirm valid production purchases remain independent from review records.

## Stop review access

`STORE_REVIEW_ENABLED=false` stops **new sandbox verification**; it does not erase
already verified sandbox subscriptions or revoke an active database approval.
To revoke existing review access immediately, delete that account's approval:

```sql
delete from public.store_review_accounts where user_id=:review_account_uuid;
```

For all review accounts, delete all approval rows using a trusted administration
session. Production entitlements remain intact. Sandbox rows can be retained for
investigation; without a current approval they grant no access. Disable the
server review flag as well. Removing the feature does not require dropping
tables, deleting customer data, or altering existing production subscriptions.

## Validation included

`node --test test/store-billing.test.mjs test/store-review-sandbox.test.mjs test/store-review-database.test.mjs`

The database test executes the real migrations twice in PGlite (PostgreSQL),
exercises role permissions/RLS, proves production rows are unchanged, verifies
colliding purchase references remain isolated, prevents cross-account transfer
and stale reactivation, and checks expired/revoked reviewer access. PGlite is a
pinned development-only dependency. This does not replace tests against the
actual Supabase project, Apple Sandbox, Google license testers, or signed devices.
