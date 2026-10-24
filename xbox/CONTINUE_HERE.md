# Continue StreamUnify Xbox work

User requested moving Xbox work into a new conversation to preserve the master project. Keep Xbox work isolated on feature/xbox-preview. Do not merge or deploy this unfinished checkpoint.

## Master project
- Repository: StreamUnify/Hello-world. Master means website, iOS and Android.
- Current main at this checkpoint: 742cfa464507830ead0cbaa66ee753faa3f2626b.
- Website https://www.streamunify.com is live on Render Hello-world-1, service srv-dbc2vibrjlhs73al1u9g, previously confirmed workspace tea-dbc0tklg1s2s73b5ni90.
- MEMBERSHIP_ENABLED=true, BILLING_ENABLED=true. Native Apple/Google billing flags remain false.
- Free: verified account, 10 searches per anchored calendar month, US only, 10 providers (Netflix, Disney+, Hulu, Peacock, Sling, Max, discovery+, Paramount+, CUE Broadcast, Tubi), no watchlist.
- Premium USD 2.99/month or USD 30/year; unlimited searches, supported providers, account watchlist. Provider subscriptions are separate. Web Stripe subscriptions enabled, but completed purchase -> signed webhook -> Premium activation is NOT yet end-to-end verified. No real charge was made. Tax collection not enabled.
- Signup and both prices visible in membership and watch-options popups. Label fix distinguishes direct provider links, TMDB options and provider homepage visits. PRs 8,9,10 merged. All 30 tests passed before those releases.
- Support: support@streamunify.com, existing Namecheap email.
- Current production Supabase is nrhgzrarngqnlsrnvnla, development acxxymkxgqjirnhlmwcv. Do not mix keys. No secrets belong in client/repository/chat.
- Latest TestFlight workflow fix on main restores app_store_connect: StreamUnify (capital S and U), matching successful old build 7e2e3e1. Lowercase streamunify caused the integration-not-found failure. User subsequently reported success and resolved Missing Compliance to Ready to Submit.
- User then reported search not displaying information in installed app. Live API tests: config200 with memberships enabled; trending200 with results and TMDB/Watchmode ok; unauthenticated title search401 Sign in to use your 10 free monthly searches. Asked whether installed app shows Sign in and instructed assigning latest main build to internal group, then updating in TestFlight. Device-level issue is not confirmed resolved.
- Analytics tag G-9FW1KRWQT7 loads after consent. User explicitly rejects Windsor.ai. Visitor count remains unknown. Google Analytics UI is signed in but its own requests (usersettings/dataaccess/streams) fail with HTTP status0, leaving blank Admin interface. Property URL observed a205930295p560484093; no successful reports. Tag Assistant could not establish debug connection. Do not claim tracking receipt or visitor count verified. Do not alter website code merely to fix Google's report-loading issue.

## Xbox direction and current checkpoint
User asked how to publish on Xbox and PlayStation, then authorized starting with Xbox. Use a separate console app, not an iOS/Android upload. Xbox first; Sony non-game app eligibility needs confirmation before implementation. Do not enroll/pay/create developer accounts without appropriate user steps.

Official references checked:
- https://learn.microsoft.com/en-us/windows/uwp/apps-for-xbox/application-architecture (native UWP or legacy WebView; WebView2 not supported on Xbox per this reference)
- https://learn.microsoft.com/en-us/windows/uwp/ui-input/gamepad-and-remote-interactions
- https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/upload-app-packages
- https://github.com/actions/runner-images/blob/main/images/windows/Windows2022-Readme.md (UWP workload and Windows SDK19041 available)
- Microsoft.NETCore.UniversalWindowsPlatform 6.2.14 verified on NuGet.

Native UWP XAML/C# prototype started at xbox/StreamUnify.Xbox:
- App.xaml / App.xaml.cs: activation and controller XY focus, mouse emulation off.
- MainPage.xaml: TV layout, search/discover/watchlist/account controls and result grid.
- CatalogClient.cs: HTTPS backend, public auth config, Supabase password grant, in-memory access/refresh tokens, authenticated server APIs and server-side membership enforcement. Passwords not persisted. Uses Windows.Data.Json and System.Net.Http.
- Package.appxmanifest: preview identity, internetClient only, universal family, unsigned package scaffold.
- StreamUnify.Xbox.csproj: x64 UWP, target SDK19041/min17763, pinned UWP framework6.2.14.

THIS IS INCOMPLETE AND UNTESTED. Missing MainPage.xaml.cs handlers, required image assets, CI workflow, build/deployment documentation and actual Windows compilation. No Xbox console tests, signed packages, Store association, Store certification, or provider-console deep links. It is not a distributable app yet.

Next steps:
1. Review auth API against current Supabase docs/changelog and fix any client issues. Commands to fetch docs had just been started; do not assume they completed or were reviewed.
2. Implement MainPage.xaml.cs with single-flight loading/sign-in, credential clearing, graceful quota/401/403 errors, title details, HTTPS-only provider launch, Premium watchlist actions. Include sign-out clearing grid and no cross-user data leakage. No embedded real keys or credentials.
3. Add valid package image assets, preview branding, development installation instructions and explicit Store identity/signing placeholders.
4. Add Windows2022 GitHub Actions UWP compile/package validation; test and fix failures. Review Release .NET Native behavior separately. Keep preview app separate from live web deployment.
5. Push a concrete draft PR when buildable, get actual Xbox hardware validation, then coordinate Microsoft Partner Center account and Store name/identity with user. No guarantee of certification or provider deep-link support.

## Communication
User prefers courteous, direct action, minimal back-and-forth. Do not claim incomplete work is live or tested. Do not ask for passwords or API keys in chat. Do not spawn subagents unless explicitly requested. User now wants to continue Xbox work in a NEW conversation, preserving master.
