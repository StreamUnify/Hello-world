# Xbox conversion review — preview 0.2.3.0

## Provider app routing

Preview 0.2.3.0 adds automatic discovery of installed apps associated with known provider HTTPS links. Discovery and a per-app support query must identify one available target before native launch. Unknown domains, unavailable/ambiguous handlers, failures and timeouts cannot cause a generic browser launch. Controller B cancels pending work; title-aware fallback panels preserve navigation focus, including over Pick Together shadow dialogs. Launch success indicates OS dispatch only, not exact-title navigation or playback.

The native routing class has Windows CI tests for invalid URLs, installed/missing/unsupported/ambiguous apps, launch refusal, API failure, duplicate requests and cancellation before/during discovery. Browser checks cover all reply states, stale messages, repeated clicks, timeouts, missing host, fallback title, 720p layout and shadow-dialog focus. The shared suite has 204 tests. Windows build/signing must succeed for the exact revision before issuing a deployment command. No retail provider handoff is claimed as hardware verified.

## Title keyboard correction

The user confirmed the other 0.2.1.0 changes looked good but reported that title entry still failed on the console keyboard. Title/actor search now uses an in-app controller keyboard. Its field is read-only to avoid invoking the Windows editor; letter buttons edit a draft, and Search calls the existing explicit title submission handler. Other native account and Pick Together editors are unchanged.

Browser checks exercise every letter/digit button with D-pad/A commands at 1080p and 720p, uppercase, symbols, spaces, backspace, clear, cursor movement, cancellation/focus restoration, and a complete controller-only `rambo` search. They verify one request on submission and none while editing/cancelling. Physical keyboard typing plus Enter also submits. The title path sends no native keyboard request. Layout screenshots fit both TV sizes.

The agent successfully installed 0.2.2.0 and Device Portal confirmed launch. Actual Xbox title typing remains pending user confirmation; simulated tests are not console input certification.

## Verified in the development environment

- Shared automated suite: 204 passing tests, including backend search, account/network behavior, entitlements, movie ordering, and Pick Together.
- Browser: 24-title catalog traversal down to the last row and back to the header at 1920×1080 and 1280×720; right-stick scroll command; collapsed service sections and closed navigation drawer excluded from focus.
- Native-text bridge simulation for account and Pick Together fields: A requests text entry and accepted text returns to the original field. Title entry now uses the in-app keyboard described above. This is not a physical system-keyboard test.
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
4. Requesting a WebView keyboard did not provide reliable native Xbox text editing. A native TextBox/PasswordBox editor hands account and Pick Together text back to the original field without logging it. The title path is superseded by the in-app keyboard in 0.2.2.0.
5. Async details refresh could replace an in-progress Watch in Order section. The Xbox packaging adaptation preserves that section.
6. Account deletion depended on a browser confirmation dialog. Xbox now uses a controller-navigable confirmation dialog with Cancel focused by default.
7. Launch/tile assets still used placeholder letters. They now use the existing mobile blue play logo.

## Outstanding console validation and boundaries

Windows compilation/signing must pass for this exact revision. On physical Xbox, verify title keyboard entry, native email/password/Pick Together entry, A/B behavior, D-pad and both sticks, suspend/resume, long-session memory, offline/reconnect, and the updated launch logo. Browser tests cannot certify these.

Real email delivery, external verification/password-reset completion, and production sign-in were not exercised with real credentials during this review. No real account deletion, purchase, or user data mutation was performed.

Provider routing is implemented with runtime support checks, but retail provider availability and exact-title handling remain unverified. Xbox Developer Mode cannot run retail provider apps. Microsoft Store purchases are not implemented. It recognizes existing memberships. Marketplace certification, store identity, production signing, listings, and hardware acceptance remain separate release work.

The user installed the Windows deployment agent, and its commanded 0.2.1.0 update was confirmed installed and Running in Device Portal. A new command is issued only after the exact revised build passes its automated checks. Console screenshot capture was blocked by the connected browser, so no visual hardware verification is claimed from that capture.
