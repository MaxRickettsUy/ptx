// MCP server that lets Claude Code research NFL and NBA props and save parlays to the tracker,
// and save season-long fantasy lineups.
// Registered in .mcp.json; it talks over stdio, so nothing here may write to stdout.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";
import { z } from "zod";
import { createParlay, findLeague, listLeagues, saveLeague, saveLineup, type NewLineupPlayer } from "../src/lib/db";
import { getGameLog, getGameStats, getInjuries, getRoster, getScoreboard, getTeams, searchPlayers, type Game } from "../src/lib/espn";
import { SCORING, SCORING_KEYS, SLOT_KEYS, SLOTS, canFill } from "../src/lib/fantasy";
import { MODELS, type Model } from "../src/lib/labels";
import { PERIOD_KEYS, SPORTS, STAT_KEYS, STATS, statsFor, type Sport } from "../src/lib/stats";

process.loadEnvFile(path.join(import.meta.dirname, "..", ".env.local"));

const BOARD_URL = "http://localhost:3000";
const LINEUPS_URL = `${BOARD_URL}/lineups`;

const server = new McpServer({ name: "parlay", version: "0.1.0" });

// When the model doesn't say which it is, go by the connecting client: Codex and other OpenAI
// clients count as ChatGPT, and anything else is taken to be Claude Code, which is what
// .mcp.json and /parlay are set up for.
function connectedModel(): Model {
  const client = server.server.getClientVersion()?.name ?? "";
  return /codex|openai|chatgpt/i.test(client) ? "chatgpt" : "claude";
}

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

// Tool failures go back to the model as readable text so it can correct course.
async function respond(run: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await run()) }] };
  } catch (error) {
    return { content: [{ type: "text", text: (error as Error).message }], isError: true };
  }
}

async function findGame(eventId: string, sport: Sport): Promise<Game> {
  const { games } = await getScoreboard(sport);
  const onSlate = games.find((g) => g.id === eventId);
  if (onSlate) return onSlate;
  return (await getGameStats(eventId, sport)).game;
}

const sportInput = z.enum(SPORTS).describe("nfl or nba");

server.registerTool(
  "get_schedule",
  {
    description:
      "List games with their event ids, start times and status: an NFL week (defaults to the current week) or an NBA day (defaults to today). Call this first to get the event_id every leg needs.",
    inputSchema: {
      sport: sportInput,
      week: z.number().int().min(1).max(18).optional().describe("NFL only: regular-season week. Omit for the current week."),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
        .optional()
        .describe("NBA only: the day as YYYY-MM-DD, in US Eastern time. Omit for today."),
    },
  },
  ({ sport, week, date }) =>
    respond(async () => {
      const board = await getScoreboard(sport, sport === "nfl" ? { week } : { date });
      return {
        ...(sport === "nfl" ? { week: board.week } : { date: board.date }),
        games: board.games.map((g) => ({
          event_id: g.id,
          matchup: g.label,
          kickoff: g.date,
          status: g.detail,
          state: g.state,
        })),
      };
    }),
);

server.registerTool(
  "search_players",
  {
    description: "Find a player by name. Returns athlete ids, position and current team.",
    inputSchema: { sport: sportInput, query: z.string().describe("Full or partial player name") },
  },
  ({ sport, query }) => respond(async () => ({ players: await searchPlayers(query, sport) })),
);

server.registerTool(
  "get_team_roster",
  {
    description:
      "List a team's players with athlete ids and injury designations: for the NFL its quarterbacks, running backs, receivers, tight ends and kicker; for the NBA the whole roster. Use it to see who is actually available.",
    inputSchema: { sport: sportInput, team: z.string().describe("Team abbreviation such as KC or DEN, or a team name") },
  },
  ({ sport, team }) => respond(() => getRoster(team, sport)),
);

server.registerTool(
  "get_injuries",
  {
    description:
      "Current injury report for a team (NFL skill positions, or every NBA player), with status and the latest note.",
    inputSchema: { sport: sportInput, team: z.string().describe("Team abbreviation such as KC or DEN, or a team name") },
  },
  ({ sport, team }) => respond(() => getInjuries(team, sport)),
);

server.registerTool(
  "get_player_game_log",
  {
    description:
      "A player's game-by-game stat lines, most recent first. Defaults to this season; pass a season year for earlier ones when this season's sample is thin.",
    inputSchema: {
      sport: sportInput,
      athlete_id: z.string(),
      last_n: z.number().int().min(1).max(25).optional().describe("How many games to return. Defaults to 6."),
      season: z
        .number()
        .int()
        .optional()
        .describe("Season year, e.g. 2025. Omit for the current season. ESPN names an NBA season by the year it ends: 2026-27 is 2027."),
    },
  },
  ({ sport, athlete_id, last_n, season }) => respond(() => getGameLog(athlete_id, sport, { lastN: last_n, season })),
);

const markets = SPORTS.map(
  (sport) => `${sport.toUpperCase()}: ${statsFor(sport).map((key) => `${key} (${STATS[key].label})`).join(", ")}`,
).join(". ");

server.registerTool(
  "save_parlay",
  {
    description: `Save an approved parlay to the live tracker. Only call this after the user has confirmed the final slip, including every line. A slip can mix NFL and NBA legs. Trackable markets by sport, ${markets}.`,
    inputSchema: {
      name: z.string().describe("Short name for the slip, e.g. 'SNF Ravens stack'"),
      notes: z.string().optional().describe("One or two sentences on the idea behind the parlay; shown on the board"),
      human_involved: z
        .boolean()
        .describe("True if the user chose or shaped any of the legs themselves, beyond supplying lines and approving. Shown on the slip as 🧑."),
      model_involved: z
        .boolean()
        .describe("True if you proposed or shaped any of the legs. False only when the user dictated the whole slip and you just recorded it. Shown on the slip as your logo."),
      model: z
        .enum(MODELS.map((m) => m.key) as [Model, ...Model[]])
        .optional()
        .describe(
          "Which model you are, so the slip shows the right logo: claude if you are Claude (Anthropic), chatgpt if you are ChatGPT or another OpenAI model. Only used when model_involved is true.",
        ),
      mock: z
        .boolean()
        .optional()
        .describe("True for a what-if slip the user is not actually submitting to a book. Shown as 🧪. Defaults to false."),
      wager: z.number().nonnegative().optional().describe("Stake in dollars, if the user gave one"),
      odds: z
        .number()
        .int()
        .refine((n) => n >= 100 || n <= -100, "American odds are +100 or higher, or -100 or lower")
        .optional()
        .describe("The whole parlay's American odds as the sportsbook shows them, e.g. 450 for +450 or -120. Leave out if the book shows a multiple instead."),
      multiplier: z
        .number()
        .gt(1)
        .optional()
        .describe("Payout multiple, for books such as Underdog that show 1.9x or 6x instead of American odds. Pass 1.9 for 1.9x. Never pass both this and odds."),
      payout: z
        .number()
        .nonnegative()
        .optional()
        .describe("Total payout the book shows, stake included. Only pass it if it differs from what the odds imply, such as a boost."),
      legs: z
        .array(
          z.object({
            sport: sportInput,
            athlete_id: z.string().describe("ESPN athlete id exactly as returned by search_players or get_team_roster"),
            player_name: z.string(),
            team: z.string().describe("The player's team abbreviation, e.g. KC or DEN"),
            event_id: z.string().describe("ESPN event id exactly as returned by get_schedule"),
            stat: z.enum(STAT_KEYS),
            direction: z.enum(["over", "under"]),
            line: z.number().describe("The sportsbook line the user gave. Record '60+' as 59.5."),
            period: z
              .enum(PERIOD_KEYS)
              .optional()
              .describe(
                "The part of the game the leg covers. Defaults to game, which is the only option for NBA legs. NFL only: q1 to q4 count that quarter only. each_quarter means the line must be beaten in every one of the four quarters separately, e.g. '10+ rushing yards in each quarter' is rushing_yards over 9.5 with each_quarter. Overtime counts towards none of the quarters.",
              ),
          }),
        )
        .min(1)
        .max(15),
    },
  },
  ({ name, notes, human_involved, model_involved, model, mock, wager, odds, multiplier, payout, legs }) =>
    respond(async () => {
      const problems: string[] = [];
      if (odds !== undefined && multiplier !== undefined) {
        return { saved: false, problems: ["Pass either odds or multiplier for the slip, not both."] };
      }
      const resolved = await Promise.all(
        legs.map(async (leg) => {
          if (STATS[leg.stat].sport !== leg.sport) {
            problems.push(`${leg.player_name}: ${leg.stat} is not tracked for the ${leg.sport.toUpperCase()}.`);
            return null;
          }
          // Quarter lines are rebuilt from NFL play-by-play only, so an NBA leg couldn't be graded.
          if (leg.sport === "nba" && (leg.period ?? "game") !== "game") {
            problems.push(`${leg.player_name}: NBA legs can only cover the full game.`);
            return null;
          }
          const game = await findGame(leg.event_id, leg.sport).catch(() => null);
          if (!game) {
            problems.push(`${leg.player_name}: no game found for event_id ${leg.event_id}.`);
            return null;
          }
          const team = leg.team.toUpperCase();
          if (team !== game.home.abbr && team !== game.away.abbr) {
            problems.push(`${leg.player_name}: ${team} is not playing in ${game.label}.`);
            return null;
          }
          const roster = await getRoster(team, leg.sport);
          const player = roster.players.find((p: { athleteId: string }) => p.athleteId === leg.athlete_id);
          if (!player) {
            problems.push(`${leg.player_name}: athlete_id ${leg.athlete_id} is not on the ${team} roster. Look them up with search_players.`);
            return null;
          }
          return {
            sport: leg.sport,
            athlete_id: leg.athlete_id,
            player_name: player.name as string,
            team_abbr: team,
            player_position: player.position as string,
            event_id: game.id,
            game_label: game.label,
            game_date: game.date,
            stat: leg.stat,
            direction: leg.direction,
            line: leg.line,
            period: leg.period ?? "game",
          };
        }),
      );

      const valid = resolved.filter((leg) => leg !== null);
      if (problems.length > 0) return { saved: false, problems };

      const parlayId = await createParlay({
        name,
        notes: notes ?? null,
        legs: valid,
        stake: { wager: wager ?? null, odds: odds ?? null, multiplier: multiplier ?? null, payout: payout ?? null },
        labels: { human: human_involved, model: model_involved ? (model ?? connectedModel()) : null, mock: mock ?? false },
      });
      return { saved: true, parlay_id: parlayId, board_url: BOARD_URL, legs: valid };
    }),
);

server.registerTool(
  "list_leagues",
  {
    description: "List the user's fantasy leagues: each one's name, their team's name in it, and its scoring. save_lineup takes one of these names.",
    inputSchema: {},
  },
  () =>
    respond(async () => ({
      leagues: (await listLeagues()).map((l) => ({ name: l.name, team_name: l.team_name, scoring: l.scoring })),
    })),
);

server.registerTool(
  "save_league",
  {
    description: `Create a fantasy league, or change one: its name, the user's team name in it, or its scoring. A league's name is whatever the user calls it and must be unique, ignoring case. To rename a league pass its old name as current_name. Changing scoring re-scores every week that hasn't finished. Scoring presets: ${SCORING_KEYS.map((key) => `${key} (${SCORING[key].label})`).join(", ")}.`,
    inputSchema: {
      name: z.string().min(1).describe("The league's name as the user wants it shown, e.g. 'Work league'"),
      team_name: z.string().min(1).describe("The user's fantasy team name in this league"),
      scoring: z.enum(SCORING_KEYS).describe("The league's scoring: standard (no points per catch), half_ppr or ppr"),
      current_name: z.string().optional().describe("Only when changing an existing league's name: what it's called now"),
    },
  },
  ({ name, team_name, scoring, current_name }) =>
    respond(async () => {
      const existing = await findLeague(current_name ?? name);
      if (current_name && !existing) {
        const known = (await listLeagues()).map((l) => l.name);
        return { saved: false, problems: [`No league called "${current_name}". Leagues: ${known.join(", ") || "none yet"}.`] };
      }
      // Only an explicit rename changes a league's name; matching one by name keeps its spelling.
      const league = await saveLeague({ id: existing?.id, name: current_name || !existing ? name : existing.name, teamName: team_name, scoring });
      return {
        saved: true,
        created: !existing,
        league: { name: league.name, team_name: league.team_name, scoring: league.scoring },
        ...(existing && { was: { name: existing.name, team_name: existing.team_name, scoring: existing.scoring } }),
      };
    }),
);

const lineupPlayer = z.object({
  slot: z.enum(SLOT_KEYS).describe("The lineup slot. BN is the bench, which doesn't count towards the score."),
  athlete_id: z
    .string()
    .optional()
    .describe("ESPN athlete id exactly as returned by search_players or get_team_roster. Leave out for a team defense (slot DST, or a defense on the bench)."),
  player_name: z.string().describe("The player's name, or the team for a defense"),
  team: z.string().describe("The player's NFL team abbreviation, e.g. KC. For a defense, the team whose D/ST it is."),
});

server.registerTool(
  "save_lineup",
  {
    description: `Save a season-long fantasy football lineup for one NFL week to one of the user's leagues, where its points are scored live from the box score with that league's scoring. Create the league first with save_league. Only call this after the user has confirmed every player and slot. A league has one lineup a week, so saving the same league and week again replaces it; use that after a swap too. Slots: ${SLOT_KEYS.map((key) => `${key} (${SLOTS[key].positions.join("/")})`).join(", ")}.`,
    inputSchema: {
      league: z.string().describe("The league's name, as list_leagues returns it"),
      week: z.number().int().min(1).max(18).optional().describe("NFL regular-season week. Omit for the current week."),
      notes: z.string().optional().describe("A sentence on the week's thinking, such as a start/sit call; shown with the lineup"),
      players: z.array(lineupPlayer).min(1).max(30).describe("The user's starters, then their bench"),
      opponent_name: z.string().optional().describe("This week's opponent's fantasy team name, for a head-to-head matchup"),
      opponent_players: z.array(lineupPlayer).max(30).optional().describe("The opponent's starters and bench, if the user gave them"),
    },
  },
  ({ league: leagueName, week, notes, players, opponent_name, opponent_players }) =>
    respond(async () => {
      const league = await findLeague(leagueName);
      if (!league) {
        const known = (await listLeagues()).map((l) => l.name);
        return {
          saved: false,
          problems: [`No league called "${leagueName}". Leagues: ${known.join(", ") || "none yet"}. Create it with save_league first.`],
        };
      }
      const board = await getScoreboard("nfl", { week });
      if (!board.week || !board.season) return { saved: false, problems: ["Couldn't tell which NFL week this is. Pass week explicitly."] };
      const teams = await getTeams("nfl");
      const problems: string[] = [];
      const warnings: string[] = [];

      const resolve = async (player: z.infer<typeof lineupPlayer>, side: "mine" | "opponent"): Promise<NewLineupPlayer | null> => {
        const abbr = player.team.toUpperCase();
        const team = teams.find((t) => t.abbr === abbr);
        if (!team) {
          problems.push(`${player.player_name}: unknown team ${player.team}.`);
          return null;
        }

        let name: string;
        let position: string;
        let athleteId: string | null = null;
        if (player.athlete_id === undefined) {
          if (player.slot !== "DST" && player.slot !== "BN") {
            problems.push(`${player.player_name}: athlete_id is required in the ${player.slot} slot. Only a defense goes without one.`);
            return null;
          }
          name = `${team.name} D/ST`;
          position = "DST";
        } else {
          const roster = await getRoster(abbr, "nfl");
          const found = roster.players.find((p: { athleteId: string }) => p.athleteId === player.athlete_id);
          if (!found) {
            problems.push(`${player.player_name}: athlete_id ${player.athlete_id} is not on the ${abbr} roster. Look them up with search_players.`);
            return null;
          }
          name = found.name;
          position = found.position ?? "";
          athleteId = player.athlete_id;
        }
        if (!canFill(player.slot, position)) {
          problems.push(`${name}: a ${position || "player with no position"} can't fill the ${player.slot} slot.`);
          return null;
        }

        const game = board.games.find((g) => g.home.abbr === abbr || g.away.abbr === abbr);
        // A team on bye scores nothing, which is final from the start.
        if (!game && player.slot !== "BN") warnings.push(`${name} is starting but ${abbr} is on bye in week ${board.week}.`);
        return {
          side,
          slot: player.slot,
          athlete_id: athleteId,
          player_name: name,
          team_abbr: abbr,
          player_position: position,
          event_id: game?.id ?? null,
          game_label: game?.label ?? null,
          game_date: game?.date ?? null,
          final_points: game ? null : 0,
          final_stats: null,
        };
      };

      const resolved = await Promise.all([
        ...players.map((p) => resolve(p, "mine")),
        ...(opponent_players ?? []).map((p) => resolve(p, "opponent")),
      ]);
      if (problems.length > 0) return { saved: false, problems };

      const { id, replaced } = await saveLineup({
        leagueId: league.id,
        season: board.season,
        week: board.week,
        opponentName: opponent_name ?? null,
        notes: notes ?? null,
        players: resolved.filter((p) => p !== null),
      });
      return {
        saved: true,
        lineup_id: id,
        league: league.name,
        replaced_earlier_lineup: replaced,
        week: board.week,
        lineups_url: `${LINEUPS_URL}?league=${league.id}`,
        warnings,
      };
    }),
);

await server.connect(new StdioServerTransport());
