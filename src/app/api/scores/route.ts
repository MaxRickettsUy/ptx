import { getWeekScores } from "@/lib/espn";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("week");
  const week = raw === null ? undefined : Number(raw);
  if (week !== undefined && !(Number.isInteger(week) && week >= 1 && week <= 25)) {
    return Response.json({ error: `"${raw}" isn't a week number.` }, { status: 400 });
  }
  try {
    return Response.json({ ...(await getWeekScores(week)), fetchedAt: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
