import type { BoardParlay } from "./board";

export type DayGroup = { key: string; label: string; past: boolean; parlays: BoardParlay[] };

const DAY_MS = 24 * 60 * 60 * 1000;

// Days are the viewer's local calendar days, so a Sunday-night game that kicks off
// after midnight UTC still files under Sunday.
function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localMidnight(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// A slip belongs to the day its first game kicks off, which is when it starts to matter.
function firstGame(parlay: BoardParlay): Date {
  const kickoffs = parlay.legs.map((leg) => Date.parse(leg.game.date)).filter(Number.isFinite);
  return new Date(kickoffs.length > 0 ? Math.min(...kickoffs) : parlay.createdAt);
}

function label(key: string, todayKey: string): string {
  const offset = Math.round((localMidnight(key).getTime() - localMidnight(todayKey).getTime()) / DAY_MS);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return localMidnight(key).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

/** Groups slips by game day: today first, then upcoming days soonest first, then past days latest first. */
export function groupByDay(parlays: BoardParlay[], now: Date): DayGroup[] {
  const todayKey = dayKey(now);
  const byDay = new Map<string, { first: number; parlay: BoardParlay }[]>();
  for (const parlay of parlays) {
    const first = firstGame(parlay);
    const key = dayKey(first);
    byDay.set(key, [...(byDay.get(key) ?? []), { first: first.getTime(), parlay }]);
  }

  const keys = [...byDay.keys()];
  const upcoming = keys.filter((k) => k >= todayKey).sort();
  const past = keys.filter((k) => k < todayKey).sort().reverse();

  return [...upcoming, ...past].map((key) => ({
    key,
    label: label(key, todayKey),
    past: key < todayKey,
    parlays: byDay
      .get(key)!
      .sort((a, b) => a.first - b.first)
      .map((entry) => entry.parlay),
  }));
}
