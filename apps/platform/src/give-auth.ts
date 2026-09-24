import { at, base64url, constantTimeEqual, fromBase64url, grantsAccount, hmac, proposeTeamEdit, type TeamEdit } from '@open-autonomy/backend';
import { resolveIdentity, verifyIdentityToken, type OpenIdMetadata } from '@volter/identity';
import type { Env } from './types.ts';

// Signing in for the human giving page and for every page's viewer (ADR 0011): a Volter identity whose linked GitHub
// account names the person, since the books and the accounts are GitHub logins; GitHub OAuth stays the repository grant
// a team edit asks for. Without a configured identity service the giving page signs in with GitHub alone. Its
// short-lived cookie carries only the verified login and account id, expiry and whether that login administered the
// org grants pool when they signed in — never an API key.

const SESSION_COOKIE = 'oa_give_session';
const STATE_COOKIE = 'oa_give_state';
const SESSION_SECONDS = 8 * 60 * 60;
const STATE_SECONDS = 10 * 60;

export interface GiveSession { login: string; id?: string; exp: number; grants_admin: boolean }

const oauthBase = (env: Env): string => env.GITHUB_OAUTH_BASE ?? 'https://github.com';
const cookieValue = (req: Request, name: string): string | undefined => req.headers.get('cookie')?.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${name}=`))?.slice(name.length + 1);
const cookieAttrs = (req: Request, path: string, seconds: number): string => `Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${seconds}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
const redirect = (location: string, cookie?: string): Response => new Response(null, { status: 302, headers: { location, ...(cookie ? { 'set-cookie': cookie } : {}) } });

async function signPayload(env: Env, payload: object): Promise<string> {
  if (!env.GIVE_SESSION_HMAC_SECRET) throw new Error('GIVE_SESSION_HMAC_SECRET is required');
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await hmac(env.GIVE_SESSION_HMAC_SECRET, body)}`;
}

async function verifyPayload<T extends { exp?: unknown }>(env: Env, token: string | undefined): Promise<T | undefined> {
  if (!token || !env.GIVE_SESSION_HMAC_SECRET) return undefined;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra || !constantTimeEqual(signature, await hmac(env.GIVE_SESSION_HMAC_SECRET, body))) return undefined;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as T;
    return typeof parsed.exp === 'number' && parsed.exp > Math.floor(Date.now() / 1000) ? parsed : undefined;
  } catch { return undefined; }
}

export async function giveSession(req: Request, env: Env): Promise<GiveSession | undefined> {
  const session = await verifyPayload<GiveSession>(env, cookieValue(req, SESSION_COOKIE));
  return session && /^[a-z\d](?:[a-z\d-]{0,38})$/i.test(session.login) && typeof session.grants_admin === 'boolean' ? session : undefined;
}

// `next` is where the sign-in returns: a path on this deployment, never elsewhere. Resolved the way a browser
// resolves it (a backslash is a slash to a WHATWG parser, dot segments collapse), kept only when the origin is
// this one, and handed on as the resolved absolute URL itself so nothing is resolved a second time; the same check
// reads it back from the signed state, where it is already absolute. The origin comparison is the whole rule.
export const safeNext = (next: string | null | undefined, base: string): string | undefined => {
  if (!next || /\s/.test(next)) return undefined;
  try { const u = new URL(next, base); return u.origin === new URL(base).origin ? u.href : undefined; } catch { return undefined; }
};
const volterConfigured = (env: Env): boolean => Boolean(env.VOLTER_ISSUER && env.VOLTER_CLIENT_ID && env.VOLTER_CLIENT_SECRET && env.GIVE_SESSION_HMAC_SECRET);
// The issuer's metadata, checked to name the configured issuer and cached per isolate; a cached failure is asked again.
const discovery = async (env: Env): Promise<OpenIdMetadata> => {
  const known = await resolveIdentity(env.VOLTER_ISSUER);
  const identity = known.available ? known : await resolveIdentity(env.VOLTER_ISSUER, { fresh: true });
  if (!identity.available) throw new Error(identity.reason);
  return identity.metadata;
};
const pkceChallenge = async (verifier: string): Promise<string> => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

/** Sign-in with Volter: the authorization code with PKCE, the verifier kept in the signed state cookie. */
async function beginVolterLogin(req: Request, env: Env, next?: string): Promise<Response> {
  const state = crypto.randomUUID();
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const exp = Math.floor(Date.now() / 1000) + STATE_SECONDS;
  let endpoints: { authorization_endpoint: string };
  try { endpoints = await discovery(env); } catch (e) { return new Response(`Volter sign-in is unavailable: ${(e as Error).message}`, { status: 503 }); }
  const target = new URL(endpoints.authorization_endpoint);
  target.search = new URLSearchParams({
    client_id: env.VOLTER_CLIENT_ID!, response_type: 'code', redirect_uri: new URL('/give/callback', req.url).toString(),
    scope: 'openid profile', state, code_challenge: await pkceChallenge(verifier), code_challenge_method: 'S256',
  }).toString();
  const back = safeNext(next, req.url);
  const payload = await signPayload(env, { state, exp, volter: verifier, ...(back ? { next: back } : {}) });
  return redirect(target.toString(), `${STATE_COOKIE}=${payload}; ${cookieAttrs(req, '/give/callback', STATE_SECONDS)}`);
}

/** Volter's answer: the code traded with this client's secret, the id token verified, the linked GitHub account the person.
 *  The account is keyed by its GitHub id; the token's login is what the identity service recorded and a login can be
 *  renamed and re-registered, so the current login (which the books and the grants-pool check name) is read from GitHub. */
async function finishVolterLogin(req: Request, env: Env, verifier: string): Promise<{ login: string; id?: string } | Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  if (!code) return new Response('Volter sign-in did not complete.', { status: 401 });
  let endpoints: { token_endpoint: string };
  try { endpoints = await discovery(env); } catch (e) { return new Response(`Volter sign-in is unavailable: ${(e as Error).message}`, { status: 503 }); }
  const tokenResponse = await fetch(endpoints.token_endpoint, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: new URL('/give/callback', req.url).toString(), client_id: env.VOLTER_CLIENT_ID!, client_secret: env.VOLTER_CLIENT_SECRET! }).toString(),
  });
  const tokens = await tokenResponse.json().catch(() => ({})) as { id_token?: string };
  if (!tokenResponse.ok || !tokens.id_token) return new Response('Volter sign-in refused: the authorization code was not accepted.', { status: 401 });
  let person;
  try { person = await verifyIdentityToken(tokens.id_token, { issuer: env.VOLTER_ISSUER!, audience: env.VOLTER_CLIENT_ID! }); }
  catch { return new Response('Volter sign-in refused: the identity token did not verify.', { status: 401 }); }
  // Funders and accounts are GitHub logins on the public books, so a person gives through their linked GitHub account.
  const id = Number(person.githubId);
  if (!person.githubId || !Number.isSafeInteger(id)) return new Response('Link a GitHub account to your Volter account at id.volter.ai to give: the books name funders by their GitHub login.', { status: 403 });
  // Read as the platform, never anonymously: a Worker shares its egress addresses, and GitHub's anonymous limit is per
  // address. The platform's token when it has one, else its OAuth app's own credentials, which GitHub rates per app.
  const asPlatform = env.GITHUB_TOKEN ? `Bearer ${env.GITHUB_TOKEN}`
    : env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET ? `Basic ${btoa(`${env.GITHUB_OAUTH_CLIENT_ID}:${env.GITHUB_OAUTH_CLIENT_SECRET}`)}` : undefined;
  const userResponse = await fetch(`${env.GITHUB_API_BASE ?? 'https://api.github.com'}/user/${id}`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'open-autonomy', ...(asPlatform ? { authorization: asPlatform } : {}) },
  });
  const user = await userResponse.json().catch(() => ({})) as { login?: string; id?: number };
  const login = user.login?.toLowerCase() ?? '';
  if (!userResponse.ok || user.id !== id || !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(login)) return new Response(`Volter sign-in refused: GitHub answered ${userResponse.status} for the linked account.`, { status: 502 });
  return { login, id: String(id) };
}

export async function beginGiveLogin(req: Request, env: Env, team?: TeamEdit, next?: string): Promise<Response> {
  // A team edit is a pull request under the person's own GitHub grant; plain sign-in is Volter's when it is configured.
  if (!team && volterConfigured(env)) return beginVolterLogin(req, env, next);
  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET || !env.GIVE_SESSION_HMAC_SECRET) return new Response('GitHub sign-in is not configured.', { status: 503 });
  const state = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + STATE_SECONDS;
  const target = new URL('/login/oauth/authorize', oauthBase(env));
  target.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID);
  target.searchParams.set('redirect_uri', new URL('/give/callback', req.url).toString());
  target.searchParams.set('state', state);
  if (team) target.searchParams.set('scope', 'public_repo');
  const back = safeNext(next, req.url);
  const payload = await signPayload(env, { state, exp, ...(team ? { team } : {}), ...(back ? { next: back } : {}) });
  if (payload.length > 3800) return new Response('This team edit is too large. Shorten the source note and try again.', { status: 400 });
  return redirect(target.toString(), `${STATE_COOKIE}=${payload}; ${cookieAttrs(req, '/give/callback', STATE_SECONDS)}`);
}

export async function finishGiveLogin(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const expected = await verifyPayload<{ state: string; exp: number; team?: TeamEdit; next?: string; volter?: string }>(env, cookieValue(req, STATE_COOKIE));
  const supplied = url.searchParams.get('state') ?? '';
  if (!expected || !supplied || !constantTimeEqual(expected.state, supplied)) return new Response('Sign-in refused: invalid or expired OAuth state.', { status: 401 });
  if (expected.volter) {
    if (!volterConfigured(env)) return new Response('Volter sign-in is not configured.', { status: 503 });
    const person = await finishVolterLogin(req, env, expected.volter);
    if (person instanceof Response) return person;
    return grantSession(req, env, person.login, person.id, expected.next);
  }
  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET) return new Response('GitHub sign-in is not configured.', { status: 503 });
  const redirectUri = new URL('/give/callback', req.url).toString();
  const tokenResponse = await fetch(new URL('/login/oauth/access_token', oauthBase(env)), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'open-autonomy' },
    body: JSON.stringify({ client_id: env.GITHUB_OAUTH_CLIENT_ID, client_secret: env.GITHUB_OAUTH_CLIENT_SECRET, code: url.searchParams.get('code') ?? '', redirect_uri: redirectUri, ...(!expected.team ? { scope: '' } : {}) }),
  });
  const tokenBody = await tokenResponse.json().catch(() => ({})) as { access_token?: string };
  if (!tokenResponse.ok || !tokenBody.access_token) return new Response('GitHub sign-in refused: the authorization code was not accepted.', { status: 401 });
  const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${tokenBody.access_token}`, 'user-agent': 'open-autonomy' };
  const userResponse = await fetch(`${env.GITHUB_API_BASE ?? 'https://api.github.com'}/user`, { headers });
  const user = await userResponse.json().catch(() => ({})) as { login?: string; id?: number; type?: string };
  const login = user.login?.toLowerCase() ?? '';
  if (!userResponse.ok || !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(login)) return new Response('GitHub sign-in refused: no verified login was returned.', { status: 401 });
  if (expected.team) {
    const headers = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'content-type': 'text/plain; charset=utf-8', 'set-cookie': `${STATE_COOKIE}=; ${cookieAttrs(req, '/give/callback', 0)}` };
    if (user.type !== 'User' || !Number.isSafeInteger(user.id)) return new Response('Team edit refused: GitHub did not verify a human account ID.', { status: 401, headers });
    try {
      const location = await proposeTeamEdit(env, expected.team, tokenBody.access_token, { id: String(user.id), login }, expected.state);
      return new Response(null, { status: 302, headers: { ...headers, location } });
    } catch (e) {
      return new Response(`Team change was not completed: ${(e as Error).message}\nReturn to ${at(expected.team.account, 'dashboard', 'team')}. If a branch was created, inspect it before retrying.`, { status: 409, headers });
    }
  }
  return grantSession(req, env, login, Number.isSafeInteger(user.id) ? String(user.id) : undefined, expected.next);
}

/** The signed-in person's session: their login, account id and whether they administer the grants pool. */
async function grantSession(req: Request, env: Env, login: string, id: string | undefined, next: string | undefined): Promise<Response> {
  // The sign-in proves identity but cannot read organization roles. The platform's server-side GitHub
  // credential performs that separate check; without one the pool stays hidden.
  const org = grantsAccount(env).split('/')[0];
  const membershipResponse = env.GITHUB_TOKEN ? await fetch(`${env.GITHUB_API_BASE ?? 'https://api.github.com'}/orgs/${encodeURIComponent(org)}/memberships/${encodeURIComponent(login)}`, {
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${env.GITHUB_TOKEN}`, 'user-agent': 'open-autonomy' },
  }) : undefined;
  const membership = await membershipResponse?.json().catch(() => ({})) as { role?: string; state?: string } | undefined;
  const session: GiveSession = { login, ...(id ? { id } : {}), exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, grants_admin: Boolean(membershipResponse?.ok && membership?.role === 'admin' && membership.state === 'active') };
  const res = redirect(new URL(safeNext(next, req.url) ?? '/give', req.url).toString(), `${SESSION_COOKIE}=${await signPayload(env, session)}; ${cookieAttrs(req, '/', SESSION_SECONDS)}`);
  res.headers.append('set-cookie', `${STATE_COOKIE}=; ${cookieAttrs(req, '/give/callback', 0)}`);
  return res;
}

// Signing out clears the cookie on the site and the one an earlier sign-in set under /give alone.
export function endGiveLogin(req: Request): Response {
  const res = redirect(new URL(safeNext(new URL(req.url).searchParams.get('next'), req.url) ?? '/give', req.url).toString(), `${SESSION_COOKIE}=; ${cookieAttrs(req, '/', 0)}`);
  res.headers.append('set-cookie', `${SESSION_COOKIE}=; ${cookieAttrs(req, '/give', 0)}`);
  return res;
}
