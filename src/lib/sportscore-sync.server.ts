import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  SPORTSCORE_MIN_INTERVAL_MS,
  findStoredCopies,
  mapSportScoreMatch,
  planCleanup,
  planMatchUpdate,
  shouldInsert,
  utcDays,
  windowDays,
  type CleanupRow,
  type MappedSportScoreMatch,
  type SyncRow,
} from "./sportscore";
import { SportScoreError, fetchSportScore } from "./sportscore.server";

export type SyncStats = {
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  protectedEdits: number;
  skipped: number;
  /** Finished or long-expired fixtures SportScore sent that were not saved. */
  ignored: number;
  removedCompleted: number;
  removedExpired: number;
  removedSources: number;
  newTournaments: string[];
  warnings: string[];
};
export type SyncResult = ({ ok: true; finishedAt: string } & SyncStats) | { ok: false; error: string; skipped?: boolean };

const DAY = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 30;
const MAX_PAST_DAYS = 10;
const ROW_COLUMNS =
  "id, external_match_id, sync_snapshot, status, home_score, away_score, start_time, tournament, home_team, away_team, home_team_logo_url, away_team_logo_url";

/**
 * Runs one SportScore sync and records it in sync_runs. Shared by the admin button (runs as the signed-in admin,
 * so RLS applies) and the scheduled job (runs with the server's admin client after the cron secret is verified).
 * At most one sync per minute, matching SportScore's 60-second cache.
 */
export async function runRecordedSync(supabase: Client, triggeredBy: string | null): Promise<SyncResult> {
  const { data: lastRun } = await supabase
    .from("sync_runs")
    .select("started_at")
    .eq("provider", "sportscore")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const since = lastRun ? Date.now() - Date.parse(lastRun.started_at) : Infinity;
  if (since < SPORTSCORE_MIN_INTERVAL_MS) {
    const wait = Math.ceil((SPORTSCORE_MIN_INTERVAL_MS - since) / 1000);
    return { ok: false, skipped: true, error: `SportScore data refreshes once a minute. Please wait ${wait} s and sync again.` };
  }

  const { data: run, error: runErr } = await supabase
    .from("sync_runs")
    .insert({ provider: "sportscore", triggered_by: triggeredBy })
    .select("id")
    .single();
  if (runErr || !run) {
    console.error("[cricx] sync_runs insert", runErr?.message);
    return { ok: false, error: "Could not start the sync." };
  }

  const finish = async (ok: boolean, error: string | null, stats: SyncStats | null) => {
    const finishedAt = new Date().toISOString();
    await supabase
      .from("sync_runs")
      .update({ ok, error, stats: stats as unknown as Json, finished_at: finishedAt })
      .eq("id", run.id);
    return finishedAt;
  };

  try {
    const stats = await runSync(supabase);
    const finishedAt = await finish(true, null, stats);
    return { ok: true, finishedAt, ...stats };
  } catch (e) {
    const message = e instanceof SportScoreError ? e.message : "The sync stopped because of an unexpected error.";
    if (!(e instanceof SportScoreError)) console.error("[cricx] sync failed", e);
    await finish(false, message, null);
    return { ok: false, error: message };
  }
}

type Client = SupabaseClient<Database>;
type MatchUpdate = Database["public"]["Tables"]["matches"]["Update"];
type MatchInsert = Database["public"]["Tables"]["matches"]["Insert"];

async function runSync(supabase: Client): Promise<SyncStats> {
  const warnings: string[] = [];
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);

  // 1. Live and recent matches (required; if this fails the whole run stops and nothing is deleted)
  //    + fixtures for a rolling 5-day window starting today.
  const items = await fetchSportScore("/api/widget/matches/?sport=cricket&limit=50");
  const days = windowDays(now);

  // 2. Past days that still have matches stored as live/upcoming: get their real results from SportScore.
  const { data: open, error: openErr } = await supabase
    .from("matches")
    .select("start_time")
    .in("status", ["live", "upcoming", "postponed"])
    .lt("start_time", `${today}T00:00:00Z`)
    .gte("start_time", new Date(now - LOOKBACK_DAYS * DAY).toISOString())
    .limit(2000);
  if (openErr) throw new SportScoreError("Could not read stored matches.");
  days.push(...utcDays(((open ?? []) as { start_time: string }[]).map((r) => r.start_time), MAX_PAST_DAYS));

  // Fetched in small parallel batches (the server allows only a few open requests at once); results keep day order.
  const uniqueDays = Array.from(new Set(days));
  const checkedDays = new Set<string>();
  for (let i = 0; i < uniqueDays.length; i += 4) {
    const batch = uniqueDays.slice(i, i + 4);
    const results = await Promise.allSettled(
      batch.map((day) => fetchSportScore(`/api/v1/fixtures/?sport=cricket&date=${day}&limit=200`)),
    );
    results.forEach((r, j) => {
      if (r.status === "fulfilled") {
        items.push(...r.value);
        checkedDays.add(batch[j]!);
      } else warnings.push(`Fixtures for ${batch[j]}: ${r.reason instanceof Error ? r.reason.message : "failed"}`);
    });
  }

  // Later items (fixtures) win over earlier ones for the same key.
  const byKey = new Map<string, MappedSportScoreMatch>();
  for (const it of items) {
    const m = mapSportScoreMatch(it);
    if (m) byKey.set(m.key, m);
  }
  const mapped = Array.from(byKey.values());
  const stats: SyncStats = {
    fetched: mapped.length,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    protectedEdits: 0,
    skipped: 0,
    ignored: 0,
    removedCompleted: 0,
    removedExpired: 0,
    removedSources: 0,
    newTournaments: [],
    warnings,
  };
  // An empty answer is treated as "SportScore unavailable": no cleanup without data.
  if (!mapped.length) return stats;

  // 3. Tournaments: create unknown competitions (sync on, hidden until the admin publishes them),
  //    only for matches that may be saved — finished results no longer add tournaments.
  const { data: tournaments, error: tErr } = await supabase.from("tournaments").select("id, name, active, published");
  if (tErr) throw new SportScoreError("Could not read tournaments.");
  const tByName = new Map<string, { active: boolean; published: boolean }>(
    ((tournaments ?? []) as { name: string; active: boolean; published: boolean }[]).map((t) => [t.name.toLowerCase(), t]),
  );
  for (const m of mapped) {
    if (!shouldInsert(m, now)) continue;
    const name = m.tournament;
    if (tByName.has(name.toLowerCase())) continue;
    const { data: created, error } = await supabase
      .from("tournaments")
      .insert({ name, sport: "Cricket", active: true, published: false, logo_url: m.tournament_logo_url })
      .select("name, active, published")
      .single();
    if (error || !created) {
      warnings.push(`Could not add tournament "${name}".`);
      tByName.set(name.toLowerCase(), { active: false, published: false });
      continue;
    }
    tByName.set(name.toLowerCase(), created);
    stats.newTournaments.push(name);
  }

  // 4. Stored rows that may be these matches (by key, or same teams around the same kickoff).
  const times = mapped.map((m) => Date.parse(m.start_time));
  const from = new Date(Math.min(...times) - DAY).toISOString();
  const to = new Date(Math.max(...times) + DAY).toISOString();
  const [{ data: near, error: nErr }, { data: keyed, error: kErr }] = await Promise.all([
    supabase.from("matches").select(ROW_COLUMNS).gte("start_time", from).lte("start_time", to).limit(5000),
    supabase.from("matches").select(ROW_COLUMNS).in("external_match_id", mapped.map((m) => m.key)),
  ]);
  if (nErr || kErr) throw new SportScoreError("Could not read stored matches.");
  const rowsById = new Map<string, SyncRow>();
  for (const r of [...((near ?? []) as SyncRow[]), ...((keyed ?? []) as SyncRow[])]) rowsById.set(r.id, r);
  const rows = Array.from(rowsById.values());

  // Exact matches claim rows first, so a re-timed lookup never grabs another fixture's row.
  const claimed = new Set<string>();
  const copies = new Map<string, SyncRow[]>();
  for (const m of mapped) {
    const found = findStoredCopies(rows, m);
    if (found.length && found.some((r) => r.external_match_id === m.key || Date.parse(r.start_time ?? "") === Date.parse(m.start_time))) {
      found.forEach((r) => claimed.add(r.id));
      copies.set(m.key, found);
    }
  }
  for (const m of mapped) {
    if (copies.has(m.key)) continue;
    const found = findStoredCopies(rows, m, claimed);
    found.forEach((r) => claimed.add(r.id));
    copies.set(m.key, found);
  }

  // 5. Updates, grouped so identical changes to copies of one fixture go out in one request.
  const groups = new Map<string, { payload: MatchUpdate; ids: string[] }>();
  const inserts: MatchInsert[] = [];
  for (const m of mapped) {
    const found = copies.get(m.key) ?? [];
    if (!found.length) {
      // Finished (or long-overdue) fixtures are not stored: they would only be deleted again.
      if (!shouldInsert(m, now)) {
        stats.ignored++;
        continue;
      }
      const t = tByName.get(m.tournament.toLowerCase());
      if (!t?.active) {
        stats.skipped++;
        continue;
      }
      const values = {
        status: m.status ?? "upcoming",
        home_score: m.home_score,
        away_score: m.away_score,
        start_time: m.start_time,
        tournament: m.tournament,
        home_team: m.home_team,
        away_team: m.away_team,
        home_team_logo_url: m.home_team_logo_url,
        away_team_logo_url: m.away_team_logo_url,
      };
      inserts.push({ ...values, sport: "Cricket", external_match_id: m.key, source_provider: "sportscore", published: t.published, sync_snapshot: values as Json });
      continue;
    }
    for (const r of found) {
      const plan = planMatchUpdate(r, m);
      stats.protectedEdits += plan.protectedFields.length;
      if (!plan.changed) {
        stats.unchanged++;
        continue;
      }
      // Only values SportScore actually supplied end up in plan.update, so none of them are null.
      const payload = { ...plan.update, sync_snapshot: plan.snapshot as Json } as MatchUpdate;
      const sig = JSON.stringify(payload);
      const g = groups.get(sig) ?? { payload, ids: [] };
      g.ids.push(r.id);
      groups.set(sig, g);
      if (Object.keys(plan.update).length) stats.updated++;
      else stats.unchanged++;
    }
  }

  for (const g of groups.values()) {
    for (let i = 0; i < g.ids.length; i += 100) {
      const { error } = await supabase.from("matches").update(g.payload).in("id", g.ids.slice(i, i + 100));
      if (error) {
        console.error("[cricx] update matches", error.message);
        throw new SportScoreError("Saving match updates failed.");
      }
    }
  }
  if (inserts.length) {
    const { error, count } = await supabase.from("matches").insert(inserts, { count: "exact" });
    if (error) {
      console.error("[cricx] insert matches", error.message);
      throw new SportScoreError(error.code === "23505" ? "Another sync just added these matches. Please sync again." : "Saving new matches failed.");
    }
    stats.inserted = count ?? inserts.length;
  }

  // 6. Lifecycle cleanup — only after every read, update and insert above succeeded.
  await cleanup(supabase, now, checkedDays, stats);
  return stats;
}

/**
 * Deletes SportScore-confirmed finished matches and expired upcoming ones (rules in planCleanup).
 * A match's own stream sources go with it (on delete cascade); channel and tournament sources are separate
 * tables and are never touched. Each delete re-checks the status, so it is safe to run repeatedly.
 */
async function cleanup(supabase: Client, now: number, checkedDays: ReadonlySet<string>, stats: SyncStats) {
  const { data, error } = await supabase
    .from("matches")
    .select("id, status, start_time, sync_snapshot")
    .in("status", ["completed", "cancelled", "upcoming", "postponed"])
    .not("sync_snapshot", "is", null)
    .limit(5000);
  if (error) {
    stats.warnings.push("Cleanup skipped: could not read stored matches.");
    return;
  }
  const plan = planCleanup((data ?? []) as CleanupRow[], { now, checkedDays });
  const batches: { ids: string[]; statuses: string[]; field: "removedCompleted" | "removedExpired" }[] = [
    { ids: plan.finished, statuses: ["completed", "cancelled"], field: "removedCompleted" },
    { ids: plan.expired, statuses: ["upcoming", "postponed"], field: "removedExpired" },
  ];
  for (const b of batches) {
    for (let i = 0; i < b.ids.length; i += 100) {
      const ids = b.ids.slice(i, i + 100);
      const countSources = async () =>
        (await supabase.from("stream_sources").select("id", { count: "exact", head: true }).in("match_id", ids)).count ?? 0;
      const before = await countSources();
      const { data: gone, error: delErr } = await supabase.from("matches").delete().in("id", ids).in("status", b.statuses).select("id");
      if (delErr) {
        console.error("[cricx] cleanup delete", delErr.message);
        stats.warnings.push("Some finished matches could not be removed; the next sync will retry.");
        return;
      }
      stats[b.field] += gone?.length ?? 0;
      if (before) stats.removedSources += before - (await countSources());
    }
  }
}
