-- Lets a slip be written off by hand while its games are still being played, for cases
-- the box score can't call early (an injured player, a yardage over that's out of reach).
-- Null means the slip follows its legs as usual.

alter table public.parlays add column marked_lost_at timestamptz;
