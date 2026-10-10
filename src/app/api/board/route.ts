import { getBoard } from "@/lib/board";

export async function GET() {
  try {
    return Response.json(await getBoard());
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
