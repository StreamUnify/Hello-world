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
