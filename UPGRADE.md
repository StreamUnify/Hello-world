# Unified search upgrade

Development branch: `upgrade/unified-search`, based on `main` at `1279a7f`.

The existing design, artwork, country selector, service selections, and numeric
TMDB watchlist IDs are preserved. Added content uses namespaced IDs. New
watchlist entries save title snapshots so they remain available across searches
and reloads. Availability in saved snapshots expires after 24 hours; it refreshes
when the title appears in search again. Previously saved IDs gain snapshots when
those titles next appear in results.

## Server configuration

Set credentials as environment variables on the backend only:

| Source | Variables |
| --- | --- |
| TMDB | `TMDB_READ_ACCESS_TOKEN` or `TMDB_API_KEY` |
| Watchmode | `WATCHMODE_API_KEY` |
| Twitch | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` |
| Podcast Index | `PODCAST_INDEX_KEY`, `PODCAST_INDEX_SECRET` |
| YouTube | `YOUTUBE_API_KEY` |

Missing credentials disable only that source. Do not put credentials into
GitHub files, browser JavaScript, or mobile app bundles. No provider registration,
paid plan, production environment change, merge, or deployment has been performed.

`/api/search?q=...&country=US` returns normalized results and per-source status.
`/api/trending?country=US` uses TMDB, optionally enriched with Watchmode.
YouTube, Twitch channel search (including offline channels), and Podcast Index
run on explicit searches. Watchmode supplements the first three TMDB titles with
regional free availability. This cap limits quota use; it is not complete free
availability coverage. Watchmode links are used when supplied; otherwise existing
watch options remain available. Provider account authorization is not implemented.

Requests use an eight-second timeout, six concurrent outbound calls, bounded
in-memory caches, duplicate request suppression, and quota cooldowns. Caches reset
on restart and are not shared across instances. Search TTLs range from one minute
for Twitch to fifteen minutes for videos/podcasts; Watchmode caches for one hour.
No automatic retries or plan upgrades occur.

## Validation and remaining checks

Run `npm test` and `node --check server.mjs`.
Automated tests use fake provider responses: missing credentials, partial failure,
quota backoff, cache reuse, concurrency deduplication, token reuse, stable IDs,
regional free availability, and unsafe link rejection. Real provider accounts and
quotas remain unverified. Browser visual verification requires a browser runtime;
the available Playwright installation has no Chromium executable.

The separate `ios-development` branch is untouched. Native bundles have not been
rebuilt. Before merging, verify real provider responses and quotas, desktop/mobile
rendering, persisted watchlists, country changes, and Capacitor Android/iOS
behavior. Confirm each provider's current attribution and production terms. Do
not deploy without the owner's approval.

Official adapter references:
- https://developer.themoviedb.org/reference/search-multi
- https://api.watchmode.com/docs
- https://dev.twitch.tv/docs/api/reference/#search-channels
- https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/
- https://podcastindex-org.github.io/docs-api/
- https://developers.google.com/youtube/v3/docs/search/list

## iOS and Android companion upgrade

This branch targets `ios-development` and includes the existing native projects.
Website PR #2 targets `main`; merge both PRs only after approval. The root
`index.html` and catalog backend match the website upgrade. Run
`npm run prepare:platforms` after editing root sources: it refreshes `www/` for
both apps, adds native safe-area padding, and refreshes the standalone `backend/`
copy. `mobile.config.json` preserves the existing public Render API origin.
`STREAMUNIFY_API_BASE` can override that origin at build time for a test backend;
only an HTTPS origin is accepted. It must never contain credentials.

Use `npm run sync:android` and `npm run sync:ios` to prepare assets and sync the
native projects. Both commands ran successfully here. iOS skipped CocoaPods and
Xcode steps because those tools are unavailable on Linux. Generated native asset
directories remain ignored by Git and are recreated during the build.

Codemagic now prepares fresh assets before iOS sync and includes an Android debug
APK workflow. These workflows have not been executed by this change. Xcode,
CocoaPods, Android SDK, Java 21, device/emulator testing, and signed release builds
remain required on the appropriate build hosts. No app store release was made.

Additional validation: six automated checks pass; a jsdom interaction check passes
for website and mobile HTML (rendering, video filter, string IDs, direct links,
watchlist across new searches and reloads). Both native copied HTML files match
`www/index.html`. This checks script behavior and asset preparation, not visual
layout or native device behavior. Browser download failed in this environment.

The new app search categories require the upgraded shared Render backend to be
deployed separately with provider credentials. Until then, apps continue receiving
the existing TMDB-only API response. No backend deployment is authorized here.
