// The pages, served: GitHub's addresses over the books. `/` is the deployment's front, `/name` a login's page,
// `/owner/project` a project as an outsider meets it, `/owner/project/dashboard` and beneath the work as the team
// reads it. Tried last, after every door with a fixed name, so a name can never shadow one. An app mounted around
// the core fills the front's and a name's slots and, if it has one, serves the project's landing page; the core
// alone serves the dashboard at the project's address.
import type { DirectoryEntry, FunderView, LedgerClient, ProjectView, SessionSummary } from '../ledger.js';
import { error, html, methodNotAllowed, withoutMoney } from '../http.js';
import { readTeamEdit, readTeamFile, validTeamAccount } from '../team.js';
import { isStale, syncProfile } from '../sync.js';
import type { Env } from '../types.js';
import { render } from '../ui.js';
import { ROADMAP_SCHEMA, type Roadmap } from '@open-autonomy/sdk/roadmap';
import { pageConfig } from './brand.js';
import { Account, type Impact } from './account.js';
import { Directory } from './directory.js';
import { document } from './document.js';
import { renderMessage } from './message.js';
import { roleOf, sees, visibilityOf, type AccountSlots, type DirectorySlots, type Role, type Viewer, type Visibility } from './model.js';
import { accountAt, at, nameOf } from './parts.js';
import { redactDeep } from '../redact.js';
import { atomFeed, updatesOf } from './updates.js';
import { cardPng } from './raster.js';
import type { ArtKind } from './art.js';

// A card is the same bytes for as long as the code that draws it is the same: drawn once per address, kept in the
// edge cache a day, and answered from there after.
async function cardResponse(req: Request, seed: string, kind?: ArtKind): Promise<Response> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  // Keyed by the address without its query: `?anything` never draws the card again.
  const url = new URL(req.url);
  const key = new Request(`${url.origin}${url.pathname}`, { method: 'GET' });
  const kept = await cache?.match(key);
  if (kept) return req.method === 'HEAD' ? new Response(null, { headers: kept.headers }) : kept;
  const res = new Response(await cardPng(seed, kind), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
  await cache?.put(key, res.clone());
  return req.method === 'HEAD' ? new Response(null, { headers: res.headers }) : res;
}
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
  // Where its identity door signs a viewer in and out, returning to `next`: the dashboard offers them in its rail.
  signIn?(next: string): string;
  signOut?(next: string): string;
}
export interface PageTools { env: Env; ledger: LedgerClient; url: URL; grantsAccount: string; identity: boolean; beginIdentity?(req: Request, intent: unknown): Promise<Response>; who?: Viewer }
// What the core hands an app for the landing page: the project as the books and the stream have it, who is looking
// and what they may open. `about` asks for the whole document rather than the page.
export interface LandingBase { account: string; view: ProjectView; role: Role; visibility: Visibility; sessions: SessionSummary[]; live: string[]; roadmap: Roadmap; daily: number[]; now: number; who?: Viewer; about: boolean; origin: string }

const NO_STORE = { 'cache-control': 'no-store' };
const EMPTY_ROADMAP: Roadmap = { schema: ROADMAP_SCHEMA, items: [] };
// A login: GitHub's rule. A project's name: what a repository may be called. An app's own doors under a project
// (the platform's give, redeem, thanks) hold to the same shapes so they can never shadow a fixed door either.
export const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
export const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const PAGES = new Set<DashPage>(['sessions', 'board', 'books', 'agent', 'team', 'statements']);
// Which panel of the owner's word each address answers to; a transcript is the sessions page's deeper panel.
const GATE: Record<DashPage | 'transcript' | 'about', keyof Visibility> = { overview: 'overview', about: 'overview', sessions: 'sessions', transcript: 'transcripts', board: 'work', books: 'books', agent: 'agent', team: 'team', statements: 'statements' };
// Names no page may take: every fixed door of this worker, and what an app may add in front of it.
export const RESERVED = new Set(['v1', 'admin', 'webhooks', 'give', 'explore', 'settings', 'healthz', 'favicon.svg', 'favicon.ico', 'assets', 'static']);
const dec = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };
const privateHtml = (body: string, status = 200): Response => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...NO_STORE } });

export async function servePages(req: Request, env: Env, ctx: ExecutionContext, app: PageApp, tools: PageTools): Promise<Response | undefined> {
  const { ledger, url } = tools;
  const { brand, logo } = pageConfig();
  const now = Date.now();
  const seg = url.pathname.split('/').slice(1).map(dec);
  const isGet = req.method === 'GET' || req.method === 'HEAD';
  // Who is looking is asked of the app only for an address this router serves, never for one falling through.
  const identify = async () => { tools.who = await app.viewer?.(req, tools); return tools.who; };
  const viewer = 'public' as const; // the front and a name's page read the same to everyone; a project's role is the project's

  // ---- a link preview's picture: a public page's drawing as a PNG card, drawn once and kept at the edge ----
  if (url.pathname === '/card.png' && isGet) return cardResponse(req, brand, 'vortex');

  // ---- the front ----
  if (url.pathname === '/') {
    if (!isGet) return undefined;
    await identify();
    const { entries } = await ledger.directory();
    for (const e of entries) if (e.is_project && isStale(e.profile.synced_at)) ctx.waitUntil(syncProfile(env, e.account));
    const slots = await app.directory?.(entries, tools);
    return html(document(brand, brand, render(Directory({ brand, viewer, entries, now, slots, q: url.searchParams.get('q')?.slice(0, 120) ?? undefined, sort: url.searchParams.get('sort') ?? undefined })), slots?.styles, { description: slots?.description ?? `Projects that build themselves on ${brand}: every session they work and every cent they spend on public books.`, image: `${url.origin}/card.png` }));
  }
  if (seg.length < 1 || seg.length > 5 || RESERVED.has(seg[0].toLowerCase()) || !LOGIN.test(seg[0])) return undefined;
  const who = await identify();

  // ---- a name: an org's projects, a person's giving ----
  if (seg.length === 1) {
    if (!isGet) return undefined;
    const name = seg[0];
    const [{ entries }, funder] = await Promise.all([ledger.directory(), ledger.funder(`@${name.toLowerCase()}`)]);
    // Only projects listed where everyone looks count: a name whose projects are all closed answers as an unknown one.
    const owns = entries.some((e) => e.is_project && e.listed && e.account.toLowerCase().startsWith(`${name.toLowerCase()}/`));
    if (!owns && !funder.found) return html(renderMessage(name, false, 'Nothing here', `No project of ${name}'s is on these books, and ${name} has not given.`), 404);
    const slots = await app.account?.(name, entries, funder.found ? funder : undefined, tools);
    // What each project given to did since: its shipped items and its runs, as the project opens them to everyone.
    const givenTo = [...new Set((funder.found ? funder.given : []).map((g) => g.to).filter((to): to is string => Boolean(to) && entries.some((e) => e.is_project && e.account === to)))].slice(0, 6);
    const impact: Record<string, Impact> = Object.fromEntries(await Promise.all(givenTo.map(async (to) => {
      const v = await ledger.project(to);
      if (!v.found) return [to, {}];
      const open = visibilityOf(v.profile.config_yaml);
      const [st, rd] = await Promise.all([sees('public', open.sessions) ? ledger.sessions(to, 100) : undefined, sees('public', open.work) ? ledger.roadmap(to) : undefined]);
      return [to, { sessions: st?.sessions, roadmap: rd?.revision?.roadmap }];
    })));
    return privateHtml(document(name, brand, render(Account({ brand, viewer, name, entries, funder: funder.found ? funder : undefined, now, slots, impact })), slots?.styles, { description: `${name} on ${brand}: the projects it owns and what it gave.` }));
  }

  // ---- a project: its landing page, its dashboard and the dashboard's depths ----
  if (!REPO.test(seg[1])) return undefined;
  const account = accountAt(seg[0], seg[1]);
  const door = seg[2];
  // `/owner/project`, `/owner/project/about` (an app's), `/owner/project/state` (the owner's control), or the
  // dashboard: `/owner/project/dashboard[/page[/key]]`.
  const page: DashPage | undefined = door === undefined ? undefined : door === 'dashboard' ? (seg[3] === undefined ? 'overview' : PAGES.has(seg[3] as DashPage) ? (seg[3] as DashPage) : undefined) : undefined;
  const key = door === 'dashboard' ? seg[4] : undefined;
  if (door !== undefined && door !== 'dashboard' && door !== 'about' && door !== 'state' && door !== 'updates.xml' && door !== 'card.png') return undefined;
  if ((door === 'updates.xml' || door === 'card.png') && seg.length > 3) return undefined;
  if (door === 'about' && (seg.length > 3 || !app.landing)) return undefined;
  if (door === 'state' && seg.length > 3) return undefined;
  if (door === 'dashboard' && (page === undefined || (key !== undefined && page !== 'sessions' && page !== 'board' && page !== 'statements') || (page === 'statements' && key === undefined))) return undefined;
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
    const r = await ledger.stateRequest(account, state, `@${who!.login}`, reason === undefined ? undefined : redactDeep(reason) as string);
    if (!r.ok) return privateHtml(renderMessage(account, false, 'Not recorded', `The request was refused: ${r.error}.`), 400);
    return new Response(null, { status: 303, headers: { location: at(account, 'dashboard', 'agent'), ...NO_STORE } });
  }
  // The owner's word holds on every address: a panel the viewer may not see is not there.
  const visibility = visibilityOf(view.profile.config_yaml);
  const gate = door === 'about' ? 'about' : page === undefined ? 'overview' : page === 'sessions' && key !== undefined ? 'transcript' : page;
  if (!sees(role, visibility[GATE[gate]])) return html(renderMessage(account, false, 'Not open', `${nameOf(account)}'s ${gate === 'about' || gate === 'overview' ? 'page' : gate} is not open to ${who ? `@${who.login}` : 'everyone'}.`), 404);
  // The project's card only when its page is open to everyone, like its feed: a cached picture never says a closed page exists.
  if (door === 'card.png') return sees('public', visibility.overview) ? cardResponse(req, account) : html(renderMessage(account, false, 'Not open', `${nameOf(account)}'s page is not open to everyone.`), 404);

  const [stream, road, funding] = await Promise.all([ledger.sessions(account, page === 'sessions' ? 100 : 50), ledger.roadmap(account), ledger.funding(account)]);
  // The money is the books panel's: a viewer the owner keeps from the books gets none of it, not in what a page draws
  // and not in what it carries for the browser. The figures are emptied and the pages draw no money for this viewer.
  const books = sees(role, visibility.books);
  const seen: ProjectView = books ? view : { ...view, funded: true, exhausted: false, status: 'funded', balance_usd_cents: 0, granted_in_usd_cents: 0, granted_out_usd_cents: 0, consumed_usd_cents: 0, burn_per_day_usd_cents: 0, runway_days: null, runway_confident: false, usable_usd_cents: 0, feed: [], envelopes: [], bounds: { models: [], limits: [] } };
  const daily = books ? funding.daily_spend_usd_cents : [];
  // What a page carries is what its viewer may see, panel by panel, not only what it draws: a viewer kept out of
  // the sessions gets the live ones by identity and standing alone (no report), out of the work no roadmap.
  const sessions = sees(role, visibility.sessions) ? stream.sessions : stream.sessions.filter((s) => stream.live.includes(s.key)).map((s) => ({ ...s, report: undefined, title: undefined }));
  // A session's cost is spend too: kept with the books.
  const priced = books ? sessions : sessions.map((s) => ({ ...s, usd_cents: 0 }));
  const roadmap = sees(role, visibility.work) ? road.revision?.roadmap ?? EMPTY_ROADMAP : EMPTY_ROADMAP;

  // ---- the project's updates as a feed: what shipped and what its runs reported, as everyone may see them ----
  // A feed reader is anonymous and a shared cache may keep the answer, so the feed is the public's, whoever asks:
  // run reports only when the owner opens the sessions to everyone, links only into panels open to everyone.
  if (door === 'updates.xml') {
    const open = (panel: keyof Visibility) => sees('public', visibility[panel]);
    // A page the owner keeps from the public has no feed at all, for anyone: a cached answer can never say it exists.
    if (!open('overview')) return html(renderMessage(account, false, 'Not open', `${nameOf(account)}'s page is not open to everyone, so it has no feed.`), 404);
    const feed = atomFeed({ origin: url.origin, account, title: `${nameOf(account)} · ${brand}`, page: at(account),
      updates: updatesOf(open('sessions') ? stream.sessions : [], open('work') ? road.revision?.roadmap ?? EMPTY_ROADMAP : EMPTY_ROADMAP),
      board: open('work') ? (item) => at(account, 'dashboard', 'board', item) : undefined,
      session: open('transcripts') ? (key) => at(account, 'dashboard', 'sessions', key) : undefined });
    return new Response(req.method === 'HEAD' ? null : feed, { headers: { 'content-type': 'application/atom+xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  }

  // ---- the landing page: the app's, when it has one; the dashboard otherwise ----
  if (door === undefined || door === 'about') {
    if (app.landing) return privateHtml(await app.landing({ account, view: seen, role, visibility, sessions: priced, live: stream.live, roadmap, daily, now, who, about: door === 'about', origin: url.origin }, tools));
  }
  const dash: DashPage = page ?? 'overview';
  const transcripts = sees(role, visibility.transcripts);
  const first = stream.live[0];
  const tail = transcripts && first && dash !== 'sessions' ? await ledger.session(account, first).then((r) => (r.session ? { key: first, turns: r.session.turns.slice(-40) } : undefined)) : undefined;
  // The view itself carries the books' detail and the agent's setup; each stays behind its own panel.
  const shown: ProjectView = {
    ...seen,
    profile: sees(role, visibility.agent) ? view.profile : { ...view.profile, setup_md: undefined, soul_md: undefined, agent_runtime: undefined, agent_skills: undefined, config_yaml: undefined },
  };
  const back = url.pathname + url.search;
  const signDoor = who ? (app.signOut ? { who: who.login, out: app.signOut(back) } : undefined) : app.signIn ? { in: app.signIn(back) } : undefined;
  // The owner's statements, for the rail's rows and their pages, when the owner opened them to this viewer.
  const statements = sees(role, visibility.statements) ? (await ledger.statements(account)).statements : [];
  const d: DashData = { brand, logo, viewer: role, visibility, v: shown, sessions: priced, live: stream.live, roadmap, tail, daily, now, page: dash, statements, origin: url.origin, ...(signDoor ? { door: signDoor } : {}) };
  const serve = (status = 200) => privateHtml(dashDocument(d), status);

  if (dash === 'sessions') {
    const show = url.searchParams.get('show'), job = url.searchParams.get('job')?.slice(0, 80);
    if (show === 'live' || show === 'failed' || job) d.filter = { ...(show === 'live' || show === 'failed' ? { show } : {}), ...(job ? { job } : {}) };
    const wanted = key ?? (transcripts ? first : undefined);
    if (wanted) {
      const got = await ledger.session(account, wanted);
      if (key !== undefined && (!got.ok || !got.session)) return html(renderMessage(account, false, 'No such session', 'Nothing was narrated under that key.'), 404);
      // The record's joined receipts are the calls panel's; a viewer the owner keeps out of it does not get them here.
      // Its cost and its receipts' costs are the books': a viewer kept from the books gets the transcript without them.
      if (got.session && transcripts) d.session = books ? (sees(role, visibility.calls) ? got.session : { ...got.session, receipts: undefined }) : { ...withoutMoney(got.session), receipts: undefined };
    }
    return serve();
  }
  if (dash === 'board') {
    if (key !== undefined && !roadmap.items.some((i) => i.id === key)) return html(renderMessage(account, false, 'No such item', `Nothing on the roadmap is called ${key}.`), 404);
    d.item = key;
    return serve();
  }
  if (dash === 'statements') {
    if (!statements.some((x) => x.id === key)) return html(renderMessage(account, false, 'No such statement', `The owner has published no statement called ${key}.`), 404);
    d.statement = key;
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
