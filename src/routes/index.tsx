import { useMemo, useState } from "react";
import { createFileRoute, Link, useHydrated } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { RefreshCw, Search, Zap, Radio } from "lucide-react";
import type { Match } from "@/lib/types";
import { dateKey, dateLong } from "@/lib/format";
import { homeMatchesQuery } from "@/lib/queries";
import MatchCard, { sportEmoji } from "@/components/MatchCard";
import Empty from "@/components/Empty";
import LocalTime from "@/components/LocalTime";
import { RouteError } from "@/components/RouteStates";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cricx X · Live Cricket Matches & Scores" },
      { name: "description", content: "Watch live cricket and sports matches, upcoming fixtures and scores on Cricx X." },
      { property: "og:title", content: "Cricx X · Live Cricket Matches & Scores" },
      { property: "og:description", content: "Watch live cricket and sports matches, upcoming fixtures and scores on Cricx X." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(homeMatchesQuery()),
  pendingComponent: () => <Empty title="Loading matches…" />,
  errorComponent: RouteError,
  component: HomePage,
});

function HomePage() {
  const hydrated = useHydrated();
  const { data: matches, refetch, isFetching, error } = useSuspenseQuery({
    ...homeMatchesQuery(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("Cricket");

  const sports = useMemo(() => Array.from(new Set(["Cricket", ...matches.map((m) => m.sport).filter(Boolean)])), [matches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return matches.filter((m) => {
      if (sport && m.sport.toLowerCase() !== sport.toLowerCase()) return false;
      if (!q) return true;
      return `${m.home_team} ${m.away_team} ${m.tournament}`.toLowerCase().includes(q);
    });
  }, [matches, query, sport]);

  const live = filtered.filter((m) => m.status === "live");
  const upcoming = filtered.filter((m) => m.status === "upcoming" || m.status === "postponed");
  const completed = filtered.filter((m) => m.status === "completed");
  const featured = live[0] || upcoming[0];

  // Day grouping depends on the visitor's time zone, so it is computed in the browser.
  const upcomingGroups = useMemo(() => {
    if (!hydrated) return [];
    const groups = new Map<string, Match[]>();
    for (const m of upcoming) {
      const key = dateKey(m.start_time);
      groups.set(key, [...(groups.get(key) ?? []), m]);
    }
    return Array.from(groups.values()).sort(
      (a, b) => new Date(a[0]?.start_time ?? 0).getTime() - new Date(b[0]?.start_time ?? 0).getTime(),
    );
  }, [upcoming, hydrated]);

  return (
    <div className="cx-home">
      {featured && (
        <section className="cx-hero">
          <div className="cx-hero-content">
            <span className={`cx-hero-tag ${featured.status === "live" ? "live" : ""}`}>
              <i /> {featured.status === "live" ? "LIVE NOW" : "UP NEXT"}
            </span>
            <div className="cx-hero-league">
              {sportEmoji[featured.sport] || "🏆"} {featured.tournament}
            </div>
            <h1>
              {featured.home_team} <em>vs</em> {featured.away_team}
            </h1>
            <p>
              {featured.status === "live" ? (
                "Live action — click below to watch"
              ) : (
                <>
                  Starts <LocalTime value={featured.start_time} format={dateLong} />
                </>
              )}
            </p>
            <div className="cx-hero-actions">
              <Link to="/watch/$id" params={{ id: featured.id }} className="cx-btn cx-btn-primary">
                <Zap size={16} /> Watch now
              </Link>
              <span className="cx-hero-hint">
                <Radio size={13} /> Multiple sources
              </span>
            </div>
          </div>
        </section>
      )}

      <div className="cx-toolbar">
        <div className="cx-filters" role="tablist" aria-label="Sport">
          {sports.map((s) => (
            <button key={s} type="button" className={sport === s ? "active" : ""} onClick={() => setSport(s)} aria-pressed={sport === s}>
              {sportEmoji[s] || "🏆"} {s}
            </button>
          ))}
        </div>
        <div className="cx-toolbar-right">
          <label className="cx-search">
            <Search size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search teams or leagues" aria-label="Search teams or leagues" />
          </label>
          <button type="button" className="cx-refresh" onClick={() => void refetch()} disabled={isFetching} aria-label="Refresh matches">
            <RefreshCw size={14} className={isFetching ? "cx-spin" : ""} />
          </button>
        </div>
      </div>

      {error && <div className="cx-error">Couldn't refresh matches. Showing the last loaded list.</div>}

      {live.length > 0 && (
        <section className="cx-section">
          <header className="cx-section-head">
            <h2>🔴 Live Now</h2>
            <span>{live.length}</span>
          </header>
          <div className="cx-match-grid">
            {live.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {!hydrated && upcoming.length > 0 && <Empty title="Loading schedule…" />}
      {upcomingGroups.map((group) => (
        <section key={group[0]?.id} className="cx-section">
          <header className="cx-section-head">
            <h2>{dateLong(group[0]?.start_time)}</h2>
            <span>
              {group.length} match{group.length === 1 ? "" : "es"}
            </span>
          </header>
          <div className="cx-match-grid">
            {group.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      ))}

      {completed.length > 0 && (
        <section className="cx-section">
          <header className="cx-section-head">
            <h2>Completed</h2>
            <span>{completed.length}</span>
          </header>
          <div className="cx-match-grid">
            {completed.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 &&
        (matches.length === 0 ? (
          <Empty icon={<Radio size={24} />} title="No matches scheduled" text="There are no live or upcoming matches right now. Check back soon." />
        ) : (
          <Empty icon={<Search size={24} />} title="No matches found" text="Try a different sport or search term." />
        ))}
    </div>
  );
}
