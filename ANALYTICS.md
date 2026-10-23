# Website visitor analytics

## Active property

The owner supplied public measurement ID `G-9FW1KRWQT7`, now the default.
`GA4_MEASUREMENT_ID` on Render overrides it; an empty or invalid override disables
analytics. The public ID is not an API credential. Visitor consent is still
required before loading Google's tracker. Verify ingestion using Realtime.

## Property configuration

1. In Google Analytics, create/select a property for StreamUnify with time zone
   America/Chicago and currency USD. Create a Web data stream for
   https://streamunify.com, named StreamUnify Website.
2. Turn off Enhanced Measurement for this stream. This integration is intended
   for basic page views, sessions, and estimated users, not automatic search,
   outbound-link, form, video, or history tracking. Leave Google Signals,
   advertising links, User-ID, and user-provided-data collection disabled.
3. Copy the public G- measurement ID. Add GA4_MEASUREMENT_ID to Render's
   environment variables with that exact value, then deploy the updated source.
   This is a public identifier, not an API secret. No Google API secret is needed.
4. Open the website and allow analytics. Check Google Analytics Realtime, then
   inspect acquisition and engagement reports as data becomes available.

An empty or invalid environment override leaves analytics disabled with no consent UI or Google
requests. A valid ID loads the consent UI; no Google script is requested until
consent is granted. Preferences can be reopened from the footer. Global Privacy
Control and Do Not Track suppress analytics. The native app API-base/Capacitor
checks exclude app builds from this web tracker.

Consent withdrawal disables GA for this page, updates consent and attempts to
remove GA cookies for the current host and parent domains. Already received data
is not erased by withdrawing consent. A previously loaded Google script remains
in memory until the page closes. No advertising consent is granted.

Page-location query strings/fragments and referring-page paths are omitted.
No custom search, watchlist, email, password, card, or membership data is sent.
Google still processes ordinary analytics/device/network information for visitors
who opt in; this is not anonymous or a claim that zero personal data is processed.

## Reporting limits

Collection begins only after activation and visitor consent. Earlier traffic
cannot be reconstructed from this integration. Users are estimates of browsers/
devices, not an exact count of people. Declines, privacy signals, blocked tags,
and ad blockers produce undercounts. Use page views for loads, sessions for
visits, and total users for estimated visitors; choose the date range since
activation. Realtime is the first validation view; standard reports take longer.

The site's existing broader privacy-policy placeholder still needs an accurate
business privacy policy before the full account and paid-membership launch.
