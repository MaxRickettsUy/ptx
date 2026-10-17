import { forgetScoreboards } from "@/lib/espn";
import { getSeasonStats } from "@/lib/season";

async function stats() {
  try {
    return Response.json({ ...(await getSeasonStats()), fetchedAt: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function GET() {
  return stats();
}

/** Refetches every week from ESPN, including finished ones that are otherwise cached for an hour. */
export async function POST() {
  forgetScoreboards();
  return stats();
}
