import { describe, expect, it } from "vitest";
import { dedupeMatches, isBlockedMixedContent, isHttpUrl, mergeSources, playbackModeFor } from "@/lib/streams";
import { validateSource, emptySource } from "@/components/admin/SourceFields";
import type { Source } from "@/lib/types";

const src = (id: string, url: string): Source => ({ id, name: id, url, kind: "hls", quality: null, enabled: true, sort_order: 0, drm_license_url: null });

describe("playback engine selection", () => {
  it("plays .m3u8 with HLS", () => {
    expect(playbackModeFor({ url: "https://x.test/live.m3u8", kind: "hls" })).toBe("hls");
  });
  it("plays .mpd manifests with the DASH player", () => {
    expect(playbackModeFor({ url: "https://x.test/manifest.mpd?token=1", kind: "hls" })).toBe("dash");
  });
  it("uses the DASH player whenever a DRM license URL is set", () => {
    expect(playbackModeFor({ url: "https://x.test/stream", kind: "hls", drm_license_url: "https://lic.test/wv" })).toBe("dash");
  });
  it("renders embed sources in an iframe", () => {
    expect(playbackModeFor({ url: "https://x.test/player/1", kind: "embed" })).toBe("embed");
  });
});

describe("insecure stream links", () => {
  it("blocks http streams on an https page instead of proxying them", () => {
    expect(isBlockedMixedContent("http://x.test/a.m3u8", "https:")).toBe(true);
  });
  it("allows https streams on an https page", () => {
    expect(isBlockedMixedContent("https://x.test/a.m3u8", "https:")).toBe(false);
  });
  it("rejects non-web URLs", () => {
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("source merging", () => {
  it("drops a tournament source whose URL duplicates a match source", () => {
    const merged = mergeSources([src("a", "https://x.test/1.m3u8")], [src("b", "HTTPS://x.test/1.m3u8 "), src("c", "https://x.test/2.m3u8")]);
    expect(merged.map((s) => s.id)).toEqual(["a", "c"]);
  });
});

describe("match de-duplication", () => {
  it("keeps one row per external match id", () => {
    const rows = [
      { external_match_id: "sportscore:1", home_team: "A", away_team: "B", start_time: "t" },
      { external_match_id: "sportscore:1", home_team: "A", away_team: "B", start_time: "t" },
    ];
    expect(dedupeMatches(rows)).toHaveLength(1);
  });
  it("collapses copies of one fixture that the old feed saved under different ids", () => {
    const rows = [
      { id: "a", external_match_id: "0.11", home_team: "Pakistan", away_team: "Sri Lanka", start_time: "2026-11-09 04:30:00+00" },
      { id: "b", external_match_id: "0.22", home_team: "pakistan ", away_team: "Sri Lanka", start_time: "2026-11-09T04:30:00+00:00" },
      { id: "c", external_match_id: "0.33", home_team: "Pakistan", away_team: "Sri Lanka", start_time: "2026-11-10T04:30:00+00:00" },
    ];
    expect(dedupeMatches(rows).map((m) => m.id)).toEqual(["a", "c"]);
  });
  it("keeps the copy of a fixture that has stream sources", () => {
    const rows = [
      { id: "a", external_match_id: "1", home_team: "A", away_team: "B", start_time: "2026-11-09T04:30:00Z" },
      { id: "b", external_match_id: "2", home_team: "A", away_team: "B", start_time: "2026-11-09T04:30:00Z" },
    ];
    expect(dedupeMatches(rows, (m) => (m.id === "b" ? 1 : 0)).map((m) => m.id)).toEqual(["b"]);
  });
});

describe("admin source form", () => {
  it("refuses a source without an https/http URL", () => {
    expect(validateSource({ ...emptySource, name: "Server 1", url: "not a url" })).not.toBeNull();
  });
  it("accepts a named https source", () => {
    expect(validateSource({ ...emptySource, name: "Server 1", url: "https://x.test/a.m3u8" })).toBeNull();
  });
});
