-- Some books (Underdog) price an entry as a payout multiple, 1.9x, instead of American odds.
-- A slip carries one or the other, never both.

alter table public.parlays
  add column multiplier numeric(8, 3) check (multiplier > 1),
  add constraint parlays_one_price check (odds is null or multiplier is null);
