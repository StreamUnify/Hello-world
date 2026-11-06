# Native email verification callback

The corrected native client accepts a direct Supabase token-hash callback at:

`com.streamunify.app://auth/callback?token_hash=...&type=email`

The website client also accepts `token_hash` and `type=email` on its normal redirect URL.

## Confirm signup email template

After the corrected mobile build is installed for testing, change the Supabase **Confirm signup** email link from `{{ .ConfirmationURL }}` to:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Verify email</a>
```

This intentionally makes the email itself open the registered StreamUnify URL scheme on native signups, avoiding an intermediate browser 303 redirect. Website signups continue to use the HTTPS RedirectTo and are verified by the website client.

Do not enable this template for production users until a client containing the direct token-hash handler is available. The existing PKCE `code` callback remains supported as a fallback.
