// What a model call costs, for the two moments the proxy needs it: the up-front RESERVATION (a safe
// ceiling held against the account while the call is in flight) and the SETTLE (the real charge). The
// gateway reports each call's real USD cost, and that report is the authoritative charge; the price table
// only right-sizes reservations, so an unlisted model reserves at a conservative per-token ceiling.

export interface ModelPrice {
  input_usd_per_mtok: number;
  output_usd_per_mtok: number;
  cache_write_multiplier?: number;
  cache_read_multiplier?: number;
}

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cost_usd?: number;
}

// The output-token ceiling the proxy reserves against. A reservation bound, not a product limit: a
// reasoning turn spends its budget on reasoning before any visible text, and a low ceiling comes back
// finish_reason=length with no text, which kills a run after the harness's continuation attempts.
export const MAX_OUTPUT_TOKENS = 65_536;

// Reservation prices for the models the kit runs by default (settle still uses the reported cost).
// Production can extend or override this table with MODEL_PRICES_JSON.
export const MODEL_PRICES: Record<string, ModelPrice> = {
  'zai/glm-5.3-flash': { input_usd_per_mtok: 0.5, output_usd_per_mtok: 1.5 },
};

export function priceTable(modelPricesJson?: string): Record<string, ModelPrice> {
  if (!modelPricesJson || modelPricesJson.trim() === '' || modelPricesJson.trim() === '{}') return MODEL_PRICES;
  return { ...MODEL_PRICES, ...(JSON.parse(modelPricesJson) as Record<string, ModelPrice>) };
}

export function reservePrice(reserveUsdPerMtok: number): ModelPrice {
  return { input_usd_per_mtok: reserveUsdPerMtok, output_usd_per_mtok: reserveUsdPerMtok };
}

export function worstCaseCents(price: ModelPrice, outputTokens: number, inputEstimate = 2000): number {
  const inputUsd = (inputEstimate / 1_000_000) * price.input_usd_per_mtok * Math.max(1, price.cache_write_multiplier ?? 1);
  const outputUsd = (outputTokens / 1_000_000) * price.output_usd_per_mtok;
  return Math.max(1, Math.ceil((inputUsd + outputUsd) * 100));
}

export function estimateInputTokensFromBody(bodyText: string): number {
  return Math.max(2000, new TextEncoder().encode(bodyText).byteLength);
}

// The charge, in fractional US cents. A reported cost wins; otherwise token counts against the table.
// Never rounded per request: a flash-class call costs a fraction of a cent and an agent fires thousands,
// so a whole-cent floor would over-count real spend several times over. Rounding happens at display.
export function settleCents(price: ModelPrice, usage: TokenUsage, fallbackCents: number): number {
  if (usage.cost_usd !== undefined && Number.isFinite(usage.cost_usd) && usage.cost_usd >= 0) return Number((usage.cost_usd * 100).toFixed(6));
  const hasUsage = usage.input_tokens !== undefined || usage.output_tokens !== undefined;
  if (!hasUsage) return fallbackCents;
  const inputUsd = ((usage.input_tokens ?? 0) / 1_000_000) * price.input_usd_per_mtok;
  const outputUsd = ((usage.output_tokens ?? 0) / 1_000_000) * price.output_usd_per_mtok;
  const cacheWriteUsd = ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * price.input_usd_per_mtok * (price.cache_write_multiplier ?? 1);
  const cacheReadUsd = ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * price.input_usd_per_mtok * (price.cache_read_multiplier ?? 1);
  return Math.max(0, Number(((inputUsd + outputUsd + cacheWriteUsd + cacheReadUsd) * 100).toFixed(6)));
}
