// Pricing maths, shared by the server and the slip card. A slip is priced either with
// American odds (+450, -120) or with a payout multiple (1.9x), as Underdog does.

export type Price = { odds: number | null; multiplier: number | null };

export function isAmericanOdds(odds: number): boolean {
  return Number.isInteger(odds) && (odds >= 100 || odds <= -100);
}

export function isMultiplier(multiplier: number): boolean {
  return Number.isFinite(multiplier) && multiplier > 1;
}

/** Total returned per dollar staked: +450 and 5.5x are both 5.5. */
export function toMultiplier(price: Price): number | null {
  if (price.multiplier !== null) return price.multiplier;
  if (price.odds === null) return null;
  return price.odds > 0 ? 1 + price.odds / 100 : 1 + 100 / Math.abs(price.odds);
}

/** Total returned on a win, stake included: $10 at +450 pays $55, $10 at 1.9x pays $19. */
export function impliedPayout(wager: number, price: Price): number | null {
  const multiplier = toMultiplier(price);
  return multiplier === null ? null : Math.round(wager * multiplier * 100) / 100;
}

export function formatPrice(price: Price): string | null {
  if (price.multiplier !== null) return `${Number(price.multiplier.toFixed(3))}x`;
  if (price.odds !== null) return price.odds > 0 ? `+${price.odds}` : String(price.odds);
  return null;
}

/**
 * Reads what someone typed into the odds field. "+450", "-120" and "450" are American odds;
 * "1.9x", "1.9" and "3" are multiples. A whole number of 100 or more is taken as American
 * unless it ends in x. Returns null for an empty field and "invalid" for anything else.
 */
export function parsePrice(text: string): Price | null | "invalid" {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === "") return null;

  const explicitMultiple = trimmed.endsWith("x");
  const value = Number(explicitMultiple ? trimmed.slice(0, -1).trim() : trimmed);
  if (!Number.isFinite(value)) return "invalid";

  if (!explicitMultiple && isAmericanOdds(value)) return { odds: value, multiplier: null };
  if (isMultiplier(value) && !trimmed.startsWith("+")) return { odds: null, multiplier: value };
  return "invalid";
}

export function formatMoney(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  });
}
