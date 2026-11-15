import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";
import type { Direction } from "./grade";
import { isModel, type SlipLabels } from "./labels";
import type { Sport } from "./stats";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  return value;
}

let client: ReturnType<typeof createClient<Database>> | undefined;

// The secret key bypasses RLS, so this module is for the Next.js server and the MCP server only.
// Never import it into a client component.
function db() {
  client ??= createClient<Database>(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export type LegRow = {
  id: string;
  parlay_id: string;
  position_in_parlay: number;
  sport: Sport;
  athlete_id: string;
  player_name: string;
  team_abbr: string | null;
  player_position: string | null;
  event_id: string;
  game_label: string;
  game_date: string;
  stat: string;
  direction: Direction;
  line: number;
  period: string;
  final_value: number | null;
  /** What an each-quarter leg finished with in each of the four quarters. */
  quarter_values: number[] | null;
  result: "hit" | "lost" | "push" | null;
};

export type ParlayRow = {
  id: string;
  name: string;
  notes: string | null;
  result: "won" | "lost" | "push" | null;
  settled_at: string | null;
  marked_lost_at: string | null;
  locked_at: string | null;
  wager: number | null;
  odds: number | null;
  multiplier: number | null;
  payout: number | null;
  by_human: boolean;
  model: string | null;
  is_mock: boolean;
  created_at: string;
  legs: LegRow[];
};

export type NewLeg = Omit<LegRow, "id" | "parlay_id" | "position_in_parlay" | "final_value" | "quarter_values" | "result">;

export async function listParlays(): Promise<ParlayRow[]> {
  const { data, error } = await db()
    .from("parlays")
    .select("*, legs(*)")
    .order("created_at", { ascending: false })
    .order("position_in_parlay", { referencedTable: "legs", ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ParlayRow[];
}

export type Stake = { wager: number | null; odds: number | null; multiplier: number | null; payout: number | null };

const labelColumns = (labels: SlipLabels) => ({ by_human: labels.human, model: labels.model, is_mock: labels.mock });

/** The stored model name, or null for one the app no longer knows. */
export const modelOf = (row: ParlayRow) => (isModel(row.model) ? row.model : null);

export async function createParlay(input: {
  name: string;
  notes: string | null;
  legs: NewLeg[];
  stake?: Stake;
  labels?: SlipLabels;
}): Promise<string> {
  const { data, error } = await db()
    .from("parlays")
    .insert({ name: input.name, notes: input.notes, ...input.stake, ...(input.labels && labelColumns(input.labels)) })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const parlayId = data.id;

  const { error: legsError } = await db()
    .from("legs")
    .insert(input.legs.map((leg, i) => ({ ...leg, parlay_id: parlayId, position_in_parlay: i })));
  if (legsError) {
    await db().from("parlays").delete().eq("id", parlayId);
    throw new Error(legsError.message);
  }
  return parlayId;
}

export async function deleteParlay(id: string): Promise<void> {
  const { error } = await db().from("parlays").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Saves what the slip editor holds: the stake, and the labels when they are sent too. */
export async function setDetails(id: string, stake: Stake, labels?: SlipLabels): Promise<void> {
  const { error } = await db()
    .from("parlays")
    // A slip that turns out to be a mock wasn't really placed, so it can't stay locked in.
    .update({ ...stake, ...(labels && labelColumns(labels)), ...(labels?.mock && { locked_at: null }) })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Writes a slip off by hand, or clears that so it follows its legs again. */
export async function setMarkedLost(id: string, markedLost: boolean): Promise<void> {
  const { error } = await db()
    .from("parlays")
    .update({ marked_lost_at: markedLost ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Marks a slip as really placed with a book, or clears that. A locked-in slip is never a mock. */
export async function setLockedIn(id: string, lockedIn: boolean): Promise<void> {
  const { error } = await db()
    .from("parlays")
    .update(lockedIn ? { locked_at: new Date().toISOString(), is_mock: false } : { locked_at: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function settleLeg(
  id: string,
  finalValue: number,
  result: "hit" | "lost" | "push",
  quarterValues: number[] | null = null,
): Promise<void> {
  const { error } = await db()
    .from("legs")
    .update({ final_value: finalValue, quarter_values: quarterValues, result })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function settleParlay(id: string, result: "won" | "lost" | "push"): Promise<void> {
  const { error } = await db()
    .from("parlays")
    .update({ result, settled_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export type LineupPlayerRow = {
  id: string;
  lineup_id: string;
  side: "mine" | "opponent";
  slot: string;
  position_in_lineup: number;
  /** Null for a team defense. */
  athlete_id: string | null;
  player_name: string;
  team_abbr: string;
  player_position: string | null;
  /** Null when the player's team is on bye. */
  event_id: string | null;
  game_label: string | null;
  game_date: string | null;
  final_points: number | null;
  final_stats: unknown;
};

export type LeagueRow = {
  id: string;
  name: string;
  team_name: string;
  scoring: string;
  created_at: string;
};

export type LineupRow = {
  id: string;
  league_id: string;
  season: number;
  week: number;
  opponent_name: string | null;
  notes: string | null;
  points: number | null;
  opponent_points: number | null;
  result: "won" | "lost" | "tie" | null;
  settled_at: string | null;
  created_at: string;
  lineup_players: LineupPlayerRow[];
};

export type NewLineupPlayer = Omit<LineupPlayerRow, "id" | "lineup_id" | "position_in_lineup">;

export async function listLineups(): Promise<LineupRow[]> {
  const { data, error } = await db()
    .from("lineups")
    .select("*, lineup_players(*)")
    .order("season", { ascending: false })
    .order("week", { ascending: false })
    .order("created_at", { ascending: false })
    .order("position_in_lineup", { referencedTable: "lineup_players", ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as LineupRow[];
}

export async function listLeagues(): Promise<LeagueRow[]> {
  const { data, error } = await db().from("leagues").select("*").order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** The league with this name, ignoring case, or null. */
export async function findLeague(name: string): Promise<LeagueRow | null> {
  const leagues = await listLeagues();
  return leagues.find((l) => l.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
}

/** Creates a league, or updates the one with `id`: its name, team name and scoring. */
export async function saveLeague(input: { id?: string; name: string; teamName: string; scoring: string }): Promise<LeagueRow> {
  const fields = { name: input.name.trim(), team_name: input.teamName, scoring: input.scoring };
  const { data, error } = input.id
    ? await db().from("leagues").update(fields).eq("id", input.id).select("*").single()
    : await db().from("leagues").insert(fields).select("*").single();
  if (error) throw new Error(error.code === "23505" ? `There is already a league called "${fields.name}".` : error.message);
  return data;
}

/** Saves a league's lineup for a week, replacing any it already has for that week. */
export async function saveLineup(input: {
  leagueId: string;
  season: number;
  week: number;
  opponentName: string | null;
  notes: string | null;
  players: NewLineupPlayer[];
}): Promise<{ id: string; replaced: boolean }> {
  const { data: old, error: findError } = await db()
    .from("lineups")
    .select("id")
    .eq("league_id", input.leagueId)
    .eq("season", input.season)
    .eq("week", input.week)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (old) await deleteLineup(old.id);

  const { data, error } = await db()
    .from("lineups")
    .insert({
      league_id: input.leagueId,
      season: input.season,
      week: input.week,
      opponent_name: input.opponentName,
      notes: input.notes,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const lineupId = data.id;

  const { error: playersError } = await db()
    .from("lineup_players")
    .insert(input.players.map((player, i) => ({ ...player, final_stats: player.final_stats as Json, lineup_id: lineupId, position_in_lineup: i })));
  if (playersError) {
    await deleteLineup(lineupId);
    throw new Error(playersError.message);
  }
  return { id: lineupId, replaced: old !== null };
}

export async function deleteLineup(id: string): Promise<void> {
  const { error } = await db().from("lineups").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function settleLineupPlayer(id: string, points: number, stats: object): Promise<void> {
  const { error } = await db()
    .from("lineup_players")
    .update({ final_points: points, final_stats: stats as Json })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function settleLineup(
  id: string,
  totals: { points: number; opponentPoints: number | null; result: "won" | "lost" | "tie" | null },
): Promise<void> {
  const { error } = await db()
    .from("lineups")
    .update({ points: totals.points, opponent_points: totals.opponentPoints, result: totals.result, settled_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
