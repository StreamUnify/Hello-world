# Subscription channel/add-on candidate

Base: deployed main `131bb3d07d750cbd1168c4660854eb4f6ee309f9`.
Scope: shared website/iOS/Android assets; no purchase, account connection, signing, tester, CI, or deployment changes.

## Behavior
- Users explicitly select subscriptions they already own in a separate add-on group. Selecting Prime Video does **not** select HBO Max through Amazon; selecting direct HBO Max does not select the Amazon, Apple, Roku, or Hulu route.
- Registry spans all source-reported channel products, not a hand-picked movie/provider list. TMDB explicit channel labels are mapped by route. Watchmode `/sources/` supplies authoritative `host_source_id`/`host_source`, including unfamiliar hosts, with stable source-specific identities. Only reported regional directory entries appear; a returned regional title offer may also establish an add-on choice for that country.
- Subscription offers from Watchmode are no longer discarded. `sub`, `rent`, `buy`, and `free` become subscription, rental, purchase, and ad-supported respectively. `tve` is never mislabeled as free/subscription. Source URLs must be HTTPS and contain no credentials; missing links are not fabricated.
- If source-directory lookup fails, ambiguous subscription rows such as `MAX` are not assumed to be direct HBO Max. Explicit route labels remain usable.
- Selected eligible subscription → free → ad-supported → other subscription → rental → purchase ordering remains. Merely selecting a rental provider never elevates its rental above free.
- Backend membership and alert matching use distinct add-on identities. Free membership's existing 10-US-provider restriction is retained; add-ons require Premium when membership is enabled. Server-side catalog and alert gates remain authoritative.
- Source directory is cached for 24 hours per country; TMDB registry retains the existing request cache. No search allowance is spent to fetch the add-on selector.

## Coverage limitations
This is not automatic account linking or entitlement verification. Manual selections describe the user's subscriptions; upstream catalog data still determines whether a title is offered. No inferred cross-host availability or universal catalog guarantee. Watchmode enrichment now covers every returned title, not only the first three: at most 18 titles per search page, 60 for an existing bounded collection, or one detail. Shared six-request concurrency, hourly offer cache and provider cooldown remain. Cold searches can therefore consume up to 15 more Watchmode title-source calls than before; collections can consume up to 57 more. No API plan is changed. Directory fetch adds a cached Watchmode request; availability-alert refresh now incorporates supported Watchmode offers too.

## Elf finding (November 1, 2026)
WBD's official US release list announces **Elf** for November 1:
https://press.wbd.com/us/media-release/whats-new-hbo-max-november-2?language_content_entity=en
Amazon's official guide lists it through an HBO Max subscription:
https://www.aboutamazon.com/news/entertainment/christmas-movies-amazon-prime-holidays-watch
This does not mean it is included with base Prime. Provider feed freshness can lag release-day additions. No movie-specific override is added.

## Primary technical references
- https://api.watchmode.com/openapi.json (source directory host relationship, source IDs, region lists, title-source type enum)
- https://api.watchmode.com/use-cases/app-deep-links (nullable/plan-dependent links)
- https://developer.themoviedb.org/reference/movie-watch-providers
- https://developer.themoviedb.org/reference/watch-providers-movie-list

Validation: mocked backend/title/directory tests and UI contract/ordering/race tests; generated backend/native assets must be regenerated after changes. Live authenticated provider coverage and signed TestFlight distribution are separate release checks, not claimed by local tests.
