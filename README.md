# Cricx X — Sports Live

Cricket live streaming, scores and 24/7 sports channels.

## Pages

| Path | Page |
| --- | --- |
| `/` | Live matches: featured match, sport filter, search, refresh (auto-refreshes every 30 s) |
| `/watch/:id` | Match player with server list (match + tournament sources) |
| `/sports` | 24/7 sports channels with category filter, search, "load more" |
| `/channel/:id` | Channel player with server list |
| `/backups` | Matches and channels with 2+ sources |
| `/cx-admin-secret` | Admin control panel (sign-in + administrator role required) |

## Stack

- React 19 + TypeScript, TanStack Start (file routes in `src/routes`), Vite
- Lovable Cloud (Postgres + Auth) with Row Level Security
- Video: hls.js (HLS), Shaka Player (DASH / Widevine / PlayReady using the provider's license URL), iframe for provider embeds

## Local development

```bash
bun install        # or: npm install
cp .env.example .env   # fill in real values (Lovable fills these automatically)
bun run dev        # http://localhost:8080
bun run typecheck  # TypeScript check
bun run test       # unit tests
bun run build      # production build
```

## Environment variables

See `.env.example`. `VITE_*` values are public and safe in the browser. `CRICAPI_KEY` is a
server-only secret used by the admin "Sync API" action; it is never sent to the browser.
No service-role key is used anywhere in the app.

## Database

Tables: `tournaments`, `matches`, `stream_sources`, `tournament_stream_sources`, `channels`,
`channel_sources`, `user_roles` (+ `has_role()` function). Schema: `drizzle/migrations/`.

Security rules:
- Visitors can only **read** published tournaments, matches and channels, and enabled sources of published items.
- Only accounts with the `admin` role in `user_roles` can add, edit or delete anything.
- Users can read only their own role rows; nobody can grant themselves a role from the app.

### Making someone an administrator

1. They create an account on `/cx-admin-secret` ("Create one") and confirm their email.
2. Add a row to `user_roles` with their user id and role `admin` (Lovable: Cloud → Database → `user_roles`, or ask the Lovable agent).

## Streams

- Use **https** stream links. Browsers block `http://` streams on an https site; there is intentionally no proxy.
- DASH/DRM: set the source type to DASH and paste the license server URL supplied by the rights holder.
  The player never bypasses DRM or provider access controls.

## Publishing

On Lovable: click **Publish** (top right). The site is served with SSR and client routing, so deep links
like `/watch/…` work on refresh. A custom domain can be connected in Project Settings → Domains.
