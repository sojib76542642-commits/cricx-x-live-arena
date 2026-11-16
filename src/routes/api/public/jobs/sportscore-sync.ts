import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduled SportScore sync. Only the platform scheduler can call it (cron secret checked first).
 * Uses the same merge rules as the admin button: no duplicates, admin edits kept, nothing deleted.
 */
export const Route = createFileRoute("/api/public/jobs/sportscore-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;

        const [{ supabaseAdmin }, { runRecordedSync }] = await Promise.all([
          import("@/integrations/supabase/client.server"),
          import("@/lib/sportscore-sync.server"),
        ]);
        const result = await runRecordedSync(supabaseAdmin, null);
        if (result.ok) {
          const { ok, finishedAt, fetched, inserted, updated, unchanged, skipped, protectedEdits, ignored, removedCompleted, removedExpired, removedSources } = result;
          return Response.json({ ok, finishedAt, fetched, inserted, updated, unchanged, skipped, protectedEdits, ignored, removedCompleted, removedExpired, removedSources });
        }
        // A run skipped by the once-a-minute limit is not a failure.
        return Response.json({ ok: false, skipped: result.skipped ?? false, error: result.error }, { status: result.skipped ? 200 : 502 });
      },
    },
  },
});
