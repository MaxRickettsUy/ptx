import { getSeasonStats } from "@/lib/season";

export async function GET() {
  try {
    return Response.json({ ...(await getSeasonStats()), fetchedAt: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
