# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

ptx tracks NFL player-prop parlays. Slips are built conversationally in Claude Code via the `/parlay` skill (`.claude/skills/parlay/`) and the `parlay` MCP server, saved to Supabase, and shown on a Next.js board that grades every leg live against ESPN's box score. Two more sections, Scores (`/scores`) and Stats (`/stats`), show weekly results and season-to-date team totals.

## Commands

```bash
supabase start               # local Postgres via Docker; applies supabase/migrations
pnpm dev                     # http://localhost:3000
pnpm lint                    # eslint
npx tsc --noEmit             # typecheck (no separate script)
pnpm build
supabase gen types typescript --local > src/lib/database.types.ts   # after any schema change
```

There is no test suite. Verify changes with `tsc` + `lint`, by hitting the API routes with `curl`, and by loading the page. With `pnpm dev` running, the Next dev server reports build/runtime errors at `POST /_next/mcp` (tool `get_errors`).

Env lives in `.env.local` (from `.env.example`): `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (the "Secret" key from `supabase status`).

## Architecture

**Data flows one way: ESPN → `src/lib` → API routes → client components that poll.** Every page is a client component (`src/components/{board,scores,stats}.tsx`) that fetches its `/api/*` route and polls (15s while a game is live, 60s otherwise; stats every 5 min). `next.config.ts` has `cacheComponents: true`, so pages that read `useSearchParams` are wrapped in `<Suspense>`.

- `src/lib/espn.ts` is the **only** file that knows ESPN's undocumented response shapes; swapping stats providers means replacing it. It has an in-memory TTL cache (`cached()`), so data is per server process. Scoreboards are cached by week and TTL; `forgetScoreboards()` clears them and backs the `POST /api/scores` and `POST /api/stats` refresh endpoints.
- Quarter-by-quarter player stats aren't in the box score. `quarterStatsFromPlays` rebuilds them from play-by-play text, and `board.ts` refuses to settle a quarter leg whose quarters don't sum to the official box-score total.
- `src/lib/stats.ts` is the registry of trackable markets (`STATS`) and periods (`PERIODS`). Adding a market there makes it available to both the MCP `save_parlay` tool and the board. `monotonic: false` (yardage) means the leg can only settle at the final whistle.
- `src/lib/grade.ts` holds the pure leg/parlay status rules.
- `src/lib/board.ts` joins saved legs with live stats. **It also settles on read:** when a game is final, `getBoard()` writes leg and parlay results back to the database as a side effect of `GET /api/board`.
- `src/lib/demo.ts`: any leg whose `event_id` starts with `demo-` is graded against a simulated, always-live game on a one-hour loop, for trying the board when no real game is on.
- `src/lib/season.ts` totals every regular-season week's final scores per team for the Stats page. Finished weeks are fetched with a 1-hour TTL.
- `src/lib/db.ts` uses the Supabase **secret key** (bypasses RLS; tables have RLS on with no policies). It's shared by the Next server and the MCP server; never import it into a client component.

**MCP server (`mcp/server.mts`)**, registered in `.mcp.json` and run with `tsx`, imports `src/lib/*` directly and loads `.env.local` itself. It talks over stdio, so **nothing it imports may write to stdout**. Lines always come from the user; there's no odds feed.

## UI conventions

- Components are shadcn/ui, **Base UI variant** (`src/components/ui`, add with `pnpm dlx shadcn@latest add <name>`). Composition uses the `render` prop (e.g. `render={<Link href=… />}`), not `asChild`.
- Use the `type-*` text utilities from `src/app/globals.css` (`type-hero`, `type-caption`, `type-fine`, …) rather than adding `text-*` theme tokens: the class merger drops unknown `text-*` names when a text colour is also present. Hit/miss colours are `text-hit` / `bg-miss` etc.
- The app is dark-only (`className="dark"` on `<html>`).
- Each page builds its own `<Sidebar>` but shares `PanelHeader` and `SectionNav` from `src/components/section-nav.tsx`. Add new top-level pages to `SECTIONS` there. The panel open/closed state is one localStorage flag shared across pages.

## Known limits (by design)

- An inactive player shows 0, so an over grades as missed; sportsbooks usually void those legs.
- The `/parlay` conversation isn't stored; only the slip's note is.
