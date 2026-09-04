import { error, json, methodNotAllowed, parseJson } from './errors.js';
import { fetchRepoText } from './github-sync.js';
import { LimitLedgerClient } from './limit-ledger.js';
import { authedClaims, mintFromRequest } from './mint.js';
import { RunBudgetClient } from './run-budget.js';
import { hmac } from './token.js';
import type { Env, RunClaims } from './types.js';

// Self-serve project keys. A project's owner proves control of its repository by committing a claim code
// (derived from the account + the UTC day, so the platform keeps no challenge state) to a well-known file
// at HEAD; the platform reads it back through raw GitHub and mints a standing key for that account. The key
// spends nothing until the account is funded (the balance hard-stop), so the only authority it needs is
// "controls the repo" — which is exactly what the file proves.

export const CLAIM_FILE = '.open-autonomy-claim';
const DEFAULT_MODELS = ['z-ai/glm-5.3-flash'];
// A rotated-away key keeps working this long so a running gateway can pick up the new one on its own time.
export const ROTATE_GRACE_MS = 24 * 3600 * 1000;

export function dayKeyUTC(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function claimCode(env: Env, account: string, day: string): Promise<string> {
  const sig = await hmac(env.AGENT_PROXY_HMAC_SECRET, `claim:${account}:${day}`);
  return `oa-claim-${sig.slice(0, 24)}`;
}

const ACCOUNT_RE = /^[^/\s]+\/[^/\s]+$/;

// GET /v1/keys/challenge?account=owner/repo → the code to commit. Valid today and tomorrow (UTC), so a
// commit that lands near midnight still verifies.
export async function handleKeyChallenge(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed();
  const account = new URL(req.url).searchParams.get('account') ?? '';
  if (!ACCOUNT_RE.test(account)) return error('invalid_account', 400);
  const today = dayKeyUTC();
  const tomorrow = dayKeyUTC(new Date(Date.now() + 86_400_000));
  return json({
    ok: true,
    account,
    file: CLAIM_FILE,
    claim: await claimCode(env, account, today),
    valid_through: `${tomorrow}T23:59:59Z`,
    next: `commit ${CLAIM_FILE} containing the claim to the default branch, then POST /v1/keys/mint {"account":"${account}"}`,
  });
}

// POST /v1/keys/mint {account, models?} → a standing key, if HEAD's claim file carries today's or
// yesterday's code for that account.
export async function handleKeyMint(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed();
  const body = parseJson<{ account?: string; models?: string[] }>(await req.text());
  if (!body || typeof body.account !== 'string' || !ACCOUNT_RE.test(body.account)) return error('invalid_account', 400);
  const models = Array.isArray(body.models) && body.models.length ? body.models : DEFAULT_MODELS;
  if (models.some((m) => typeof m !== 'string' || !m)) return error('invalid_models', 400);
  const account = body.account;
  const found = (await fetchRepoText(env, account, CLAIM_FILE, 256))?.trim();
  if (!found) return error('claim_file_missing', 403);
  const today = dayKeyUTC();
  const yesterday = dayKeyUTC(new Date(Date.now() - 86_400_000));
  const accepted = [await claimCode(env, account, today), await claimCode(env, account, yesterday)];
  if (!accepted.includes(found)) return error('claim_mismatch', 403);
  return mintFromRequest(env, { repo: account, issue: 0, actor: 'hermes', purpose: 'hermes', standing: true, models });
}

// POST /v1/keys/rotate (Authorization: Bearer <current standing key>) → a fresh standing key for the same
// account and models. The old key keeps working for ROTATE_GRACE_MS, then expires.
export async function handleKeyRotate(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed();
  const claims = await authedClaims(req, env);
  if (!claims) return error('auth_failed', 401);
  if (!claims.standing) return error('not_a_standing_key', 403);
  const minted = await mintFromRequest(env, {
    repo: claims.repo, issue: claims.issue, actor: claims.actor, purpose: claims.purpose ?? 'hermes', standing: true, models: claims.models,
  });
  if (!minted.ok) return minted;
  const graceUntil = new Date(Date.now() + ROTATE_GRACE_MS).toISOString();
  await expireRun(env, claims, graceUntil);
  const payload = await minted.json() as { ok: true; run: RunClaims; token: string };
  return json({ ...payload, previous: { run_id: claims.run_id, expires_at: graceUntil } });
}

// Shorten a run's life (both the budget object, which gates each call, and the ledger's slot record).
async function expireRun(env: Env, claims: RunClaims, expiresAt: string): Promise<void> {
  const ms = Date.parse(expiresAt);
  if (Date.parse(claims.expires_at) <= ms) return; // never extend
  await new RunBudgetClient(env.RUNS, claims.run_id).expireAt(expiresAt);
  await new LimitLedgerClient(env.LIMITS).setRunExpiry(claims.run_id, ms);
}
