import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Search, ShieldCheck, Radio, Tv, ArrowRight, RefreshCw } from "lucide-react";
import { backupsQuery } from "@/lib/queries";
import Empty from "@/components/Empty";
import { sportEmoji } from "@/components/MatchCard";
import { RouteError } from "@/components/RouteStates";

export const Route = createFileRoute("/backups")({
  head: () => ({
    meta: [
      { title: "Backup Streams · Cricx X" },
      { name: "description", content: "Matches and 24/7 channels on Cricx X that have more than one stream source." },
      { property: "og:title", content: "Backup Streams · Cricx X" },
      { property: "og:description", content: "Matches and 24/7 channels on Cricx X that have more than one stream source." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(backupsQuery()),
  pendingComponent: () => <Empty title="Loading backups…" />,
  errorComponent: RouteError,
  component: BackupsPage,
});

function BackupsPage() {
  const { data, refetch, isFetching } = useSuspenseQuery(backupsQuery());
  const [mode, setMode] = useState<"matches" | "channels">("matches");
  const [query, setQuery] = useState("");

  const filteredMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.matches.filter(({ match }) => !q || `${match.home_team} ${match.away_team} ${match.tournament}`.toLowerCase().includes(q));
  }, [data.matches, query]);

  const filteredChannels = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.channels.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [data.channels, query]);

  return (
    <div className="cx-backups">
      <header className="cx-page-head">
        <span className="cx-kicker">BACKUP SOURCES</span>
        <h1>
          Backup <em>Streams</em>
        </h1>
        <p>Matches and channels with more than one enabled source.</p>
      </header>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div className="cx-backup-toggle">
          <button type="button" className={mode === "matches" ? "active" : ""} aria-pressed={mode === "matches"} onClick={() => setMode("matches")}>
            <Radio size={14} /> Matches ({data.matches.length})
          </button>
          <button type="button" className={mode === "channels" ? "active" : ""} aria-pressed={mode === "channels"} onClick={() => setMode("channels")}>
            <Tv size={14} /> Channels ({data.channels.length})
          </button>
        </div>
        <button type="button" className="cx-refresh" style={{ marginBottom: 16 }} onClick={() => void refetch()} disabled={isFetching} aria-label="Refresh backups">
          <RefreshCw size={14} className={isFetching ? "cx-spin" : ""} />
        </button>
      </div>

      <label className="cx-search cx-search-wide">
        <Search size={15} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${mode}`} aria-label={`Search ${mode}`} />
      </label>

      {mode === "matches" ? (
        filteredMatches.length === 0 ? (
          <Empty icon={<ShieldCheck size={24} />} title="No match backups" text="Only matches with 2+ sources appear here." />
        ) : (
          <div className="cx-backup-list">
            {filteredMatches.map(({ match, sources }) => (
              <Link key={match.id} to="/watch/$id" params={{ id: match.id }} className="cx-backup-row">
                <span className="cx-backup-emoji">{sportEmoji[match.sport] || "🏆"}</span>
                <span className="cx-backup-info">
                  <b>
                    {match.home_team} vs {match.away_team}
                  </b>
                  <small>{match.tournament}</small>
                </span>
                <span className="cx-backup-count">{sources}</span>
                <ArrowRight size={15} />
              </Link>
            ))}
          </div>
        )
      ) : filteredChannels.length === 0 ? (
        <Empty icon={<ShieldCheck size={24} />} title="No channel backups" text="Only channels with 2+ sources appear here." />
      ) : (
        <div className="cx-backup-list">
          {filteredChannels.map((c) => (
            <Link key={c.id} to="/channel/$id" params={{ id: c.id }} className="cx-backup-row">
              <span className="cx-backup-emoji">{c.logo_url ? <img src={c.logo_url} alt="" /> : "📺"}</span>
              <span className="cx-backup-info">
                <b>{c.name}</b>
                <small>{c.category || "Sports"}</small>
              </span>
              <span className="cx-backup-count">{c.sources}</span>
              <ArrowRight size={15} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
