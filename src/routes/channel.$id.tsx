import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, Signal, Lock, Radio } from "lucide-react";
import { channelQuery } from "@/lib/queries";
import { sourceLabel } from "@/lib/streams";
import VideoPlayer from "@/components/VideoPlayer";
import Empty from "@/components/Empty";
import { RouteError, RouteNotFound } from "@/components/RouteStates";

export const Route = createFileRoute("/channel/$id")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(channelQuery(params.id)),
  head: ({ loaderData }) => {
    const title = loaderData ? `${loaderData.name} Live · Cricx X` : "Live Channel · Cricx X";
    const description = loaderData?.description || (loaderData ? `Watch ${loaderData.name} live, 24/7 on Cricx X.` : "Watch 24/7 sports channels on Cricx X.");
    const meta = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary" },
    ];
    if (loaderData?.logo_url?.startsWith("https://")) {
      meta.push({ property: "og:image", content: loaderData.logo_url }, { name: "twitter:image", content: loaderData.logo_url });
    }
    return { meta };
  },
  pendingComponent: () => <Empty title="Loading channel…" />,
  errorComponent: RouteError,
  notFoundComponent: () => (
    <RouteNotFound title="Channel unavailable" text="This channel is not available right now." to="/sports" label="Back to Sports" />
  ),
  component: ChannelWatchPage,
});

function ChannelWatchPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const { data: channel } = useSuspenseQuery(channelQuery(id));
  const { sources } = channel;
  const [selected, setSelected] = useState(sources[0]?.id ?? "");
  const active = sources.find((s) => s.id === selected) ?? sources[0];
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div className="cx-watch" style={{ maxWidth: 1600, margin: "0 auto" }}>
      <button
        type="button"
        className="cx-back"
        onClick={() => (window.history.length > 1 ? router.history.back() : void router.navigate({ to: "/sports" }))}
      >
        <ArrowLeft size={16} /> Back to Channels
      </button>

      <header className="cx-channel-head">
        {channel.logo_url && !logoFailed && <img src={channel.logo_url} alt={channel.name} onError={() => setLogoFailed(true)} ref={(el) => { if (el?.complete && el.naturalWidth === 0) setLogoFailed(true); }} />}
        <div>
          <div className="cx-channel-meta">
            <span className="cx-badge cx-badge-live">
              <i /> LIVE NOW
            </span>
            <span>{channel.category || "Sports"}</span>
          </div>
          <h1>{channel.name}</h1>
        </div>
      </header>

      <div className="cx-channel-layout">
        <section style={{ minWidth: 0 }}>
          <div className="cx-player-container">
            {active ? (
              <VideoPlayer key={active.id} src={active.url} kind={active.kind} drmLicenseUrl={active.drm_license_url} />
            ) : (
              <div className="cx-player-empty">
                <Signal size={48} />
                <b>No Streams Available</b>
                <small>This channel has no active sources.</small>
              </div>
            )}
          </div>

          <div className="cx-player-note">
            <span>
              <Lock size={14} /> Only authorized streams. Content is provided by third-party sources.
            </span>
            <span>
              <Radio size={14} color="var(--primary)" /> Live Feed
            </span>
          </div>
        </section>

        <aside className="cx-servers-panel">
          <div className="cx-servers-head">
            <h3>
              <Signal size={18} color="var(--primary)" /> SERVERS ({sources.length})
            </h3>
            <span>{active ? "PLAYING" : "OFFLINE"}</span>
          </div>

          <div role="listbox" aria-label="Stream servers">
            {sources.map((s, i) => (
              <button
                type="button"
                role="option"
                aria-selected={active?.id === s.id}
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={`cx-server-item ${active?.id === s.id ? "active" : ""}`}
                style={{ width: "100%" }}
              >
                <div className="cx-server-name">
                  <span className="cx-server-num">{i + 1}</span>
                  <span style={{ textAlign: "left" }}>
                    <b style={{ display: "block", fontSize: 13 }}>{s.name}</b>
                    <small style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700 }}>{(s.quality || "auto").toUpperCase()}</small>
                  </span>
                </div>
                <span className="cx-server-tag">{active?.id === s.id ? "PLAYING" : sourceLabel(s)}</span>
              </button>
            ))}
            {sources.length === 0 && (
              <p style={{ color: "var(--text-muted)", textAlign: "center", fontSize: "14px" }}>No servers configured for this channel.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
