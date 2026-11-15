# ptx

Build NFL and NBA player-prop parlays by talking them through in Claude Code, then watch every leg track live against the box score.

- **Building** (`/parlay` in Claude Code): describe the game, leg count and goal. Claude checks schedule, rosters, injuries and game logs through the `parlay` MCP server, asks you for the lines your book is offering, and saves the slip once you approve it.
- **Fantasy lineups** (`/lineup` in Claude Code, `/lineups` in the app): set up each of your leagues once under whatever name you like, with your team name and its scoring (standard, half PPR or PPR). Then give Claude each week's lineup, and optionally your opponent's. It's scored live from the box score, with each player settled when their game ends, and every league keeps its own season record. Saving a league's lineup for the same week again replaces it.
- **Hedging** (`/hedge` in Claude Code): Claude reads your saved matchup, finds your opponent's biggest remaining threats, and builds prop slips (usually singles) that pay if they boom. You give the lines; the slips go on the board.
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
| `src/lib/espn.ts` | The only file that knows ESPN's response shapes. Their endpoints are unofficial, so swap this file to change stats provider. Every call takes a sport (`nfl` or `nba`). Quarter-by-quarter lines are rebuilt from the play-by-play, since the box score only has game totals; the board won't settle a quarter leg whose quarters don't add up to the box score. Only NFL play-by-play is parsed, so NBA legs are full-game only. |
| `src/lib/stats.ts` | The trackable markets, each tagged with its sport, and how each is computed from a box-score line. Add a market here and it's available to Claude and the board. Also the periods a leg can cover: the full game, one quarter, or each quarter. |
| `src/lib/grade.ts` | Leg and parlay status rules. |
| `src/lib/board.ts` | Joins saved legs with live stats and settles finished ones. |
| `src/lib/fantasy.ts`, `src/lib/lineups.ts` | Fantasy slots, scoring presets and points rules; and scoring saved lineups live, settling each player when their game ends. |
| `mcp/server.mts` | The MCP server Claude Code uses: five research tools, `save_parlay`, and `list_leagues`, `save_league`, `save_lineup` and `get_matchup` for fantasy. Registered in `.mcp.json`. |
| `.claude/skills/parlay/`, `.claude/skills/lineup/`, `.claude/skills/hedge/` | The `/parlay`, `/lineup` and `/hedge` skills: how a session should go. |
| `src/lib/db.ts` | Supabase access for the Next.js server and the MCP server, using the secret key. Tables have RLS on with no policies. |

After changing the schema, regenerate types with `supabase gen types typescript --local > src/lib/database.types.ts`.

## UI

Components are [shadcn/ui](https://ui.shadcn.com) (Base UI variant) in `src/components/ui`, added with `pnpm dlx shadcn@latest add <name>`. They are themed to the Apple DESIGN.md from shadcn.io/design/apple; the tokens and type scale live in `src/app/globals.css`. Use the `type-*` utilities for text sizes rather than new `text-*` theme tokens, because the class merger drops unknown `text-*` names when a text colour is also present.

## Known limits

- Lines are whatever you tell Claude; there is no odds feed.
- The conversation is not stored with a slip. The reasoning lives in the note saved with it.
- A player who is inactive shows 0 and an over grades as missed. Sportsbooks usually void those legs instead.
- NBA legs cover the full game only, and the Scores, Stats and Lineups pages are NFL-only.
- Fantasy points skip what the box score doesn't record: two-point conversions, return TDs by offensive players, safeties, blocked kicks and field-goal distance. Totals can differ slightly from your league's app.
- Yardage can go backwards, so yardage legs only settle at the final whistle. Counting stats (receptions, TDs, attempts, and every NBA market) settle as soon as they cross the line.
