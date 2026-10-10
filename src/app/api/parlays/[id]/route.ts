import { deleteParlay } from "@/lib/db";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/parlays/[id]">) {
  const { id } = await ctx.params;
  try {
    await deleteParlay(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
