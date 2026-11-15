// Shared by the Next server (/api/lineups) and the MCP server (get_matchup), so it can't be marked
// server-only; like db.ts, never import it into a client component.

import { listLeagues, listLineups, settleLineup, settleLineupPlayer, type LineupPlayerRow } from "./db";
import { getGameStats, getScoreboard, headshotUrl, type Game, type GameStats } from "./espn";
import {
  SCORING,
  SLOTS,
  defensePoints,
  defenseSummary,
  isScoringKey,
  isSlotKey,
  playerPoints,
  playerSummary,
  type ScoringKey,
} from "./fantasy";
import type { GameState } from "./grade";
import { EMPTY_LINE, type DefenseLine, type PlayerLine } from "./stats";

export type LineupPlayer = {
  id: string;
  /** Null for a team defense. */
  athleteId: string | null;
  /** Null when the player's team is on bye. */
  eventId: string | null;
  slot: string;
  slotLabel: string;
  name: string;
  headshot: string | null;
  team: string;
  teamLogo: string;
  position: string | null;
  points: number;
  /** The numbers behind the points, e.g. "245 pass yds, 2 pass TD"; null before kickoff. */
  summary: string | null;
  /** "bye" when the player's team has no game this week. */
  state: GameState | "bye";
  game: { label: string; date: string; detail: string; score: string | null } | null;
};

export type LineupSide = {
  name: string;
  points: number;
  starters: LineupPlayer[];
  bench: LineupPlayer[];
  /** Starters whose game hasn't finished yet. */
  yetToFinish: number;
};

export type Lineup = {
  id: string;
  leagueId: string;
  leagueName: string;
  season: number;
  week: number;
  scoringLabel: string;
  notes: string | null;
  createdAt: string;
  /** Null until every player's game is final, and always null without an opponent. */
  result: "won" | "lost" | "tie" | null;
  final: boolean;
  live: boolean;
  mine: LineupSide;
  opponent: LineupSide | null;
};

export type League = {
  id: string;
  name: string;
  teamName: string;
  scoringLabel: string;
  /** Settled head-to-head results across every saved week. */
  record: { won: number; lost: number; tie: number };
  live: boolean;
};

export type Lineups = {
  leagues: League[];
  lineups: Lineup[];
  anyLive: boolean;
  problems: string[];
  fetchedAt: string;
};

function score(game: Game): string | null {
  if (game.state === "pre") return null;
  return `${game.away.abbr} ${game.away.score} · ${game.home.abbr} ${game.home.score}`;
}

const round = (n: number) => Math.round(n * 100) / 100;

const EMPTY_DEFENSE: DefenseLine = { pointsAllowed: 0, sacks: 0, interceptions: 0, fumblesRecovered: 0, touchdowns: 0 };

const isDefense = (player: LineupPlayerRow) => player.athlete_id === null;

export async function getLineups(): Promise<Lineups> {
  const [leagues, lineups] = await Promise.all([listLeagues(), listLineups()]);
  const leagueById = new Map(leagues.map((l) => [l.id, l]));
  const problems: string[] = [];
  const open = lineups.flatMap((l) => l.lineup_players.filter((p) => p.final_points === null && p.event_id !== null));

  // Each week with an unsettled player, so games that haven't kicked off can skip the box score.
  const slate = new Map<string, Game>();
  const weeks = new Set(lineups.filter((l) => l.lineup_players.some((p) => p.final_points === null && p.event_id !== null)).map((l) => l.week));
  await Promise.all(
    [...weeks].map(async (week) => {
      try {
        for (const game of (await getScoreboard("nfl", { week })).games) slate.set(game.id, game);
      } catch (error) {
        problems.push(`Week ${week} scoreboard unavailable: ${(error as Error).message}`);
      }
    }),
  );

  const stats = new Map<string, GameStats>();
  await Promise.all(
    [...new Set(open.map((p) => p.event_id!))]
      .filter((id) => slate.get(id)?.state !== "pre")
      .map(async (id) => {
        try {
          stats.set(id, await getGameStats(id, "nfl"));
        } catch (error) {
          problems.push(`Stats unavailable for event ${id}: ${(error as Error).message}`);
        }
      }),
  );

  const writes: Promise<void>[] = [];

  const view = lineups.map((lineup): Lineup => {
    const league = leagueById.get(lineup.league_id);
    const scoring: ScoringKey = league && isScoringKey(league.scoring) ? league.scoring : "ppr";
    const teamName = league?.team_name ?? "My team";

    // Each player's card, with which side they're on and whether their points are final.
    const players = lineup.lineup_players.map((row): { side: LineupPlayerRow["side"]; done: boolean; view: LineupPlayer } => {
      const base = {
        id: row.id,
        athleteId: row.athlete_id,
        eventId: row.event_id,
        slot: row.slot,
        slotLabel: isSlotKey(row.slot) ? SLOTS[row.slot].label : row.slot,
        name: row.player_name,
        headshot: row.athlete_id ? headshotUrl(row.athlete_id, "nfl") : null,
        team: row.team_abbr,
        teamLogo: `/team-logos/nfl/${row.team_abbr.toLowerCase()}.png`,
        position: row.player_position,
      };

      if (row.event_id === null) {
        return { side: row.side, done: true, view: { ...base, points: 0, summary: null, state: "bye", game: null } };
      }

      if (row.final_points !== null) {
        return {
          side: row.side,
          done: true,
          view: {
            ...base,
            points: Number(row.final_points),
            summary: summarize(row, row.final_stats),
            state: "post",
            game: { label: row.game_label ?? "", date: row.game_date ?? "", detail: "Final", score: null },
          },
        };
      }

      const gameStats = stats.get(row.event_id);
      const game = gameStats?.game ?? slate.get(row.event_id);
      if (!game || game.state === "pre" || !gameStats) {
        return {
          side: row.side,
          done: false,
          view: {
            ...base,
            points: 0,
            summary: null,
            state: "pre",
            game: {
              label: game?.label ?? row.game_label ?? "",
              date: game?.date ?? row.game_date ?? "",
              detail: game ? game.detail : "No data",
              score: game ? score(game) : null,
            },
          },
        };
      }

      // A player with no box-score row yet simply hasn't recorded a stat.
      const line: PlayerLine | DefenseLine = isDefense(row)
        ? (gameStats.defenses[row.team_abbr] ?? EMPTY_DEFENSE)
        : (gameStats.players[row.athlete_id!]?.line ?? EMPTY_LINE);
      const points = isDefense(row) ? defensePoints(line as DefenseLine) : playerPoints(line as PlayerLine, scoring);

      if (game.state === "post") {
        writes.push(
          settleLineupPlayer(row.id, points, line).catch(
            (error) => void problems.push(`Could not settle ${row.player_name}: ${(error as Error).message}`),
          ),
        );
      }

      return {
        side: row.side,
        done: game.state === "post",
        view: {
          ...base,
          points,
          summary: summarize(row, line),
          state: game.state,
          game: { label: game.label, date: game.date, detail: game.detail, score: score(game) },
        },
      };
    });

    // Bench points are shown but never count towards the total.
    const side = (which: LineupPlayerRow["side"], name: string): LineupSide => {
      const starters = players.filter((p) => p.side === which && p.view.slot !== "BN");
      return {
        name,
        points: round(starters.reduce((sum, p) => sum + p.view.points, 0)),
        starters: starters.map((p) => p.view),
        bench: players.filter((p) => p.side === which && p.view.slot === "BN").map((p) => p.view),
        yetToFinish: starters.filter((p) => !p.done).length,
      };
    };

    const mine = side("mine", teamName);
    const hasOpponent = lineup.opponent_name !== null || players.some((p) => p.side === "opponent");
    const opponent = hasOpponent ? side("opponent", lineup.opponent_name ?? "Opponent") : null;
    const final = players.every((p) => p.done);
    const result = !final || !opponent ? null : mine.points > opponent.points ? "won" : mine.points < opponent.points ? "lost" : "tie";

    if (final && !lineup.settled_at) {
      writes.push(
        settleLineup(lineup.id, { points: mine.points, opponentPoints: opponent?.points ?? null, result }).catch(
          (error) => void problems.push(`Could not settle ${teamName}: ${(error as Error).message}`),
        ),
      );
    }

    return {
      id: lineup.id,
      leagueId: lineup.league_id,
      leagueName: league?.name ?? "Unknown league",
      season: lineup.season,
      week: lineup.week,
      scoringLabel: SCORING[scoring].label,
      notes: lineup.notes,
      createdAt: lineup.created_at,
      result,
      final,
      live: players.some((p) => p.view.state === "in"),
      mine,
      opponent,
    };
  });

  await Promise.all(writes);

  return {
    leagues: leagues.map((league): League => {
      const own = view.filter((l) => l.leagueId === league.id);
      const count = (result: Lineup["result"]) => own.filter((l) => l.result === result).length;
      return {
        id: league.id,
        name: league.name,
        teamName: league.team_name,
        scoringLabel: SCORING[isScoringKey(league.scoring) ? league.scoring : "ppr"].label,
        record: { won: count("won"), lost: count("lost"), tie: count("tie") },
        live: own.some((l) => l.live),
      };
    }),
    lineups: view,
    anyLive: view.some((l) => l.live),
    problems,
    fetchedAt: new Date().toISOString(),
  };
}

function summarize(row: LineupPlayerRow, stats: unknown): string | null {
  if (!stats || typeof stats !== "object") return null;
  // Stored lines from before a stat was added lack it, so fill the gaps with zeros.
  return isDefense(row) ? defenseSummary(stats as DefenseLine) : playerSummary({ ...EMPTY_LINE, ...(stats as Partial<PlayerLine>) });
}
