-- Single-user app: every table has RLS enabled with no policies, so the Data API
-- is closed to the publishable key. The Next.js server talks to it with the secret key.

create table public.chats (
  id text primary key,
  title text,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.parlays (
  id uuid primary key default gen_random_uuid(),
  chat_id text references public.chats (id) on delete set null,
  name text not null,
  notes text,
  result text check (result in ('won', 'lost', 'push')),
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create index parlays_chat_id_idx on public.parlays (chat_id);
create index parlays_created_at_idx on public.parlays (created_at desc);

create table public.legs (
  id uuid primary key default gen_random_uuid(),
  parlay_id uuid not null references public.parlays (id) on delete cascade,
  position_in_parlay int not null default 0,
  athlete_id text not null,
  player_name text not null,
  team_abbr text,
  player_position text,
  event_id text not null,
  game_label text not null,
  game_date timestamptz not null,
  stat text not null,
  direction text not null check (direction in ('over', 'under')),
  line numeric not null,
  final_value numeric,
  result text check (result in ('hit', 'lost', 'push')),
  created_at timestamptz not null default now()
);

create index legs_parlay_id_idx on public.legs (parlay_id);
create index legs_unsettled_event_idx on public.legs (event_id) where result is null;

alter table public.chats enable row level security;
alter table public.parlays enable row level security;
alter table public.legs enable row level security;
