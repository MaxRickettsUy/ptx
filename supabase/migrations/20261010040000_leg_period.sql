-- The part of the game a leg covers. Most legs are full-game; a leg can instead cover one
-- quarter, or need its line beaten in each of the four quarters separately.
-- quarter_values keeps what an each-quarter leg finished with in Q1 to Q4, since final_value
-- can only hold one number (the quarter that came closest to losing it).

alter table public.legs
  add column period text not null default 'game'
    check (period in ('game', 'q1', 'q2', 'q3', 'q4', 'each_quarter')),
  add column quarter_values numeric[];
