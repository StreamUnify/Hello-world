# Xbox conversion review — preview 0.2.1.0

## Verified in the development environment

- Shared automated suite: 203 passing tests, including backend search, account/network behavior, entitlements, movie ordering, and Pick Together.
- Browser: 24-title catalog traversal down to the last row and back to the header at 1920×1080 and 1280×720; right-stick scroll command; collapsed service sections and closed navigation drawer excluded from focus.
- Native-text bridge simulation: A requests text entry, accepted text returns to search and Pick Together, cancellation preserves the original query. This is not a physical system-keyboard test.
- Search UI submission: title, uppercase title, misspelling suggestion, actor, multiple-actor query, actor pagination, empty results, and catalog error display. The browser API responses are mocked; backend matching is covered separately by the shared suite.
- Country and service-type filters; service checkbox selection; focus restoration after rerendering; genre and content-rating filters.
- Mock-account sign-in, Premium recognition, hidden purchase/restore controls, account-deletion cancellation with no delete request.
- Watchlist add/remove, availability alert add/remove, alert dialog, title details, Watch in Order release/chronology controls, nested dialogs, Back, menu navigation, and Pick Together favorite text and selection.
- No browser page exceptions in the expanded test flow.
- Existing blue play artwork reused for all Xbox tiles and splash screen; no placeholder SU artwork remains in those assets.
- Native origin restriction, popup blocking, denied WebView permissions, fixed production API origin, local app identity, and no new broad filesystem/device capabilities were reviewed.

## Defects addressed

1. Focus could target controls inside closed details sections, silently failing and trapping movement around movie cards. These controls and aria-hidden/inert sections are excluded.
2. Focus disappeared when service/results/details elements were replaced. Equivalent replacement controls now regain focus.
3. Right-stick scrolling was absent. It now scrolls the nearest scrollable panel or the page independently of focus.
4. Requesting a WebView keyboard did not provide reliable native Xbox text editing. A native TextBox/PasswordBox editor now hands text back to the original field, without logging text or passwords.
5. Async details refresh could replace an in-progress Watch in Order section. The Xbox packaging adaptation preserves that section.
6. Account deletion depended on a browser confirmation dialog. Xbox now uses a controller-navigable confirmation dialog with Cancel focused by default.
7. Launch/tile assets still used placeholder letters. They now use the existing mobile blue play logo.

## Outstanding console validation and boundaries

Windows compilation/signing must pass for this exact revision. On physical Xbox, verify native keyboard entry (search, email, password, Pick Together), A/B behavior, D-pad and both sticks, suspend/resume, long-session memory, offline/reconnect, and the updated launch logo. Browser tests cannot certify these.

Real email delivery, external verification/password-reset completion, and production sign-in were not exercised with real credentials during this review. No real account deletion, purchase, or user data mutation was performed.

Provider apps still open separately on Xbox. The development app does not yet implement provider deep links or Microsoft Store purchases. It recognizes existing memberships. Marketplace certification, store identity, production signing, listings, and hardware acceptance remain separate release work.

No deployment command is enabled. Version 0.2.0.0 remains on the user's Xbox until an explicitly authorized reviewed update is installed. The new Windows deployment agent has passed Windows compilation and its own validation/DPAPI self-tests; local setup and an actual console upload have not yet been verified.
