import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runRecordedSync, type SyncResult } from "./sportscore-sync.server";

export type { SyncResult, SyncStats } from "./sportscore-sync.server";

/**
 * Admin-only: pull cricket matches from SportScore's free public API (no key) and merge them into the database.
 * Runs as the signed-in admin, so the database security rules still apply to every write.
 */
export const syncSportScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SyncResult> => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (roleErr || !isAdmin) return { ok: false, error: "Only administrators can run the sync." };
    return runRecordedSync(supabase, userId);
  });
