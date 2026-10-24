# StreamUnify for Xbox — development preview

This is a separate Xbox TV interface and x64 UWP/WebView2 shell. It reuses the deployed StreamUnify catalog, account, allowance and watchlist APIs. It does not change the website, iOS, Android or backend behavior.

## Build

1. On Windows, install Visual Studio 2022 with UWP development tools, the .NET and C++ UWP components, and Windows SDK 10.0.19041.0. Microsoft’s setup guide: https://learn.microsoft.com/en-us/microsoft-edge/webview2/get-started/winui2
2. From the repository root, run `npm ci`, then `npm run build:xbox`. The default API origin comes from `mobile.config.json`. To use a different HTTPS environment, set `STREAMUNIFY_XBOX_API_BASE` before building.
3. Open `xbox/StreamUnify.Xbox/StreamUnify.Xbox.csproj` in Visual Studio, restore NuGet packages, and select **Debug / x64**.
4. Enable Xbox Developer Mode, pair the console, select **Remote Machine**, and deploy. Keep the deployment type as **App**. On Windows, Developer Mode and the WebView2 Runtime are needed for local testing.

The Xbox app validation GitHub Actions workflow restores dependencies, prepares web assets, runs Xbox unit checks, and compiles an **unsigned development package**. A successful workflow does not establish console compatibility or Store readiness. Visual Studio can sign and deploy a development build; unsigned CI output is not a public Store release.

Generated `Web/` output, `bin/`, `obj/`, certificates and AppPackages are excluded from source control. Run the preparation script before every native build. The five SU monogram images are temporary development artwork; replace them with approved StreamUnify Store assets before submission.

## Included

- TV layout, explicit focus, directional pad/stick navigation, A select, B back, dialog focus containment and focus restoration.
- Native gamepad polling with repeat delay; browser previews use Gamepad API. Input pauses while the system keyboard is visible.
- Catalog browsing, explicit-submit searches (one search ID per submission), country selection for Premium, selected-service filters and free-option filters.
- Existing email/password account sign-in and free account creation with email verification. No payment links, checkout, billing portal, or upgrade QR codes.
- Server-verified membership status, remaining search allowance and Premium account watchlist reads/additions/removals.
- App-isolated persistent auth storage through the Supabase client. No service-role key or provider credentials are packaged. Use sign-out on shared consoles; this preview does not link StreamUnify accounts to Xbox profiles.
- Packaged local web content with HTTPS virtual-host mapping, blocked top-level external navigation and popups, denied permission requests, and a minimal host message handler for the keyboard and two fixed legal URLs.

## Release blockers — still required

- **Windows compilation:** inspect the Xbox workflow result and resolve any SDK/packaging issues; Linux development cannot verify UWP compilation.
- **Physical Xbox tests:** cold start, controller-only navigation, virtual keyboard entry and dismissal, country selection, disconnect/reconnect, suspend/resume, poor network, sign-in/out, free allowance exhaustion, expired session, Premium watchlist synchronization and removal, large results, TV safe areas, and memory usage. Confirm no double A/B actions.
- **Partner Center:** verified StreamUnify company account, reserved app name, official package name/publisher identity, business details and any program onboarding presented in the account. The manifest currently uses a development identity. Do not submit it unchanged.
- **Account review:** test production sign-in and email verification with a test account, confirm auth redirects and legal/account-deletion instructions, and add secure device-code/QR sign-in as a later enhancement. No new database schema is required for this preview.
- **Provider links:** this preview displays availability only. Per-provider Xbox app/title launching needs documented protocols and real-device validation before it is enabled. Saved watchlist snapshots can be stale; searching refreshes availability.
- **Purchases:** recognize previously purchased Premium only. If adding digital purchases on Xbox, implement Microsoft Store purchases and server verification. Do not route users to Stripe, an external upgrade page or payment QR code. Current policy: https://learn.microsoft.com/en-us/windows/apps/publish/store-policies#108-financial-transactions
- **Store submission:** approved icons and Xbox screenshots, description, privacy and terms URLs, support@streamunify.com, age rating, territories, accessibility review, reviewer account/instructions, release package signing/association and certification.

## First release proposal

Entertainment/discovery app for Xbox Series X/S, US-first. Validate any advertised Xbox One compatibility separately. Existing Premium members can access their entitlements; other accounts get server-enforced free access. Provider subscriptions are separate. No playback or direct provider launch is advertised.

## Store description draft

Find your next movie or TV show with StreamUnify. Search titles, check streaming availability in your country, and filter by your selected services. Sign in with an existing StreamUnify account; members with active Premium access can use their synced watchlist. Free accounts include 10 searches per monthly period across 10 selected US providers. StreamUnify is a discovery tool and does not include streaming subscriptions or play movies and shows. Availability varies by region and can change. Purchases are not available in this Xbox version.
