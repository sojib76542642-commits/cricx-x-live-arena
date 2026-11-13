import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isStaleMatch, mapCricApiMatch, type CricApiMatch } from "./cricapi";

export type SyncResult =
  | { ok: true; fetched: number; inserted: number; updated: number; skipped: number; finished: number; newTournaments: string[] }
  | { ok: false; error: string };

/**
 * Admin-only: pull current matches from CricAPI and upsert them.
 * The API key stays on the server (CRICAPI_KEY secret) and never reaches the browser.
 * Writes run as the signed-in admin, so database security rules still apply.
 */
export const syncCricketMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SyncResult> => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (roleErr || !isAdmin) return { ok: false, error: "Only administrators can run the sync." };

    const apiKey = process.env["CRICAPI_KEY"];
    if (!apiKey) return { ok: false, error: "The cricket data API key (CRICAPI_KEY) is not configured yet." };

    let items: CricApiMatch[] = [];
    try {
      const res = await fetch(`https://api.cricapi.com/v1/currentMatches?apikey=${encodeURIComponent(apiKey)}&offset=0`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        console.error("[cricx] CricAPI HTTP", res.status);
        return { ok: false, error: `The cricket data service responded with an error (${res.status}).` };
      }
      const json = (await res.json()) as { status?: string; reason?: string; data?: CricApiMatch[] };
      if (json.status && json.status !== "success") {
        console.error("[cricx] CricAPI status", json.status, json.reason);
        return { ok: false, error: `Cricket data service: ${json.reason ?? "request failed"}` };
      }
      items = Array.isArray(json.data) ? json.data : [];
    } catch (e) {
      console.error("[cricx] CricAPI fetch failed", e);
      return { ok: false, error: "Could not reach the cricket data service." };
    }

    const mapped = items.map(mapCricApiMatch).filter((m): m is NonNullable<typeof m> => m !== null);

    const { data: tournaments, error: tErr } = await supabase.from("tournaments").select("id, name, active, published");
    if (tErr) return { ok: false, error: "Could not read tournaments." };
    const byName = new Map((tournaments ?? []).map((t) => [t.name.toLowerCase(), t]));

    const newTournaments: string[] = [];
    for (const name of new Set(mapped.map((m) => m.tournament))) {
      if (byName.has(name.toLowerCase())) continue;
      const { data: created, error } = await supabase
        .from("tournaments")
        .insert({ name, active: true, published: false })
        .select("id, name, active, published")
        .single();
      if (error || !created) continue;
      byName.set(name.toLowerCase(), created);
      newTournaments.push(name);
    }

    const ids = mapped.map((m) => m.external_match_id);
    const { data: existing } = ids.length
      ? await supabase.from("matches").select("external_match_id").in("external_match_id", ids)
      : { data: [] as { external_match_id: string | null }[] };
    const existingIds = new Set((existing ?? []).map((e) => e.external_match_id));

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const rows = [];
    for (const m of mapped) {
      const t = byName.get(m.tournament.toLowerCase());
      if (!t || !t.active) {
        skipped++;
        continue;
      }
      if (existingIds.has(m.external_match_id)) {
        // Keep admin's publish choice on existing rows; refresh live data only.
        const { error } = await supabase
          .from("matches")
          .update({ status: m.status, home_score: m.home_score, away_score: m.away_score, start_time: m.start_time })
          .eq("external_match_id", m.external_match_id);
        if (!error) updated++;
      } else {
        rows.push({ ...m, published: t.published });
      }
    }
    if (rows.length) {
      const { error, count } = await supabase.from("matches").insert(rows, { count: "exact" });
      if (error) {
        console.error("[cricx] insert matches", error.message);
        return { ok: false, error: "Saving new matches failed." };
      }
      inserted = count ?? rows.length;
    }

    // Matches the feed no longer reports but that are still marked live/upcoming long after kickoff
    // (e.g. older imported rows) are marked completed so the site stops showing them as live.
    let finished = 0;
    const feedIds = new Set(ids);
    const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { data: open } = await supabase
      .from("matches")
      .select("id, status, start_time, tournament, external_match_id")
      .in("status", ["live", "upcoming"])
      .lt("start_time", cutoff)
      .limit(1000);
    const now = Date.now();
    const staleIds = (open ?? []).filter((m) => !feedIds.has(m.external_match_id ?? "") && isStaleMatch(m, now)).map((m) => m.id);
    for (let i = 0; i < staleIds.length; i += 100) {
      const { error, count } = await supabase
        .from("matches")
        .update({ status: "completed" }, { count: "exact" })
        .in("id", staleIds.slice(i, i + 100));
      if (!error) finished += count ?? 0;
    }

    return { ok: true, fetched: items.length, inserted, updated, skipped, finished, newTournaments };
  });
