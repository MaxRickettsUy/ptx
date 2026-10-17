import { forgetScoreboards, getWeekScores } from "@/lib/espn";

function parseWeek(request: Request): { week?: number; error?: Response } {
  const raw = new URL(request.url).searchParams.get("week");
  if (raw === null) return {};
  const week = Number(raw);
  if (!(Number.isInteger(week) && week >= 1 && week <= 25)) {
    return { error: Response.json({ error: `"${raw}" isn't a week number.` }, { status: 400 }) };
  }
  return { week };
}

async function scores(week?: number) {
  try {
    return Response.json({ ...(await getWeekScores(week)), fetchedAt: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { week, error } = parseWeek(request);
  return error ?? scores(week);
}

/** Refetches the week from ESPN instead of serving the cached copy. */
export async function POST(request: Request) {
  const { week, error } = parseWeek(request);
  if (error) return error;
  forgetScoreboards(week);
  return scores(week);
}
