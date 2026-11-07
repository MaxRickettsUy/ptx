-- When the user marked a slip as locked in, meaning they really placed the bet. Null until then.
-- A locked-in slip can't also be a mock; the app clears one when it sets the other.

alter table public.parlays
  add column locked_at timestamptz;
