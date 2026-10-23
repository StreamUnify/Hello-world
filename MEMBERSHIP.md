# StreamUnify membership deployment

## Implemented

The website includes sign-in, email-verified signup, password recovery, membership status, Premium watchlists, local-watchlist import, and monthly/annual checkout controls. The server validates access tokens, enforces free US/provider limits, counts explicit searches atomically, and deduplicates search retries for ten minutes. Searches where every catalog source fails do not use an allowance. Empty results from a working source do use one search.

Premium subscriptions cost USD $2.99/month or $30/year. They cover StreamUnify discovery features and do not include subscriptions to third-party streaming providers. Billing uses Stripe-hosted Checkout and customer portal. Webhook signatures are required; fulfillment reads current subscription state and writes entitlements through a service-only database transaction that deduplicates event IDs and rejects older event state. Billing is disabled until configured and verified.

## Environments

- Development: `acxxymkxgqjirnhlmwcv`, us-east-2.
- Production: `nrhgzrarngqnlsrnvnla`, us-east-2.
- Organization: StreamUnify LLC.
- Render: StreamUnify workspace, existing Hello-world-1 service `srv-dbc2vibrjlhs73al1u9g`.

Both migrations have been applied to both databases. No customer test fixtures remain. Production URL and public key are configured in Render. `MEMBERSHIP_ENABLED=false` and `BILLING_ENABLED=false` preserve existing access until the dependencies below are ready. Environment variables are managed through Render, not duplicated in a Blueprint.

## Account activation

1. Configure a production SMTP sender in Supabase Production → Authentication → Email → SMTP. The default Supabase sender only delivers to project-team addresses and cannot support public signups. Verify the sender's domain with its email provider.
2. In Authentication → URL Configuration set Site URL to `https://streamunify.com` and allow `https://streamunify.com/` and `https://streamunify.com/?recover=1`. Keep email confirmation enabled. PKCE confirmation links should be opened in the same browser where signup began.
3. Test signup, confirmation, sign-in, recovery, sign-out, and revoked-session rejection using real controlled test accounts. Do not turn off verification to bypass email setup.
4. Plan mobile rollout before enforcing the shared catalog API: older installed mobile builds do not yet send account tokens. Updating only the server would prevent them from searching. Native builds need the new account client, supported session storage/deep-link handling, and store purchase integration before launch.
5. Once those checks pass, set `MEMBERSHIP_ENABLED=true` on Render and deploy. Verify unauthenticated search denial, exactly ten free submissions, US/provider filtering, reset dates, and Premium watchlist isolation.

## Billing activation

Use a separate Stripe sandbox first. The currently connected Stripe account exposes live mode only. The ChatGPT connection does not supply an API key to the running Render application.

Set these directly in Render's Environment page; never put secret values in chat, source control, or browser assets:

- `STRIPE_API_KEY`: restricted server key with required customer, Checkout, subscription/invoice read, and portal access.
- `STRIPE_WEBHOOK_SECRET`: signing secret for `/api/billing/webhook`.
- `STRIPE_MONTHLY_PRICE_ID` and `STRIPE_ANNUAL_PRICE_ID`: recurring USD prices for 299 cents/month and 3000 cents/year.
- `STRIPE_MODE`: `test` for sandbox; switch to `live` only with matching live keys, price IDs and endpoint secret after validation.
- `SUPABASE_SECRET_KEY`: Production project's server-only secret key for trusted billing writes. Do not substitute the public key.
- `PUBLIC_ORIGIN=https://streamunify.com`.

Subscribe the webhook to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`.

Configure the Stripe customer portal to allow cancellation and payment-method management. Test first payment, renewal, failure, cancellation, duplicate/reordered deliveries, and event retries against sandbox infrastructure. The success page never grants access. Current entitlement behavior requires an active subscription with a paid latest invoice; past-due/unpaid access is revoked. Existing web subscriptions are managed through the portal rather than creating a second subscription. The current single Render instance serializes checkout creation per user; add a shared checkout reservation lock before scaling to multiple instances.

Apple Pay and Google Pay can appear in eligible web Checkout sessions according to Stripe settings and device/browser eligibility. Native iOS and Android digital subscriptions still require their applicable store purchase integrations; this code hides web checkout controls in Capacitor apps. StoreKit and Play Billing are not implemented by this branch. Confirm tax registrations and the chosen collection setup before enabling automatic tax; this code does not turn it on implicitly.

## Verification

- `npm test`: 18 tests covering catalog behavior, input validation, auth failure, quota denial, billing mode/signatures, price selection, duplicate checkout protection, entitlement decisions, HTTP routes, and disabled-mode compatibility.
- UI interaction checks: typing consumes no searches, explicit submission consumes one, free provider list contains ten services, country is locked to US, watchlist requires Premium, and original device data is preserved.
- Rolled-back development database transactions: retry deduplication, request/query binding, client billing denial, month-end/leap-year reset behavior, duplicate/stale payment events, free quota, expired premium, and revoked sessions.
- Security advisors: four informational `rls_enabled_no_policy` findings are intentional for service-only billing tables and private retry receipts. Client grants are revoked and no client policies exist; no warning/error findings were reported. See https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy.

`npm run build` regenerates the committed browser bundle from `membership-client-src.js` using the pinned local bundler. Production installs from `package-lock.json`; Node 22+ is required. No runtime Supabase CLI is needed.
