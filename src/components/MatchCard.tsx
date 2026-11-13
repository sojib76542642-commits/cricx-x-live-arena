import { Link } from "@tanstack/react-router";
import { CirclePlay } from "lucide-react";
import type { Match } from "@/lib/types";
import { dateShort, timeOnly } from "@/lib/format";
import TeamLogo from "./TeamLogo";
import Countdown from "./Countdown";
import LocalTime from "./LocalTime";

export const sportEmoji: Record<string, string> = {
  Cricket: "🏏",
  Football: "⚽",
  Basketball: "🏀",
  Tennis: "🎾",
};

export default function MatchCard({ match }: { match: Match }) {
  const emoji = sportEmoji[match.sport] || "🏆";

  if (match.status === "completed") {
    return (
      <article className="cx-match cx-match-completed">
        <div className="cx-match-top">
          <span className="cx-badge">FINAL</span>
          <span className="cx-league">
            {emoji} {match.tournament}
          </span>
        </div>
        <div className="cx-match-teams">
          <div className="cx-team">
            <TeamLogo name={match.home_team} logo={match.home_team_logo_url} />
            <b>{match.home_team}</b>
          </div>
          <span className="cx-vs">VS</span>
          <div className="cx-team">
            <TeamLogo name={match.away_team} logo={match.away_team_logo_url} />
            <b>{match.away_team}</b>
          </div>
        </div>
        <div className="cx-match-final">
          <strong>{match.home_score || "—"}</strong>
          <span>:</span>
          <strong>{match.away_score || "—"}</strong>
        </div>
      </article>
    );
  }

  return (
    <Link to="/watch/$id" params={{ id: match.id }} className={`cx-match cx-match-${match.status}`}>
      <div className="cx-match-top">
        <span className={`cx-badge cx-badge-${match.status === "live" ? "live" : "upcoming"}`}>
          <i /> {match.status.toUpperCase()}
        </span>
        <span className="cx-league">
          {emoji} {match.tournament}
        </span>
      </div>

      <div className="cx-match-teams">
        <div className="cx-team">
          <TeamLogo name={match.home_team} logo={match.home_team_logo_url} />
          <b>{match.home_team}</b>
        </div>
        <span className="cx-vs">VS</span>
        <div className="cx-team">
          <TeamLogo name={match.away_team} logo={match.away_team_logo_url} />
          <b>{match.away_team}</b>
        </div>
      </div>

      {match.status === "live" && (match.home_score || match.away_score) && (
        <div className="cx-live-score">
          <strong>{match.home_score || "—"}</strong>
          <span>·</span>
          <strong>{match.away_score || "—"}</strong>
        </div>
      )}

      <div className="cx-match-foot">
        <span>
          {match.status === "live" ? (
            <>
              <CirclePlay size={11} /> Watch live
            </>
          ) : (
            <Countdown start={match.start_time} />
          )}
        </span>
        <span>
          <LocalTime value={match.start_time} format={(v) => `${dateShort(v)} · ${timeOnly(v)}`} />
        </span>
      </div>
    </Link>
  );
}
