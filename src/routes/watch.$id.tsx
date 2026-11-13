import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Signal, Server, Play } from "lucide-react";
import { dateLong, timeOnly } from "@/lib/format";
import { matchQuery } from "@/lib/queries";
import { sourceLabel } from "@/lib/streams";
import VideoPlayer from "@/components/VideoPlayer";
import Empty from "@/components/Empty";
import LocalTime from "@/components/LocalTime";
import { RouteError, RouteNotFound } from "@/components/RouteStates";

export const Route = createFileRoute("/watch/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(matchQuery(params.id)),
  head: ({ loaderData }) => {
    const title = loaderData
      ? `${loaderData.match.home_team} vs ${loaderData.match.away_team} · Watch Live · Cricx X`
      : "Watch Live · Cricx X";
    const description = loaderData
      ? `Watch ${loaderData.match.home_team} vs ${loaderData.match.away_team} (${loaderData.match.tournament}) live on Cricx X.`
      : "Watch live sports on Cricx X.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "video.other" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  pendingComponent: () => <Empty title="Loading match…" />,
  errorComponent: RouteError,
  notFoundComponent: () => <RouteNotFound title="Match not found" text="This match is not available or has been removed." />,
  component: WatchPage,
});

function WatchPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const { data } = useSuspenseQuery({ ...matchQuery(id), refetchInterval: 60_000 });
  const { match, sources } = data;
  const [selected, setSelected] = useState(sources[0]?.id ?? "");
  const activeSource = sources.find((s) => s.id === selected) ?? sources[0];

  return (
    <div className="cx-watch">
      <button
        type="button"
        className="cx-btn cx-btn-secondary"
        onClick={() => (window.history.length > 1 ? router.history.back() : void router.navigate({ to: "/" }))}
        style={{ padding: "8px 16px", marginBottom: "16px", borderRadius: "8px" }}
      >
        <ArrowLeft size={16} /> Back to Live
      </button>

      <div className="cx-watch-head">
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
          <span className={`cx-badge cx-badge-${match.status === "live" ? "live" : "upcoming"}`}>
            {match.status === "live" && <i />} {match.status}
          </span>
          <span className="cx-badge" style={{ background: "var(--surface)", color: "var(--text-dim)", border: "1px solid var(--border)" }}>
            {match.tournament}
          </span>
        </div>
        <h1>
          {match.home_team} <span style={{ color: "var(--text-muted)" }}>vs</span> {match.away_team}
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          <LocalTime value={match.start_time} format={(v) => `${dateLong(v)} · ${timeOnly(v)}`} />
          {(match.home_score || match.away_score) && ` · ${match.home_score || "—"} : ${match.away_score || "—"}`}
        </p>
      </div>

      <div className="cx-watch-layout">
        <div className="cx-player-container">
          {activeSource ? (
            <VideoPlayer key={activeSource.id} src={activeSource.url} kind={activeSource.kind} drmLicenseUrl={activeSource.drm_license_url} />
          ) : (
            <div className="cx-player-empty">
              <Signal size={48} />
              <b>No Stream Available</b>
              <small>Streams for this match have not been added yet.</small>
            </div>
          )}
        </div>

        <div className="cx-servers-panel">
          <div className="cx-servers-head">
            <h3>
              <Server size={20} /> SERVERS ({sources.length})
            </h3>
            <span>{activeSource ? "CONNECTED" : "OFFLINE"}</span>
          </div>

          <div role="listbox" aria-label="Stream servers">
            {sources.map((src, idx) => (
              <button
                type="button"
                role="option"
                aria-selected={activeSource?.id === src.id}
                key={src.id}
                className={`cx-server-item ${activeSource?.id === src.id ? "active" : ""}`}
                style={{ width: "100%" }}
                onClick={() => setSelected(src.id)}
              >
                <div className="cx-server-name">
                  <span className="cx-server-num">{idx + 1}</span>
                  {src.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {activeSource?.id === src.id && <Play size={14} color="var(--primary)" fill="var(--primary)" />}
                  <span className="cx-server-tag">{sourceLabel(src)}</span>
                </div>
              </button>
            ))}
            {sources.length === 0 && (
              <p style={{ color: "var(--text-muted)", textAlign: "center", fontSize: "14px" }}>No servers configured for this match.</p>
            )}
          </div>
        </div>
      </div>
      <p style={{ marginTop: 16 }}>
        <Link to="/backups" className="cx-back">
          Looking for more sources? See Backups
        </Link>
      </p>
    </div>
  );
}
