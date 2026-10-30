# Recently searched

Shared website/iOS/Android UI stores up to 10 submitted search terms per verified account, newest first. Case-insensitive repeats move to the top. Failed searches, blocked allowance requests, pagination, actor refinements, and anonymous browsing do not add entries. Selecting history submits a normal search and follows the existing allowance rules. History records terms, not the genre/rating/service filters.

The server records history after successful catalog and allowance checks. A history service failure cannot prevent search results. GET and DELETE /api/account/recent-searches use the authenticated account's token; the database enforces ownership with RLS. No browser-local search history is retained. Account deletion cascades to history. Opening the section refreshes from the account, including searches from another device.

## Release order

The migration `supabase/migrations/20261030021420_recent_searches.sql` is installed and tested on StreamUnify Development only. Apply it to Production before deploying the backend. Deploy after the owner approves the cloud-browser preview. Run `npm run prepare:platforms` to regenerate the Render backend and shared mobile assets. Store releases still require new iOS/Android builds; no builds or master deployment are triggered by this branch.

Validation: unit tests cover authenticated routes, user-token database calls, safe title rendering, selection, clearing, and late-response isolation across logout. Development database checks in rolled-back transactions verify the 10-entry cap, case-insensitive duplicates, and RLS isolation. The browser preview uses clearly labeled sample account history.
