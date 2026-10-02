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
//   third of its goal, a spending limit at 80% or more, a spending freeze (its own or its org's), a pause asked for and
//   not yet taken, and the org's pause. The
//   workspace shows them in its Inbox and its bot carries them; this side never names a person.
// - Books. Every tick also publishes the project's books to the workspace (its `books` kind: standing, money in and out,
//   balance, burn and runway, earmarks, spending caps and their use, the owner's statements, the daily metered spend),
//   and does the controls asked there: a spending freeze, or lifting it, set on the books as the workspace's act.
// Absent configuration (WORKPLACE_URL, WORKPLACE_APP_ID, WORKPLACE_CLIENT_ID, WORKPLACE_CLIENT_SECRET), the doors answer
// `workplace_not_configured`, as the card rail does without Stripe.
import { error, hmac, json, methodNotAllowed, parseJson } from './http.js';
import { LedgerClient, LimitLedger, type FundingSnapshot, type LedgerCore, type ProjectView } from './ledger.js';
import type { Statement } from '@open-autonomy/sdk/statements';
import { standingOf } from './page/parts.js';
import { hasScope, type Env, type KeyClaims } from './types.js';

export interface WorkplaceEnv extends Env {
  WORKPLACE_URL?: string;
  WORKPLACE_APP_ID?: string;
  WORKPLACE_CLIENT_ID?: string;
  WORKPLACE_CLIENT_SECRET?: string;
}

/** What the books keep of one project's link: the organization, the role its alerts are for, and the alerts raised
 *  there that are still standing (so a condition that ends is cleared). The token is its installation's (below). */
export interface WorkplaceLink {
  account: string;
  base: string;
  organizationId: string;
  installationId: string;
  principalId: string;
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

/** The app's installation in one workspace's organization: one token, shared by every project linked there. A workspace
 *  keeps one installation per organization, and installing again (linking another project) replaces its token. */
export interface WorkplaceInstallation { base: string; organizationId: string; installationId: string; principalId: string; accessToken: string; expiresAt: string }
const installKey = (base: string, organizationId: string): string => `workplace-install:${base}|${organizationId}`;

// The books keep links under their own keys in the ledger's storage; the ledger's core knows nothing of them.
LimitLedger.extend({
  async workplace_install_put(core: LedgerCore, body) {
    const install = body.install as WorkplaceInstallation;
    await core.storage.put(installKey(install.base, install.organizationId), install);
    return { ok: true };
  },
  async workplace_install(core: LedgerCore, body) {
    return { ok: true, install: (await core.storage.get<WorkplaceInstallation>(installKey(String(body.base ?? ''), String(body.organizationId ?? '')))) ?? null };
  },
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
  async workplace_roster_put(core: LedgerCore, body) {
    await core.storage.put(`workplace-roster:${String(body.account ?? '')}`, body.roster);
    return { ok: true };
  },
  async workplace_roster(core: LedgerCore, body) {
    return { ok: true, roster: (await core.storage.get<WorkplaceMember[]>(`workplace-roster:${String(body.account ?? '')}`)) ?? null };
  },
  async workplace_giver_put(core: LedgerCore, body) {
    await core.storage.put(`giver-identity:${String(body.funder ?? '').toLowerCase()}`, body.identity);
    return { ok: true };
  },
  async workplace_givers(core: LedgerCore, body) {
    const out: Array<{ funder: string; issuer: string; subject: string }> = [];
    for (const funder of (body.funders as string[] | undefined) ?? []) {
      const identity = await core.storage.get<{ issuer: string; subject: string }>(`giver-identity:${funder.toLowerCase()}`);
      if (identity) out.push({ funder, ...identity });
    }
    return { ok: true, givers: out };
  },
  async workplace_unlink(core: LedgerCore, body) {
    await core.storage.delete(`workplace-roster:${String(body.account ?? '')}`);
    await core.storage.delete(`workplace:${String(body.account ?? '')}`);
    return { ok: true };
  },
});

/** A person on a linked project's team, as its workspace seats them (company RFC 0024 D10, "the team declared once"):
 *  known by the identities they proved there, with the scopes their seat and team roles give here. */
export interface WorkplaceMember { name: string; identities: { issuer: string; subject: string }[]; scopes: string[] }

/** The workspace's seats as this project's team: its `admin` seats and anyone holding the `owner` team role are owners;
 *  a seat holding any other team role is the team; a seat with none (a member who joined, say) is not on the team. The
 *  team is declared, never implied by a seat. Authority scopes are Workplace roles, so they are set there, not in
 *  config.yaml. */
export function rosterOf(org: { members?: Array<{ principalId: string; displayName: string; identities?: { issuer: string; subject: string }[] }>; seats?: Array<{ principalId: string; role: string; teamRoles?: string[] }> }): WorkplaceMember[] {
  const people = new Map((org.members ?? []).map((member) => [member.principalId, member]));
  return (org.seats ?? []).flatMap((seat) => {
    const person = people.get(seat.principalId);
    if (!person?.identities?.length) return [];
    const teamRoles = seat.teamRoles ?? [];
    const owner = seat.role === 'admin' || teamRoles.includes('owner');
    if (!owner && teamRoles.length === 0) return [];
    return [{ name: person.displayName, identities: person.identities, scopes: owner ? ['owner'] : ['team'] }];
  });
}

/** A linked project's team as its workspace last declared it; null when the project is not linked (config.yaml governs). */
export async function workplaceRoster(ledger: LedgerClient, account: string): Promise<WorkplaceMember[] | null> {
  return (await ledger.call<{ roster: WorkplaceMember[] | null }>('workplace_roster', { account })).roster;
}

/** A funder who gave signed in with Volter: the identity a linked workspace names its givers by (its `giver` role). */
export async function recordGiverIdentity(ledger: LedgerClient, funder: string, identity: { issuer: string; subject: string }): Promise<void> {
  await ledger.call('workplace_giver_put', { funder, identity });
}

export const workplaceLink = async (ledger: LedgerClient, account: string): Promise<WorkplaceLink | null> => (await ledger.call<{ link: WorkplaceLink | null }>('workplace_link', { account })).link;
const putLink = (ledger: LedgerClient, link: WorkplaceLink) => ledger.call<{ ok: true }>('workplace_link_put', { link });

/** The books' conditions as alerts, read from the project's view: the same facts its dashboard's "Needs attention" reads. */
export function workplaceAlertsOf(v: ProjectView, origin: string): WorkplaceAlert[] {
  const books = `${origin}/${v.account}/dashboard/books`;
  const agent = `${origin}/${v.account}/dashboard/agent`;
  const out: WorkplaceAlert[] = [];
  const standing = standingOf(v, []);
  const org = v.control?.desired?.from?.slice(1);
  if (standing === 'requested') out.push({ key: 'agent.pause-not-taken', severity: 'warning', reason: `A pause was asked for${org ? ` by ${org}` : ''}; the agent has not reported it paused yet`, link: agent });
  if (org && (standing === 'paused' || standing === 'requested')) out.push({ key: 'agent.org-paused', severity: 'info', reason: `Paused by ${org}: the project runs again when ${org} resumes`, link: agent });
  if (v.freeze) out.push(v.freeze.from
    ? { key: 'books.org-frozen', severity: 'warning', reason: `Spending is frozen for every project of ${v.freeze.from.slice(1)} since ${v.freeze.at.slice(0, 16).replace('T', ' ')}`, link: books }
    : { key: 'books.frozen', severity: 'warning', reason: `Spending is frozen by ${v.freeze.by}${v.freeze.reason ? `: ${v.freeze.reason}` : ''}`, link: books });
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

/** The source key the project's books publish under in the workspace. */
export const booksSourceKey = (account: string): string => account.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 64) || 'books';
const purposeWords = (purpose: ProjectView['envelopes'][number]['purpose']): string => (purpose.type === 'item' ? `for ${purpose.item}` : purpose.type === 'models' ? `for ${purpose.models.join(', ')}` : purpose.type === 'model' ? 'for model calls' : 'for anything');
const daysBack = (count: number, now = Date.now()): string[] => Array.from({ length: count }, (_, index) => new Date(now - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10));

/** The project's books in the workspace's `books` format. */
export function workplaceBooksOf(v: ProjectView, funding: FundingSnapshot, statements: Statement[], origin: string): Record<string, unknown> {
  const standing = standingOf(v, []);
  const moved = (v.feed ?? []).filter((flow) => flow.kind === 'grant' || flow.kind === 'mint');
  const flows = moved.filter((flow) => flow.to === v.account || flow.from === v.account).slice(-200).map((flow, index) => {
    const out = flow.kind === 'grant' && flow.from === v.account;
    const party = out ? flow.to : flow.from ? flow.from.replace(/^@/, '') : flow.sponsor_login ?? 'the operator';
    const what = flow.kind === 'mint' ? (flow.coupon ? 'a coupon' : flow.sponsor_login ? 'sponsorship' : 'credits') : flow.note ? `a grant · "${flow.note}"` : 'a grant';
    return { key: flow.id ?? `${flow.ts}-${index}`, at: flow.ts, direction: out ? 'out' : 'in', party, what, usdCents: flow.amount_usd_cents };
  });
  const days = funding.daily_spend_usd_cents ?? [];
  const dates = daysBack(days.length);
  return {
    summary: {
      account: v.account, standing, balanceUsdCents: v.balance_usd_cents, inUsdCents: v.granted_in_usd_cents, outUsdCents: v.granted_out_usd_cents ?? 0,
      spentUsdCents: v.consumed_usd_cents, burnPerDayUsdCents: v.burn_per_day_usd_cents, runwayDays: v.runway_days === null || !Number.isFinite(v.runway_days) ? null : Math.round(v.runway_days),
      runwayConfident: v.runway_confident, goalDays: v.goal_days, freeze: v.freeze ?? null, canFreeze: !v.freeze?.from, giveUrl: `${origin}/give?to=${encodeURIComponent(v.account)}`,
    },
    flows,
    envelopes: v.envelopes.map((envelope) => ({ key: envelope.id, purpose: purposeWords(envelope.purpose), ...(envelope.from ? { from: envelope.from } : {}), balanceUsdCents: envelope.balance_usd_cents })),
    limits: v.bounds.limits.map((limit, index) => ({ key: `${limit.window}:${limit.model ?? '*'}:${index}`, window: limit.window, ...(limit.model ? { model: limit.model } : {}), ...(limit.usd_cents !== undefined ? { usdCents: limit.usd_cents } : {}), ...(limit.calls !== undefined ? { calls: limit.calls } : {}), ...(limit.tokens !== undefined ? { tokens: limit.tokens } : {}), used: { usdCents: limit.used.usd_cents, calls: limit.used.calls, tokens: limit.used.tokens } })),
    statements: statements.map((statement) => ({ key: statement.id, title: statement.title, text: statement.badges.map((badge) => `${badge.label}: ${badge.message}`).join(' · ') || statement.source.name, at: statement.as_of })),
    daily: days.map((usdCents, index) => ({ key: dates[index], usdCents })),
  };
}

async function workplaceCall<T>(link: WorkplaceLink & { accessToken: string }, path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<{ ok: boolean; status: number; data?: T; code?: string }> {
  const response = await fetch(`${link.base}/api/v3/organizations/${encodeURIComponent(link.organizationId)}${path}`, {
    method, redirect: 'manual',
    headers: { accept: 'application/json', authorization: `Bearer ${link.accessToken}`, 'x-rh2-organization': link.organizationId, origin: link.base, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: { code?: string } };
  return { ok: response.ok, status: response.status, ...(payload.data === undefined ? {} : { data: payload.data }), ...(payload.error?.code ? { code: payload.error.code } : {}) };
}

/** One project's alerts brought in step with its books: each standing condition raised (a repeat is a no-op there), each
 *  one that ended cleared. The keys raised are kept on the link so a condition that ends is cleared, never forgotten. */
export async function syncWorkplaceAlerts(ledger: LedgerClient, stored: WorkplaceLink): Promise<WorkplaceLink> {
  const at = new Date().toISOString();
  const { install } = await ledger.call<{ install: WorkplaceInstallation | null }>('workplace_install', { base: stored.base, organizationId: stored.organizationId });
  if (!install) return { ...stored, lastTick: { at, ok: false, note: 'the workspace has no installation for this organization; link the project again' } };
  if (Date.parse(install.expiresAt) <= Date.now()) return { ...stored, lastTick: { at, ok: false, note: 'the installation token expired; link the project again' } };
  const link = { ...stored, accessToken: install.accessToken };
  const failures: string[] = [];
  const source = booksSourceKey(link.account);
  // The controls asked in the workspace first: a freeze taken now shows in the books published below.
  const queue = await workplaceCall<{ controls: Array<{ action: string; controlId: string; reason: string | null; requestedBy: string; targetKey: string }> }>(link, `/books/${source}/controls`);
  for (const control of queue.data?.controls ?? []) {
    let ok = false; let note = `${control.action} is not a books control`;
    if (control.targetKey !== link.account) note = 'the control names another project';
    else if (control.action === 'freeze' || control.action === 'unfreeze') {
      const done = await ledger.freezeSet(link.account, control.action === 'freeze' ? { by: `Workplace · ${control.requestedBy}`, ...(control.reason ? { reason: control.reason } : {}) } : null);
      ok = done.ok; note = done.ok ? '' : done.error ?? 'refused';
    }
    const reported = await workplaceCall(link, `/books-controls/${encodeURIComponent(control.controlId)}/complete`, { ok, ...(note ? { note } : {}) });
    if (!reported.ok) failures.push(`control ${control.controlId}: ${reported.code ?? reported.status}`);
  }
  const v = await ledger.project(link.account);
  if (!v.found) return { ...link, lastTick: { at, ok: false, note: 'the project is not on the books' } };
  const [funding, statements] = await Promise.all([ledger.funding(link.account), ledger.statements(link.account)]);
  // Its givers, by the Volter identity they gave under, so the workspace can seat them in its `giver` role.
  const funders = [...new Set((v.feed ?? []).filter((flow) => flow.to === link.account && flow.kind === 'grant' && flow.from?.startsWith('@')).map((flow) => flow.from!))];
  const { givers } = await ledger.call<{ givers: Array<{ funder: string; issuer: string; subject: string }> }>('workplace_givers', { funders });
  const model = { ...workplaceBooksOf(v, funding, statements.statements ?? [], link.origin), givers: givers.map((giver) => ({ key: giver.funder, issuer: giver.issuer, subject: giver.subject })) };
  const published = await workplaceCall(link, `/books/${source}`, { name: link.account, system: 'Open Autonomy', link: `${link.origin}/${link.account}/dashboard/books`, observedAt: at, model }, 'PUT');
  if (!published.ok) failures.push(`books: ${published.code ?? published.status}`);
  // The team, declared once in the workspace: its seats read back as this project's roster.
  const organization = await workplaceCall<Parameters<typeof rosterOf>[0]>(link, '');
  if (organization.ok && organization.data) await ledger.call('workplace_roster_put', { account: link.account, roster: rosterOf(organization.data) });
  else failures.push(`roster: ${organization.code ?? organization.status}`);
  // Each alert names its project: an organization links several, and one project's condition never clears another's.
  const scope = link.account.toLowerCase().replace(/[^a-z0-9._:/-]+/g, '-');
  const wanted = workplaceAlertsOf(v, link.origin).map((alert) => ({ ...alert, key: `${alert.key}:${scope}`, reason: `${link.account}: ${alert.reason}`.slice(0, 300) }));
  const raised: Record<string, string> = {};
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
  const next: WorkplaceLink = { ...stored, raised, lastTick: { at, ok: failures.length === 0, ...(failures.length ? { note: failures.join('; ').slice(0, 300) } : {}) } };
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
    // The installation's token is the organization's, shared with every project linked there (installing again replaced it).
    await ledger.call('workplace_install_put', { install: { base: base(env), organizationId: data.organizationId, installationId: data.installationId, principalId: data.principalId, accessToken: data.accessToken, expiresAt: data.expiresAt } satisfies WorkplaceInstallation });
    const link: WorkplaceLink = { account: state.account!, base: base(env), organizationId: data.organizationId, installationId: data.installationId, principalId: data.principalId, role: state.role!, linkedAt: new Date().toISOString(), linkedBy: state.by!, origin: url.origin, raised: {} };
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
    return json({ ok: true, linked: true, link });
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
