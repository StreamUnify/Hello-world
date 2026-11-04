# StreamUnify Xbox — current shared interface

Xbox preview **0.2.2.0** packages the current shared StreamUnify homepage, search, actor and fuzzy search, genre/rating filters, Pick Together, recent account searches, title details, Watch in Order, availability alerts, selected services, and Premium watchlists. The app uses the production API and account entitlements.

`npm ci && npm run build:xbox` creates the packaged `Web/` assets from root `index.html`, current membership/provider modules, and current Pick Together modules. Shared product code is not copied into a separate Xbox fork. TV CSS, controller navigation (including shadow DOM and dialogs), select-option panels, and Xbox auth adaptation live in `xbox/web`. The header shows the app version; `app-config.js` records the CI commit SHA. Every future **master** update includes website, iOS, Android, and Xbox; see `AGENTS.md`.

## Windows package

Use Visual Studio 2022 UWP tools, Windows SDK 10.0.19041, Debug/x64. The Xbox GitHub workflow builds and signs the MSIX using an ephemeral development certificate whose subject matches `CN=StreamUnifyDevelopment`. Only the signed package, public certificate and dependencies are published; the private signing key is removed from the runner. Preserve the development identity when updating an installed preview.

Upload the signed MSIX through Xbox Device Portal. The existing x64 dependencies are unchanged from 0.1.0.0 and need only be supplied if the console reports them missing. Do not install Xbox dependencies on the Windows PC. Updating to a higher version with the same package identity should retain app data; console verification is required.

## Xbox adaptations and limitations

- D-pad/stick moves focus, A selects or opens the system keyboard, B closes the active dialog or returns to Discover. Select menus become controller-friendly panels. Dialogs contain controller focus, including Pick Together's shadow DOM.
- Existing app-isolated account sessions use the same `streamunify-xbox-auth` storage key. New registrations use the shared email-first flow; verification/password creation completes at the public website, followed by sign-in on Xbox.
- Existing Premium memberships are recognized. Purchases, checkout, billing portal and mobile-store plugins are excluded from the Xbox account bundle. Microsoft Store purchases require a separate implemented and tested integration.
- Provider availability, add-on requirements and cost labels remain visible. External provider links display instructions to use the provider's Xbox app; direct launching/playback is not implemented. The native host can open only the two fixed legal URLs.
- Website analytics is excluded from the package. Native host capabilities and navigation restrictions remain in force.
- This is a development preview, not a Microsoft Store submission. Official identity association, approved Store assets, age rating, screenshots and certification remain required.

## Validation

Run `npm test` and `npm run build:xbox`. Verify at 1080p and 720p with a controller: homepage, all search filters, actor pagination, Pick Together selection/results/back, account sign-in/out, recent searches, watchlist sync, alerts, details/order, unavailable network, suspend/resume and keyboard dismissal. Browser checks supplement physical Xbox One testing; they do not replace it.

Launch and tile artwork use the existing blue play logo from `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`, matching the website favicon.

Title/actor entry uses an in-app QWERTY keyboard: choose keys with the D-pad/left stick and press A, then choose Search. B or Cancel preserves the existing query. Uppercase, symbols, spaces, backspace, clear, and cursor movement are available. This title keyboard uses the same controller command path as the app buttons; it does not request the Windows input pane.
