import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Search, Tv } from "lucide-react";
import { channelsQuery } from "@/lib/queries";
import Empty from "@/components/Empty";
import ChannelCard from "@/components/ChannelCard";
import { RouteError } from "@/components/RouteStates";

export const Route = createFileRoute("/sports")({
  head: () => ({
    meta: [
      { title: "24/7 Sports Channels · Cricx X" },
      { name: "description", content: "Browse always-on sports TV channels on Cricx X, with multiple stream sources per channel." },
      { property: "og:title", content: "24/7 Sports Channels · Cricx X" },
      { property: "og:description", content: "Browse always-on sports TV channels on Cricx X, with multiple stream sources per channel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(channelsQuery()),
  pendingComponent: () => <Empty title="Loading channels…" />,
  errorComponent: RouteError,
  component: SportsPage,
});

const PAGE = 60;

function SportsPage() {
  const { data: channels } = useSuspenseQuery(channelsQuery());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [limit, setLimit] = useState(PAGE);

  const categories = useMemo(() => ["All", ...Array.from(new Set(channels.map((c) => c.category || "Sports"))).sort()], [channels]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter((c) => {
      if (category !== "All" && (c.category || "Sports") !== category) return false;
      return !q || c.name.toLowerCase().includes(q);
    });
  }, [channels, query, category]);

  const visible = filtered.slice(0, limit);
  const withSources = channels.filter((c) => c.sources.length > 0).length;

  return (
    <div className="cx-home">
      <header className="cx-hero" style={{ minHeight: "auto", padding: "32px 24px", marginBottom: "24px" }}>
        <div className="cx-hero-content">
          <span className="cx-hero-tag live">
            <i /> ALWAYS ON
          </span>
          <h1 style={{ fontSize: "clamp(24px, 4vw, 36px)", marginTop: "12px" }}>
            24/7 Sports <em>Channels</em>
          </h1>
          <p style={{ color: "var(--text-dim)", marginBottom: 0 }}>
            {channels.length} channels streaming · {withSources} with active sources
          </p>
        </div>
      </header>

      <div className="cx-toolbar" style={{ marginBottom: "24px" }}>
        <div className="cx-filters" aria-label="Category">
          {categories.slice(0, 12).map((c) => (
            <button
              key={c}
              type="button"
              className={category === c ? "active" : ""}
              aria-pressed={category === c}
              onClick={() => {
                setCategory(c);
                setLimit(PAGE);
              }}
            >
              {c}
            </button>
          ))}
        </div>
        <label className="cx-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search channels"
            aria-label="Search channels"
          />
        </label>
      </div>

      {filtered.length === 0 ? (
        channels.length === 0 ? (
          <Empty icon={<Tv size={24} />} title="No channels yet" text="24/7 channels will appear here once they're added." />
        ) : (
          <Empty icon={<Tv size={24} />} title="No channels found" text="Try another category or search term." />
        )
      ) : (
        <>
          <div className="cx-channel-grid">
            {visible.map((c) => (
              <ChannelCard key={c.id} channel={c} />
            ))}
          </div>

          {filtered.length > limit && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: "32px" }}>
              <button type="button" className="cx-btn cx-btn-secondary" onClick={() => setLimit((l) => l + PAGE)}>
                Load More Channels ({visible.length} / {filtered.length})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
