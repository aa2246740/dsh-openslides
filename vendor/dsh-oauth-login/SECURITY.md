# Security Policy

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Include reproduction steps without including real credentials.

Do not open a public issue containing OAuth callback URLs, authorization codes,
access or refresh tokens, API keys, cookies, or the contents of
`$DSH_HOME/.dsh-oauth-auth.json`.

## Security boundaries

- DSH owns a separate OAuth grant and never reads or writes Pi Agent or official
  CLI auth files.
- Stored credentials are restricted to the current operating-system user.
- Local proxy candidates must pass a credential-free HTTP CONNECT probe before
  use. OAuth payloads remain protected by end-to-end TLS.
- Explicit HTTP and WebSocket proxy settings apply only inside this plugin's
  request scope. A disabled channel connects directly; a failed explicit proxy
  does not silently fall back to direct access. Loopback callbacks bypass proxies.
- The proxy settings API accepts same-origin, loopback requests on a literal
  localhost/loopback Host, requires JSON for writes, and uses revision checks.
  URLs containing proxy credentials, paths, queries, or fragments are rejected.
  Settings are written atomically with mode 0600 to a separate file; the OAuth
  credential document is not modified. TLS verification is never disabled.
- Authorization URLs are restricted to the provider hosts declared by the
  installed Pi AI provider catalog.

The `0.1.x` line receives security fixes while it is the latest release line.
