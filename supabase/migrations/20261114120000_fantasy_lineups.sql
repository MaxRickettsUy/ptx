-- Season-long fantasy lineups: one row per fantasy team per NFL week, with its starters and bench
-- in lineup_players. A lineup can carry the opponent's players too, for a head-to-head matchup.
-- Points are worked out live from the box score; each player's are written down once their game
-- is final, and the lineup's totals once every player's are.

create table public.lineups (
  id uuid primary key default gen_random_uuid(),
  season int not null,
  week int not null check (week between 1 and 18),
  league text,
  team_name text not null,
  opponent_name text,
  scoring text not null check (scoring in ('standard', 'half_ppr', 'ppr')),
  notes text,
  points numeric,
  opponent_points numeric,
  -- Only a lineup with an opponent can win or lose.
  result text check (result in ('won', 'lost', 'tie')),
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

-- Saving a team's lineup again for the same week replaces it, as after a mid-week swap.
create unique index lineups_team_week_key on public.lineups (season, week, team_name, coalesce(league, ''));
create index lineups_created_at_idx on public.lineups (created_at desc);

create table public.lineup_players (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references public.lineups (id) on delete cascade,
  side text not null default 'mine' check (side in ('mine', 'opponent')),
  slot text not null check (slot in ('QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPERFLEX', 'K', 'DST', 'BN')),
  position_in_lineup int not null default 0,
  -- Null for a team defense, which is scored from its team's totals.
  athlete_id text,
  player_name text not null,
  team_abbr text not null,
  player_position text,
  -- Null when the player's team is on bye that week.
  event_id text,
  game_label text,
  game_date timestamptz,
  final_points numeric,
  -- The stat line the final points came from, so a settled player needs no more box-score fetches.
  final_stats jsonb,
  created_at timestamptz not null default now(),
  check ((player_position = 'DST') = (athlete_id is null))
);

create index lineup_players_lineup_id_idx on public.lineup_players (lineup_id);

alter table public.lineups enable row level security;
alter table public.lineup_players enable row level security;
