/**
 * Canvas commands are posted to `/api/command?project=…`, so a
 * `url.endsWith("/api/command")` test goes stale the moment a query string
 * appears — and every control then looks like it emits nothing.
 *
 * Match the server's own routing instead: POST /api/command by pathname.
 */
export function isApiCommandUrl(rawUrl) {
  try {
    return new URL(String(rawUrl)).pathname === "/api/command";
  } catch {
    return false;
  }
}
