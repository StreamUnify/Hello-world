# Security status and release checks

Report suspected vulnerabilities privately to support@streamunify.com. Do not post credentials or customer data in issues.

## Implemented controls

- Capacitor core, CLI, Android and iOS pinned to 7.6.10, addressing GHSA-rvm3-566m-v7fv. Rebuild and redistribute installed native apps to apply the patch.
- Native session secrets stay in device-only secure storage; debugging and cleartext traffic explicitly disabled. Native assets use a hash-based script Content Security Policy.
- Website HSTS, nosniff, frame denial, referrer and permission restrictions. Inline scripts require content hashes; inline styles remain permitted for the existing layout.
- API CORS allows only the website/API and packaged native app origins. Requests without an Origin still require the same authentication and ownership checks.
- In-memory, per-IP throttling: catalog 60/minute, account 120/minute, webhook 300/minute; Retry-After on 429. Bounded counters and HTTP request/header timeouts. The Render forwarded address is trusted only when RENDER=true, using the final forwarded address. Multi-instance deployments need a shared limiter and edge filtering; this is not distributed DDoS protection.
- Existing account-owned RLS and payment-signature/receipt checks retained. Server-only billing tables intentionally have RLS without client policies.

## Unfinished external settings

Production Supabase reports compromised-password protection disabled. The connected MCP tools cannot update Auth configuration, and the dashboard requires sign-in. Enable and verify that setting in Supabase Auth password settings. Check plan availability before any paid upgrade. Do not treat this document as confirmation it has been enabled.

Verify MFA and recovery methods on administrator accounts (GitHub, Supabase, Render, Stripe, Codemagic, Apple and Google), API key restrictions/rotation, backups and a restore drill. This code review cannot establish those account settings or certify store approval. No penetration test has been performed.

## Validation

Run npm ci, npm audit, npm test, and npm run prepare:platforms. Test native sign-in/deep links, purchases/restoration and external provider links on physical iOS and Android devices using signed release builds. Confirm production security headers and account isolation after deployment.
