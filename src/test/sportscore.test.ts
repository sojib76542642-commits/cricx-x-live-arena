import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findStoredCopies,
  mapSportScoreMatch,
  mapStatus,
  parseScore,
  planCleanup,
  planMatchUpdate,
  shouldInsert,
  windowDays,
  type CleanupRow,
  type SyncRow,
} from "@/lib/sportscore";
import { SportScoreError, fetchSportScore } from "@/lib/sportscore.server";
import { isAwaitingResult, isHomeVisible } from "@/lib/streams";

// Shapes copied from real SportScore responses (fixtures for 2026-11-13 and 2026-11-10).
const finished = {
  home: "New Zealand",
  away: "India",
  home_score: "333/10",
  away_score: "89/10",
  status: "finished",
  status_text: "Finished",
  time: "2026-11-13T02:00:00+00:00",
  competition: "ODI Series New Zealand vs India",
  url: "/cricket/match/new-zealand-vs-india/",
};
const cutInHalf = { ...finished, home_score: null, away_score: null, status: "upcoming", status_text: "Cut in half", time: "2026-11-10T02:00:00+00:00" };

function row(over: Partial<SyncRow> = {}): SyncRow {
  return {
    id: "r1",
    external_match_id: "NewZealand-India-1794276000000",
    sync_snapshot: null,
    status: "live",
    home_score: null,
    away_score: null,
    start_time: "2026-11-13T02:00:00+00:00",
    tournament: "ODI Series New Zealand vs India",
    home_team: "New Zealand",
    away_team: "India",
    home_team_logo_url: null,
    away_team_logo_url: null,
    ...over,
  };
}

describe("SportScore mapping", () => {
  it("maps a finished match to completed with its real scores", () => {
    const m = mapSportScoreMatch(finished)!;
    expect(m.status).toBe("completed");
    expect(m.home_score).toBe("333/10");
    expect(m.away_score).toBe("89/10");
    expect(m.key).toBe("sportscore:cricket:new-zealand-vs-india:2026-11-13");
  });
  it("treats '-' as no score", () => {
    expect(parseScore("-")).toBeNull();
  });
  it("keeps SportScore's 'upcoming' for an abnormal past match instead of completing it by age", () => {
    expect(mapStatus("upcoming", "Cut in half")).toBe("upcoming");
    expect(mapStatus("upcoming", "Abnormal")).toBe("upcoming");
  });
  it("maps abandoned and postponed notes", () => {
    expect(mapStatus("finished", "Abandoned")).toBe("cancelled");
    expect(mapStatus("upcoming", "Postponed")).toBe("postponed");
  });
  it("leaves the status alone when SportScore sends an unknown one", () => {
    expect(mapStatus("weird", "")).toBeNull();
  });
});

describe("sync merge rules", () => {
  const api = mapSportScoreMatch(finished)!;
  it("updates status and scores of an old-feed copy on first link", () => {
    const plan = planMatchUpdate(row(), api);
    expect(plan.update).toMatchObject({ status: "completed", home_score: "333/10", away_score: "89/10" });
  });
  it("keeps a value the admin edited after the last sync", () => {
    const synced = row({ status: "live", sync_snapshot: { status: "upcoming" } });
    const plan = planMatchUpdate(synced, api);
    expect(plan.update.status).toBeUndefined();
    expect(plan.protectedFields).toContain("status");
  });
  it("never clears stored scores when SportScore sends none", () => {
    const plan = planMatchUpdate(row({ home_score: "120/3", sync_snapshot: { home_score: "120/3" } }), mapSportScoreMatch(cutInHalf)!);
    expect(plan.update.home_score).toBeUndefined();
  });
  it("swaps scores when the stored match lists the teams the other way round", () => {
    const plan = planMatchUpdate(row({ home_team: "India", away_team: "New Zealand" }), api);
    expect(plan.update).toMatchObject({ home_score: "89/10", away_score: "333/10" });
  });
  it("reports no change for a match that is already up to date (second sync)", () => {
    const first = planMatchUpdate(row(), api);
    const after = row({ ...first.update, sync_snapshot: first.snapshot });
    expect(planMatchUpdate(after, api).changed).toBe(false);
  });
});

describe("duplicate prevention", () => {
  const api = mapSportScoreMatch(finished)!;
  it("finds every stored copy of the same fixture, in either team order", () => {
    const rows = [row({ id: "a" }), row({ id: "b", home_team: "India", away_team: "New Zealand" })];
    expect(findStoredCopies(rows, api).map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("does not link a different meeting of the same teams three days apart", () => {
    expect(findStoredCopies([row({ id: "old", start_time: "2026-11-10T02:00:00+00:00" })], api)).toEqual([]);
  });
  it("prefers the row that already carries the SportScore key", () => {
    const rows = [row({ id: "keyed", external_match_id: api.key, start_time: "2026-11-13T03:00:00+00:00" }), row({ id: "other" })];
    expect(findStoredCopies(rows, api).map((r) => r.id)).toEqual(["keyed"]);
  });
});

describe("SportScore error handling", () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (status: number, body: unknown) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })));

  it("explains a rate limit", async () => {
    respond(429, { error: "Too many requests" });
    await expect(fetchSportScore("/x")).rejects.toThrow(/limiting requests/);
  });
  it("reports a server error with its status", async () => {
    respond(500, { error: "boom" });
    await expect(fetchSportScore("/x")).rejects.toThrow("SportScore responded with an error (500: boom).");
  });
  it("rejects an unexpected body", async () => {
    respond(200, "<html>");
    await expect(fetchSportScore("/x")).rejects.toBeInstanceOf(SportScoreError);
  });
  it("explains a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(fetchSportScore("/x")).rejects.toThrow("Could not reach SportScore.");
  });
  it("returns the matches list on success", async () => {
    respond(200, { matches: [finished] });
    await expect(fetchSportScore("/x")).resolves.toHaveLength(1);
  });
});

describe("home page grouping", () => {
  const now = Date.parse("2026-11-15T08:30:00Z");
  it("lists an upcoming match whose kickoff passed over a day ago as awaiting a result", () => {
    expect(isAwaitingResult({ status: "upcoming", start_time: "2026-11-10T02:00:00Z" }, now)).toBe(true);
  });
  it("keeps today's overdue match in the schedule", () => {
    expect(isAwaitingResult({ status: "upcoming", start_time: "2026-11-15T05:00:00Z" }, now)).toBe(false);
  });
  it("never moves completed or live matches", () => {
    expect(isAwaitingResult({ status: "live", start_time: "2026-11-10T02:00:00Z" }, now)).toBe(false);
  });
});

describe("match lifecycle", () => {
  const now = Date.parse("2026-11-16T06:00:00Z");
  const checked = new Set(["2026-11-12", "2026-11-13", "2026-11-16"]);
  const c = (over: Partial<CleanupRow>): CleanupRow => ({ id: "x", status: "upcoming", start_time: "2026-11-16T10:00:00Z", sync_snapshot: { status: "upcoming" }, ...over });
  const plan = (rows: CleanupRow[]) => planCleanup(rows, { now, checkedDays: checked });

  it("moves upcoming -> live -> completed only on SportScore's status, then deletes the completed match", () => {
    const upcoming = row({ status: "upcoming", sync_snapshot: { status: "upcoming" } });
    const toLive = planMatchUpdate(upcoming, { ...mapSportScoreMatch(finished)!, status: "live" });
    expect(toLive.update.status).toBe("live");
    const live = row({ ...toLive.update, sync_snapshot: toLive.snapshot });
    expect(plan([{ ...live, start_time: live.start_time!, status: "live" }]).finished).toEqual([]);
    const toDone = planMatchUpdate(live, mapSportScoreMatch(finished)!);
    expect(toDone.update.status).toBe("completed");
    const done = { id: "r1", status: "completed", start_time: live.start_time!, sync_snapshot: toDone.snapshot };
    expect(plan([done]).finished).toEqual(["r1"]);
  });
  it("deletes an abandoned (cancelled) match SportScore reported as finished", () => {
    expect(plan([c({ id: "a", status: "cancelled", sync_snapshot: { status: "cancelled" } })]).finished).toEqual(["a"]);
  });
  it("never deletes a live match, however old", () => {
    expect(plan([c({ status: "live", start_time: "2026-11-01T00:00:00Z", sync_snapshot: { status: "live" } })])).toEqual({ finished: [], expired: [] });
  });
  it("keeps a match an admin marked completed while SportScore still says live", () => {
    expect(plan([c({ status: "completed", sync_snapshot: { status: "live" } })]).finished).toEqual([]);
  });
  it("keeps manual matches the sync never touched", () => {
    expect(plan([c({ status: "completed", sync_snapshot: null }), c({ start_time: "2026-11-12T00:00:00Z", sync_snapshot: null })])).toEqual({ finished: [], expired: [] });
  });
  it("removes an upcoming match more than 48 h past kickoff when that day was checked", () => {
    expect(plan([c({ id: "old", start_time: "2026-11-13T02:00:00Z" })]).expired).toEqual(["old"]);
  });
  it("keeps it when that day's SportScore request failed this run", () => {
    expect(plan([c({ start_time: "2026-11-10T02:00:00Z" })]).expired).toEqual([]);
  });
  it("keeps an upcoming match less than 48 h past kickoff", () => {
    expect(plan([c({ start_time: "2026-11-15T02:00:00Z" })]).expired).toEqual([]);
  });
  it("is idempotent: once rows are gone there is nothing left to delete", () => {
    expect(plan([])).toEqual({ finished: [], expired: [] });
  });
  it("does not store finished or long-overdue fixtures, so deleted results never come back", () => {
    expect(shouldInsert({ status: "completed", start_time: "2026-11-16T02:00:00Z" }, now)).toBe(false);
    expect(shouldInsert({ status: "cancelled", start_time: "2026-11-16T02:00:00Z" }, now)).toBe(false);
    expect(shouldInsert({ status: "upcoming", start_time: "2026-11-10T02:00:00Z" }, now)).toBe(false);
    expect(shouldInsert({ status: "upcoming", start_time: "2026-11-19T02:00:00Z" }, now)).toBe(true);
    expect(shouldInsert({ status: "live", start_time: "2026-11-12T02:00:00Z" }, now)).toBe(true);
  });
  it("fetches fixtures for a rolling 5-day window starting today", () => {
    expect(windowDays(now)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
  });
  it("home page lists only live and upcoming matches", () => {
    expect(isHomeVisible({ status: "live", start_time: "2026-11-15T02:00:00Z" }, now)).toBe(true);
    expect(isHomeVisible({ status: "upcoming", start_time: "2026-11-17T02:00:00Z" }, now)).toBe(true);
    expect(isHomeVisible({ status: "completed", start_time: "2026-11-16T02:00:00Z" }, now)).toBe(false);
    expect(isHomeVisible({ status: "cancelled", start_time: "2026-11-16T02:00:00Z" }, now)).toBe(false);
    expect(isHomeVisible({ status: "upcoming", start_time: "2026-11-13T02:00:00Z" }, now)).toBe(false);
  });
});
