---
name: hedge
description: Build prop slips that hedge the user's fantasy football matchup, using their saved lineup and their opponent's, and save them to the ptx parlay board. Use when the user wants to hedge a fantasy matchup, bet against their opponent's players, or protect a fantasy week with props.
---

# Hedging a fantasy matchup

You are helping one person place NFL player props that pay off when their fantasy week goes badly, so a loss in their league is cushioned by a win at the sportsbook. Their lineups live in the ptx tracker; the slips you build go on the same parlay board as `/parlay` slips.

The `parlay` MCP server provides the tools: `list_leagues` and `get_matchup` to read the fantasy side, the research tools `get_schedule`, `get_team_roster`, `get_injuries` and `get_player_game_log` (pass `sport: nfl`), and `save_parlay` to save a slip. If they aren't available, tell the user to reconnect the `parlay` server from `/mcp` rather than working around it.

## How a hedge works

The user loses their matchup when their opponent's players outscore theirs. So a hedge leg is one of:

- **An over on an opponent's starter.** If the opponent's player has a big game, the user is more likely to lose, and the bet cashes. This is the main tool.
- **An under on one of the user's own starters.** If their own player flops, the bet cashes. Use it sparingly: it's a bet against their own team, and many people don't want that. Ask before proposing any.

Never suggest a leg that wins in the same situation the user's fantasy team wins, such as an over on their own player or an under on the opponent's. That doubles their exposure instead of hedging it.

Only players whose games haven't started can be hedged at pre-game lines. A live game needs a live line from the user's book, so say so if they want one.

## Prompt, don't interview

Walk the user through with the `AskUserQuestion` tool, as `/lineup` does: 2 to 4 options a question, with "Other" for typed answers, and up to four related questions in one call. Keep prose between prompts to a line or two.

### 1. Matchup

Call `list_leagues`. With one league use it; with several, prompt "Which matchup do you want to hedge?" with each league as an option, showing its team name. Then call `get_matchup`. If it has no opponent, the user can't hedge against one: offer to add the opponent with `/lineup`, or to hedge with unders on their own players only.

Show the state of the matchup in a line: the score, and how many starters each side still has to play.

### 2. Find the swing players

From the opponent's starters still to play, rank the ones whose big games would hurt the user most: high-usage running backs and receivers, the quarterback, and anyone with touchdown upside. Check each against `get_injuries` and their last few games with `get_player_game_log`. Skip players who are out or doubtful, kickers and defenses (no props for them), and anyone whose game is final or under way.

Watch for overlap:

- **The same player on both sides** (possible across a shared NFL team, never in one league) cancels out; skip him.
- **Players in the same NFL game** as the user's own starters are correlated. An over on the opponent's receiver can also mean a shootout that helps the user's players in that game, so it's a weaker hedge. Say so.

Prompt with the three or four best candidates as a multi-select ("Which players do you want to hedge against?"), each labelled with team, position, kickoff and a one-line reason drawn from the data.

### 3. Pick markets and get lines

For each chosen player, suggest the market that best tracks their fantasy points: receiving yards or receptions for receivers and tight ends (receptions matter more in PPR), rush + rec yards for backs, passing yards or passing TDs for quarterbacks, and `touchdowns` (anytime TD, over 0.5) for anyone, since touchdowns swing fantasy weeks most. Only use markets `save_parlay` lists for the NFL.

There's no odds feed, so never invent a line. Prompt for each one, offering the market you suggested and an alternative, and ask the user to type their book's number in Other. "60+" is over 59.5.

### 4. Singles or a parlay

Say plainly that a parlay hedge only pays if every leg hits, which makes it a weak hedge: the user can lose their matchup and still lose the slip. Separate single-leg slips are the real hedge; a two-leg parlay on the opponent's two biggest threats is a reasonable middle ground for a bigger payout. Prompt with "Separate singles", "One parlay" and "Two-leg parlay on the top two".

Each single is its own `save_parlay` call with one leg.

### 5. Stake and save

Ask the stake and price for each slip as `/parlay` does: `wager`, then `odds` (American) or `multiplier`, never both. If the user's league has money on the line, they may want the hedge to roughly cover what they'd lose; offer to work that out from the price, but leave the amount to them.

Show the final slips, then prompt "Save", "Change a leg" and "Cancel". Save with:

- `name`: `Hedge: <opponent> (<league> wk <week>)`, plus the player for a single, e.g. `Hedge: Johnman (Shin's Classroom wk 10) · Henry`.
- `notes`: the matchup and why, e.g. "Down 27.7 to Johnman in Shin's Classroom; Henry is their biggest remaining swing."
- `human_involved` and `model_involved` honestly, with `model: claude`, as `/parlay` describes.
- `mock: true` if the user isn't actually placing it; ask if it's unclear.
- `athlete_id` and `event_id` exactly as `get_matchup` returned them, `sport: nfl`, and the player's `team`.

After saving, tell the user the slips are on the board at http://localhost:3000 next to the matchup at /lineups, both needing `pnpm dev` running.

## Style

Be direct. Never call a hedge free money or a sure thing: it costs the stake whenever the user's fantasy week goes well, and that's the point of it. If the user is comfortably ahead, it's fine to say a hedge may not be worth it.
