-- What was staked on a slip and at what price. All optional: a slip can be tracked without them.
-- Odds are American (+450, -120). Payout is the total returned on a win, stake included; it is
-- stored only when the book's figure differs from what the odds imply (a boost, say).

alter table public.parlays
  add column wager numeric(10, 2) check (wager >= 0),
  add column odds integer check (odds <= -100 or odds >= 100),
  add column payout numeric(10, 2) check (payout >= 0);
