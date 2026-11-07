-- Which league a leg's game is in. Every leg so far is NFL; NBA legs are graded against
-- ESPN's basketball box score. It lives on the leg, so one slip can mix sports.

alter table public.legs
  add column sport text not null default 'nfl' check (sport in ('nfl', 'nba'));
