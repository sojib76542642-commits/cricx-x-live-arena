import { describe, expect, it } from "vitest";
import { cricStatus, cricTournament, isStaleMatch, mapCricApiMatch } from "@/lib/cricapi";

describe("CricAPI mapping", () => {
  it("marks ended matches completed, started matches live, others upcoming", () => {
    expect(cricStatus({ matchStarted: true, matchEnded: true })).toBe("completed");
    expect(cricStatus({ matchStarted: true, matchEnded: false })).toBe("live");
    expect(cricStatus({ matchStarted: false })).toBe("upcoming");
  });

  it("takes the series name after the match number as the tournament", () => {
    expect(cricTournament({ name: "India vs Australia, 3rd ODI, Australia tour of India 2026" })).toBe("Australia tour of India 2026");
  });

  it("maps teams, GMT start time and scores", () => {
    const m = mapCricApiMatch({
      id: "abc",
      name: "India vs Australia, 3rd ODI, Australia tour of India 2026",
      dateTimeGMT: "2026-11-13T09:30:00",
      teams: ["India", "Australia"],
      score: [{ r: 250, w: 6, o: 50, inning: "India Inning 1" }],
      matchStarted: true,
      matchEnded: false,
    });
    expect(m).toMatchObject({
      external_match_id: "cricapi:abc",
      home_team: "India",
      away_team: "Australia",
      start_time: "2026-11-13T09:30:00.000Z",
      status: "live",
      home_score: "250/6 (50)",
      away_score: null,
    });
  });

  it("skips items without two teams", () => {
    expect(mapCricApiMatch({ id: "x", teams: ["India"], dateTimeGMT: "2026-11-13T09:30:00" })).toBeNull();
  });
});

describe("old match status clean-up", () => {
  const now = Date.parse("2026-11-13T11:00:00Z");
  it("marks a T10/T20 match still 'live' 4 days after kickoff as stale", () => {
    expect(isStaleMatch({ status: "live", start_time: "2026-11-09T13:45:00Z", tournament: "Abu Dhabi T10 League" }, now)).toBe(true);
  });
  it("gives a Test match 6 days before treating it as stale", () => {
    expect(isStaleMatch({ status: "live", start_time: "2026-11-09T04:30:00Z", tournament: "Test Series Pakistan vs Sri Lanka" }, now)).toBe(false);
  });
  it("never touches matches already completed or cancelled", () => {
    expect(isStaleMatch({ status: "cancelled", start_time: "2026-10-01T00:00:00Z", tournament: "T20 League" }, now)).toBe(false);
  });
});
