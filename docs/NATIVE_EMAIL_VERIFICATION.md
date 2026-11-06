# Native email verification callback

The corrected iOS client requests this signup redirect:

`com.streamunify.app://auth/direct-callback`

Android build 147 and website signups continue using their existing confirmation flows.

## Supabase redirect allow list

Add this exact additional redirect URL before testing the corrected iOS build:

`com.streamunify.app://auth/direct-callback`

Keep all existing redirect URLs.

## Confirm signup email template

After the corrected iOS build is installed for testing, use this conditional link in the Supabase **Confirm signup / Magic Link** template:

```html
{{ if eq .RedirectTo "com.streamunify.app://auth/direct-callback" }}
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Verify email</a>
{{ else }}
<a href="{{ .ConfirmationURL }}">Verify email</a>
{{ end }}
```

Supabase Auth uses Go templates and supports conditionals based on template properties such as `.RedirectTo`. The direct iOS link is a user-tapped custom URL scheme and the corrected app verifies `.TokenHash` with `verifyOtp`, avoiding the failed Chrome 303 handoff.

The existing `/auth/callback?code=...` PKCE path remains supported for compatibility. Do not remove the existing redirect URLs.
