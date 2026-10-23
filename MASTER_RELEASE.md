# StreamUnify master membership release

Master means website, iOS and Android. This release adds one account system, membership limits, an account watchlist, Stripe Checkout on the website, and native Apple/Google subscription verification and restoration. Provider subscriptions remain separate.

## Pricing and products

| Channel | Monthly | Annual |
| --- | --- | --- |
| Website | USD 2.99 | USD 30 |
| Apple subscription IDs | com.streamunify.premium.monthly | com.streamunify.premium.annual |
| Google subscription | streamunify_premium, monthly base plan | streamunify_premium, annual base plan |

Native screens display prices returned by the store. Configure these products in the existing app records, in a single Apple subscription group and a Google subscription with two auto-renewing base plans. Store products and a subscription purchase must be tested before enabling purchases.

## Deployment status and safeguards

Stripe billing is configured in production. Customer memberships remain behind MEMBERSHIP_ENABLED=false because existing published mobile builds do not implement account sign-in. Apple and Google purchases default to disabled. Deploying this code does not publish apps, enable memberships, or create store products.

Production Supabase is nrhgzrarngqnlsrnvnla; development is acxxymkxgqjirnhlmwcv. The native store migration adds only service-accessible purchase records and a service-only entitlement function. No client can set its own plan. Native credentials belong only on the backend.

The Stripe webhook URL is https://www.streamunify.com/api/billing/webhook. Unsigned requests are rejected. A successful real signed payment, entitlement update and account refresh still need end-to-end verification before launch.

## Native setup remaining

1. Add Supabase redirect URLs https://www.streamunify.com/, https://www.streamunify.com/?recover=1 and com.streamunify.app://auth/callback alongside the existing apex redirects. Password reset/verification links must open on the device that initiated the PKCE flow.
2. Apple backend variables: APPLE_BILLING_ENABLED=true, APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY and numeric APPLE_APP_ID. Use an App Store Server API key. Configure server notifications at https://www.streamunify.com/api/stores/apple/notifications.
3. Google backend variables: GOOGLE_BILLING_ENABLED=true, GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, GOOGLE_RTDN_AUDIENCE and GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL. Grant minimum required Play Developer API subscription permissions and configure authenticated Pub/Sub push notifications at https://www.streamunify.com/api/stores/google/notifications. The audience must match the configured OIDC audience exactly.
4. STORE_ENVIRONMENT defaults to Production. Use Sandbox ONLY on a separate development backend/database for Apple sandbox and Google test purchases. Production rejects test purchases. Never mix test credentials or test entitlements into production.
5. In Codemagic, build this branch with StreamUnify iOS Build and StreamUnify Android Debug Build, then StreamUnify iOS TestFlight. App Store Connect integration name is streamunify. iOS minimum is 15.0; Android minimum is 24 and target is 36. Android release distribution additionally needs the existing production signing keystore and a signed AAB workflow.
6. Test verified registration, password recovery, quota reset, free watchlist restriction, monthly/annual payments, restore, cancellation, expiry, refunds, cross-platform entitlement and account deletion on actual devices. Deleting an account does not cancel a store subscription; the UI states this and provides subscription management.
7. After compatible mobile builds are available, enable MEMBERSHIP_ENABLED and validate website payment end-to-end before inviting paying customers. Existing app versions may need a coordinated upgrade notice.

## Validation

30 Node tests pass, including forged signatures, account ownership, environment separation, native secure session storage, shared asset packaging and server routing. Android Capacitor sync and iOS asset copy pass on Linux. Native compilation/signing, store sandbox purchases and real signed notification delivery are not verified locally. The privacy and membership pages describe implemented behavior and need business review before store submission.
