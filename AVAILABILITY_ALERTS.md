# Content ratings and availability alerts

The rating dropdown beside Genre uses US movie and TV classifications. It is an exact filter, not a maximum-age rule or PIN-protected parental control. The choice is stored on the device and remains active across searches and reloads until All ratings is selected. Unknown ratings are excluded unless Not rated / unknown is explicitly selected. Classification lookup failures fail closed. A reload with an existing rating does not consume another search; refinements of a submitted search reuse its search ID.

Notify me tracks subscription/free availability on selected services, excluding rental and purchase offers. Alerts are account-based and delivered in the in-app Alerts inbox, not email, SMS or operating-system push. The first successful check records a baseline; an already-available title shows an immediate status message. Later additions generate one notification per new selected-service transition. Removal and subsequent return can produce another alert. Failed provider requests never erase a successful baseline.

Preferences follow the most recently used device's country and service selections. Existing membership restrictions still apply. Each account can track up to 100 titles. A server sweep runs every 15 minutes and checks titles whose last successful observation is over six hours old. Returning users also trigger a bounded catch-up check. A sleeping or stopped web instance does not run sweeps, so this is periodic in-app delivery, not guaranteed real-time background push. Provider data is supplied by TMDB and may be incomplete or delayed.

## Release

- Apply `supabase/migrations/20261027061109_availability_alerts.sql` before deploying the backend. The additive migration was applied to Development and its RLS/transition behavior was verified with temporary fixtures in a rolled-back transaction. Production has not been migrated as part of preparation.
- The backend uses existing `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and TMDB configuration. No secret is sent to clients. Only the service role can record provider observations or create notifications.
- Run `npm test` and `npm run prepare:platforms`. Shared web assets and backend copies include the rating and alert modules. Native builds still require the normal Android/iOS CI and store distribution process.
- Verify the dropdown persists after reload, clearing it restores all ratings, and tracked-title controls are beside the watchlist heart. Verify a real subscribed account's alert can be enabled, canceled and read after deployment. Do not generate a synthetic availability notification for real users.
