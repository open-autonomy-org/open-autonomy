// THE WORKPLACE INTEGRATION (company RFC 0024 B5(1), C7-C8): a project's books shown and acted on in Volter Workplace
// (RH2), its organization's workspace, through an app the workspace installs by consent (RFC 0014's installable apps).
// Workplace reaches nothing here and this reaches nothing inside Workplace: each side speaks the other's public doors.
//
// - The link. The project's owner (a steer key) asks for a link; the answer is the workspace's install page for this
//   deployment's registered app. The workspace's admin consents there, and the workspace sends them back here with a
//   one-time code, which this deployment trades (with the app's client secret) for its token in that organization. The
//   link is kept in the books under the project, with the role its alerts are for.
// - Alerts. The books' own conditions are raised in the workspace as alerts, under stable keys, for the link's role, and
//   cleared there when they end (the condition is read again on every tick): spent out, not yet funded, runway under a
//   third of its goal, a spending limit at 80% or more, a pause asked for and not yet taken, and the org's pause. The
//   workspace shows them in its Inbox and its bot carries them; this side never names a person.
// Absent configuration (WORKPLACE_URL, WORKPLACE_APP_ID, WORKPLACE_CLIENT_ID, WORKPLACE_CLIENT_SECRET), the doors answer
// `workplace_not_configured`, as the card rail does without Stripe.
import { error, hmac, json, methodNotAllowed, parseJson } from './http.js';
import { LedgerClient, LimitLedger, type LedgerCore, type ProjectView } from './ledger.js';
import { standingOf } from './page/parts.js';
import { hasScope, type Env, type KeyClaims } from './types.js';

export interface WorkplaceEnv extends Env {
  WORKPLACE_URL?: string;
  WORKPLACE_APP_ID?: string;
  WORKPLACE_CLIENT_ID?: string;
  WORKPLACE_CLIENT_SECRET?: string;
}

/** What the books keep of one project's link: the organization, the installation's token, the role its alerts are for,
 *  and the alerts raised there that are still standing (so a condition that ends is cleared). */
export interface WorkplaceLink {
  account: string;
  base: string;
  organizationId: string;
  installationId: string;
  principalId: string;
  accessToken: string;
  expiresAt: string;
  role: string;
  linkedAt: string;
  linkedBy: string;
  /** This deployment's address, where the alerts' links point (the clock knows no request). */
  origin: string;
  raised: Record<string, string>;
  lastTick?: { at: string; ok: boolean; note?: string };
}

export interface WorkplaceAlert { key: string; severity: 'info' | 'warning' | 'critical'; reason: string; link: string; }

const ROLE = /^[a-z][a-z0-9-]{0,63}$/;
const STATE_TTL_MS = 30 * 60_000;
const configured = (env: WorkplaceEnv): boolean => Boolean(env.WORKPLACE_URL && env.WORKPLACE_APP_ID && env.WORKPLACE_CLIENT_ID && env.WORKPLACE_CLIENT_SECRET);
const base = (env: WorkplaceEnv): string => String(env.WORKPLACE_URL).replace(/\/+$/, '');

// The books keep links under their own keys in the ledger's storage; the ledger's core knows nothing of them.
LimitLedger.extend({
  async workplace_link_put(core: LedgerCore, body) {
    const link = body.link as WorkplaceLink;
    await core.storage.put(`workplace:${link.account}`, link);
    return { ok: true };
  },
  async workplace_link(core: LedgerCore, body) {
    const link = await core.storage.get<WorkplaceLink>(`workplace:${String(body.account ?? '')}`);
    return { ok: true, link: link ?? null };
  },
  async workplace_links(core: LedgerCore) {
    const links = await core.storage.list<WorkplaceLink>({ prefix: 'workplace:' });
    return { ok: true, links: [...links.values()] };
  },
  async workplace_unlink(core: LedgerCore, body) {
    await core.storage.delete(`workplace:${String(body.account ?? '')}`);
    return { ok: true };
  },
});

export const workplaceLink = async (ledger: LedgerClient, account: string): Promise<WorkplaceLink | null> => (await ledger.call<{ link: WorkplaceLink | null }>('workplace_link', { account })).link;
const putLink = (ledger: LedgerClient, link: WorkplaceLink) => ledger.call<{ ok: true }>('workplace_link_put', { link });

/** The books' conditions as alerts, read from the project's view: the same facts its dashboard's "Needs attention" reads. */
export function workplaceAlertsOf(v: ProjectView, origin: string): WorkplaceAlert[] {
  const books = `${origin}/${v.account}/books`;
  const agent = `${origin}/${v.account}/agent`;
  const out: WorkplaceAlert[] = [];
  const standing = standingOf(v, []);
  const org = v.control?.desired?.from?.slice(1);
  if (standing === 'requested') out.push({ key: 'agent.pause-not-taken', severity: 'warning', reason: `A pause was asked for${org ? ` by ${org}` : ''}; the agent has not reported it paused yet`, link: agent });
  if (org && (standing === 'paused' || standing === 'requested')) out.push({ key: 'agent.org-paused', severity: 'info', reason: `Paused by ${org}: the project runs again when ${org} resumes`, link: agent });
  if (standing === 'exhausted') out.push({ key: 'books.spent-out', severity: 'critical', reason: 'Spending stopped: the balance is spent', link: books });
  if (standing === 'unfunded') out.push({ key: 'books.unfunded', severity: 'info', reason: 'Not yet funded: nothing is spent on the platform until money comes in', link: books });
  const runway = v.runway_days !== null && Number.isFinite(v.runway_days) ? Math.round(v.runway_days) : null;
  if (runway !== null && standing !== 'exhausted' && runway < v.goal_days / 3) out.push({ key: 'books.runway-low', severity: 'warning', reason: `${runway} ${runway === 1 ? 'day' : 'days'} of runway left, under a third of the ${v.goal_days}-day goal`, link: books });
  for (const limit of v.bounds.limits) {
    const used = limit.usd_cents ? limit.used.usd_cents / limit.usd_cents : limit.calls ? limit.used.calls / limit.calls : limit.tokens ? limit.used.tokens / limit.tokens : 0;
    if (used < 0.8) continue;
    const what = limit.usd_cents !== undefined ? `$${(limit.usd_cents / 100).toFixed(2)}` : limit.calls !== undefined ? `${limit.calls}-call` : `${limit.tokens}-token`;
    out.push({ key: `caps.${limit.window}${limit.model ? `.${limit.model.replace(/[^a-z0-9._-]/gi, '-').toLowerCase()}` : ''}`, severity: used >= 1 ? 'critical' : 'warning', reason: `${limit.model ? `${limit.model}: ` : ''}${Math.round(used * 100)}% of the ${what} limit per ${limit.window} is used`, link: books });
  }
  return out;
}

async function workplaceCall<T>(link: WorkplaceLink, path: string, body: unknown): Promise<{ ok: boolean; status: number; data?: T; code?: string }> {
  const response = await fetch(`${link.base}/api/v3/organizations/${encodeURIComponent(link.organizationId)}${path}`, {
    method: 'POST', redirect: 'manual',
    headers: { accept: 'application/json', authorization: `Bearer ${link.accessToken}`, 'content-type': 'application/json', 'x-rh2-organization': link.organizationId },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: { code?: string } };
  return { ok: response.ok, status: response.status, ...(payload.data === undefined ? {} : { data: payload.data }), ...(payload.error?.code ? { code: payload.error.code } : {}) };
}

/** One project's alerts brought in step with its books: each standing condition raised (a repeat is a no-op there), each
 *  one that ended cleared. The keys raised are kept on the link so a condition that ends is cleared, never forgotten. */
export async function syncWorkplaceAlerts(ledger: LedgerClient, link: WorkplaceLink): Promise<WorkplaceLink> {
  const at = new Date().toISOString();
  if (Date.parse(link.expiresAt) <= Date.now()) return { ...link, lastTick: { at, ok: false, note: 'the installation token expired; link the project again' } };
  const v = await ledger.project(link.account);
  if (!v.found) return { ...link, lastTick: { at, ok: false, note: 'the project is not on the books' } };
  const wanted = workplaceAlertsOf(v, link.origin);
  const raised: Record<string, string> = {};
  const failures: string[] = [];
  for (const alert of wanted) {
    const fingerprint = `${alert.severity}|${alert.reason}`;
    if (link.raised[alert.key] === fingerprint) { raised[alert.key] = fingerprint; continue; }
    const answer = await workplaceCall(link, '/alerts', { key: alert.key, severity: alert.severity, reason: alert.reason, link: alert.link, targetRole: link.role });
    if (answer.ok) raised[alert.key] = fingerprint; else failures.push(`${alert.key}: ${answer.code ?? answer.status}`);
  }
  for (const key of Object.keys(link.raised)) {
    if (key in raised || wanted.some((alert) => alert.key === key)) continue;
    const answer = await workplaceCall(link, '/alerts/clear', { key });
    if (!answer.ok) { raised[key] = link.raised[key]!; failures.push(`${key}: ${answer.code ?? answer.status}`); }
  }
  const next = { ...link, raised, lastTick: { at, ok: failures.length === 0, ...(failures.length ? { note: failures.join('; ').slice(0, 300) } : {}) } };
  await putLink(ledger, next);
  return next;
}

/** The deployment's clock for alerts: every quarter hour, beside its other schedules. */
export const WORKPLACE_CRON = '*/15 * * * *';

/** Every linked project's alerts, on the deployment's clock. */
export async function syncAllWorkplaceAlerts(env: WorkplaceEnv): Promise<{ links: number; failed: number }> {
  if (!configured(env)) return { links: 0, failed: 0 };
  const ledger = new LedgerClient(env.LIMITS);
  const { links } = await ledger.call<{ links: WorkplaceLink[] }>('workplace_links');
  let failed = 0;
  for (const link of links) {
    try { if (!(await syncWorkplaceAlerts(ledger, link)).lastTick?.ok) failed++; }
    catch (cause) { failed++; console.error('[workplace] alerts', link.account, cause); }
  }
  return { links: links.length, failed };
}

// The link's round trip carries a signed state: which project, which role, who asked, and when, so the code that comes
// back can only complete the link its owner started.
async function signState(env: WorkplaceEnv, state: Record<string, string>): Promise<string> {
  const payload = btoa(JSON.stringify(state)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${payload}.${await hmac(env.AGENT_PROXY_HMAC_SECRET, `workplace:${payload}`)}`;
}
async function readState(env: WorkplaceEnv, value: string): Promise<Record<string, string> | null> {
  const [payload, signature] = value.split('.');
  if (!payload || !signature || signature !== await hmac(env.AGENT_PROXY_HMAC_SECRET, `workplace:${payload}`)) return null;
  const state = parseJson<Record<string, string>>(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  return state && Date.now() - Date.parse(state.at ?? '') < STATE_TTL_MS ? state : null;
}

/**
 * The doors:
 * - `POST /v1/accounts/:account/workplace/link` (the owner's steer key; `{ "role"? }`): the install page to open.
 * - `GET /workplace/callback?code=&state=`: the workspace's return; the code traded, the link kept.
 * - `GET /v1/accounts/:account/workplace` (steer key): the link as it stands, without its token.
 * - `POST /v1/accounts/:account/workplace/unlink` (steer key): the link forgotten here (the workspace's admin uninstalls there).
 * - `POST /v1/accounts/:account/workplace/sync` (steer key): the alerts brought in step now, not at the next tick.
 */
export async function workplaceRoute(req: Request, env: WorkplaceEnv, url: URL, claims: () => Promise<KeyClaims | null>): Promise<Response | undefined> {
  const path = url.pathname;
  const m = path.match(/^\/v1\/accounts\/([^/]+\/[^/]+)\/workplace(?:\/(link|unlink|sync))?$/);
  if (path !== '/workplace/callback' && !m) return undefined;
  if (!configured(env)) return error('workplace_not_configured', 503);
  const ledger = new LedgerClient(env.LIMITS);
  if (path === '/workplace/callback') {
    if (req.method !== 'GET') return methodNotAllowed();
    const state = await readState(env, url.searchParams.get('state') ?? '');
    const code = url.searchParams.get('code');
    if (!state || !code) return error('invalid_state', 400);
    const exchanged = await fetch(`${base(env)}/api/v3/automation/apps/oauth/access`, { method: 'POST', redirect: 'manual', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ clientId: env.WORKPLACE_CLIENT_ID, clientSecret: env.WORKPLACE_CLIENT_SECRET, code }) });
    const data = (await exchanged.json().catch(() => ({})) as { data?: { accessToken: string; expiresAt: string; installationId: string; organizationId: string; principalId: string } }).data;
    if (!exchanged.ok || !data) return error('workplace_refused_code', 502);
    const link: WorkplaceLink = { account: state.account!, base: base(env), organizationId: data.organizationId, installationId: data.installationId, principalId: data.principalId, accessToken: data.accessToken, expiresAt: data.expiresAt, role: state.role!, linkedAt: new Date().toISOString(), linkedBy: state.by!, origin: url.origin, raised: {} };
    await putLink(ledger, link);
    await syncWorkplaceAlerts(ledger, link).catch((cause) => console.error('[workplace] first sync', cause));
    return Response.redirect(`${base(env)}/console/inbox`, 303);
  }
  const account = decodeURIComponent(m![1]!);
  const who = await claims();
  if (!who || !hasScope(who, 'steer') || who.account.toLowerCase() !== account.toLowerCase()) return error('auth_failed', 401);
  const link = await workplaceLink(ledger, account);
  if (!m![2]) {
    if (req.method !== 'GET') return methodNotAllowed();
    if (!link) return json({ ok: true, linked: false });
    const { accessToken: _token, ...shown } = link;
    return json({ ok: true, linked: true, link: shown });
  }
  if (req.method !== 'POST') return methodNotAllowed();
  if (m![2] === 'unlink') { await ledger.call('workplace_unlink', { account }); return json({ ok: true, linked: false }); }
  if (m![2] === 'sync') {
    if (!link) return error('not_linked', 404);
    const next = await syncWorkplaceAlerts(ledger, link);
    return json({ ok: next.lastTick?.ok ?? false, raised: Object.keys(next.raised), ...(next.lastTick?.note ? { note: next.lastTick.note } : {}) });
  }
  const body = parseJson<{ role?: unknown }>(await req.text()) ?? {};
  const role = typeof body.role === 'string' ? body.role : 'admin';
  if (!ROLE.test(role)) return error('invalid_role', 400);
  const state = await signState(env, { account, role, by: who.kid, at: new Date().toISOString() });
  const install = new URL(`${base(env)}/console/apps/${encodeURIComponent(String(env.WORKPLACE_APP_ID))}/install`);
  install.searchParams.set('redirect_uri', `${url.origin}/workplace/callback`);
  install.searchParams.set('state', state);
  return json({ ok: true, install_url: install.href });
}
