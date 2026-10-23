# Membership foundation — development only

This branch creates the database policy and server adapter. It does not yet add signup/login screens, enforce limits in the public catalog routes, or accept payments. Do not enable membership in production until those pieces are implemented and tested together. Existing website and mobile behavior is unchanged.

## Development database

Supabase project: StreamUnify Development (`acxxymkxgqjirnhlmwcv`), organization StreamUnify LLC, region us-east-2. The migration in `supabase/migrations` has been applied to this development project. Never reuse a development database for production customer records.

The adapter expects `MEMBERSHIP_ENABLED=true`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`. Keep configuration in the hosting environment. No service-role key, password, or card data belongs in browser assets or git. The adapter uses verified user access tokens and database row-level security.

## Confirmed policy

- Free: 10 submitted searches per calendar month anchored to the first search, US catalog limited to Netflix, Disney+, Hulu, Peacock, Sling, Max, discovery+, Paramount+, CUE Broadcast, and Tubi. No watchlist access.
- Premium: unlimited searches, supported catalog providers, and an account watchlist. USD $2.99/month or $30/year. Third-party streaming subscriptions are separate.
- Database quota updates lock each account's usage row. Clients cannot set their own quota or membership. Premium entitlement expiration hides watchlist records without deleting them.
- Sensitive database operations require a verified, nonanonymous account and an existing session. Passwords belong to Supabase Auth; payment details belong to the payment provider.

## Validation completed

`npm test` covers the catalog plus adapter failure, verification, quota denial, provider filtering, and watchlist input handling. Development database transaction checks confirmed 10 searches succeed and the 11th is denied; self-upgrades and free watchlist writes are blocked; premium searches remain unlimited; expired premium hides saved records; deleted sessions cannot use membership RPCs. Test transactions were rolled back. Supabase security advisors reported no lints after migration.

## Remaining before rollout

1. Account screens, email verification/recovery, redirect URLs, production email delivery, and mobile session handling.
2. Wire server endpoints and UI together: count explicit search submissions rather than typing/debounced requests, force free country to US, hide watchlist for free accounts, and preserve existing local saved titles. Define retry/idempotency and failed-search behavior before counting usage in production.
3. Connect a Stripe sandbox. Implement hosted subscription Checkout, customer portal, signature-verified idempotent webhooks, and server-owned entitlement updates. Current connection exposes the live Stripe account; no live products, subscriptions, or charges have been created for this work.
4. Implement applicable Apple and Google digital purchase flows and shared entitlements; Apple Pay/Google Pay on the web are distinct from native store billing.
5. Test account isolation, concurrent quota requests, month-end/leap-year resets, payment lifecycle events, recovery, and native flows before production deployment.
