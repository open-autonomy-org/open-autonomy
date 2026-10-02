// The deployment's audience: who the engine shows to, where the constitution's "public" means that audience. Private
// is the engine's default: with no AUDIENCE named, nobody is in it, and a project is read only through its own key
// or a roster seat. The platform names `public`. A private deployment behind Cloudflare Access names `access`, and a
// request is in the audience when it carries Access's signed assertion for this application, verified here, so a
// path Access bypasses (the keyed doors) admits nobody by a header alone.
import { fromBase64url } from './http.js';
import type { Env } from './types.js';

type Jwk = JsonWebKey & { kid?: string };
let certs: { team: string; at: number; keys: Jwk[] } | undefined;
const CERTS_TTL_MS = 60 * 60 * 1000;

async function keysOf(team: string, kid: string): Promise<Jwk | undefined> {
  const fresh = certs && certs.team === team && Date.now() - certs.at < CERTS_TTL_MS;
  if (!fresh || !certs!.keys.some((k) => k.kid === kid)) {
    const res = await fetch(`https://${team}/cdn-cgi/access/certs`).catch(() => undefined);
    if (!res?.ok) return undefined;
    const body = await res.json().catch(() => ({})) as { keys?: Jwk[] };
    certs = { team, at: Date.now(), keys: Array.isArray(body.keys) ? body.keys : [] };
  }
  return certs!.keys.find((k) => k.kid === kid);
}

const text = (b: Uint8Array): string => new TextDecoder().decode(b);
async function accessAdmits(req: Request, env: Env): Promise<boolean> {
  const team = env.ACCESS_TEAM_DOMAIN?.trim();
  const aud = env.ACCESS_AUD?.trim();
  // Access sets the header on the paths it guards; the browser carries the same token in Access's cookie to the paths
  // it bypasses (the dashboard's live reads under /v1), and either is believed only once its signature is.
  const cookie = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(req.headers.get('cookie') ?? '')?.[1];
  const jwt = req.headers.get('cf-access-jwt-assertion') ?? cookie;
  if (!team || !aud || !jwt) return false;
  const [h, p, s] = jwt.split('.');
  if (!h || !p || !s) return false;
  try {
    const header = JSON.parse(text(fromBase64url(h))) as { alg?: string; kid?: string };
    const claims = JSON.parse(text(fromBase64url(p))) as { aud?: string | string[]; iss?: string; exp?: number; nbf?: number };
    if (header.alg !== 'RS256' || !header.kid) return false;
    const now = Date.now() / 1000;
    if (claims.iss !== `https://${team}` || typeof claims.exp !== 'number' || claims.exp <= now || (claims.nbf ?? 0) > now + 60) return false;
    if (!(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(aud)) return false;
    const jwk = await keysOf(team, header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, fromBase64url(s), new TextEncoder().encode(`${h}.${p}`));
  } catch {
    return false;
  }
}

/** Whether this request's viewer is in the deployment's audience. Anything but a recognized AUDIENCE admits nobody. */
export async function inAudience(req: Request, env: Env): Promise<boolean> {
  const audience = env.AUDIENCE?.trim();
  if (audience === 'public') return true;
  if (audience === 'access') return accessAdmits(req, env);
  return false;
}
