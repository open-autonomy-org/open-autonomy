import { base64url, constantTimeEqual, error, fromBase64url, hmac, json, methodNotAllowed, modelKey, parseJson } from './http.js';
import { fetchRepoText } from './sync.js';
import { LedgerClient } from './ledger.js';
import { DEFAULT_SCOPES, type Env, type KeyClaims, type KeyScope } from './types.js';

// A project's key. The owner proves control of the repository by committing a claim code (derived from
// the account and the UTC day, so the platform keeps no challenge state) to a well-known file at HEAD; the
// platform reads it back and mints. The key spends nothing until the account is funded (the balance
// hard-stop), so the only authority it needs is "controls the repo", which is exactly what the file proves.
//
// Verification is the signature and the expiry, nothing else: no per-key state has to survive a deploy for
// a key to keep working. The books keep a registry of key ids for listing, revocation and rotation grace;
// a registry entry can only shorten a key's life, never extend it. Rotating the HMAC secret is the one
// thing that invalidates every key at once.

export const CLAIM_FILE = '.open-autonomy-claim';
export const DEFAULT_MODELS = ['zai/glm-5.3-flash'];
// A rotated-away key keeps working this long so a running stack can pick up the new one on its own time.
export const ROTATE_GRACE_MS = 24 * 3600 * 1000;
const SCOPES: KeyScope[] = ['spend', 'narrate', 'steer', 'give'];
const ACCOUNT_RE = /^[^/\s]+\/[^/\s]+$/;
// A funder is a person: `@<github login>` on the books, proven by the claim file in a repository they own.
const FUNDER_RE = /^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i;
const FUNDER_ACCOUNT_RE = /^@[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/;
export const funderAccount = (login: string): string => `@${login.toLowerCase()}`;

export function dayKeyUTC(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function claimCode(env: Env, account: string, day: string): Promise<string> {
  const sig = await hmac(env.AGENT_PROXY_HMAC_SECRET, `claim:${account}:${day}`);
  return `oa-claim-${sig.slice(0, 24)}`;
}

export async function signKey(env: Env, claims: KeyClaims): Promise<string> {
  const payload = base64url(new TextEncoder().encode(JSON.stringify(claims)));
  return `${payload}.${await hmac(env.AGENT_PROXY_HMAC_SECRET, payload)}`;
}

// The claims a presented key carries, if its signature is ours and it has not expired. The books' registry
// (revocation, rotation grace) is consulted by whoever spends or narrates on it (see LedgerClient.keyCheck).
export async function verifyKey(env: Env, token: string | null): Promise<KeyClaims | null> {
  if (!token) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  if (!constantTimeEqual(signature, await hmac(env.AGENT_PROXY_HMAC_SECRET, payload))) return null;
  let claims: KeyClaims;
  try { claims = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as KeyClaims; } catch { return null; }
  // A project's key names owner/repo; a funder's names @login and carries no models (it can only give).
  if (typeof claims.kid !== 'string' || !claims.kid || typeof claims.account !== 'string' || !(ACCOUNT_RE.test(claims.account) || FUNDER_ACCOUNT_RE.test(claims.account))) return null;
  if (!Array.isArray(claims.models) || claims.models.some((m) => typeof m !== 'string' || !m)) return null;
  const giveOnly = Array.isArray(claims.scopes) && claims.scopes.length > 0 && claims.scopes.every((x) => x === 'give');
  if (!claims.models.length && !giveOnly) return null;
  if (claims.scopes !== undefined && (!Array.isArray(claims.scopes) || claims.scopes.some((x) => !SCOPES.includes(x)))) return null;
  if (!(Date.parse(claims.exp) > Date.now())) return null;
  return claims;
}

// The claims behind a request's key, checked against the books' registry. Null when the key is missing,
// forged, expired, revoked, or past its rotation grace.
export async function authedClaims(req: Request, env: Env): Promise<KeyClaims | null> {
  const claims = await verifyKey(env, modelKey(req));
  if (!claims) return null;
  const check = await new LedgerClient(env.LIMITS).keyCheck(claims.kid);
  return check.ok ? claims : null;
}

export async function mintKey(env: Env, account: string, models: string[], scopes: KeyScope[] = DEFAULT_SCOPES): Promise<Response> {
  const ttl = Number(env.KEY_EXPIRES_SECONDS ?? 90 * 24 * 3600);
  const now = Date.now();
  const claims: KeyClaims = { kid: `key_${crypto.randomUUID()}`, account, models, scopes, iat: new Date(now).toISOString(), exp: new Date(now + ttl * 1000).toISOString() };
  const registered = await new LedgerClient(env.LIMITS).keyRegister(claims);
  if (!registered.ok) return error(registered.error ?? 'key_limit_reached', 429, { account });
  return json({ ok: true, key: claims, token: await signKey(env, claims) });
}

// GET /v1/keys/challenge?account=owner/repo → the code to commit. Valid today and tomorrow (UTC), so a
// commit that lands near midnight still verifies.
export async function handleKeyChallenge(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed();
  const url = new URL(req.url);
  const funder = url.searchParams.get('funder');
  if (funder !== null) {
    if (!FUNDER_RE.test(funder)) return error('invalid_funder', 400);
    const tomorrow = dayKeyUTC(new Date(Date.now() + 86_400_000));
    return json({ ok: true, funder: funder.toLowerCase(), file: CLAIM_FILE, claim: await claimCode(env, funderAccount(funder), dayKeyUTC()), valid_through: `${tomorrow}T23:59:59Z`, next: `commit ${CLAIM_FILE} containing the claim to the default branch of a repository you own (${funder}/<repo>), then POST /v1/keys/mint {"funder":"${funder}","repo":"${funder}/<repo>"}` });
  }
  const account = url.searchParams.get('account') ?? '';
  if (!ACCOUNT_RE.test(account)) return error('invalid_account', 400);
  const tomorrow = dayKeyUTC(new Date(Date.now() + 86_400_000));
  return json({
    ok: true,
    account,
    file: CLAIM_FILE,
    claim: await claimCode(env, account, dayKeyUTC()),
    valid_through: `${tomorrow}T23:59:59Z`,
    next: `commit ${CLAIM_FILE} containing the claim to the default branch, then POST /v1/keys/mint {"account":"${account}"}`,
  });
}

// POST /v1/keys/mint {account, models?, scopes?} → a key, if HEAD's claim file carries today's or yesterday's
// code. `scopes: ["steer"]` mints an owner-side driver's key, which can push a roadmap and nothing else.
export async function handleKeyMint(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed();
  const body = parseJson<{ account?: string; models?: string[]; scopes?: KeyScope[]; funder?: string; repo?: string }>(await req.text());
  if (body && typeof body.funder === 'string') {
    // A funder's key: the claim file in a repository the login owns proves the login; the key only gives.
    if (!FUNDER_RE.test(body.funder) || typeof body.repo !== 'string' || !ACCOUNT_RE.test(body.repo)) return error('invalid_funder', 400);
    if (body.repo.split('/')[0].toLowerCase() !== body.funder.toLowerCase()) return error('repo_not_owned', 403);
    const found = (await fetchRepoText(env, body.repo, CLAIM_FILE, 256))?.trim();
    if (!found) return error('claim_file_missing', 403);
    const account = funderAccount(body.funder);
    const accepted = [await claimCode(env, account, dayKeyUTC()), await claimCode(env, account, dayKeyUTC(new Date(Date.now() - 86_400_000)))];
    if (!accepted.includes(found)) return error('claim_mismatch', 403);
    return mintKey(env, account, [], ['give']);
  }
  if (!body || typeof body.account !== 'string' || !ACCOUNT_RE.test(body.account)) return error('invalid_account', 400);
  const models = Array.isArray(body.models) && body.models.length ? body.models : DEFAULT_MODELS;
  if (models.some((m) => typeof m !== 'string' || !m)) return error('invalid_models', 400);
  const scopes = body.scopes === undefined ? DEFAULT_SCOPES : body.scopes;
  if (!Array.isArray(scopes) || !scopes.length || scopes.some((x) => !SCOPES.includes(x))) return error('invalid_scopes', 400);
  const found = (await fetchRepoText(env, body.account, CLAIM_FILE, 256))?.trim();
  if (!found) return error('claim_file_missing', 403);
  const accepted = [await claimCode(env, body.account, dayKeyUTC()), await claimCode(env, body.account, dayKeyUTC(new Date(Date.now() - 86_400_000)))];
  if (!accepted.includes(found)) return error('claim_mismatch', 403);
  return mintKey(env, body.account, models, scopes);
}

// POST /v1/keys/rotate (Authorization: Bearer <current key>) {grace_seconds?} → a fresh key for the same
// account and models. The old key keeps working for the grace (ROTATE_GRACE_MS unless the caller asks for
// less), then the registry refuses it.
export async function handleKeyRotate(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed();
  const claims = await authedClaims(req, env);
  if (!claims) return error('auth_failed', 401);
  const minted = await mintKey(env, claims.account, claims.models, claims.scopes ?? DEFAULT_SCOPES);
  if (!minted.ok) return minted;
  let graceMs = ROTATE_GRACE_MS;
  try { const body = JSON.parse(await req.text() || '{}') as { grace_seconds?: unknown }; if (typeof body.grace_seconds === 'number' && Number.isFinite(body.grace_seconds)) graceMs = Math.min(ROTATE_GRACE_MS, Math.max(0, body.grace_seconds) * 1000); } catch { /* no body: the full grace */ }
  const graceUntil = new Date(Date.now() + graceMs).toISOString();
  await new LedgerClient(env.LIMITS).keyExpire(claims.kid, graceUntil);
  const payload = await minted.json() as { ok: true; key: KeyClaims; token: string };
  return json({ ...payload, previous: { kid: claims.kid, exp: graceUntil } });
}

// GET /v1/keys (Authorization: Bearer <key>) → the account's keys as the registry lists them; the caller's
// own key sees only its own account.
export async function handleKeyList(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed();
  const claims = await authedClaims(req, env);
  if (!claims) return error('auth_failed', 401);
  return json(await new LedgerClient(env.LIMITS).keys(claims.account));
}
