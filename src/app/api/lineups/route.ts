import { getLineups } from "@/lib/lineups";

export async function GET() {
  try {
    return Response.json(await getLineups());
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
