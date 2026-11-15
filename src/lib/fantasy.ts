// Season-long fantasy scoring: the lineup slots, the scoring presets, and how a box-score line
// turns into fantasy points. Pure functions, shared by the lineups page and the MCP server.

import type { DefenseLine, PlayerLine } from "./stats";

// The presets differ only in what a catch is worth; everything else is the common standard.
export const SCORING = {
  standard: { label: "Standard", reception: 0 },
  half_ppr: { label: "Half PPR", reception: 0.5 },
  ppr: { label: "PPR", reception: 1 },
} as const;

export type ScoringKey = keyof typeof SCORING;

export const SCORING_KEYS = Object.keys(SCORING) as [ScoringKey, ...ScoringKey[]];

export function isScoringKey(value: string): value is ScoringKey {
  return value in SCORING;
}

// Which roster positions can fill each slot. A kicker is PK on ESPN rosters; a fullback plays as a back.
export const SLOTS = {
  QB: { label: "QB", positions: ["QB"] },
  RB: { label: "RB", positions: ["RB", "FB"] },
  WR: { label: "WR", positions: ["WR"] },
  TE: { label: "TE", positions: ["TE"] },
  FLEX: { label: "FLEX", positions: ["RB", "FB", "WR", "TE"] },
  SUPERFLEX: { label: "SFLX", positions: ["QB", "RB", "FB", "WR", "TE"] },
  K: { label: "K", positions: ["K", "PK"] },
  DST: { label: "D/ST", positions: ["DST"] },
  BN: { label: "BN", positions: ["QB", "RB", "FB", "WR", "TE", "K", "PK", "DST"] },
} as const satisfies Record<string, { label: string; positions: readonly string[] }>;

export type SlotKey = keyof typeof SLOTS;

export const SLOT_KEYS = Object.keys(SLOTS) as [SlotKey, ...SlotKey[]];

export function isSlotKey(value: string): value is SlotKey {
  return value in SLOTS;
}

export const canFill = (slot: SlotKey, position: string) => (SLOTS[slot].positions as readonly string[]).includes(position);

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Points for a player's line. Kickers get their kicking points as they stand (3 a field goal,
 * 1 an extra point), since the box score has no per-kick distances. Two-point conversions and
 * return touchdowns aren't in the box score at all, so they score nothing here.
 */
export function playerPoints(line: PlayerLine, scoring: ScoringKey): number {
  return round(
    line.passYds / 25 +
      line.passTd * 4 -
      line.passInt * 2 +
      line.rushYds / 10 +
      line.rushTd * 6 +
      line.rec * SCORING[scoring].reception +
      line.recYds / 10 +
      line.recTd * 6 -
      line.fumLost * 2 +
      line.kickPts,
  );
}

// Fewer points allowed scores more; past 27 it starts to cost.
const POINTS_ALLOWED: [max: number, points: number][] = [
  [0, 5],
  [6, 4],
  [13, 3],
  [17, 1],
  [27, 0],
  [34, -1],
  [45, -3],
];

/** Points for a team defense. Safeties and blocked kicks aren't in the box score, so they score nothing here. */
export function defensePoints(line: DefenseLine): number {
  const allowed = POINTS_ALLOWED.find(([max]) => line.pointsAllowed <= max)?.[1] ?? -5;
  return round(allowed + line.sacks + line.interceptions * 2 + line.fumblesRecovered * 2 + line.touchdowns * 6);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A player's notable numbers in a few words, e.g. "245 pass yds, 2 pass TD, 31 rush yds". */
export function playerSummary(line: PlayerLine): string {
  const parts = [
    line.passAtt > 0 && `${line.passCmp}/${line.passAtt}, ${line.passYds} pass yds`,
    line.passTd > 0 && `${line.passTd} pass TD`,
    line.passInt > 0 && plural(line.passInt, "INT"),
    line.rushAtt > 0 && `${line.rushYds} rush yds`,
    line.rushTd > 0 && `${line.rushTd} rush TD`,
    line.rec > 0 && `${plural(line.rec, "rec")}, ${line.recYds} yds`,
    line.recTd > 0 && `${line.recTd} rec TD`,
    line.fumLost > 0 && plural(line.fumLost, "fumble"),
    line.kickPts > 0 && `${plural(line.fgMade, "FG")}, ${line.kickPts} pts`,
  ];
  return parts.filter(Boolean).join(", ");
}

export function defenseSummary(line: DefenseLine): string {
  const parts = [
    `${line.pointsAllowed} allowed`,
    line.sacks > 0 && plural(line.sacks, "sack"),
    line.interceptions > 0 && plural(line.interceptions, "INT"),
    line.fumblesRecovered > 0 && plural(line.fumblesRecovered, "fum rec", "fum rec"),
    line.touchdowns > 0 && plural(line.touchdowns, "TD"),
  ];
  return parts.filter(Boolean).join(", ");
}
