import type { SourceKind } from "@/lib/types";
import { isHttpUrl } from "@/lib/streams";

export type SourceDraft = { name: string; url: string; kind: SourceKind; quality: string; drm: string };

export const emptySource: SourceDraft = { name: "", url: "", kind: "hls", quality: "", drm: "" };

/** Returns an error message, or null when the draft can be saved. */
export function validateSource(d: SourceDraft): string | null {
  if (!d.name.trim()) return "Enter a source name.";
  if (!isHttpUrl(d.url)) return "Enter a valid stream URL starting with https://";
  if (d.drm.trim() && !isHttpUrl(d.drm)) return "The DRM license URL must start with https://";
  return null;
}

export function sourceRow(d: SourceDraft) {
  return {
    name: d.name.trim(),
    url: d.url.trim(),
    kind: d.kind,
    quality: d.quality.trim() || null,
    drm_license_url: d.drm.trim() || null,
    enabled: true,
  };
}

export default function SourceFields({ value, onChange }: { value: SourceDraft; onChange: (v: SourceDraft) => void }) {
  const set = <K extends keyof SourceDraft>(k: K, v: SourceDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <>
      <div className="cx-form-row">
        <input className="cx-input" placeholder="Source Name (e.g. Server 1)" value={value.name} onChange={(e) => set("name", e.target.value)} aria-label="Source name" />
        <input className="cx-input" placeholder="Stream URL (https://…m3u8 / .mpd / embed)" value={value.url} onChange={(e) => set("url", e.target.value)} aria-label="Stream URL" />
      </div>
      <div className="cx-form-row">
        <select className="cx-input" value={value.kind} onChange={(e) => set("kind", e.target.value as SourceKind)} aria-label="Stream type">
          <option value="hls">HLS (.m3u8)</option>
          <option value="dash">DASH (.mpd)</option>
          <option value="embed">Embed (provider player)</option>
        </select>
        <input className="cx-input" placeholder="Quality (optional, e.g. HD)" value={value.quality} onChange={(e) => set("quality", e.target.value)} aria-label="Quality" />
      </div>
      {value.kind === "dash" && (
        <input
          className="cx-input"
          placeholder="DRM license server URL from the provider (optional)"
          value={value.drm}
          onChange={(e) => set("drm", e.target.value)}
          aria-label="DRM license URL"
        />
      )}
    </>
  );
}
