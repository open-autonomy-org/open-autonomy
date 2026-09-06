import { base64url, constantTimeEqual, fromBase64url, hmac } from './http.js';
import { grantsAccount, type Env } from './types.js';

// GitHub OAuth for the human giving page. Its short-lived cookie carries only the verified login,
// expiry and whether that login administered the org grants pool when they signed in — never an API key.

const SESSION_COOKIE = 'oa_give_session';
const STATE_COOKIE = 'oa_give_state';
const SESSION_SECONDS = 8 * 60 * 60;
const STATE_SECONDS = 10 * 60;

export interface GiveSession { login: string; exp: number; grants_admin: boolean }

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

export async function beginGiveLogin(req: Request, env: Env): Promise<Response> {
  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET || !env.GIVE_SESSION_HMAC_SECRET) return new Response('GitHub sign-in is not configured.', { status: 503 });
  const state = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + STATE_SECONDS;
  const target = new URL('/login/oauth/authorize', oauthBase(env));
  target.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID);
  target.searchParams.set('redirect_uri', new URL('/give/callback', req.url).toString());
  target.searchParams.set('state', state);
  return redirect(target.toString(), `${STATE_COOKIE}=${await signPayload(env, { state, exp })}; ${cookieAttrs(req, '/give/callback', STATE_SECONDS)}`);
}

export async function finishGiveLogin(req: Request, env: Env): Promise<Response> {
  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET || !env.GIVE_SESSION_HMAC_SECRET) return new Response('GitHub sign-in is not configured.', { status: 503 });
  const url = new URL(req.url);
  const expected = await verifyPayload<{ state: string; exp: number }>(env, cookieValue(req, STATE_COOKIE));
  const supplied = url.searchParams.get('state') ?? '';
  if (!expected || !supplied || !constantTimeEqual(expected.state, supplied)) return new Response('GitHub sign-in refused: invalid or expired OAuth state.', { status: 401 });
  const redirectUri = new URL('/give/callback', req.url).toString();
  const tokenResponse = await fetch(new URL('/login/oauth/access_token', oauthBase(env)), {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'open-autonomy' },
    body: JSON.stringify({ client_id: env.GITHUB_OAUTH_CLIENT_ID, client_secret: env.GITHUB_OAUTH_CLIENT_SECRET, code: url.searchParams.get('code') ?? '', redirect_uri: redirectUri, scope: '' }),
  });
  const tokenBody = await tokenResponse.json().catch(() => ({})) as { access_token?: string };
  if (!tokenResponse.ok || !tokenBody.access_token) return new Response('GitHub sign-in refused: the authorization code was not accepted.', { status: 401 });
  const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${tokenBody.access_token}`, 'user-agent': 'open-autonomy' };
  const userResponse = await fetch(`${env.GITHUB_API_BASE ?? 'https://api.github.com'}/user`, { headers });
  const user = await userResponse.json().catch(() => ({})) as { login?: string };
  const login = user.login?.toLowerCase() ?? '';
  if (!userResponse.ok || !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(login)) return new Response('GitHub sign-in refused: no verified login was returned.', { status: 401 });
  // A scope-free OAuth token proves identity but cannot read organization roles. The platform's
  // server-side GitHub credential performs that separate check; without one the pool stays hidden.
  const org = grantsAccount(env).split('/')[0];
  const membershipResponse = env.GITHUB_TOKEN ? await fetch(`${env.GITHUB_API_BASE ?? 'https://api.github.com'}/orgs/${encodeURIComponent(org)}/memberships/${encodeURIComponent(login)}`, {
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${env.GITHUB_TOKEN}`, 'user-agent': 'open-autonomy' },
  }) : undefined;
  const membership = await membershipResponse?.json().catch(() => ({})) as { role?: string; state?: string } | undefined;
  const session: GiveSession = { login, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, grants_admin: Boolean(membershipResponse?.ok && membership?.role === 'admin' && membership.state === 'active') };
  return redirect(new URL('/give', req.url).toString(), `${SESSION_COOKIE}=${await signPayload(env, session)}; ${cookieAttrs(req, '/give', SESSION_SECONDS)}`);
}

export function endGiveLogin(req: Request): Response {
  return redirect(new URL('/give', req.url).toString(), `${SESSION_COOKIE}=; ${cookieAttrs(req, '/give', 0)}`);
}
