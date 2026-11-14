/**
 * AI credits: an approximate measure of model spend. The database prices each model call
 * (migration 8, model_prices); this module only formats the figure.
 */
export const USD_PER_CREDIT = 0.01;

/** One decimal under 10 (any use at all shows as at least 0.1), whole numbers above. */
export function formatCredits(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 10) return Math.max(0.1, Math.round(n * 10) / 10).toFixed(1);
  return Math.round(n).toLocaleString("en-GB");
}
