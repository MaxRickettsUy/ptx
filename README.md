# Parlay Board

Build NFL player-prop parlays by talking them through in Claude Code, then watch every leg track live against the box score.

- **Building** (`/parlay` in Claude Code): describe the game, leg count and goal. Claude checks schedule, rosters, injuries and game logs through the `parlay` MCP server, asks you for the lines your book is offering, and saves the slip once you approve it.
- **Board** (`/`): every saved parlay with per-leg progress. Polls every 15s while a game is live, every 60s otherwise, and writes final results to the database when games end.

## Run it

```bash
supabase start            # needs Docker running; applies supabase/migrations
cp .env.example .env.local  # then fill in the secret key
pnpm dev                  # the board, at http://localhost:3000
```

Then start Claude Code in this directory, approve the `parlay` MCP server when prompted, and run `/parlay`. Saving needs Supabase running; the dev server is only needed to view the board.

`SUPABASE_SECRET_KEY` is the "Secret" key printed by `supabase status`. Supabase Studio is at http://127.0.0.1:54323.

## How it fits together

| Path | What it does |
| --- | --- |
| `src/lib/espn.ts` | The only file that knows ESPN's response shapes. Their endpoints are unofficial, so swap this file to change stats provider. |
| `src/lib/stats.ts` | The trackable markets and how each is computed from a box-score line. Add a market here and it's available to Claude and the board. |
| `src/lib/grade.ts` | Leg and parlay status rules. |
| `src/lib/board.ts` | Joins saved legs with live stats and settles finished ones. |
| `mcp/server.mts` | The MCP server Claude Code uses: five research tools and `save_parlay`. Registered in `.mcp.json`. |
| `.claude/skills/parlay/` | The `/parlay` skill: how a session should go. |
| `src/lib/db.ts` | Supabase access for the Next.js server and the MCP server, using the secret key. Tables have RLS on with no policies. |

After changing the schema, regenerate types with `supabase gen types typescript --local > src/lib/database.types.ts`.

## UI

Components are [shadcn/ui](https://ui.shadcn.com) (Base UI variant) in `src/components/ui`, added with `pnpm dlx shadcn@latest add <name>`. They are themed to the Apple DESIGN.md from shadcn.io/design/apple; the tokens and type scale live in `src/app/globals.css`. Use the `type-*` utilities for text sizes rather than new `text-*` theme tokens, because the class merger drops unknown `text-*` names when a text colour is also present.

## Known limits

- Lines are whatever you tell Claude; there is no odds feed.
- The conversation is not stored with a slip. The reasoning lives in the note saved with it.
- A player who is inactive shows 0 and an over grades as missed. Sportsbooks usually void those legs instead.
- Yardage can go backwards, so yardage legs only settle at the final whistle. Counting stats (receptions, TDs, attempts) settle as soon as they cross the line.
