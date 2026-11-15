-- Fantasy leagues as their own rows: a name the user picks, their team's name in it, and its
-- scoring. Each weekly lineup belongs to one league, which has at most one lineup a week.
-- Lineups saved before this get a league named after their old league text (or team name).

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  team_name text not null,
  scoring text not null check (scoring in ('standard', 'half_ppr', 'ppr')),
  created_at timestamptz not null default now()
);

-- Leagues are looked up by name, so two can't differ only in case.
create unique index leagues_name_key on public.leagues (lower(name));

alter table public.lineups
  add column league_id uuid references public.leagues (id) on delete cascade;

insert into public.leagues (name, team_name, scoring)
select distinct on (lower(coalesce(league, team_name))) coalesce(league, team_name), team_name, scoring
from public.lineups
order by lower(coalesce(league, team_name)), created_at desc;

update public.lineups l
set league_id = g.id
from public.leagues g
where lower(g.name) = lower(coalesce(l.league, l.team_name));

alter table public.lineups alter column league_id set not null;

drop index public.lineups_team_week_key;

-- The team name and scoring now live on the league.
alter table public.lineups
  drop column league,
  drop column team_name,
  drop column scoring;

create unique index lineups_league_week_key on public.lineups (league_id, season, week);

alter table public.leagues enable row level security;
