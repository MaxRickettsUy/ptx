import "server-only";

import { listParlays, settleLeg, settleParlay, type LegRow } from "./db";
import { demoGameStats, demoQuarterStats, isDemoEvent } from "./demo";
import { getGameStats, getQuarterStats, getScoreboard, headshotUrl, type Game, type GameStats, type QuarterStats } from "./espn";
import { gradeLeg, gradeParlay, gradeQuarters, type Direction, type GameState, type LegStatus, type ParlayStatus } from "./grade";
import type { SlipLabels } from "./labels";
import { impliedPayout } from "./odds";
import { EMPTY_LINE, PERIODS, STATS, addLines, isPeriodKey, isStatKey, type PeriodKey } from "./stats";

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
  /** Null for a full-game leg; otherwise the part of the game it covers, e.g. "Each quarter". */
  periodLabel: string | null;
  /** For an each-quarter leg this is the quarter closest to losing it. */
  value: number;
  /** Q1 to Q4, on each-quarter legs only. */
  quarters: { value: number; status: LegStatus }[] | null;
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

  // Quarter-by-quarter numbers come from the play-by-play, a second request, so only fetch
  // them for games with a leg that needs them.
  const quarterEvents = new Set(
    parlays.flatMap((p) => p.legs.filter((l) => !l.result && l.period !== "game").map((l) => l.event_id)),
  );
  const quarterStats = new Map<string, QuarterStats>();
  await Promise.all(
    [...quarterEvents].map(async (id) => {
      const game = stats.get(id)?.game;
      if (!game || game.state === "pre") return;
      try {
        quarterStats.set(id, isDemoEvent(id) ? demoQuarterStats(new Date()) : await getQuarterStats(id, game.state === "post"));
      } catch (error) {
        problems.push(`Quarter stats unavailable for event ${id}: ${(error as Error).message}`);
      }
    }),
  );

  const writes: Promise<void>[] = [];

  const view = parlays.map((parlay): BoardParlay => {
    const legs = parlay.legs.map((leg): BoardLeg => {
      const def = isStatKey(leg.stat) ? STATS[leg.stat] : null;
      const period: PeriodKey = isPeriodKey(leg.period) ? leg.period : "game";
      const line = Number(leg.line);
      const base = {
        id: leg.id,
        playerName: leg.player_name,
        headshot: headshotUrl(leg.athlete_id),
        team: leg.team_abbr,
        position: leg.player_position,
        statShort: def?.short ?? leg.stat,
        statLabel: def?.label ?? leg.stat,
        direction: leg.direction,
        line,
        periodLabel: period === "game" ? null : PERIODS[period].label,
        quarters: null,
      };

      if (leg.result) {
        return {
          ...base,
          value: Number(leg.final_value ?? 0),
          quarters:
            leg.quarter_values?.map((raw) => {
              const value = Number(raw);
              return { value, status: gradeLeg({ direction: leg.direction, line, value, state: "post", monotonic: true }) };
            }) ?? null,
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
      const boxValue = def.value(gameStats?.players[leg.athlete_id]?.line ?? EMPTY_LINE);
      let value = boxValue;
      let status = gradeLeg({ direction: leg.direction, line, value, state: game.state, monotonic: def.monotonic });
      let quarters: BoardLeg["quarters"] = null;
      let settleable = gameStats !== undefined;

      if (period !== "game" && game.state !== "pre") {
        const byQuarter = quarterStats.get(leg.event_id);
        const lines = byQuarter?.players[leg.athlete_id] ?? [];
        const done = byQuarter?.quartersDone ?? 0;
        const inQuarter = (quarter: number) => {
          const quarterValue = def.value(lines[quarter - 1] ?? EMPTY_LINE);
          const state: GameState = quarter <= done ? "post" : quarter === done + 1 ? "in" : "pre";
          return {
            value: quarterValue,
            status: gradeLeg({ direction: leg.direction, line, value: quarterValue, state, monotonic: def.monotonic }),
          };
        };

        if (period === "each_quarter") {
          quarters = [1, 2, 3, 4].map(inQuarter);
          const started = quarters.filter((q) => q.status !== "pending").map((q) => q.value);
          value = started.length === 0 ? 0 : leg.direction === "over" ? Math.min(...started) : Math.max(...started);
          status = gradeQuarters(quarters.map((q) => q.status));
        } else {
          ({ value, status } = inQuarter(PERIODS[period].quarter));
        }

        // The quarters are pieced together from the play-by-play, which can disagree with the
        // official totals. Don't write a result down on numbers that don't add up.
        const total = def.value(addLines(lines));
        if (!byQuarter) {
          settleable = false;
          if (status === "pending") status = "live";
        } else if (game.state === "post" && total !== boxValue) {
          settleable = false;
          problems.push(
            `${leg.player_name}: quarter-by-quarter ${def.label.toLowerCase()} adds up to ${total} but the box score says ${boxValue}, so this leg is not being settled automatically.`,
          );
        }
      }

      if (game.state === "post" && settleable && status !== "pending" && status !== "live") {
        writes.push(settleLegQuietly(leg, value, status, quarters?.map((q) => q.value) ?? null, problems));
      }

      return {
        ...base,
        value,
        quarters,
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

async function settleLegQuietly(
  leg: LegRow,
  value: number,
  status: "hit" | "lost" | "push",
  quarterValues: number[] | null,
  problems: string[],
) {
  try {
    await settleLeg(leg.id, value, status, quarterValues);
  } catch (error) {
    problems.push(`Could not settle ${leg.player_name}: ${(error as Error).message}`);
  }
}
