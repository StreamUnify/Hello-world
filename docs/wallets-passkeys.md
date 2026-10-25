# Embedded checkout and passkeys — activation checklist

This branch prepares the implementation. It does not activate wallets, passkeys, native billing, or tax. Master currently uses hosted Stripe Checkout.

## Website checkout

- Add the account's **publishable** key as `STRIPE_PUBLISHABLE_KEY` on Render. The key must start with `pk_live_` for the current live environment. Never use a secret key here.
- Register `www.streamunify.com` (and any additional host that displays checkout) in Stripe payment method domains. Currently only `checkout.stripe.com` is registered.
- Enable Google Pay in the Stripe payment configuration and confirm `available: true` and preference `on`. Last account read reported unavailable/off. Apple Pay was available/on.
- Test embedded Checkout, wallet eligibility, cancellation, plan switching, and signed webhook fulfillment in an isolated Stripe sandbox before setting `STRIPE_EMBEDDED_ENABLED=true` in production.
- Stripe's payment iframe owns card and wallet data. Only the authenticated customer's Checkout Session client secret is returned to that customer. The frontend completion callback refreshes server membership; it never grants Premium.
- Switching plans or checkout surfaces expires incompatible open sessions. Prices remain selected exclusively by the server. Customer Portal manages web subscriptions.
- Review tax registration requirements before enabling Stripe Tax. Automatic tax is deliberately unchanged; it must not be enabled without the appropriate active registrations.

## Passkeys

Use the permanent RP ID **www.streamunify.com**, matching the canonical website, to avoid relying on the apex-domain redirect for app association files. Do not change the RP ID after customers enroll.

Supabase production project: `nrhgzrarngqnlsrnvnla`.

1. Configure Auth → Passkeys: enabled; RP display name `StreamUnify`; RP ID `www.streamunify.com`; origin `https://www.streamunify.com`. Supabase currently labels passkeys experimental.
2. Verify web enrollment and sign-in with a real confirmed disposable account. Then enable Render `PASSKEYS_ENABLED=true`.
3. For iOS, supply the public Apple Team ID as `APPLE_TEAM_ID`, enable Associated Domains for `com.streamunify.app`, and include `App/Passkeys.entitlements` in the signed app's code-signing entitlements. Regenerate the provisioning profile to include that capability. The entitlement file is provided but deliberately not enabled in the current signing configuration. Verify `https://www.streamunify.com/.well-known/apple-app-site-association` returns JSON directly with no redirect. Native passkeys require iOS 16+; older supported devices retain password sign-in.
4. For Android, supply the **Play App Signing** certificate SHA-256 fingerprint (not merely the upload key) as `ANDROID_SIGNING_CERT_SHA256` on Render. Comma-separated fingerprints are supported for explicitly trusted signing certificates. Add the corresponding `android:apk-key-hash:<base64url SHA256>` origin to Supabase. Verify `https://www.streamunify.com/.well-known/assetlinks.json`. Passkeys require Android 9+ and a compatible credential provider.
5. Build signed iOS and Android apps and test registration, sign-out/sign-in, cancellation, wrong-origin rejection, and fallback on actual devices. Only then enable `PASSKEYS_IOS_ENABLED=true` / `PASSKEYS_ANDROID_ENABLED=true`.

Supabase issues and verifies challenges and creates sessions. The app bridges only native platform ceremonies. No biometric data is sent to StreamUnify. Account creation still begins with verified email; a supported, configured device can finish verification with a passkey instead of creating a password, or enroll a passkey later from the account. Password recovery remains available.

## Validation performed

54 Node tests pass, including server price selection, incompatible-session expiry, embedded session resumption, public key mode gating, passkey capability flags, verified-user registration guard, signed credential verification failures and Stripe mount cleanup. Shared website/backend/iOS/Android web assets were regenerated and consistency checks pass.

Cloud-browser QA uses clearly labeled local simulations for Auth, Stripe's payment form and passkey ceremonies. Real wallet charges, SMTP, native compilation and hardware biometric ceremonies are not verified by these simulations. This Linux environment has no Xcode or Android SDK.

Stripe connector domain registration was attempted twice. Both attempts requested authentication, reported it accepted, and returned no mutation confirmation. Do not assume registration succeeded; read back domains before any retry.
