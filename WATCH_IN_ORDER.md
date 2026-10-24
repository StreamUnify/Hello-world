# Watch in Order (website, iOS and Android)

Movie cards expose Watch in Order. The title-options dialog also exposes it.
Release order is loaded on demand from TMDB movie collections. Story chronology
is curated for the Star Wars Skywalker saga plus Solo/Rogue One, and the eleven
Harry Potter/Fantastic Beasts films. These sets are explicitly scoped in the UI;
other collections never claim a curated story timeline. Unknown release dates
sort last. Reboots remain in their own TMDB collections unless explicitly curated.

Each row shows its own country-specific streaming providers and access tiers,
including providers outside the user's selections. Free accounts retain the same
US/provider restrictions as search, while unavailable titles stay in their proper
position. Where to watch opens that sequel's options. Save to watchlist uses the
existing premium entitlement and storage. Browsing a franchise does not consume
another search allowance. No new third-party credentials are needed.

The `/api/movie-order?id=<TMDB movie ID>&country=US` endpoint uses the existing
bounded TMDB request cache and concurrency limits. When membership is enabled it
requires authentication, refreshes entitlements, and enforces provider restrictions.
A missing collection has a clear empty state; failed timelines can be retried;
provider failures preserve movies with a partial-availability notice.

Source of truth: index.html, catalog.mjs and movie-order.mjs. Run
`npm run prepare:platforms` to copy backend files and prepare the shared mobile UI;
then use the existing signed iOS and Android build/release workflows. Native store
releases are required for installed apps to pick up these bundled UI changes.

Timeline references are included in movie-order.mjs and linked in the interface.
