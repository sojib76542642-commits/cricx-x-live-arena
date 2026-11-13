-- Roles
create type public.app_role as enum ('admin', 'moderator', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

create policy "Users can read their own roles" on public.user_roles
  for select to authenticated using (user_id = auth.uid());

-- Tournaments
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index tournaments_name_lower_key on public.tournaments (lower(name));
grant select on public.tournaments to anon;
grant select, insert, update, delete on public.tournaments to authenticated;
grant all on public.tournaments to service_role;
alter table public.tournaments enable row level security;
create policy "Public can read published tournaments" on public.tournaments
  for select to anon, authenticated using (published = true);
create policy "Admins manage tournaments" on public.tournaments
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Matches
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  sport text not null default 'Cricket',
  tournament text not null default '',
  home_team text not null,
  away_team text not null,
  start_time timestamptz not null default now(),
  status text not null default 'upcoming' check (status in ('live','upcoming','completed','postponed','cancelled')),
  home_score text,
  away_score text,
  home_team_logo_url text,
  away_team_logo_url text,
  published boolean not null default false,
  external_match_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index matches_start_time_idx on public.matches (start_time);
create index matches_tournament_lower_idx on public.matches (lower(tournament));
grant select on public.matches to anon;
grant select, insert, update, delete on public.matches to authenticated;
grant all on public.matches to service_role;
alter table public.matches enable row level security;
create policy "Public can read published matches" on public.matches
  for select to anon, authenticated using (published = true);
create policy "Admins manage matches" on public.matches
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
create trigger matches_touch_updated_at before update on public.matches
  for each row execute function public.touch_updated_at();

-- Match stream sources
create table public.stream_sources (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  name text not null,
  url text not null,
  kind text not null default 'hls' check (kind in ('hls','dash','embed')),
  quality text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  drm_license_url text,
  created_at timestamptz not null default now()
);
create index stream_sources_match_idx on public.stream_sources (match_id);
grant select on public.stream_sources to anon;
grant select, insert, update, delete on public.stream_sources to authenticated;
grant all on public.stream_sources to service_role;
alter table public.stream_sources enable row level security;
create policy "Public can read enabled sources of published matches" on public.stream_sources
  for select to anon, authenticated using (
    enabled = true and exists (select 1 from public.matches m where m.id = match_id and m.published = true)
  );
create policy "Admins manage stream sources" on public.stream_sources
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Tournament stream sources (inherited by every match of the tournament)
create table public.tournament_stream_sources (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  url text not null,
  kind text not null default 'hls' check (kind in ('hls','dash','embed')),
  quality text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  drm_license_url text,
  created_at timestamptz not null default now()
);
create index tournament_stream_sources_t_idx on public.tournament_stream_sources (tournament_id);
grant select on public.tournament_stream_sources to anon;
grant select, insert, update, delete on public.tournament_stream_sources to authenticated;
grant all on public.tournament_stream_sources to service_role;
alter table public.tournament_stream_sources enable row level security;
create policy "Public can read enabled sources of published tournaments" on public.tournament_stream_sources
  for select to anon, authenticated using (
    enabled = true and exists (select 1 from public.tournaments t where t.id = tournament_id and t.published = true)
  );
create policy "Admins manage tournament sources" on public.tournament_stream_sources
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- 24/7 channels
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text,
  category text default 'Sports',
  logo_url text,
  description text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.channels to anon;
grant select, insert, update, delete on public.channels to authenticated;
grant all on public.channels to service_role;
alter table public.channels enable row level security;
create policy "Public can read published channels" on public.channels
  for select to anon, authenticated using (published = true);
create policy "Admins manage channels" on public.channels
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create table public.channel_sources (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  name text not null,
  url text not null,
  kind text not null default 'hls' check (kind in ('hls','dash','embed')),
  quality text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  drm_license_url text,
  created_at timestamptz not null default now()
);
create index channel_sources_channel_idx on public.channel_sources (channel_id);
grant select on public.channel_sources to anon;
grant select, insert, update, delete on public.channel_sources to authenticated;
grant all on public.channel_sources to service_role;
alter table public.channel_sources enable row level security;
create policy "Public can read enabled sources of published channels" on public.channel_sources
  for select to anon, authenticated using (
    enabled = true and exists (select 1 from public.channels c where c.id = channel_id and c.published = true)
  );
create policy "Admins manage channel sources" on public.channel_sources
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));