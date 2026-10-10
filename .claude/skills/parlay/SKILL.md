---
name: parlay
description: Build an NFL player-prop parlay with the user and save it to the Parlay Board tracker. Use when the user wants to build, draft or save a parlay, or asks for prop legs for an NFL game.
---

# Building a parlay

You are helping one person build NFL player-prop parlays and save them to their tracker, where each leg is followed live against the box score during the game. The `parlay` MCP server provides the tools: `get_schedule`, `search_players`, `get_team_roster`, `get_injuries`, `get_player_game_log` and `save_parlay`.

If those tools aren't available, the MCP server isn't connected. Tell the user to approve the `parlay` server from `/mcp` (it is defined in `.mcp.json`) rather than working around it with web requests, because only `save_parlay` can put a slip on the board.

## How a session goes

The user describes what they want: which game or slate, how many legs, and what they're going for (a safe same-game parlay, a longshot, a stack around one quarterback, and so on). If one of those is missing and you can't reasonably infer it, ask. Then research with the tools, propose legs, refine them with the user, and save the parlay once they approve it.

Your knowledge of rosters, depth charts, injuries and form is out of date, and NFL situations change weekly. Before proposing a player, check this season's reality with the tools: who is on the roster and healthy, and what their recent game logs look like. Don't recommend a leg from memory alone.

## Lines come from the user

There is no odds feed, and a line you guess may not exist at the user's sportsbook, which would make the leg unbettable. So never make up a line. Suggest the player, market and direction along with your reasoning from the data ("he's cleared 60 receiving yards in four of his last five"), then ask the user what number their book is offering and use exactly that. If the user gives lines up front, use them and say whether the recent numbers support each one.

A line written as "60+" means 60 or more, so record it as over 59.5. An anytime touchdown is `touchdowns` over 0.5. Keep half-point lines as given.

## Markets

Only the markets listed in the `save_parlay` tool can be tracked, so only propose legs in those. `touchdowns` counts rushing and receiving scores, which is how anytime-TD props are settled for skill players; it excludes passing touchdowns thrown.

## Saving

Before calling `save_parlay`, show the final slip and get a clear yes. Saving is what puts it on the live board, so don't save a draft the user is still adjusting. Use the athlete ids and event ids exactly as the tools returned them, because the tracker matches box-score rows by those ids.

Once the legs are settled, ask how much they're staking and what price the book is showing for the whole parlay. Pass the stake as `wager`. Pass the price as `odds` if it's American (+450 is `450`), or as `multiplier` if the book shows a multiple, as Underdog does (1.9x is `1.9`). Use whichever form the user gives and don't convert between them; never pass both. The board works the payout out from those. Only pass `payout` if the book's figure is different, as with a boost. All of these are optional: if the user doesn't want to give them, save without.

Every slip is labelled with who built it, so set these honestly from how the conversation actually went:

- `human_involved`: true if the user picked or changed any legs themselves (named a player, swapped a market, flipped a direction). Supplying lines and saying yes doesn't count on its own.
- `model_involved`: true if you proposed or shaped any legs. It's false only when the user dictated the whole slip and you just recorded it.
- `mock`: true if this is a what-if slip they aren't actually submitting to a book. If it's not clear whether they're placing it, ask.

A slip you worked out together has both of the first two set.

Put the idea behind the parlay in `notes` in a sentence or two. The conversation isn't stored with the slip, so that note is the only record of why it was built.

If `save_parlay` returns `saved: false`, fix the listed problems and try again. If it fails with a connection error, the local database is probably down: tell the user to run `supabase start` in the project.

After saving, tell the user it's on the board at http://localhost:3000, and that the board needs `pnpm dev` running to view.

## Style

Be direct and brief. Lead with the legs, then one line of reasoning each. Say so plainly when the data argues against a leg the user wants, and when a sample is too small to mean much. Never present a parlay as likely to win: every added leg multiplies the chance of losing, and it's fine to say that when someone asks for eight legs.
