import { limitsFromEnv } from './config.js';
import { error, json } from './errors.js';
import { LimitLedgerClient } from './limit-ledger.js';
import { RunBudgetClient } from './run-budget.js';
import { extractModelToken, signRunToken, verifyRunToken } from './token.js';
import type { Env, MintRunRequest, RunClaims } from './types.js';

// Minting a run token or a standing key, and resolving the claims behind a presented token. Shared by the
// admin mint route and the self-serve project-key routes (keys.ts).

export async function mintFromRequest(env: Env, body: MintRunRequest): Promise<Response> {
  const validation = validateMint(body);
  if (validation) return validation;

  const maxUsdCents = body.max_usd_cents
    ?? (typeof body.max_usd === 'number' ? Math.round(body.max_usd * 100) : undefined)
    ?? Number(env.DEFAULT_MAX_USD_CENTS ?? 500);
  const maxRequests = body.max_requests ?? Number(env.DEFAULT_MAX_REQUESTS ?? 200);
  // A standing key is a long-lived project key for an always-on agent (e.g. a Hermes daemon): it skips the
  // per-run caps (the budget object ignores max_usd_cents/max_requests for it) and lives ~90 days by
  // default. Spend is still hard-stopped by the account balance and the global daily cap.
  const standing = body.standing === true;
  const expiresSeconds = body.expires_in_seconds
    ?? Number(standing ? env.STANDING_EXPIRES_SECONDS ?? 90 * 24 * 3600 : env.DEFAULT_EXPIRES_SECONDS ?? 7200);
  const limitConfig = limitsFromEnv(env);
  if (!standing) {
    if (maxUsdCents > Number(env.MAX_RUN_USD_CENTS ?? 500)) return error('run_spend_cap_too_high', 400);
    if (maxRequests > Number(env.MAX_RUN_REQUESTS ?? 200)) return error('run_request_cap_too_high', 400);
  }

  const runId = body.run_id ?? `run_${crypto.randomUUID()}`;
  const claims: RunClaims = {
    run_id: runId,
    repo: body.repo,
    issue: body.issue,
    actor: body.actor,
    max_usd_cents: maxUsdCents,
    max_requests: maxRequests,
    models: body.models,
    expires_at: new Date(Date.now() + expiresSeconds * 1000).toISOString(),
    purpose: body.purpose ?? 'agent',
    standing: standing || undefined,
    github_run_id: body.github_run_id,
    github_run_attempt: body.github_run_attempt,
    github_workflow_ref: body.github_workflow_ref,
  };

  const runInit = await new RunBudgetClient(env.RUNS, runId).init(claims);
  if (!runInit.ok) return error(runInit.error, 409);

  const ledger = await new LimitLedgerClient(env.LIMITS).register(claims, limitConfig);
  if (!ledger.ok) {
    await new RunBudgetClient(env.RUNS, runId).revoke();
    return error(ledger.error, 429);
  }

  const token = await signRunToken(env, claims);
  return json({ ok: true, run: claims, token });
}

function validateMint(body: MintRunRequest): Response | null {
  if (!body || typeof body !== 'object') return error('invalid_request');
  if (!body.repo || !/^[^/\s]+\/[^/\s]+$/.test(body.repo)) return error('invalid_repo');
  if (!Number.isInteger(body.issue) || body.issue < 0) return error('invalid_issue');
  if (!body.actor || typeof body.actor !== 'string') return error('invalid_actor');
  if (!Array.isArray(body.models) || body.models.length === 0 || body.models.some((m) => typeof m !== 'string' || !m)) {
    return error('invalid_models');
  }
  if (body.max_usd_cents !== undefined && (!Number.isInteger(body.max_usd_cents) || body.max_usd_cents <= 0)) {
    return error('invalid_max_usd_cents');
  }
  if (body.max_requests !== undefined && (!Number.isInteger(body.max_requests) || body.max_requests <= 0)) {
    return error('invalid_max_requests');
  }
  if (body.expires_in_seconds !== undefined && (!Number.isInteger(body.expires_in_seconds) || body.expires_in_seconds <= 0)) {
    return error('invalid_expires_in_seconds');
  }
  if (body.standing !== undefined && typeof body.standing !== 'boolean') return error('invalid_standing');
  if (body.github_run_id !== undefined && typeof body.github_run_id !== 'string') return error('invalid_github_run_id');
  if (body.github_run_attempt !== undefined && typeof body.github_run_attempt !== 'string') return error('invalid_github_run_attempt');
  if (body.github_workflow_ref !== undefined && typeof body.github_workflow_ref !== 'string') return error('invalid_github_workflow_ref');
  return null;
}

export async function authedClaims(req: Request, env: Env): Promise<RunClaims | null> {
  const tokenClaims = await verifyRunToken(env, extractModelToken(req));
  if (!tokenClaims) return null;
  const status = await new RunBudgetClient(env.RUNS, tokenClaims.run_id).status() as { revoked?: boolean; claims?: RunClaims | null };
  if (status.revoked || !status.claims) return null;
  if (status.claims.run_id !== tokenClaims.run_id) return null;
  return status.claims;
}

