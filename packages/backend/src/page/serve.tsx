// The pages, served: GitHub's addresses over the books. `/` is the deployment's front, `/name` a login's page,
// `/owner/project` a project and `/owner/project/<tab>` its depths. Tried last, after every door with a fixed name,
// so a name can never shadow one. An app mounted around the core fills each page's slots through `App.page`.
import type { DirectoryEntry, FunderView, LedgerClient, ProjectView } from '../ledger.js';
import { error, html, methodNotAllowed } from '../http.js';
import { readTeamEdit, readTeamFile, validTeamAccount } from '../team.js';
import { isStale, syncProfile } from '../sync.js';
import type { Env } from '../types.js';
import { render } from '../ui.js';
import { ROADMAP_SCHEMA, type Roadmap } from '@open-autonomy/sdk/roadmap';
import { pageConfig } from './brand.js';
import { Account } from './account.js';
import { Directory } from './directory.js';
import { renderMessage } from './message.js';
import { roleOf, sees, visibilityOf, type AccountSlots, type DirectorySlots, type PageSlots, type Viewer, type Visibility } from './model.js';
import { accountAt, at, nameOf, type SessionTail } from './parts.js';
import { Overview, document, type ProjectPageData } from './project.js';
import { Agent, Books, Doc, Item, Session, Sessions, Team, Work } from './tabs.js';

// What an app puts on the pages: slots per page, computed per request. Absent, the core's page stands alone.
export interface PageApp {
  // Who is looking, if the app has an identity door (the platform: its GitHub sign-in). Absent: everyone is the public.
  viewer?(req: Request, tools: PageTools): Promise<Viewer | undefined>;
  project?(account: string, view: ProjectView, tools: PageTools): Promise<PageSlots>;
  directory?(entries: DirectoryEntry[], tools: PageTools): Promise<DirectorySlots>;
  account?(name: string, entries: DirectoryEntry[], funder: FunderView | undefined, tools: PageTools): Promise<AccountSlots>;
}
export interface PageTools { env: Env; ledger: LedgerClient; url: URL; grantsAccount: string; identity: boolean; beginIdentity?(req: Request, intent: unknown): Promise<Response>; who?: Viewer }

const NO_STORE = { 'cache-control': 'no-store' };
const EMPTY_ROADMAP: Roadmap = { schema: ROADMAP_SCHEMA, items: [] };
// A login: GitHub's rule. A project's name: what a repository may be called. An app's own doors under a project
// (the platform's give, redeem, thanks) hold to the same shapes so they can never shadow a fixed door either.
export const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
export const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const TABS = new Set(['work', 'sessions', 'books', 'agent', 'team', 'about', 'state']);
// Which panel of the owner's word a tab address answers to; a transcript is the sessions tab's deeper panel.
const GATE: Record<string, keyof Visibility> = { about: 'overview', work: 'work', sessions: 'sessions', transcript: 'transcripts', books: 'books', agent: 'agent', team: 'team' };
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
  if (url.pathname === '/' || (seg.length >= 1 && seg.length <= 4 && LOGIN.test(seg[0]))) tools.who = await app.viewer?.(req, tools);
  const who = tools.who;
  const viewer = 'public' as const; // the front and a name's page read the same to everyone; a project's role is the project's

  // ---- the front ----
  if (url.pathname === '/') {
    if (!isGet) return undefined;
    const { entries } = await ledger.directory();
    for (const e of entries) if (e.is_project && isStale(e.profile.synced_at)) ctx.waitUntil(syncProfile(env, e.account));
    const slots = await app.directory?.(entries, tools);
    return html(document(brand, brand, render(Directory({ brand, viewer, entries, now, slots })), slots?.styles));
  }
  if (seg.length < 1 || seg.length > 4 || RESERVED.has(seg[0].toLowerCase()) || !LOGIN.test(seg[0])) return undefined;

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

  // ---- a project and its depths ----
  if (!REPO.test(seg[1])) return undefined;
  const account = accountAt(seg[0], seg[1]);
  const tab = seg[2];
  if (tab !== undefined && !TABS.has(tab)) return undefined;
  if (tab !== 'work' && tab !== 'sessions' && seg.length > 3) return undefined;
  if (tab === 'state' ? req.method !== 'POST' : !isGet && tab !== 'team') return methodNotAllowed();
  const view = await ledger.project(account);
  if (!view.found) return html(renderMessage(account, false, 'No such project', `No project found for ${account}.`), 404);
  if (view.is_project && isStale(view.profile.synced_at)) ctx.waitUntil(syncProfile(env, account));
  const role = roleOf(who, view);
  // The owner's one control: running or paused, with a reason, from the roster's owner signed in at the page. The
  // request is recorded as the owner's; the automation applies it its own way and answers through the SDK.
  if (tab === 'state') {
    if (req.headers.get('origin') !== url.origin) return error('invalid_origin', 403);
    if (role !== 'owner') return privateHtml(renderMessage(account, false, 'Not the owner', `Only an owner on ${nameOf(account)}'s roster, signed in, may pause or resume its agent.`), 403);
    const form = await req.formData();
    const state = String(form.get('state') ?? '');
    if (state !== 'running' && state !== 'paused') return error('invalid_request');
    const reason = String(form.get('reason') ?? '').trim().slice(0, 400) || undefined;
    const r = await ledger.stateRequest(account, state, `@${who!.login}`, reason);
    if (!r.ok) return privateHtml(renderMessage(account, false, 'Not recorded', `The request was refused: ${r.error}.`), 400);
    return new Response(null, { status: 303, headers: { location: at(account, 'agent'), ...NO_STORE } });
  }
  // The owner's word holds on every address, not only the tab bar: a panel the viewer may not see is not there.
  const visibility = visibilityOf(view.profile.config_yaml);
  const gate = tab === 'sessions' && seg.length === 4 ? 'transcript' : tab ?? 'about';
  if (!sees(role, visibility[GATE[gate]])) return html(renderMessage(account, false, 'Not open', `${nameOf(account)}'s ${gate === 'about' ? 'page' : gate} is not open to ${who ? `@${who.login}` : 'everyone'}.`), 404);
  const base = async (limit: number): Promise<ProjectPageData> => {
    const [stream, road, funding, slots] = await Promise.all([ledger.sessions(account, limit), ledger.roadmap(account), ledger.funding(account), app.project?.(account, view, tools) ?? Promise.resolve({} as PageSlots)]);
    const first = stream.live[0];
    const tail: SessionTail | undefined = first ? await ledger.session(account, first).then((r) => (r.session ? { key: first, turns: r.session.turns.slice(-40) } : undefined)) : undefined;
    return { brand, viewer: role, visibility, v: view, sessions: stream.sessions, live: stream.live, roadmap: road.revision?.roadmap ?? EMPTY_ROADMAP, revision: road.revision?.revision, tail, daily: funding.daily_spend_usd_cents, now, slots };
  };
  const page = (title: string, d: ProjectPageData, node: unknown, status = 200) => privateHtml(document(title === nameOf(account) ? title : `${title} · ${nameOf(account)}`, brand, render(node), d.slots?.styles), status);

  if (tab === 'team') {
    if (!validTeamAccount(account)) return error('invalid_account', 400);
    if (req.method === 'POST') {
      if (req.headers.get('origin') !== url.origin) return error('invalid_origin', 403);
      if (Number(req.headers.get('content-length')) > 16_000) return error('form_too_large', 413);
      if (!tools.beginIdentity) return privateHtml(renderMessage(account, false, 'Team change not started', 'This deployment has no identity door for editing the roster on the page; edit the committed config instead.'), 501);
      try { return await tools.beginIdentity(req, readTeamEdit(account, await req.formData())); }
      catch (e) { return privateHtml(renderMessage(account, false, 'Team change not started', (e as Error).message), 400); }
    }
    const d = await base(20);
    try { const file = await readTeamFile(env, account); return page('Team', d, Team({ d, file, editing: url.searchParams.get('edit') ?? undefined, configured: tools.identity })); }
    catch (e) { return page('Team', d, Team({ d, failure: (e as Error).message, configured: tools.identity }), 503); }
  }
  if (tab === undefined) { const d = await base(50); return page(nameOf(account), d, Overview(d)); }
  if (tab === 'about' && seg.length === 3) { const d = await base(20); return page('About', d, Doc({ d, title: 'About', md: view.profile.about_md })); }
  if (tab === 'work' && seg.length === 3) { const d = await base(20); return page('Work', d, Work(d)); }
  if (tab === 'work' && seg.length === 4) {
    const [d, item] = await Promise.all([base(20), ledger.item(account, seg[3])]);
    if (!d.roadmap.items.some((i) => i.id === seg[3]) && !item.sessions.length && !item.updates.length) return html(renderMessage(account, false, 'No such item', `Nothing on the roadmap or in the stream is called ${seg[3]}.`), 404);
    return page(seg[3], d, Item({ d, view: item }));
  }
  if (tab === 'sessions' && seg.length === 3) { const d = await base(100); return page('Sessions', d, Sessions(d)); }
  if (tab === 'sessions' && seg.length === 4) {
    const [d, got] = await Promise.all([base(20), ledger.session(account, seg[3])]);
    if (!got.ok || !got.session) return html(renderMessage(account, false, 'No such session', 'Nothing was narrated under that key.'), 404);
    return page(got.session.source ?? got.session.kind, d, Session({ d, s: got.session }));
  }
  if (tab === 'books' && seg.length === 3) {
    const [d, calls] = await Promise.all([base(20), ledger.calls(account, 100)]);
    return page('Books', d, Books({ d, calls: calls.calls }));
  }
  if (tab === 'agent' && seg.length === 3) { const d = await base(20); return page('Agent', d, Agent(d)); }
  return undefined;
}
