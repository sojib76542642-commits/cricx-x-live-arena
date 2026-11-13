export type MatchStatus = "live" | "upcoming" | "completed" | "postponed" | "cancelled";

export const MATCH_STATUSES: MatchStatus[] = ["live", "upcoming", "completed", "postponed", "cancelled"];

export type Match = {
  id: string;
  sport: string;
  tournament: string;
  home_team: string;
  away_team: string;
  start_time: string;
  status: MatchStatus;
  home_score: string | null;
  away_score: string | null;
  home_team_logo_url: string | null;
  away_team_logo_url: string | null;
  published: boolean;
  external_match_id: string | null;
  created_at?: string;
};

export type SourceKind = "hls" | "dash" | "embed";

export type Source = {
  id: string;
  name: string;
  url: string;
  kind: SourceKind;
  quality: string | null;
  enabled: boolean;
  sort_order: number;
  drm_license_url: string | null;
  match_id?: string;
  channel_id?: string;
  tournament_id?: string;
};

export type Channel = {
  id: string;
  name: string;
  slug: string | null;
  category: string | null;
  logo_url: string | null;
  description: string | null;
  published: boolean;
  sources: Source[];
};

export type Tournament = {
  id: string;
  name: string;
  active: boolean;
  published: boolean;
};
