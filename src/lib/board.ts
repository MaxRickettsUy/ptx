import "server-only";

import { listParlays, settleLeg, settleParlay, type LegRow } from "./db";
import { demoGameStats, isDemoEvent } from "./demo";
import { getGameStats, getScoreboard, headshotUrl, type Game, type GameStats } from "./espn";
import { gradeLeg, gradeParlay, type Direction, type GameState, type LegStatus, type ParlayStatus } from "./grade";
import type { SlipLabels } from "./labels";
import { impliedPayout } from "./odds";
import { EMPTY_LINE, STATS, isStatKey } from "./stats";

export type BoardLeg = {
  id: string;
  playerName: string;
  headshot: string | null;
  team: string | null;
  position: string | null;
  statShort: string;
  statLabel: string;
  direction: Direction;
  line: number;
  value: number;
  status: LegStatus;
  game: {
    label: string;
    date: string;
    state: GameState;
    detail: string;
    score: string | null;
  };
};

export type BoardParlay = {
  id: string;
  name: string;
  notes: string | null;
  createdAt: string;
  /** True when the user wrote this slip off by hand rather than the box score deciding it. */
  markedLost: boolean;
  wager: number | null;
  odds: number | null;
  /** Payout multiple (1.9x), for books that price that way. A slip has odds or a multiplier, not both. */
  multiplier: number | null;
  /** Total returned on a win. The book's own figure if one was saved, otherwise worked out from the odds. */
  payout: number | null;
  /** True when the payout was entered by hand rather than derived from the wager and price. */
  payoutEntered: boolean;
  labels: SlipLabels;
  status: ParlayStatus;
  legs: BoardLeg[];
};

export type Board = {
  parlays: BoardParlay[];
  anyLive: boolean;
  problems: string[];
  fetchedAt: string;
};

function score(game: Game): string | null {
  if (game.state === "pre") return null;
  return `${game.away.abbr} ${game.away.score} · ${game.home.abbr} ${game.home.score}`;
}

export async function getBoard(): Promise<Board> {
  const parlays = await listParlays();
  const problems: string[] = [];

  const openEvents = new Set(parlays.flatMap((p) => p.legs.filter((l) => !l.result).map((l) => l.event_id)));

  const slate = new Map<string, Game>();
  if (openEvents.size > 0) {
    try {
      for (const game of (await getScoreboard()).games) slate.set(game.id, game);
    } catch (error) {
      problems.push(`Scoreboard unavailable: ${(error as Error).message}`);
    }
  }

  // Games that haven't kicked off have no box score worth fetching. Anything started,
  // finished, or missing from this week's slate needs the full summary.
  const stats = new Map<string, GameStats>();
  await Promise.all(
    [...openEvents]
      .filter((id) => slate.get(id)?.state !== "pre")
      .map(async (id) => {
        try {
          stats.set(id, isDemoEvent(id) ? demoGameStats(id, new Date()) : await getGameStats(id));
        } catch (error) {
          problems.push(`Stats unavailable for event ${id}: ${(error as Error).message}`);
        }
      }),
  );

  const writes: Promise<void>[] = [];

  const view = parlays.map((parlay): BoardParlay => {
    const legs = parlay.legs.map((leg): BoardLeg => {
      const def = isStatKey(leg.stat) ? STATS[leg.stat] : null;
      const base = {
        id: leg.id,
        playerName: leg.player_name,
        headshot: headshotUrl(leg.athlete_id),
        team: leg.team_abbr,
        position: leg.player_position,
        statShort: def?.short ?? leg.stat,
        statLabel: def?.label ?? leg.stat,
        direction: leg.direction,
        line: Number(leg.line),
      };

      if (leg.result) {
        return {
          ...base,
          value: Number(leg.final_value ?? 0),
          status: leg.result,
          game: { label: leg.game_label, date: leg.game_date, state: "post", detail: "Final", score: null },
        };
      }

      const gameStats = stats.get(leg.event_id);
      const game = gameStats?.game ?? slate.get(leg.event_id);
      if (!game || !def) {
        return {
          ...base,
          value: 0,
          status: "pending",
          game: { label: leg.game_label, date: leg.game_date, state: "pre", detail: game ? "Unknown market" : "No data", score: null },
        };
      }

      // A player with no box-score row yet simply hasn't recorded a stat.
      const value = def.value(gameStats?.players[leg.athlete_id]?.line ?? EMPTY_LINE);
      const status = gradeLeg({ direction: leg.direction, line: base.line, value, state: game.state, monotonic: def.monotonic });

      if (game.state === "post" && gameStats && status !== "pending" && status !== "live") {
        writes.push(settleLegQuietly(leg, value, status, problems));
      }

      return {
        ...base,
        value,
        status,
        game: { label: game.label, date: game.date, state: game.state, detail: game.detail, score: score(game) },
      };
    });

    const graded = gradeParlay(legs.map((l) => l.status));
    const markedLost = parlay.marked_lost_at !== null;
    // A hand-written-off slip reads as lost, but its legs keep updating and the stored result
    // still records what the box score eventually says.
    const status = markedLost ? "lost" : graded;
    const allFinal = legs.length > 0 && legs.every((l) => l.game.state === "post" && l.status !== "pending" && l.status !== "live");
    if (!parlay.result && allFinal && graded !== "pending" && graded !== "live") {
      writes.push(settleParlay(parlay.id, graded).catch((error) => void problems.push(`Could not settle parlay: ${error.message}`)));
    }

    // numeric columns come back from PostgREST as numbers, but guard against strings anyway.
    const wager = parlay.wager === null ? null : Number(parlay.wager);
    const multiplier = parlay.multiplier === null ? null : Number(parlay.multiplier);
    const payout =
      parlay.payout !== null
        ? Number(parlay.payout)
        : wager !== null
          ? impliedPayout(wager, { odds: parlay.odds, multiplier })
          : null;

    return {
      id: parlay.id,
      name: parlay.name,
      notes: parlay.notes,
      createdAt: parlay.created_at,
      markedLost,
      wager,
      odds: parlay.odds,
      multiplier,
      payout,
      payoutEntered: parlay.payout !== null,
      labels: { human: parlay.by_human, model: parlay.by_model, mock: parlay.is_mock },
      status,
      legs,
    };
  });

  await Promise.all(writes);

  return {
    parlays: view,
    anyLive: view.some((p) => p.legs.some((l) => l.game.state === "in")),
    problems,
    fetchedAt: new Date().toISOString(),
  };
}

async function settleLegQuietly(leg: LegRow, value: number, status: "hit" | "lost" | "push", problems: string[]) {
  try {
    await settleLeg(leg.id, value, status);
  } catch (error) {
    problems.push(`Could not settle ${leg.player_name}: ${(error as Error).message}`);
  }
}
