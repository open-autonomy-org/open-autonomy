// The pages, served: GitHub's addresses over the books. `/` is the deployment's front, `/name` a login's page,
// `/owner/project` a project as an outsider meets it, `/owner/project/dashboard` and beneath the work as the team
// reads it. Tried last, after every door with a fixed name, so a name can never shadow one. An app mounted around
// the core fills the front's and a name's slots and, if it has one, serves the project's landing page; the core
// alone serves the dashboard at the project's address.
import type { DirectoryEntry, FunderView, LedgerClient, ProjectView, SessionSummary } from '../ledger.js';
import { error, html, methodNotAllowed } from '../http.js';
import { readTeamEdit, readTeamFile, validTeamAccount } from '../team.js';
import { isStale, syncProfile } from '../sync.js';
import type { Env } from '../types.js';
import { render } from '../ui.js';
import { ROADMAP_SCHEMA, type Roadmap } from '@open-autonomy/sdk/roadmap';
import { pageConfig } from './brand.js';
import { Account } from './account.js';
import { Directory } from './directory.js';
import { document } from './document.js';
import { renderMessage } from './message.js';
import { roleOf, sees, visibilityOf, type AccountSlots, type DirectorySlots, type Role, type Viewer, type Visibility } from './model.js';
import { accountAt, at, nameOf } from './parts.js';
import { dashDocument, type DashData, type DashPage } from '../dash/index.js';

// What an app puts on the pages, computed per request. Absent, the core's page stands alone.
export interface PageApp {
  // Who is looking, if the app has an identity door (the platform: its GitHub sign-in). Absent: everyone is the public.
  viewer?(req: Request, tools: PageTools): Promise<Viewer | undefined>;
  // A project's landing page, and its whole document at `/about`: the platform's campaign. Absent, the core serves
  // the dashboard at the project's address and has no `/about`.
  landing?(d: LandingBase, tools: PageTools): Promise<string>;
  directory?(entries: DirectoryEntry[], tools: PageTools): Promise<DirectorySlots>;
  account?(name: string, entries: DirectoryEntry[], funder: FunderView | undefined, tools: PageTools): Promise<AccountSlots>;
}
export interface PageTools { env: Env; ledger: LedgerClient; url: URL; grantsAccount: string; identity: boolean; beginIdentity?(req: Request, intent: unknown): Promise<Response>; who?: Viewer }
// What the core hands an app for the landing page: the project as the books and the stream have it, who is looking
// and what they may open. `about` asks for the whole document rather than the page.
export interface LandingBase { account: string; view: ProjectView; role: Role; visibility: Visibility; sessions: SessionSummary[]; live: string[]; roadmap: Roadmap; daily: number[]; now: number; who?: Viewer; about: boolean }

const NO_STORE = { 'cache-control': 'no-store' };
const EMPTY_ROADMAP: Roadmap = { schema: ROADMAP_SCHEMA, items: [] };
// A login: GitHub's rule. A project's name: what a repository may be called. An app's own doors under a project
// (the platform's give, redeem, thanks) hold to the same shapes so they can never shadow a fixed door either.
export const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
export const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const PAGES = new Set<DashPage>(['sessions', 'board', 'books', 'agent', 'team']);
// Which panel of the owner's word each address answers to; a transcript is the sessions page's deeper panel.
const GATE: Record<DashPage | 'transcript' | 'about', keyof Visibility> = { overview: 'overview', about: 'overview', sessions: 'sessions', transcript: 'transcripts', board: 'work', books: 'books', agent: 'agent', team: 'team' };
// Names no page may take: every fixed door of this worker, and what an app may add in front of it.
export const RESERVED = new Set(['v1', 'admin', 'webhooks', 'give', 'explore', 'settings', 'healthz', 'favicon.svg', 'favicon.ico', 'assets', 'static']);
const dec = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };
const privateHtml = (body: string, status = 200): Response => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...NO_STORE } });

export async function servePages(req: Request, env: Env, ctx: ExecutionContext, app: PageApp, tools: PageTools): Promise<Response | undefined> {
  const { ledger, url } = tools;
  const { brand } = pageConfig();
  const now = Date.now();
  const seg = url.pathname.split('/').slice(1).map(dec);
  const isGet = req.method === 'GET' || req.method === 'HEAD';
  // Who is looking is asked of the app only for an address this router serves, never for one falling through.
  const identify = async () => { tools.who = await app.viewer?.(req, tools); return tools.who; };
  const viewer = 'public' as const; // the front and a name's page read the same to everyone; a project's role is the project's

  // ---- the front ----
  if (url.pathname === '/') {
    if (!isGet) return undefined;
    await identify();
    const { entries } = await ledger.directory();
    for (const e of entries) if (e.is_project && isStale(e.profile.synced_at)) ctx.waitUntil(syncProfile(env, e.account));
    const slots = await app.directory?.(entries, tools);
    return html(document(brand, brand, render(Directory({ brand, viewer, entries, now, slots })), slots?.styles));
  }
  if (seg.length < 1 || seg.length > 5 || RESERVED.has(seg[0].toLowerCase()) || !LOGIN.test(seg[0])) return undefined;
  const who = await identify();

  // ---- a name: an org's projects, a person's giving ----
  if (seg.length === 1) {
    if (!isGet) return undefined;
    const name = seg[0];
    const [{ entries }, funder] = await Promise.all([ledger.directory(), ledger.funder(`@${name.toLowerCase()}`)]);
    const owns = entries.some((e) => e.account.toLowerCase().startsWith(`${name.toLowerCase()}/`));
    if (!owns && !funder.found) return html(renderMessage(name, false, 'Nothing here', `No project of ${name}'s is on these books, and ${name} has not given.`), 404);
    const slots = await app.account?.(name, entries, funder.found ? funder : undefined, tools);
    return privateHtml(document(name, brand, render(Account({ brand, viewer, name, entries, funder: funder.found ? funder : undefined, now, slots })), slots?.styles));
  }

  // ---- a project: its landing page, its dashboard and the dashboard's depths ----
  if (!REPO.test(seg[1])) return undefined;
  const account = accountAt(seg[0], seg[1]);
  const door = seg[2];
  // `/owner/project`, `/owner/project/about` (an app's), `/owner/project/state` (the owner's control), or the
  // dashboard: `/owner/project/dashboard[/page[/key]]`.
  const page: DashPage | undefined = door === undefined ? undefined : door === 'dashboard' ? (seg[3] === undefined ? 'overview' : PAGES.has(seg[3] as DashPage) ? (seg[3] as DashPage) : undefined) : undefined;
  const key = door === 'dashboard' ? seg[4] : undefined;
  if (door !== undefined && door !== 'dashboard' && door !== 'about' && door !== 'state') return undefined;
  if (door === 'about' && (seg.length > 3 || !app.landing)) return undefined;
  if (door === 'state' && seg.length > 3) return undefined;
  if (door === 'dashboard' && (page === undefined || (key !== undefined && page !== 'sessions' && page !== 'board'))) return undefined;
  if (door === 'state' ? req.method !== 'POST' : !isGet && !(page === 'team' && key === undefined)) return methodNotAllowed();
  const view = await ledger.project(account);
  if (!view.found) return html(renderMessage(account, false, 'No such project', `No project found for ${account}.`), 404);
  if (view.is_project && isStale(view.profile.synced_at)) ctx.waitUntil(syncProfile(env, account));
  const role = roleOf(who, view);
  // The owner's one control: running or paused, with a reason, from the roster's owner signed in at the page. The
  // request is recorded as the owner's; the automation applies it its own way and answers through the SDK.
  if (door === 'state') {
    if (req.headers.get('origin') !== url.origin) return error('invalid_origin', 403);
    if (role !== 'owner') return privateHtml(renderMessage(account, false, 'Not the owner', `Only an owner on ${nameOf(account)}'s roster, signed in, may pause or resume its agent.`), 403);
    if (Number(req.headers.get('content-length')) > 4_000) return error('form_too_large', 413);
    let form: FormData;
    try { form = await req.formData(); } catch { return error('invalid_request'); }
    const state = String(form.get('state') ?? '');
    if (state !== 'running' && state !== 'paused') return error('invalid_request');
    const reason = String(form.get('reason') ?? '').trim().slice(0, 400) || undefined;
    const r = await ledger.stateRequest(account, state, `@${who!.login}`, reason);
    if (!r.ok) return privateHtml(renderMessage(account, false, 'Not recorded', `The request was refused: ${r.error}.`), 400);
    return new Response(null, { status: 303, headers: { location: at(account, 'dashboard', 'agent'), ...NO_STORE } });
  }
  // The owner's word holds on every address: a panel the viewer may not see is not there.
  const visibility = visibilityOf(view.profile.config_yaml);
  const gate = door === 'about' ? 'about' : page === undefined ? 'overview' : page === 'sessions' && key !== undefined ? 'transcript' : page;
  if (!sees(role, visibility[GATE[gate]])) return html(renderMessage(account, false, 'Not open', `${nameOf(account)}'s ${gate === 'about' || gate === 'overview' ? 'page' : gate} is not open to ${who ? `@${who.login}` : 'everyone'}.`), 404);
  const [stream, road, funding] = await Promise.all([ledger.sessions(account, page === 'sessions' ? 100 : 50), ledger.roadmap(account), ledger.funding(account)]);
  const roadmap = road.revision?.roadmap ?? EMPTY_ROADMAP;

  // ---- the landing page: the app's, when it has one; the dashboard otherwise ----
  if (door === undefined || door === 'about') {
    if (app.landing) return privateHtml(await app.landing({ account, view, role, visibility, sessions: stream.sessions, live: stream.live, roadmap, daily: funding.daily_spend_usd_cents, now, who, about: door === 'about' }, tools));
  }
  const dash: DashPage = page ?? 'overview';
  const transcripts = sees(role, visibility.transcripts);
  const first = stream.live[0];
  const tail = transcripts && first && dash !== 'sessions' ? await ledger.session(account, first).then((r) => (r.session ? { key: first, turns: r.session.turns.slice(-40) } : undefined)) : undefined;
  const d: DashData = { brand, viewer: role, visibility, v: view, sessions: stream.sessions, live: stream.live, roadmap, tail, daily: funding.daily_spend_usd_cents, now, page: dash };
  const serve = (status = 200) => privateHtml(dashDocument(d), status);

  if (dash === 'sessions') {
    const wanted = key ?? (transcripts ? first : undefined);
    if (wanted) {
      const got = await ledger.session(account, wanted);
      if (key !== undefined && (!got.ok || !got.session)) return html(renderMessage(account, false, 'No such session', 'Nothing was narrated under that key.'), 404);
      // The record's joined receipts are the calls panel's; a viewer the owner keeps out of it does not get them here.
      if (got.session && transcripts) d.session = sees(role, visibility.calls) ? got.session : { ...got.session, receipts: undefined };
    }
    return serve();
  }
  if (dash === 'board') {
    if (key !== undefined && !roadmap.items.some((i) => i.id === key)) return html(renderMessage(account, false, 'No such item', `Nothing on the roadmap is called ${key}.`), 404);
    d.item = key;
    return serve();
  }
  if (dash === 'books') {
    if (sees(role, visibility.calls)) d.calls = (await ledger.calls(account, 100)).calls;
    return serve();
  }
  if (dash === 'team') {
    if (!validTeamAccount(account)) return error('invalid_account', 400);
    if (req.method === 'POST') {
      if (req.headers.get('origin') !== url.origin) return error('invalid_origin', 403);
      if (Number(req.headers.get('content-length')) > 16_000) return error('form_too_large', 413);
      if (!tools.beginIdentity) return privateHtml(renderMessage(account, false, 'Team change not started', 'This deployment has no identity door for editing the roster on the page; edit the committed config instead.'), 501);
      try { return await tools.beginIdentity(req, readTeamEdit(account, await req.formData())); }
      catch (e) { return privateHtml(renderMessage(account, false, 'Team change not started', (e as Error).message), 400); }
    }
    const editing = url.searchParams.get('edit') ?? undefined;
    try { const file = await readTeamFile(env, account); d.roster = { members: file.team.members, sha: file.sha, head: file.head, editing, configured: tools.identity }; return serve(); }
    catch (e) { d.roster = { failure: (e as Error).message, editing, configured: tools.identity }; return serve(503); }
  }
  return serve();
}
