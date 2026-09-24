// What a model call costs, for the two moments the proxy needs it: the up-front RESERVATION (a safe
// ceiling held against the account while the call is in flight) and the SETTLE (the real charge). The
// gateway reports each call's real USD cost on its OpenAI surfaces, and that report (with Merge's fee, when
// it charges one) is the authoritative charge. Its Anthropic surface reports none (Merge's streaming docs:
// "Usage on message_delta has Anthropic's shape and carries no cost field"), so a model's `settle` rates are
// the gateway's own per-token prices, which reproduce its reported cost exactly, and they price that wire's
// tokens; the proxy checks them against every reported cost. A model with no `settle` rates settles an
// unreported call at its reservation rates, which overstate. An unlisted model reserves at a conservative
// per-token ceiling.

export interface ModelPrice {
  input_usd_per_mtok: number;
  output_usd_per_mtok: number;
  cache_write_multiplier?: number;
  cache_read_multiplier?: number;
  /** The gateway's own per-token prices, for a call whose response reports no cost. */
  settle?: SettleRates;
}

export interface SettleRates {
  input_usd_per_mtok: number;
  output_usd_per_mtok: number;
  /** A cached input token's price; absent, a cached token costs an input token's. */
  cache_read_usd_per_mtok?: number;
  /** A cache-writing input token's price; absent, an input token's. */
  cache_write_usd_per_mtok?: number;
}

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  /** The OpenAI surfaces count cached tokens inside the input (`prompt_tokens_details.cached_tokens`). */
  cached_prompt_tokens?: number;
  cost_usd?: number;
  /** Merge's fee on top of `cost_usd` (`routing.merge_fee_usd`), once it charges one. */
  fee_usd?: number;
}

// The output-token ceiling the proxy reserves against. A reservation bound, not a product limit: a
// reasoning turn spends its budget on reasoning before any visible text, and a low ceiling comes back
// finish_reason=length with no text, which kills a run after the harness's continuation attempts.
export const MAX_OUTPUT_TOKENS = 65_536;

// Reservation prices for the models the kit runs by default, and their `settle` rates: the gateway's prices,
// measured against its own reported costs on 2026-09-24 (4,427 input and 3 output tokens reported $6.6555e-5;
// 17 and 8, $6.55e-7; 11 input, 4,416 cached and 3 output, $1.3563e-5, each exactly these rates).
// Production can extend or override this table with MODEL_PRICES_JSON.
export const MODEL_PRICES: Record<string, ModelPrice> = {
  'zai/glm-5.3-flash': {
    input_usd_per_mtok: 0.5, output_usd_per_mtok: 1.5,
    settle: { input_usd_per_mtok: 0.015, output_usd_per_mtok: 0.05, cache_read_usd_per_mtok: 0.003 },
  },
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

// The charge, in fractional US cents. A reported cost wins (with Merge's fee); otherwise the gateway's own
// per-token prices (`settle`); otherwise token counts against the reservation table.
// Never rounded per request: a flash-class call costs a fraction of a cent and an agent fires thousands,
// so a whole-cent floor would over-count real spend several times over. Rounding happens at display.
export function settleCents(price: ModelPrice, usage: TokenUsage, fallbackCents: number): number {
  const fee = usage.fee_usd !== undefined && Number.isFinite(usage.fee_usd) && usage.fee_usd >= 0 ? usage.fee_usd : 0;
  if (usage.cost_usd !== undefined && Number.isFinite(usage.cost_usd) && usage.cost_usd >= 0) return Number(((usage.cost_usd + fee) * 100).toFixed(6));
  const hasUsage = usage.input_tokens !== undefined || usage.output_tokens !== undefined;
  if (!hasUsage) return fallbackCents;
  if (price.settle) return Math.max(0, Number(((gatewayUsd(price.settle, usage) + fee) * 100).toFixed(6)));
  const inputUsd = ((usage.input_tokens ?? 0) / 1_000_000) * price.input_usd_per_mtok;
  const outputUsd = ((usage.output_tokens ?? 0) / 1_000_000) * price.output_usd_per_mtok;
  const cacheWriteUsd = ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * price.input_usd_per_mtok * (price.cache_write_multiplier ?? 1);
  const cacheReadUsd = ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * price.input_usd_per_mtok * (price.cache_read_multiplier ?? 1);
  return Math.max(0, Number(((inputUsd + outputUsd + cacheWriteUsd + cacheReadUsd) * 100).toFixed(6)));
}

/** What the gateway charges for these tokens at its own per-token prices, in USD. */
export function gatewayUsd(rates: SettleRates, usage: TokenUsage): number {
  // the OpenAI surfaces count cached tokens inside the input; the Anthropic surface counts them apart
  const cached = usage.cache_read_input_tokens ?? usage.cached_prompt_tokens ?? 0;
  const fresh = Math.max(0, (usage.input_tokens ?? 0) - (usage.cache_read_input_tokens === undefined ? (usage.cached_prompt_tokens ?? 0) : 0));
  const mtok = (tokens: number, rate: number) => (tokens / 1_000_000) * rate;
  return mtok(fresh, rates.input_usd_per_mtok)
    + mtok(cached, rates.cache_read_usd_per_mtok ?? rates.input_usd_per_mtok)
    + mtok(usage.cache_creation_input_tokens ?? 0, rates.cache_write_usd_per_mtok ?? rates.input_usd_per_mtok)
    + mtok(usage.output_tokens ?? 0, rates.output_usd_per_mtok);
}

/**
 * How far a model's `settle` rates are from a cost the gateway reported for the same tokens, as a fraction
 * of that cost; null when there is nothing to compare. The proxy says a drift aloud: the gateway changed a
 * price, and the Anthropic wire's charge must follow.
 */
export function settleDrift(price: ModelPrice, usage: TokenUsage): number | null {
  if (!price.settle || usage.cost_usd === undefined || !(usage.cost_usd > 0)) return null;
  return Math.abs(gatewayUsd(price.settle, usage) - usage.cost_usd) / usage.cost_usd;
}
