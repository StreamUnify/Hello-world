# Discovery redesign release review

This is a real UI integration, not a replacement with the Sites mock. Root `index.html` remains the source for website, backend, and Capacitor shared assets. Existing service, search, actor, rating, details, watch-order, watchlist, account, alert, consent, and billing flows retain their contracts.

New: restrained navy/blue design; actual catalog-backed featured-film carousel opening the existing Where to Watch panel; verified official provider sign-in links; three pricing cards connected to existing account flow; native store-derived prices; adjacent StreamUnify trademark claim (™ only); enlarged service-management control.

The carousel uses only current returned qualifying movie records with artwork, requests no extra searches, hides for queries/refinements/saved titles, pauses for reduced motion/focus/hover/dialogs/background tabs, and never hosts playback. Empty/upstream unavailable results remain empty rather than showing fictional seed titles.

## Deployment safeguards

Do not enable membership or store purchase flags as part of this visual update. Existing native store products and secure storage remain untouched. A push to main triggers Codemagic Android Debug and signed iOS TestFlight distribution to StreamUnify Testers; it is therefore a release action, not just a source save. Review before merging.

TestFlight applies to iOS only. Android release distribution still requires the signing/AAB path. This Linux workspace can prepare/copy native assets but cannot prove an iOS signed build. Store transactions, real verified auth, entitlements, subscriptions, refunds and signed notifications require the existing development environment and device testing before launch-readiness can be claimed.

Rollback: revert the redesign commit as a unit and regenerate shared assets; do not independently revert only `www` or `backend`. No database migration or runtime environment mutation is introduced.
