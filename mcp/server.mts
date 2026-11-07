// MCP server that lets Claude Code research NFL and NBA props and save parlays to the tracker.
// Registered in .mcp.json; it talks over stdio, so nothing here may write to stdout.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";
import { z } from "zod";
import { createParlay } from "../src/lib/db";
import { getGameLog, getGameStats, getInjuries, getRoster, getScoreboard, searchPlayers, type Game } from "../src/lib/espn";
import { MODELS, type Model } from "../src/lib/labels";
import { PERIOD_KEYS, SPORTS, STAT_KEYS, STATS, statsFor, type Sport } from "../src/lib/stats";

process.loadEnvFile(path.join(import.meta.dirname, "..", ".env.local"));

const BOARD_URL = "http://localhost:3000";

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

await server.connect(new StdioServerTransport());
