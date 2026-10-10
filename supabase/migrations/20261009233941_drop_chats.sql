-- Parlays are now built in Claude Code through the MCP server, so conversations
-- are no longer stored here. The idea behind a slip lives in parlays.notes.

alter table public.parlays drop column chat_id;
drop table public.chats;
