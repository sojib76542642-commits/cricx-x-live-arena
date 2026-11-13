import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { notFound } from "@tanstack/react-router";
import type { Database } from "@/integrations/supabase/types";
import type { Channel, Match, Source, SourceKind } from "./types";
import { dedupeMatches, mergeSources } from "./streams";

type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
type SourceRow = Row<"stream_sources"> | Row<"tournament_stream_sources"> | Row<"channel_sources">;

/** Read-only client using the publishable key. Row Level Security limits it to published content. */
function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) {
    console.error("[cricx] SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not set");
    throw new Error("The database is not configured. Please try again later.");
  }
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

function fail(context: string, error: { message: string }): never {
  console.error(`[cricx] ${context}:`, error.message);
  throw new Error(`Could not load ${context}. Please try again.`);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toMatch(r: Row<"matches">): Match {
  return { ...r, status: r.status as Match["status"] };
}

function toSource(r: SourceRow): Source {
  return { ...r, kind: (r.kind as SourceKind) ?? "hls" };
}

/** Prefer the copy of a fixture that has playable sources, then the most recently created one. */
function rankBySources(counts: Map<string, number>) {
  return (m: Match) => (counts.get(m.id) ?? 0) * 1e13 + (Date.parse(m.created_at ?? "") || 0);
}

export const getHomeMatches = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const now = Date.now();
  const past = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const future = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data, error }, src] = await Promise.all([
    sb
      .from("matches")
      .select("*")
      .eq("published", true)
      .gte("start_time", past)
      .lte("start_time", future)
      .order("start_time", { ascending: true })
      .limit(1000),
    sb.from("stream_sources").select("match_id").eq("enabled", true),
  ]);
  if (error) fail("matches", error);
  if (src.error) fail("stream sources", src.error);
  const counts = new Map<string, number>();
  for (const s of src.data ?? []) counts.set(s.match_id, (counts.get(s.match_id) ?? 0) + 1);
  return dedupeMatches((data ?? []).map(toMatch), rankBySources(counts));
});

export const getMatchWithSources = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => {
    if (typeof input?.id !== "string") throw new Error("Invalid match id");
    return { id: input.id };
  })
  .handler(async ({ data }) => {
    if (!UUID_RE.test(data.id)) throw notFound();
    const sb = publicClient();
    const { data: row, error } = await sb.from("matches").select("*").eq("id", data.id).eq("published", true).maybeSingle();
    if (error) fail("match", error);
    if (!row) throw notFound();

    const [own, tournament] = await Promise.all([
      sb.from("stream_sources").select("*").eq("match_id", data.id).eq("enabled", true).order("sort_order"),
      row.tournament
        ? sb.from("tournaments").select("id").ilike("name", row.tournament).limit(1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (own.error) fail("stream sources", own.error);

    let inherited: Source[] = [];
    if (tournament.data?.id) {
      const res = await sb
        .from("tournament_stream_sources")
        .select("*")
        .eq("tournament_id", tournament.data.id)
        .eq("enabled", true)
        .order("sort_order");
      if (res.error) fail("tournament sources", res.error);
      inherited = (res.data ?? []).map(toSource);
    }

    return { match: toMatch(row), sources: mergeSources((own.data ?? []).map(toSource), inherited) };
  });

export const getChannels = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const [ch, src] = await Promise.all([
    sb.from("channels").select("*").eq("published", true).order("name"),
    sb.from("channel_sources").select("*").eq("enabled", true).order("sort_order"),
  ]);
  if (ch.error) fail("channels", ch.error);
  if (src.error) fail("channel sources", src.error);
  const byChannel = new Map<string, Source[]>();
  for (const s of src.data ?? []) {
    byChannel.set(s.channel_id, [...(byChannel.get(s.channel_id) ?? []), toSource(s)]);
  }
  return (ch.data ?? []).map(
    (c): Channel => ({
      ...c,
      name: c.name || "Unknown Channel",
      category: c.category || "Sports",
      sources: byChannel.get(c.id) ?? [],
    }),
  );
});

export const getChannelWithSources = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => {
    if (typeof input?.id !== "string") throw new Error("Invalid channel id");
    return { id: input.id };
  })
  .handler(async ({ data }) => {
    if (!UUID_RE.test(data.id)) throw notFound();
    const sb = publicClient();
    const { data: c, error } = await sb.from("channels").select("*").eq("id", data.id).eq("published", true).maybeSingle();
    if (error) fail("channel", error);
    if (!c) throw notFound();
    const src = await sb.from("channel_sources").select("*").eq("channel_id", data.id).eq("enabled", true).order("sort_order");
    if (src.error) fail("channel sources", src.error);
    const sources = (src.data ?? []).map(toSource);
    return { ...c, category: c.category || "Sports", sources } satisfies Channel;
  });

/** Matches and channels with two or more enabled sources. */
export const getBackups = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const [ms, ss, ts, tss, chs, css] = await Promise.all([
    sb.from("matches").select("*").eq("published", true).order("start_time").limit(1000),
    sb.from("stream_sources").select("match_id, url").eq("enabled", true),
    sb.from("tournaments").select("id, name").eq("published", true),
    sb.from("tournament_stream_sources").select("tournament_id, url").eq("enabled", true),
    sb.from("channels").select("*").eq("published", true).order("name"),
    sb.from("channel_sources").select("channel_id").eq("enabled", true),
  ]);
  for (const [label, r] of [["matches", ms], ["sources", ss], ["tournaments", ts], ["tournament sources", tss], ["channels", chs], ["channel sources", css]] as const) {
    if (r.error) fail(label, r.error);
  }

  const urlsByMatch = new Map<string, Set<string>>();
  for (const s of ss.data ?? []) {
    const set = urlsByMatch.get(s.match_id) ?? new Set<string>();
    set.add(s.url.trim().toLowerCase());
    urlsByMatch.set(s.match_id, set);
  }
  const tIdByName = new Map((ts.data ?? []).map((t) => [t.name.toLowerCase(), t.id]));
  const urlsByTournament = new Map<string, string[]>();
  for (const s of tss.data ?? []) {
    urlsByTournament.set(s.tournament_id, [...(urlsByTournament.get(s.tournament_id) ?? []), s.url.trim().toLowerCase()]);
  }

  const ownCounts = new Map([...urlsByMatch].map(([id, set]) => [id, set.size]));
  const matches = dedupeMatches((ms.data ?? []).map(toMatch), rankBySources(ownCounts))
    .map((m) => {
      const set = new Set(urlsByMatch.get(m.id) ?? []);
      const tId = tIdByName.get(m.tournament.toLowerCase());
      for (const u of (tId && urlsByTournament.get(tId)) || []) set.add(u);
      return { match: m, sources: set.size };
    })
    .filter((x) => x.sources > 1);

  const counts = new Map<string, number>();
  for (const s of css.data ?? []) counts.set(s.channel_id, (counts.get(s.channel_id) ?? 0) + 1);
  const channels = (chs.data ?? [])
    .map((c) => ({ id: c.id, name: c.name, category: c.category || "Sports", logo_url: c.logo_url, sources: counts.get(c.id) ?? 0 }))
    .filter((c) => c.sources > 1);

  return { matches, channels };
});
