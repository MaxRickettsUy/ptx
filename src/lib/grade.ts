export type GameState = "pre" | "in" | "post";
export type Direction = "over" | "under";
export type LegStatus = "pending" | "live" | "hit" | "lost" | "push";
export type ParlayStatus = "pending" | "live" | "won" | "lost" | "push";

export function gradeLeg(input: {
  direction: Direction;
  line: number;
  value: number;
  state: GameState;
  monotonic: boolean;
}): LegStatus {
  const { direction, line, value, state, monotonic } = input;
  if (state === "pre") return "pending";

  if (state === "post") {
    if (value === line) return "push";
    return value > line === (direction === "over") ? "hit" : "lost";
  }

  // Mid-game, only a stat that can't decrease can settle a leg early.
  if (monotonic && value > line) return direction === "over" ? "hit" : "lost";
  return "live";
}

export function gradeParlay(legs: LegStatus[]): ParlayStatus {
  if (legs.length === 0) return "pending";
  if (legs.includes("lost")) return "lost";
  if (legs.every((s) => s === "push")) return "push";
  if (legs.every((s) => s === "hit" || s === "push")) return "won";
  if (legs.every((s) => s === "pending")) return "pending";
  return "live";
}
