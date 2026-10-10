-- Who built a slip, and whether it was really placed.
--   by_human: the user chose or shaped the legs
--   by_model: the model proposed or shaped the legs
--   is_mock:  a what-if slip that was never submitted to a book
-- Human and model are not exclusive; a slip worked out together carries both.

alter table public.parlays
  add column by_human boolean not null default false,
  add column by_model boolean not null default false,
  add column is_mock boolean not null default false;
