import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { Direction } from "./grade";
import { isModel, type SlipLabels } from "./labels";

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
    .update({ ...stake, ...(labels && labelColumns(labels)) })
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
