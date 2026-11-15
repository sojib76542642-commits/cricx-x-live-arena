<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules (Cricx X)

- Public pages read data through `createServerFn` in `src/lib/public-data.functions.ts` using the publishable key; RLS limits anon reads to published/enabled rows — never use the admin client for public reads.
- Admin writes go from the browser Supabase client and are enforced by RLS via `public.has_role(auth.uid(),'admin')`; the admin route's role check is UX only.
- Third-party API keys, if any are ever added, are read only inside server functions; no generic URL proxy exists — do not add one.
- Match data sync lives in `src/lib/sportscore-sync.server.ts` (`runRecordedSync`), shared by the admin server function (runs as the admin, RLS applies) and the cron route `/api/public/jobs/sportscore-sync` (cron secret verified, then admin client) — one merge path keeps duplicate prevention and admin-edit protection identical.
- The sync never changes status because of age; the home page only groups long-overdue "upcoming" matches for display (`isAwaitingResult`).
- Time/zone-dependent text renders via `LocalTime`/`useHydrated` to avoid SSR hydration mismatches.
- Playback engine choice lives in `src/lib/streams.ts` (`playbackModeFor`); `VideoPlayer` lazy-imports hls.js and shaka-player client-side.
- Keep the original `cx-*` class design system in `src/styles.css`; new UI should reuse those classes and CSS variables.
- Public match lists collapse copies of one fixture (same teams + kickoff) via `dedupeMatches` with a rank preferring rows that have enabled sources — the old feed saved one fixture under many ids, and admins still see every row.
- `public.bootstrap_owner_admin` (trigger on auth email confirmation) grants admin only to the owner email and only while no admin exists; all other role grants are manual via SQL, never from the app.
