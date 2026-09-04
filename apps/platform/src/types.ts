export interface Env {
  AGENT_PROXY_ADMIN_TOKEN: string;
  AGENT_PROXY_HMAC_SECRET: string;
  MODEL_GATEWAY_URL?: string;
  MODEL_GATEWAY_API_KEY?: string;
  MAX_BODY_BYTES?: string;
  MODEL_PRICES_JSON?: string;
  // Worst-case USD/Mtok used only to RESERVE budget for a model with no price-table entry; the charge is
  // trued down to the gateway's reported cost. Conservative default covers frontier models.
  MODEL_GATEWAY_RESERVE_USD_PER_MTOK?: string;
  MAX_GLOBAL_DAILY_USD_CENTS?: string;
  DEFAULT_FUNDING_ACCOUNT?: string;
  DEFAULT_SPONSOR_ACCOUNT?: string;
  GITHUB_SPONSORS_WEBHOOK_SECRET?: string;
  GITHUB_API_BASE?: string;
  GITHUB_RAW_BASE?: string;
  // Optional: raises the GitHub REST rate limit for the docs sync.
  GITHUB_TOKEN?: string;
  // Lifetime of a minted key (default 90 days).
  KEY_EXPIRES_SECONDS?: string;
  // The card rail: Stripe Issuing. Absent → the rail refuses with rail_not_configured.
  STRIPE_API_BASE?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  LIMITS: DurableObjectNamespace;
}

// What a key says about itself. The key is `base64url(claims).hmac`; the signature and `exp` are the whole
// verification, so a key survives every redeploy. The books keep a registry of key ids for listing and
// revocation only, and a rotated key's grace is a registry expiry, never a re-signing.
export interface KeyClaims {
  kid: string;
  account: string;
  models: string[];
  // What the key may do. `spend`: the rails; `narrate`: the development stream; `steer`: push a roadmap
  // revision (an owner-side driver's key, which spends nothing). Absent means spend + narrate.
  scopes?: KeyScope[];
  iat: string;
  exp: string;
}
export type KeyScope = 'spend' | 'narrate' | 'steer';
export const DEFAULT_SCOPES: KeyScope[] = ['spend', 'narrate'];
export const hasScope = (claims: KeyClaims, scope: KeyScope): boolean => (claims.scopes ?? DEFAULT_SCOPES).includes(scope);

// One settled spend, as a rail reports it to the books: a model call, a card authorization captured, a
// partner's charge.
export interface UsageEvent {
  request_id: string;
  rail?: 'model' | 'card' | 'partner';
  model?: string;
  route?: string;
  reserved_usd_cents: number;
  actual_usd_cents: number;
  input_tokens?: number;
  output_tokens?: number;
  // The card rail: who was paid, in which merchant category, on which card; the partner rail: which
  // partner, for what unit and quantity.
  merchant?: string;
  category?: string;
  card_last4?: string;
  partner?: string;
  unit?: string;
  quantity?: number;
  reference?: string;
  outcome: 'ok' | 'metering_error';
}
