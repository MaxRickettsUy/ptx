import { deleteParlay, setMarkedLost } from "@/lib/db";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/parlays/[id]">) {
  const { id } = await ctx.params;
  try {
    await deleteParlay(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/parlays/[id]">) {
  const { id } = await ctx.params;
  const body: unknown = await req.json().catch(() => null);
  const markedLost = (body as { markedLost?: unknown } | null)?.markedLost;
  if (typeof markedLost !== "boolean") {
    return Response.json({ error: "Expected a JSON body of { markedLost: boolean }." }, { status: 400 });
  }
  try {
    await setMarkedLost(id, markedLost);
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
