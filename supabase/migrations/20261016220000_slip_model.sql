-- Which model helped build a slip, instead of only whether one did. Null when the user
-- dictated the whole slip. Every model-built slip so far came from /parlay in Claude Code.

alter table public.parlays
  add column model text check (model in ('claude', 'chatgpt'));

update public.parlays set model = 'claude' where by_model;

alter table public.parlays drop column by_model;
