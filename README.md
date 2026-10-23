# StreamUnify mobile starter (Capacitor)

This starter bundles your **existing StreamUnify web design** for Android and iOS. It preserves the scrolling Where to Watch dialog, free/paid provider badges, country selection, and watchlist saved locally on each device.

**Status:** This ZIP contains the complete Capacitor source/config, but not generated native `ios/` and `android/` directories or compiled apps. Those require installing npm dependencies and running Capacitor CLI on a development machine. No Apple/Google store release has been created.

## 1. Set your Render API URL

Open `www/app-config.js` and replace `https://YOUR-RENDER-SERVICE.onrender.com` with the actual public HTTPS URL of your Render service (no slash at end). Never put your TMDB key in this file.

## 2. Update the existing Render backend

The mobile app's bundled origin differs from the Render website's origin. Replace only `server.mjs` in your existing GitHub/Render repository with `backend/server.mjs`. This version adds restricted CORS access for Capacitor origins (`capacitor://localhost`, `http://localhost`, `https://localhost`), while keeping the existing API and TMDB credentials server-side.

Deploy the latest GitHub commit on Render, then verify your normal website still loads.

## 3. Generate native projects

Requires Node.js 20+, npm, and:
- Android: Android Studio with a working Android SDK.
- iOS: a Mac with Xcode (iOS builds cannot be produced on Windows).

From this extracted project directory:

```bash
npm install
npx cap add android
npx cap add ios   # macOS only
npx cap sync
npx cap open android
npx cap open ios   # macOS only
```

Run on an emulator or physical device from Android Studio / Xcode. Whenever `www/` changes, run `npx cap sync` again. Use a stable reverse-DNS bundle identifier before publishing (current starter uses `com.streamunify.app`; ownership/availability not verified).

## 4. Verify

- Trending/search returns TMDB data.
- Select a country; check provider labels FREE, FREE WITH ADS, SUBSCRIPTION, RENT, BUY.
- Where to watch scrolls to the bottom.
- Watchlist persists after app restart.
- Provider links open in the device browser (deep links may require separate native handling).
- Android back button, keyboard, and safe areas work on real devices.

## Important limitations

- `www/app-config.js` needs your real Render URL before testing.
- This uses bundled web assets (not a remote WebView `server.url`).
- Current watchlist is device-local, not synchronized across platforms.
- Store publication requires icons, splash assets, screenshots, privacy disclosures, app review, and account setup.
- Provider availability is based on TMDB data and is not guaranteed; official provider deep links and account integrations require separate work.
- The backend's CORS origin allowlist is suitable for public catalog endpoints, not user-authenticated endpoints; review security before adding accounts.
