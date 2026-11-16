import type { MatchStatus } from "./types";

/**
 * SportScore free public API (no key). Terms: https://sportscore.com/developers/terms/
 * Every page that shows this data must render a visible dofollow "Powered by SportScore" link.
 */
export const SPORTSCORE_BASE = "https://sportscore.com";
/** SportScore edge-caches responses for 60 s; the sync never runs more often than this. */
export const SPORTSCORE_MIN_INTERVAL_MS = 60_000;

/** One item of `matches` from /api/widget/matches/ and /api/v1/fixtures/ (shape verified against live responses). */
export type SportScoreMatch = {
  home?: string | null;
  away?: string | null;
  home_logo?: string | null;
  away_logo?: string | null;
  home_score?: string | number | null;
  away_score?: string | number | null;
  status?: string | null;
  status_text?: string | null;
  time?: string | null;
  competition?: string | null;
  competition_logo?: string | null;
  url?: string | null;
};

export type SportScoreEnvelope = { sport?: string; count?: number; matches?: SportScoreMatch[]; updated?: string; error?: string };

/** Fields the sync owns on a match row. */
export const SYNC_FIELDS = [
  "status",
  "home_score",
  "away_score",
  "start_time",
  "tournament",
  "home_team",
  "away_team",
  "home_team_logo_url",
  "away_team_logo_url",
] as const;
export type SyncField = (typeof SYNC_FIELDS)[number];
export type SyncValues = Partial<Record<SyncField, string | null>>;

export type MappedSportScoreMatch = {
  key: string;
  slug: string;
  sport: "Cricket";
  tournament: string;
  tournament_logo_url: string | null;
  home_team: string;
  away_team: string;
  start_time: string;
  status: MatchStatus | null;
  home_score: string | null;
  away_score: string | null;
  home_team_logo_url: string | null;
  away_team_logo_url: string | null;
};

/** "/cricket/match/chandigarh-vs-baroda/" -> "chandigarh-vs-baroda" (football urls add an id segment, kept with ":"). */
export function slugFromUrl(url: string | null | undefined): string | null {
  const parts = (url ?? "").split("/").filter(Boolean);
  const i = parts.indexOf("match");
  const rest = i >= 0 ? parts.slice(i + 1) : [];
  return rest.length ? rest.join(":").toLowerCase() : null;
}

/** "-", "" and null mean no score yet. */
export function parseScore(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  const s = v.trim();
  return s === "" || s === "-" ? null : s;
}

/**
 * Maps SportScore's status to ours. Returns null when the status is unknown, so the stored status is left alone.
 * "Abnormal" / "Cut in half" stay as SportScore reports them (upcoming) — nothing is guessed from the clock.
 */
export function mapStatus(status: string | null | undefined, text: string | null | undefined): MatchStatus | null {
  const t = (text ?? "").toLowerCase();
  if (/cancel|abandon/.test(t)) return "cancelled";
  if (/postpon/.test(t)) return "postponed";
  switch ((status ?? "").toLowerCase()) {
    case "live":
      return "live";
    case "finished":
      return "completed";
    case "upcoming":
      return "upcoming";
    default:
      return null;
  }
}

function httpsOrNull(u: string | null | undefined): string | null {
  return u && /^https:\/\//i.test(u) ? u : null;
}

function toIso(t: string | null | undefined): string | null {
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Stable id: the match slug plus its UTC kickoff day (cricket slugs repeat when the same teams meet again). */
export function sportScoreKey(slug: string, startIso: string): string {
  return `sportscore:cricket:${slug}:${startIso.slice(0, 10)}`;
}

export function mapSportScoreMatch(m: SportScoreMatch): MappedSportScoreMatch | null {
  const home = m.home?.trim();
  const away = m.away?.trim();
  const start = toIso(m.time);
  const slug = slugFromUrl(m.url);
  if (!home || !away || !start || !slug) return null;
  return {
    key: sportScoreKey(slug, start),
    slug,
    sport: "Cricket",
    tournament: m.competition?.trim() || "Cricket",
    tournament_logo_url: httpsOrNull(m.competition_logo),
    home_team: home,
    away_team: away,
    start_time: start,
    status: mapStatus(m.status, m.status_text),
    home_score: parseScore(m.home_score),
    away_score: parseScore(m.away_score),
    home_team_logo_url: httpsOrNull(m.home_logo),
    away_team_logo_url: httpsOrNull(m.away_logo),
  };
}

/** Same two teams regardless of which one is listed at home. */
export function teamPairKey(a: string, b: string): string {
  return [a, b].map((t) => t.trim().toLowerCase()).sort().join("|");
}

export type SyncRow = {
  id: string;
  external_match_id: string | null;
  sync_snapshot: unknown;
} & Record<SyncField, string | null>;

const FEED_OWNED: ReadonlySet<SyncField> = new Set(["status", "home_score", "away_score"]);

function same(field: SyncField, a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (field === "start_time") return Date.parse(a) === Date.parse(b);
  return a === b;
}

function isEmpty(v: string | null | undefined) {
  return v == null || v.trim() === "";
}

/**
 * Decides which fields of a stored match to refresh from SportScore.
 * - A field the sync wrote before is refreshed only while it still holds that value (admin edits win).
 * - On first link (no snapshot), live data (status, scores) is refreshed; names, time, competition and
 *   logos are only filled in when empty.
 * - Values SportScore doesn't supply (null) never clear stored data.
 */
export function planMatchUpdate(row: SyncRow, api: MappedSportScoreMatch) {
  const snapshot = row.sync_snapshot && typeof row.sync_snapshot === "object" ? (row.sync_snapshot as SyncValues) : null;
  const swapped = row.home_team != null && row.away_team != null &&
    row.home_team.trim().toLowerCase() === api.away_team.trim().toLowerCase() &&
    row.away_team.trim().toLowerCase() === api.home_team.trim().toLowerCase() &&
    api.home_team.trim().toLowerCase() !== api.away_team.trim().toLowerCase();
  const incoming: SyncValues = {
    status: api.status,
    home_score: swapped ? api.away_score : api.home_score,
    away_score: swapped ? api.home_score : api.away_score,
    start_time: api.start_time,
    tournament: api.tournament,
    home_team: swapped ? api.away_team : api.home_team,
    away_team: swapped ? api.home_team : api.away_team,
    home_team_logo_url: swapped ? api.away_team_logo_url : api.home_team_logo_url,
    away_team_logo_url: swapped ? api.home_team_logo_url : api.away_team_logo_url,
  };

  const update: SyncValues = {};
  const nextSnapshot: SyncValues = {};
  const protectedFields: SyncField[] = [];
  for (const f of SYNC_FIELDS) {
    const v = incoming[f];
    const current = row[f];
    const prev = snapshot?.[f];
    if (v == null) {
      if (prev !== undefined) nextSnapshot[f] = prev;
      continue;
    }
    if (same(f, current, v)) {
      nextSnapshot[f] = v;
      continue;
    }
    const canWrite = isEmpty(current) || (prev !== undefined && same(f, current, prev)) || (snapshot === null && FEED_OWNED.has(f));
    if (canWrite) {
      update[f] = v;
      nextSnapshot[f] = v;
    } else {
      protectedFields.push(f);
      if (prev !== undefined) nextSnapshot[f] = prev;
    }
  }
  const snapshotChanged = JSON.stringify(sortKeys(snapshot ?? {})) !== JSON.stringify(sortKeys(nextSnapshot));
  return { update, snapshot: nextSnapshot, protectedFields, changed: Object.keys(update).length > 0 || snapshotChanged };
}

function sortKeys(o: SyncValues) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

const TWELVE_HOURS = 12 * 60 * 60 * 1000;

/**
 * Finds the stored rows for one SportScore match: same key, else same teams at the same kickoff,
 * else same teams within 12 h (a re-timed fixture). Never matches a different meeting of the same teams days apart.
 */
export function findStoredCopies<R extends Pick<SyncRow, "id" | "external_match_id" | "home_team" | "away_team" | "start_time">>(
  rows: R[],
  api: MappedSportScoreMatch,
  claimed: ReadonlySet<string> = new Set(),
): R[] {
  const byKey = rows.filter((r) => r.external_match_id === api.key);
  if (byKey.length) return byKey;
  const pair = teamPairKey(api.home_team, api.away_team);
  const t = Date.parse(api.start_time);
  const samePair = rows.filter((r) => !claimed.has(r.id) && r.home_team && r.away_team && teamPairKey(r.home_team, r.away_team) === pair);
  const exact = samePair.filter((r) => r.start_time && Date.parse(r.start_time) === t);
  if (exact.length) return exact;
  return samePair.filter((r) => r.start_time && Math.abs(Date.parse(r.start_time) - t) <= TWELVE_HOURS);
}

/** Unique UTC days (YYYY-MM-DD), newest first. */
export function utcDays(isoTimes: string[], limit: number): string[] {
  return Array.from(new Set(isoTimes.map((t) => new Date(t).toISOString().slice(0, 10)))).sort().reverse().slice(0, limit);
}

const HOUR = 60 * 60 * 1000;

/** Fixtures are fetched for today plus the next days, so upcoming matches cover a rolling 5-day window. */
export const UPCOMING_WINDOW_DAYS = 5;
/** An upcoming/postponed match this long past kickoff, still not live per SportScore, is expired and removed. */
export const EXPIRED_UPCOMING_AFTER_MS = 48 * HOUR;

/** Finished per SportScore ("finished" maps to completed, or cancelled when abandoned). */
const FINISHED: ReadonlySet<string> = new Set(["completed", "cancelled"]);
const NOT_STARTED: ReadonlySet<string> = new Set(["upcoming", "postponed"]);

export type CleanupRow = { id: string; status: string; start_time: string; sync_snapshot: unknown };

/**
 * The status SportScore last reported for this row, but only when the stored status still equals it.
 * Rows never touched by the sync (manual admin matches) or whose status an admin changed return null.
 */
export function confirmedStatus(row: Pick<CleanupRow, "status" | "sync_snapshot">): string | null {
  const snap = row.sync_snapshot && typeof row.sync_snapshot === "object" ? (row.sync_snapshot as SyncValues) : null;
  const s = snap?.status;
  return typeof s === "string" && s === row.status ? s : null;
}

/**
 * Which stored matches the sync deletes after a successful run.
 * - finished: SportScore confirmed completed/cancelled (any kickoff date).
 * - expired: SportScore still says upcoming/postponed, kickoff is over 48 h ago, and that kickoff day's
 *   fixtures were fetched successfully in this run (so a failed request never causes a deletion).
 * Live matches, manual matches and admin-overridden statuses are never deleted.
 */
export function planCleanup(rows: CleanupRow[], opts: { now: number; checkedDays: ReadonlySet<string> }) {
  const finished: string[] = [];
  const expired: string[] = [];
  for (const r of rows) {
    const s = confirmedStatus(r);
    if (!s) continue;
    if (FINISHED.has(s)) {
      finished.push(r.id);
      continue;
    }
    if (!NOT_STARTED.has(s)) continue;
    const t = Date.parse(r.start_time);
    if (!Number.isFinite(t) || opts.now - t <= EXPIRED_UPCOMING_AFTER_MS) continue;
    if (opts.checkedDays.has(new Date(t).toISOString().slice(0, 10))) expired.push(r.id);
  }
  return { finished, expired };
}

/** A SportScore match not yet stored is saved only while it is live or genuinely upcoming. */
export function shouldInsert(m: Pick<MappedSportScoreMatch, "status" | "start_time">, now: number): boolean {
  if (m.status && FINISHED.has(m.status)) return false;
  if (m.status === "live") return true;
  const t = Date.parse(m.start_time);
  return Number.isFinite(t) && now - t <= EXPIRED_UPCOMING_AFTER_MS;
}

/** UTC days (YYYY-MM-DD) from the day of `now` forward. */
export function windowDays(now: number, count: number = UPCOMING_WINDOW_DAYS): string[] {
  return Array.from({ length: count }, (_, i) => new Date(now + i * 24 * HOUR).toISOString().slice(0, 10));
}
