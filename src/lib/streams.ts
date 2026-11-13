import type { Match, Source, SourceKind } from "./types";

/** How a source should be played in the browser. */
export type PlaybackMode = "hls" | "dash" | "embed";

/**
 * Pick the playback engine for a source.
 * - `embed` sources render in an iframe (provider's own player).
 * - `.mpd` manifests, `dash` kind, or a DRM license URL use Shaka Player.
 * - everything else is treated as HLS (hls.js, or native HLS on Safari).
 */
export function playbackModeFor(source: { url: string; kind?: SourceKind | string | null; drm_license_url?: string | null }): PlaybackMode {
  if (source.kind === "embed") return "embed";
  const path = source.url.split("?")[0]?.toLowerCase() ?? "";
  if (source.kind === "dash" || path.endsWith(".mpd") || source.drm_license_url) return "dash";
  return "hls";
}

/** A plain-http stream cannot load inside an https page (browser mixed-content rule). */
export function isBlockedMixedContent(url: string, pageProtocol: string): boolean {
  return pageProtocol === "https:" && url.trim().toLowerCase().startsWith("http://");
}

/** Only http(s) URLs are accepted as stream, license or embed URLs. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Merge match sources with inherited tournament sources, dropping duplicate URLs (first wins). */
export function mergeSources(own: Source[], inherited: Source[]): Source[] {
  const seen = new Set<string>();
  return [...own, ...inherited].filter((s) => {
    const key = s.url.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type DedupeRow = Pick<Match, "external_match_id" | "home_team" | "away_team" | "start_time">;

/** Same teams at the same kickoff instant = same fixture, whatever id the feed gave it. */
export function fixtureKey(m: DedupeRow): string {
  const t = Date.parse(m.start_time);
  return `${m.home_team.trim().toLowerCase()}|${m.away_team.trim().toLowerCase()}|${Number.isNaN(t) ? m.start_time : t}`;
}

/**
 * Remove duplicate matches: same external id, or same fixture (teams + kickoff).
 * When several rows describe one fixture, the highest `rank` wins (ties keep the first);
 * list order follows each fixture's first appearance.
 */
export function dedupeMatches<T extends DedupeRow>(rows: T[], rank: (m: T) => number = () => 0): T[] {
  const seenExt = new Set<string>();
  const byFixture = new Map<string, T>();
  for (const m of rows) {
    if (m.external_match_id) {
      if (seenExt.has(m.external_match_id)) continue;
      seenExt.add(m.external_match_id);
    }
    const key = fixtureKey(m);
    const current = byFixture.get(key);
    if (!current || rank(m) > rank(current)) byFixture.set(key, m);
  }
  return Array.from(byFixture.values());
}

export function sourceLabel(source: Source): string {
  const mode = playbackModeFor(source);
  if (mode === "embed") return "EMBED";
  if (mode === "dash") return source.drm_license_url ? "DASH · DRM" : "DASH";
  return "HLS";
}
