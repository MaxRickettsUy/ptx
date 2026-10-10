import { deleteParlay, setDetails, setMarkedLost } from "@/lib/db";
import { isAmericanOdds, isMultiplier } from "@/lib/odds";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/parlays/[id]">) {
  const { id } = await ctx.params;
  try {
    await deleteParlay(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

const isAmount = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);

// Accepts either { markedLost } or { wager, odds, multiplier, payout, labels? }; in the second
// form every stake value is sent, with null clearing it. A slip is priced by odds or a
// multiplier, not both. Labels are { human, model, mock } and are left alone when omitted.
export async function PATCH(req: Request, ctx: RouteContext<"/api/parlays/[id]">) {
  const { id } = await ctx.params;
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;

  try {
    if (typeof body.markedLost === "boolean") {
      await setMarkedLost(id, body.markedLost);
      return new Response(null, { status: 204 });
    }

    if ("wager" in body && "odds" in body && "payout" in body) {
      const { wager, odds, payout } = body;
      const multiplier = body.multiplier ?? null;
      if (!isAmount(wager) || !isAmount(payout)) {
        return Response.json({ error: "Wager and payout must be amounts of zero or more." }, { status: 400 });
      }
      if (odds !== null && !(typeof odds === "number" && isAmericanOdds(odds))) {
        return Response.json({ error: "Odds must be American odds such as +450 or -120." }, { status: 400 });
      }
      if (multiplier !== null && !(typeof multiplier === "number" && isMultiplier(multiplier))) {
        return Response.json({ error: "A multiple must be a number above 1, such as 1.9." }, { status: 400 });
      }
      if (odds !== null && multiplier !== null) {
        return Response.json({ error: "Give American odds or a multiple, not both." }, { status: 400 });
      }
      const labels = body.labels as Record<string, unknown> | undefined;
      const flags = labels && [labels.human, labels.model, labels.mock];
      if (flags && !flags.every((flag) => typeof flag === "boolean")) {
        return Response.json({ error: "Labels must be { human, model, mock } booleans." }, { status: 400 });
      }
      await setDetails(
        id,
        { wager, odds, multiplier, payout },
        flags ? { human: flags[0] as boolean, model: flags[1] as boolean, mock: flags[2] as boolean } : undefined,
      );
      return new Response(null, { status: 204 });
    }

    return Response.json({ error: "Expected { markedLost } or { wager, odds, multiplier, payout, labels? }." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
