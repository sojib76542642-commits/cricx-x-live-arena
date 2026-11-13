import type { MatchStatus } from "./types";

/** Subset of a CricAPI `currentMatches` item that the sync uses. */
export type CricApiMatch = {
  id: string;
  name?: string;
  matchType?: string;
  status?: string;
  dateTimeGMT?: string;
  date?: string;
  teams?: string[];
  teamInfo?: Array<{ name?: string; shortname?: string; img?: string }>;
  score?: Array<{ r?: number; w?: number; o?: number; inning?: string }>;
  matchStarted?: boolean;
  matchEnded?: boolean;
};

export type MappedMatch = {
  external_match_id: string;
  sport: string;
  tournament: string;
  home_team: string;
  away_team: string;
  start_time: string;
  status: MatchStatus;
  home_score: string | null;
  away_score: string | null;
  home_team_logo_url: string | null;
  away_team_logo_url: string | null;
};

export function cricStatus(m: Pick<CricApiMatch, "matchStarted" | "matchEnded">): MatchStatus {
  if (m.matchEnded) return "completed";
  if (m.matchStarted) return "live";
  return "upcoming";
}

/** "India vs Australia, 3rd ODI, Australia tour of India 2026" -> "Australia tour of India 2026" */
export function cricTournament(m: Pick<CricApiMatch, "name" | "matchType">): string {
  const parts = (m.name ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return parts.slice(2).join(", ");
  return (m.matchType ?? "Cricket").toUpperCase();
}

function teamScore(m: CricApiMatch, team: string): string | null {
  const innings = (m.score ?? []).filter((s) => (s.inning ?? "").toLowerCase().startsWith(team.toLowerCase()));
  if (innings.length === 0) return null;
  return innings.map((s) => `${s.r ?? 0}/${s.w ?? 0} (${s.o ?? 0})`).join(" & ");
}

function toIso(m: CricApiMatch): string | null {
  const raw = m.dateTimeGMT ? `${m.dateTimeGMT.replace(" ", "T")}${/[zZ]|[+-]\d\d:?\d\d$/.test(m.dateTimeGMT) ? "" : "Z"}` : m.date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function mapCricApiMatch(m: CricApiMatch): MappedMatch | null {
  const [home, away] = m.teams ?? [];
  const start = toIso(m);
  if (!m.id || !home || !away || !start) return null;
  const logo = (team: string) => m.teamInfo?.find((t) => t.name === team)?.img ?? null;
  return {
    external_match_id: `cricapi:${m.id}`,
    sport: "Cricket",
    tournament: cricTournament(m),
    home_team: home,
    away_team: away,
    start_time: start,
    status: cricStatus(m),
    home_score: teamScore(m, home),
    away_score: teamScore(m, away),
    home_team_logo_url: logo(home),
    away_team_logo_url: logo(away),
  };
}
