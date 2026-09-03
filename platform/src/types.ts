// `gateway` reaches non-first-party models (e.g. DeepSeek) over the model gateway's Anthropic-compatible
// wire, so it shares the `/v1/messages` handler with `anthropic` — only the upstream URL + auth differ.
export type Provider = 'anthropic' | 'openai' | 'gateway';

export interface Env {
  AGENT_PROXY_ADMIN_TOKEN: string;
  AGENT_PROXY_HMAC_SECRET: string;
  MODEL_GATEWAY_URL?: string;
  MODEL_GATEWAY_API_KEY?: string;
  DEFAULT_MAX_USD_CENTS?: string;
  DEFAULT_MAX_REQUESTS?: string;
  DEFAULT_EXPIRES_SECONDS?: string;
  MAX_BODY_BYTES?: string;
  MODEL_PRICES_JSON?: string;
  // Worst-case USD/Mtok used only to RESERVE budget for an the model gateway model with no price-table entry;
  // the charge is trued down to the model gateway's reported cost. Conservative default covers frontier models.
  MODEL_GATEWAY_RESERVE_USD_PER_MTOK?: string;
  MAX_RUN_USD_CENTS?: string;
  MAX_RUN_REQUESTS?: string;
  MAX_ACTIVE_RUNS_GLOBAL?: string;
  MAX_ACTIVE_RUNS_PER_REPO?: string;
  MAX_ACTIVE_RUNS_PER_ACTOR?: string;
  MAX_ACTIVE_RUNS_SYSTEM?: string;
  MAX_RUNS_PER_REPO_PER_DAY?: string;
  MAX_RUNS_PER_ACTOR_PER_DAY?: string;
  MAX_RUNS_PER_ISSUE_PER_DAY?: string;
  MAX_GLOBAL_DAILY_USD_CENTS?: string;
  ENFORCE_ACCOUNT_BALANCE?: string;
  DEFAULT_FUNDING_ACCOUNT?: string;
  DEFAULT_SPONSOR_ACCOUNT?: string;
  GITHUB_SPONSORS_WEBHOOK_SECRET?: string;
  GITHUB_API_BASE?: string;
  // Optional: raises the GitHub REST rate limit for profile sync (metadata, readme image, roadmap issues).
  GITHUB_TOKEN?: string;
  GITHUB_RAW_BASE?: string;
  // Lifetime of a STANDING key (a long-lived project key for an always-on agent such as a Hermes daemon;
  // default 90 days). Standing keys skip the per-run caps and are bounded by the account balance + the
  // global daily cap only.
  STANDING_EXPIRES_SECONDS?: string;
  // Health monitor (detect + surface): how long an org may be silent before it's "down" vs (much longer)
  // "dormant" — the thresholds GET /health classifies by.
  HEALTH_SILENCE_MINUTES?: string;
  HEALTH_DEAD_MINUTES?: string;
  RUNS: DurableObjectNamespace;
  LIMITS: DurableObjectNamespace;
}

export interface RunClaims {
  run_id: string;
  repo: string;
  issue: number;
  actor: string;
  max_usd_cents: number;
  max_requests: number;
  models: string[];
  expires_at: string;
  purpose?: 'triage' | 'agent' | 'review' | 'pm' | 'hermes';
  // A standing key: no per-run spend/request cap (the account balance and the global daily cap still bind).
  // Admin-minted only.
  standing?: boolean;
  github_run_id?: string;
  github_run_attempt?: string;
  github_workflow_ref?: string;
}

export interface MintRunRequest {
  run_id?: string;
  repo: string;
  issue: number;
  actor: string;
  max_usd_cents?: number;
  max_usd?: number;
  max_requests?: number;
  models: string[];
  expires_in_seconds?: number;
  purpose?: 'triage' | 'agent' | 'review' | 'pm' | 'hermes';
  standing?: boolean;
  github_run_id?: string;
  github_run_attempt?: string;
  github_workflow_ref?: string;
}

export interface UsageEvent {
  request_id: string;
  provider: Provider;
  model: string;
  route: string;
  reserved_usd_cents: number;
  actual_usd_cents: number;
  input_tokens?: number;
  output_tokens?: number;
  outcome: 'ok' | 'upstream_error' | 'rejected' | 'metering_error';
  created_at: string;
}
