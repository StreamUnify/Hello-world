# Daily verified streaming highlights

`GET /api/release-highlights?country=US` serves a bounded, validated daily snapshot. Native/web UI shows new arrivals (last14 calendar days) and announced streaming releases (next30days); it filters by selected country and supported service controls. These are provider announcements, not a guarantee of playback or inclusion in a user's subscription.

## Sources and limits
Initial adapter covers image-bearing Prime Video United States spotlights discovered from Amazon's current official entertainment index/RSS and monthly streaming roundup. It requires an explicit US editorial statement, title-specific image, real calendar streaming date and relevant originals/new-title section; rentals, sports and channels sections are excluded. It does not turn theatrical dates into streaming dates.
Netflix Tudum is withheld: country locale is not availability evidence and generic card timestamps can be article publication dates. No Netflix records are admitted until an actual streaming-specific structure and scope are established. WBD was inaccessible to raw fetching and is not silently substituted with cached search results. Other countries/providers can have no verified cards; no universal coverage claim.
Artwork URLs are contextual official publisher assets, not assertions that public access grants an image license. Publisher corrections/removals are reflected at the next successful source refresh. Missing artwork is hidden by the client.

## Durable scheduling
`.github/workflows/daily-release-highlights.yml` runs at06:00UTC daily and on main changes to its own ingestion sources, plus manual dispatch. GitHub scheduled times are best-effort, not exact-time guarantees. It fetches official sources and writes `release-highlights.json` to dedicated `data/release-highlights` branch. This is persistent across Render restarts and does NOT push daily main commits or trigger the existing main-only native/TestFlight workflows. No new paid service, API key, database extension, or user credentials are required. GitHub's job token has repository contents-write solely for the fixed data-branch push.

The backend reads the fixed public raw GitHub URL with bounded8s timeout,1MBlimit, coalesced15min cache and failure backoff. Source/image hosts, dates, country, schema and timestamps are validated. Existing valid snapshot can survive a short fetch failure without changing checkedAt/verifiedAt; expired or invalid data yields empty releases. Snapshot/record timestamps expire after48h. A failed source refresh writes no fabricated replacement records. `nextRefreshAt` denotes the next planned06:00UTC refresh, not proof that a job ran.

## Operations
Inspect Actions “Daily verified streaming highlights” run outcome and data-branch commit/snapshot checkedAt; then verify production endpoint reports fresh actual records. Confirm sources statuses and country coverage. If no current image-bearing announcements exist, an empty lane is expected. Avoid adding testfixtures to the production data branch. Testfixtures in Node tests are synthetic and not production source material.

First actual local refresh:2026-11-02T01:26:44.967Z,8PrimeUS announcements,Netflixunavailable,nextplanned2026-11-02T06:00:00Z. This alone is not proof of the hosted scheduler; require successful bootstrap Actions run after merge.
