import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LogOut, Trash2, Eye, EyeOff, LayoutDashboard, Trophy, CalendarDays, RefreshCw, Power, Server, Plus, Tv, Save, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { MATCH_STATUSES, type MatchStatus } from "@/lib/types";
import { syncCricketMatches } from "@/lib/admin.functions";
import SourceFields, { emptySource, sourceRow, validateSource, type SourceDraft } from "./SourceFields";

type T = Database["public"]["Tables"];
type TournamentRow = T["tournaments"]["Row"];
type MatchRow = T["matches"]["Row"];
type TSourceRow = T["tournament_stream_sources"]["Row"];
type MSourceRow = T["stream_sources"]["Row"];
type ChannelRow = T["channels"]["Row"];
type CSourceRow = T["channel_sources"]["Row"];
type Table = "tournaments" | "matches" | "tournament_stream_sources" | "stream_sources" | "channels" | "channel_sources";

type Data = {
  tournaments: TournamentRow[];
  matches: MatchRow[];
  tSources: TSourceRow[];
  mSources: MSourceRow[];
  channels: ChannelRow[];
  cSources: CSourceRow[];
};

const TABS = [
  { id: "dashboard", icon: LayoutDashboard, label: "Overview" },
  { id: "tournaments", icon: Trophy, label: "Tournaments" },
  { id: "matches", icon: CalendarDays, label: "Matches" },
  { id: "sources", icon: Server, label: "Match Sources" },
  { id: "channels", icon: Tv, label: "24/7 Channels" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminDashboard({ email }: { email: string }) {
  const queryClient = useQueryClient();
  const runSync = useServerFn(syncCricketMatches);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const [t, m, ts, ms, c, cs] = await Promise.all([
      supabase.from("tournaments").select("*").order("name"),
      supabase.from("matches").select("*").order("start_time", { ascending: false }).limit(1000),
      supabase.from("tournament_stream_sources").select("*").order("created_at", { ascending: false }),
      supabase.from("stream_sources").select("*").order("created_at", { ascending: false }),
      supabase.from("channels").select("*").order("name"),
      supabase.from("channel_sources").select("*").order("created_at", { ascending: false }),
    ]);
    const err = [t, m, ts, ms, c, cs].find((r) => r.error)?.error;
    if (err) {
      setLoadError(err.message);
    } else {
      setData({
        tournaments: t.data ?? [],
        matches: m.data ?? [],
        tSources: ts.data ?? [],
        mSources: ms.data ?? [],
        channels: c.data ?? [],
        cSources: cs.data ?? [],
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  /** Run a write, report the result, then reload admin data and the public pages' cache. */
  async function mutate(label: string, fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) {
        toast.error(`${label} failed: ${error.message}`);
        return false;
      }
      toast.success(label);
      await fetchData();
      void queryClient.invalidateQueries();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(table: Table, id: string) {
    if (!window.confirm("Are you sure? This will delete the item.")) return;
    await mutate("Deleted", () => supabase.from(table).delete().eq("id", id));
  }

  async function syncCricket() {
    setSyncing(true);
    try {
      const res = await runSync();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Sync finished: ${res.inserted} new, ${res.updated} updated, ${res.skipped} skipped (sync off).` +
          (res.newTournaments.length ? ` New tournaments start hidden: ${res.newTournaments.join(", ")}` : ""),
        { duration: 8000 },
      );
      await fetchData();
      void queryClient.invalidateQueries();
    } catch (e) {
      console.error(e);
      toast.error("Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <div className="cx-admin-head">
        <div>
          <h1>Control Panel</h1>
          <p>Auto-Sync & Stream Management · {email}</p>
        </div>
        <div className="cx-admin-actions">
          <button type="button" onClick={syncCricket} disabled={syncing} className="cx-btn cx-btn-primary">
            <RefreshCw size={16} className={syncing ? "cx-spin" : ""} /> {syncing ? "Syncing..." : "Sync API"}
          </button>
          <button type="button" onClick={() => void fetchData()} disabled={loading} className="cx-btn cx-btn-secondary" aria-label="Reload data">
            <RefreshCw size={16} className={loading ? "cx-spin" : ""} />
          </button>
          <button type="button" onClick={() => void supabase.auth.signOut()} className="cx-btn cx-btn-secondary" aria-label="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <div className="cx-admin-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`cx-btn ${tab === t.id ? "cx-btn-primary" : "cx-btn-secondary"}`}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="cx-error" role="alert">
          Could not load admin data: {loadError}
        </div>
      )}
      {!data ? (
        <div className="cx-empty">
          <Loader2 className="cx-spin" size={24} /> Loading admin data…
        </div>
      ) : (
        <>
          {tab === "dashboard" && <Overview data={data} />}
          {tab === "tournaments" && <TournamentsTab data={data} busy={busy} mutate={mutate} deleteItem={deleteItem} />}
          {tab === "matches" && <MatchesTab data={data} busy={busy} mutate={mutate} deleteItem={deleteItem} />}
          {tab === "sources" && <SourcesTab data={data} busy={busy} mutate={mutate} deleteItem={deleteItem} />}
          {tab === "channels" && <ChannelsTab data={data} busy={busy} mutate={mutate} deleteItem={deleteItem} />}
        </>
      )}
    </div>
  );
}

type TabProps = {
  data: Data;
  busy: boolean;
  mutate: (label: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>;
  deleteItem: (table: Table, id: string) => Promise<void>;
};

function Overview({ data }: { data: Data }) {
  const stats = [
    ["Tournaments", data.tournaments.length],
    ["Matches", data.matches.length],
    ["Live now", data.matches.filter((m) => m.status === "live").length],
    ["Match sources", data.tSources.length + data.mSources.length],
    ["24/7 Channels", data.channels.length],
    ["Channel sources", data.cSources.length],
  ] as const;
  return (
    <div className="cx-admin-stats">
      {stats.map(([label, value]) => (
        <div key={label} className="cx-card">
          <div className="cx-stat-label">{label}</div>
          <div className="cx-stat-value">{value}</div>
        </div>
      ))}
    </div>
  );
}

function TournamentsTab({ data, busy, mutate, deleteItem }: TabProps) {
  const [name, setName] = useState("");

  async function add() {
    if (!name.trim()) return toast.error("Enter a tournament name.");
    const ok = await mutate("Tournament added", () => supabase.from("tournaments").insert({ name: name.trim(), active: true, published: true }));
    if (ok) setName("");
  }

  function toggleSync(t: TournamentRow) {
    if (!window.confirm(t.active ? "Stop syncing new matches for this tournament?" : "Enable syncing for this tournament?")) return;
    void mutate(t.active ? "Sync stopped" : "Sync enabled", () => supabase.from("tournaments").update({ active: !t.active }).eq("id", t.id));
  }

  function togglePublic(t: TournamentRow) {
    const next = !t.published;
    void mutate(next ? "Tournament and its matches are now public" : "Tournament hidden from website", async () => {
      const r1 = await supabase.from("tournaments").update({ published: next }).eq("id", t.id);
      if (r1.error) return r1;
      return supabase.from("matches").update({ published: next }).ilike("tournament", t.name);
    });
  }

  return (
    <div className="cx-list">
      <div className="cx-card">
        <h3>
          <Plus size={18} /> Add Tournament
        </h3>
        <div className="cx-form-row">
          <input className="cx-input" placeholder="Tournament name (must match the match's tournament)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Tournament name" />
          <button type="button" className="cx-btn cx-btn-primary" onClick={add} disabled={busy}>
            <Plus size={16} /> Add Tournament
          </button>
        </div>
      </div>
      {data.tournaments.length === 0 && <p className="cx-muted">No tournaments yet. Add one above or run Sync API.</p>}
      {data.tournaments.map((t) => (
        <div key={t.id} className="cx-row">
          <div className="cx-row-main">
            <b>{t.name}</b>
            <small>
              <span className={t.active ? "cx-pill-on" : "cx-pill-off"}>{t.active ? "Sync ON" : "Sync OFF"}</span> •{" "}
              <span>{t.published ? "Public" : "Hidden"}</span> • {data.matches.filter((m) => m.tournament.toLowerCase() === t.name.toLowerCase()).length} matches
            </small>
          </div>
          <div className="cx-row-actions">
            <button type="button" onClick={() => toggleSync(t)} className="cx-btn cx-btn-secondary" disabled={busy}>
              <Power size={14} color={t.active ? "var(--primary)" : "var(--danger)"} /> {t.active ? "Stop Sync" : "Start Sync"}
            </button>
            <button type="button" onClick={() => togglePublic(t)} className="cx-btn cx-btn-secondary" disabled={busy}>
              {t.published ? (
                <>
                  <EyeOff size={14} /> Hide
                </>
              ) : (
                <>
                  <Eye size={14} /> Make Public
                </>
              )}
            </button>
            <button type="button" onClick={() => void deleteItem("tournaments", t.id)} className="cx-btn cx-btn-secondary cx-icon-btn" aria-label={`Delete ${t.name}`} disabled={busy}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const emptyMatch = { sport: "Cricket", tournament: "", home: "", away: "", start: "", status: "upcoming" as MatchStatus, published: true };

function MatchesTab({ data, busy, mutate, deleteItem }: TabProps) {
  const [form, setForm] = useState(emptyMatch);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.matches.filter((m) => !q || `${m.home_team} ${m.away_team} ${m.tournament}`.toLowerCase().includes(q));
  }, [data.matches, query]);

  async function add() {
    if (!form.home.trim() || !form.away.trim()) return toast.error("Enter both team names.");
    if (!form.start) return toast.error("Choose a start date and time.");
    const ok = await mutate("Match added", () =>
      supabase.from("matches").insert({
        sport: form.sport.trim() || "Cricket",
        tournament: form.tournament.trim(),
        home_team: form.home.trim(),
        away_team: form.away.trim(),
        start_time: new Date(form.start).toISOString(),
        status: form.status,
        published: form.published,
      }),
    );
    if (ok) setForm(emptyMatch);
  }

  return (
    <div className="cx-list">
      <div className="cx-card">
        <h3>
          <Plus size={18} /> Add Match
        </h3>
        <div className="cx-form">
          <div className="cx-form-row">
            <input className="cx-input" placeholder="Home team" value={form.home} onChange={(e) => setForm({ ...form, home: e.target.value })} aria-label="Home team" />
            <input className="cx-input" placeholder="Away team" value={form.away} onChange={(e) => setForm({ ...form, away: e.target.value })} aria-label="Away team" />
          </div>
          <div className="cx-form-row">
            <input className="cx-input" list="cx-tournament-names" placeholder="Tournament" value={form.tournament} onChange={(e) => setForm({ ...form, tournament: e.target.value })} aria-label="Tournament" />
            <datalist id="cx-tournament-names">
              {data.tournaments.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
            <input className="cx-input" placeholder="Sport" value={form.sport} onChange={(e) => setForm({ ...form, sport: e.target.value })} aria-label="Sport" />
          </div>
          <div className="cx-form-row">
            <input className="cx-input" type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} aria-label="Start time" />
            <select className="cx-input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as MatchStatus })} aria-label="Status">
              {MATCH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <label className="cx-muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> Show on website
          </label>
          <button type="button" className="cx-btn cx-btn-primary cx-btn-block" onClick={add} disabled={busy}>
            <Plus size={16} /> Add Match
          </button>
        </div>
      </div>

      <label className="cx-search">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search matches" aria-label="Search matches" />
      </label>
      {filtered.length === 0 && <p className="cx-muted">No matches found.</p>}
      {filtered.slice(0, limit).map((m) => (
        <MatchRowEditor key={`${m.id}-${m.status}-${m.home_score}-${m.away_score}-${m.start_time}`} m={m} busy={busy} mutate={mutate} deleteItem={deleteItem} />
      ))}
      {filtered.length > limit && (
        <button type="button" className="cx-btn cx-btn-secondary" onClick={() => setLimit((l) => l + 50)}>
          Show more ({limit} / {filtered.length})
        </button>
      )}
    </div>
  );
}

function MatchRowEditor({ m, busy, mutate, deleteItem }: { m: MatchRow } & Omit<TabProps, "data">) {
  const [status, setStatus] = useState(m.status as MatchStatus);
  const [home, setHome] = useState(m.home_score ?? "");
  const [away, setAway] = useState(m.away_score ?? "");
  const [start, setStart] = useState(toLocalInput(m.start_time));
  const dirty = status !== m.status || home !== (m.home_score ?? "") || away !== (m.away_score ?? "") || start !== toLocalInput(m.start_time);

  return (
    <div className="cx-row">
      <div className="cx-row-main">
        <b>
          {m.home_team} vs {m.away_team}
        </b>
        <small>
          {m.tournament || "No tournament"} • {m.published ? "Public" : "Hidden"}
          {m.external_match_id ? " • synced" : ""}
        </small>
      </div>
      <div className="cx-row-actions">
        <select className="cx-input" style={{ width: "auto", padding: "8px 10px" }} value={status} onChange={(e) => setStatus(e.target.value as MatchStatus)} aria-label="Match status">
          {MATCH_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input className="cx-input" style={{ width: 150, padding: "8px 10px" }} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start time" />
        <input className="cx-input" style={{ width: 110, padding: "8px 10px" }} placeholder="Home score" value={home} onChange={(e) => setHome(e.target.value)} aria-label="Home score" />
        <input className="cx-input" style={{ width: 110, padding: "8px 10px" }} placeholder="Away score" value={away} onChange={(e) => setAway(e.target.value)} aria-label="Away score" />
        <button
          type="button"
          className="cx-btn cx-btn-primary"
          disabled={busy || !dirty || !start}
          onClick={() =>
            void mutate("Match updated", () =>
              supabase
                .from("matches")
                .update({ status, home_score: home.trim() || null, away_score: away.trim() || null, start_time: new Date(start).toISOString() })
                .eq("id", m.id),
            )
          }
        >
          <Save size={14} /> Save
        </button>
        <button
          type="button"
          className="cx-btn cx-btn-secondary"
          disabled={busy}
          onClick={() => void mutate(m.published ? "Match hidden" : "Match published", () => supabase.from("matches").update({ published: !m.published }).eq("id", m.id))}
          aria-label={m.published ? "Hide match" : "Publish match"}
        >
          {m.published ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button type="button" onClick={() => void deleteItem("matches", m.id)} className="cx-btn cx-btn-secondary cx-icon-btn" aria-label="Delete match" disabled={busy}>
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function SourceListItem({ name, sub, enabled, onToggle, onDelete, busy }: { name: string; sub: string; enabled: boolean; onToggle: () => void; onDelete: () => void; busy: boolean }) {
  return (
    <div className="cx-row cx-row-sub">
      <div className="cx-row-main">
        <b>
          {name} {!enabled && <span className="cx-pill-off">(disabled)</span>}
        </b>
        <small>{sub}</small>
      </div>
      <div className="cx-row-actions">
        <button type="button" className="cx-btn cx-btn-secondary" onClick={onToggle} disabled={busy} aria-label={enabled ? "Disable source" : "Enable source"}>
          <Power size={14} color={enabled ? "var(--primary)" : "var(--danger)"} />
        </button>
        <button type="button" onClick={onDelete} className="cx-btn cx-btn-secondary cx-icon-btn" aria-label="Delete source" disabled={busy}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function SourcesTab({ data, busy, mutate, deleteItem }: TabProps) {
  const [srcType, setSrcType] = useState<"tournament" | "match">("tournament");
  const [tournamentId, setTournamentId] = useState(data.tournaments[0]?.id ?? "");
  const [matchId, setMatchId] = useState(data.matches[0]?.id ?? "");
  const [draft, setDraft] = useState<SourceDraft>(emptySource);

  async function add() {
    const err = validateSource(draft);
    if (err) return toast.error(err);
    if (srcType === "tournament" && !tournamentId) return toast.error("Select a tournament.");
    if (srcType === "match" && !matchId) return toast.error("Select a match.");
    const row = sourceRow(draft);
    const ok =
      srcType === "tournament"
        ? await mutate("Source added to tournament — it applies to all its matches", () =>
            supabase.from("tournament_stream_sources").insert({ ...row, tournament_id: tournamentId }),
          )
        : await mutate("Source added to match", () => supabase.from("stream_sources").insert({ ...row, match_id: matchId }));
    if (ok) setDraft(emptySource);
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div className="cx-card">
        <h3>
          <Server size={18} /> Add Match Stream Source
        </h3>
        <div className="cx-segment">
          <button type="button" onClick={() => setSrcType("tournament")} className={`cx-btn ${srcType === "tournament" ? "cx-btn-primary" : "cx-btn-secondary"}`}>
            Tournament Source
          </button>
          <button type="button" onClick={() => setSrcType("match")} className={`cx-btn ${srcType === "match" ? "cx-btn-primary" : "cx-btn-secondary"}`}>
            Specific Match
          </button>
        </div>
        <div className="cx-form">
          {srcType === "tournament" ? (
            <select className="cx-input" value={tournamentId} onChange={(e) => setTournamentId(e.target.value)} aria-label="Tournament">
              <option value="">-- Select Tournament --</option>
              {data.tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          ) : (
            <select className="cx-input" value={matchId} onChange={(e) => setMatchId(e.target.value)} aria-label="Match">
              <option value="">-- Select Match --</option>
              {data.matches.slice(0, 200).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.home_team} vs {m.away_team} · {m.tournament}
                </option>
              ))}
            </select>
          )}
          <SourceFields value={draft} onChange={setDraft} />
          <button type="button" onClick={add} className="cx-btn cx-btn-primary cx-btn-block" disabled={busy}>
            <Plus size={16} /> Add Source
          </button>
        </div>
      </div>

      <div className="cx-admin-grid">
        <div className="cx-card">
          <h4>Tournament Sources ({data.tSources.length})</h4>
          <div className="cx-list">
            {data.tSources.length === 0 && <p className="cx-muted">No tournament sources added yet.</p>}
            {data.tSources.map((s) => (
              <SourceListItem
                key={s.id}
                name={s.name}
                sub={`${data.tournaments.find((t) => t.id === s.tournament_id)?.name ?? "Unknown"} · ${s.kind.toUpperCase()} · ${s.url}`}
                enabled={s.enabled}
                busy={busy}
                onToggle={() => void mutate("Source updated", () => supabase.from("tournament_stream_sources").update({ enabled: !s.enabled }).eq("id", s.id))}
                onDelete={() => void deleteItem("tournament_stream_sources", s.id)}
              />
            ))}
          </div>
        </div>
        <div className="cx-card">
          <h4>Match Specific Sources ({data.mSources.length})</h4>
          <div className="cx-list">
            {data.mSources.length === 0 && <p className="cx-muted">No match specific sources added yet.</p>}
            {data.mSources.map((s) => {
              const match = data.matches.find((m) => m.id === s.match_id);
              return (
                <SourceListItem
                  key={s.id}
                  name={s.name}
                  sub={`${match ? `${match.home_team} vs ${match.away_team}` : "Unknown Match"} · ${s.kind.toUpperCase()} · ${s.url}`}
                  enabled={s.enabled}
                  busy={busy}
                  onToggle={() => void mutate("Source updated", () => supabase.from("stream_sources").update({ enabled: !s.enabled }).eq("id", s.id))}
                  onDelete={() => void deleteItem("stream_sources", s.id)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChannelsTab({ data, busy, mutate, deleteItem }: TabProps) {
  const [chanName, setChanName] = useState("");
  const [chanCategory, setChanCategory] = useState("Sports");
  const [chanLogo, setChanLogo] = useState("");
  const [channelId, setChannelId] = useState(data.channels[0]?.id ?? "");
  const [draft, setDraft] = useState<SourceDraft>(emptySource);
  const categories = Array.from(new Set(["Sports", "Cricket", "Football", ...data.channels.map((c) => c.category || "Sports")]));

  async function addChannel() {
    if (!chanName.trim()) return toast.error("Enter channel name.");
    if (chanLogo.trim() && !/^https?:\/\//i.test(chanLogo.trim())) return toast.error("Logo URL must start with https://");
    const name = chanName.trim();
    const ok = await mutate("Channel added", () =>
      supabase.from("channels").insert({
        name,
        category: chanCategory.trim() || "Sports",
        logo_url: chanLogo.trim() || null,
        published: true,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      }),
    );
    if (ok) {
      setChanName("");
      setChanLogo("");
    }
  }

  async function addChannelSource() {
    const err = validateSource(draft);
    if (err) return toast.error(err);
    if (!channelId) return toast.error("Select a channel.");
    const ok = await mutate("Channel source added", () => supabase.from("channel_sources").insert({ ...sourceRow(draft), channel_id: channelId }));
    if (ok) setDraft(emptySource);
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div className="cx-admin-grid">
        <div className="cx-card">
          <h3>
            <Tv size={18} /> Add New Channel
          </h3>
          <div className="cx-form">
            <input className="cx-input" placeholder="Channel Name (e.g. Star Sports)" value={chanName} onChange={(e) => setChanName(e.target.value)} aria-label="Channel name" />
            <input className="cx-input" placeholder="Logo URL (optional)" value={chanLogo} onChange={(e) => setChanLogo(e.target.value)} aria-label="Logo URL" />
            <input className="cx-input" list="cx-channel-categories" placeholder="Category" value={chanCategory} onChange={(e) => setChanCategory(e.target.value)} aria-label="Category" />
            <datalist id="cx-channel-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <button type="button" onClick={addChannel} className="cx-btn cx-btn-primary cx-btn-block" disabled={busy}>
              <Plus size={16} /> Add Channel
            </button>
          </div>
        </div>

        <div className="cx-card">
          <h3>
            <Server size={18} /> Add Source to Channel
          </h3>
          <div className="cx-form">
            <select className="cx-input" value={channelId} onChange={(e) => setChannelId(e.target.value)} aria-label="Channel">
              <option value="">-- Select Channel --</option>
              {data.channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <SourceFields value={draft} onChange={setDraft} />
            <button type="button" onClick={addChannelSource} className="cx-btn cx-btn-primary cx-btn-block" disabled={busy}>
              <Plus size={16} /> Add Source
            </button>
          </div>
        </div>
      </div>

      <div className="cx-card">
        <h4>Channels ({data.channels.length})</h4>
        <div className="cx-list">
          {data.channels.length === 0 && <p className="cx-muted">No channels added yet.</p>}
          {data.channels.map((c) => {
            const srcs = data.cSources.filter((s) => s.channel_id === c.id);
            return (
              <div key={c.id} className="cx-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {c.logo_url ? <img src={c.logo_url} width={30} height={30} alt="" style={{ borderRadius: 4, objectFit: "contain" }} /> : <Tv size={24} color="var(--text-muted)" />}
                    <div className="cx-row-main" style={{ minWidth: 0 }}>
                      <b>{c.name}</b>
                      <small>
                        {c.category} • {srcs.length} Sources • {c.published ? "Public" : "Hidden"}
                      </small>
                    </div>
                  </div>
                  <div className="cx-row-actions">
                    <button
                      type="button"
                      className="cx-btn cx-btn-secondary"
                      disabled={busy}
                      onClick={() => void mutate(c.published ? "Channel hidden" : "Channel published", () => supabase.from("channels").update({ published: !c.published }).eq("id", c.id))}
                      aria-label={c.published ? "Hide channel" : "Publish channel"}
                    >
                      {c.published ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button type="button" onClick={() => void deleteItem("channels", c.id)} className="cx-btn cx-btn-secondary cx-icon-btn" aria-label={`Delete ${c.name}`} disabled={busy}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {srcs.map((s) => (
                  <SourceListItem
                    key={s.id}
                    name={s.name}
                    sub={`${s.kind.toUpperCase()} · ${s.url}`}
                    enabled={s.enabled}
                    busy={busy}
                    onToggle={() => void mutate("Source updated", () => supabase.from("channel_sources").update({ enabled: !s.enabled }).eq("id", s.id))}
                    onDelete={() => void deleteItem("channel_sources", s.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
