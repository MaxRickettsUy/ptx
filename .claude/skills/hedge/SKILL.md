---
name: hedge
description: Recommend prop parlays that hedge the user's fantasy football matchup, combining overs on their opponent's players with unders on their own, and save the ones they pick to the ptx parlay board. Use when the user wants to hedge a fantasy matchup, bet against their opponent's players or their own, or protect a fantasy week with props.
---

# Hedging a fantasy matchup

You are helping one person build NFL prop parlays that cash when their fantasy week goes badly: when their own players flop, when their opponent's players go off, or both. The slips are a consolation prize: if they lose their matchup, they should have something to root for. Their lineups live in the ptx tracker; the slips you build go on the same parlay board as `/parlay` slips.

The `parlay` MCP server provides the tools: `list_leagues` and `get_matchup` to read the fantasy side, the research tools `get_schedule`, `get_team_roster`, `get_injuries` and `get_player_game_log` (pass `sport: nfl`), and `save_parlay` to save a slip. If they aren't available, tell the user to reconnect the `parlay` server from `/mcp` rather than working around it.

## How a hedge leg works

Every leg must win in the same situation the user's fantasy team loses. So a leg is one of:

- **An under on one of the user's own starters.** It cashes when that player flops.
- **An over on one of the opponent's starters.** It cashes when that player goes off.

Both are first-class; the user wants slips that combine players from both teams. Never include a leg that wins when the user's fantasy team wins (an over on their own player, an under on the opponent's): that doubles their exposure instead of hedging it.

Only players whose games haven't started can be hedged at pre-game lines. A live game needs a live line from the user's book, so say so if they want one.

## Recommend, don't interview

Do the research and come back with ready-made slips for the user to pick from. Don't ask which players to hedge against or which markets to use; those are your recommendations to make. Use the `AskUserQuestion` tool, as `/lineup` does, only for the matchup, for choosing among your slips, and for lines, stake and saving. Keep prose between prompts short.

### 1. Matchup

Call `list_leagues`. With one league use it; with several, prompt "Which matchup do you want to hedge?" with each league as an option, showing its team name. Then call `get_matchup`. If it has no opponent, build slips from unders on the user's own players only, and offer to add the opponent with `/lineup`.

Show the state of the matchup in a line: the score, and how many starters each side still has to play.

### 2. Research both sides

For every starter still to play on both teams (skip quarterbacks, kickers, defenses, and anyone whose game is final or under way; include a quarterback only if the user asks), check `get_injuries` for their team and their last four to six games with `get_player_game_log`. Skip players who are out or doubtful; flag anyone questionable.

Pick a market and direction for each player:

- **The user's players (unders):** the stat their fantasy points lean on, at a line they've been missing lately or that a tough matchup threatens: receiving yards or receptions for receivers and tight ends (receptions in PPR), rush + rec yards for backs. Avoid `touchdowns` under 0.5 on a back or receiver with a heavy red-zone role; it's usually heavily juiced.
- **The opponent's players (overs):** the stat that tracks their ceiling. `touchdowns` over 0.5 (anytime TD) swings fantasy weeks most; yardage and receptions work too.

Only use markets `save_parlay` lists for the NFL.

### 3. Build the slips

Recommend about three different parlays of at least six legs each, mixing players from both teams. Give each a short name and a one-line idea, for example:

- **Nightmare week**: unders on the user's most important players plus overs on the opponent's top threats. The scenario that hurts most, so the biggest payout.
- **Same-game story**: legs from one or two NFL games that tell one story, e.g. the user's receivers under plus the opponent's running backs over when those teams are likely to lean on the run. Correlation within a slip is good here: it makes the legs hit together.
- **Afternoon collapse**: the user's lesser starters doing nothing plus the opponent's depth producing, for when the stars are a wash.

Within a slip, prefer legs that tend to hit together. Avoid pairs that pull against each other: an under on the user's receiver and an over on the opponent's receiver in the same game both need opposite game scripts, so they rarely both hit. Say so if a slip has a pair like that.

Don't reuse the same leg in every slip; a player can appear in at most two slips, so one result doesn't decide them all. The same player on both teams cancels out; leave him out.

Show the slips as a compact list: name, the idea, and each leg as `Player (TEAM) over/under market`, with the reason drawn from the data (e.g. "under 4 catches in three straight"). Then prompt "Which slips do you want?" as a multi-select with each slip as an option. The user can ask for changes in Other.

### 4. Lines

There's no odds feed, so never save a line the user hasn't approved. Estimate each leg's line from the game log and prompt once per slip (up to four slips a call), listing that slip's estimates, with the options "Use these lines" and "I'll type them". If they type their own, take those. Anytime-TD legs are 0.5 and need no prompt. "60+" is over 59.5. Ask in the same call whether they're placing the slips or tracking them as mock.

### 5. Stake and save

Ask the stake and price for each slip as `/parlay` does: `wager`, then `odds` (American) or `multiplier`, never both.

Show the final slips, then prompt "Save", "Change a leg" and "Cancel". Save each slip with its own `save_parlay` call:

- `name`: `Hedge: <slip name> (<league> wk <week>)`, e.g. `Hedge: Nightmare week (Shin's Classroom wk 10)`.
- `notes`: the matchup and the idea, e.g. "Down 27.7 to Johnman. Cashes if Chase and Kelce flop and Henry scores."
- `human_involved` and `model_involved` honestly, with `model: claude`, as `/parlay` describes.
- `mock: true` if the user isn't actually placing it; ask if it's unclear.
- `athlete_id` and `event_id` exactly as `get_matchup` returned them, `sport: nfl`, and the player's `team`.

After saving, tell the user the slips are on the board at http://localhost:3000 next to the matchup at /lineups, both needing `pnpm dev` running.

## Style

Be direct. Never call a hedge free money or a sure thing: every slip costs its stake whenever the fantasy week goes well, and that's the point of it. A parlay needs every leg, so the user can lose their matchup and still lose the slip; say that once when presenting the slips, not on every one.
