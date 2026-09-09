import { ROADMAP_SCHEMA, type Roadmap } from '@open-autonomy/sdk/roadmap';
import { error, html, json, methodNotAllowed, parseJson } from './http.js';
import { authedClaims, handleKeyChallenge, handleKeyList, handleKeyMint, handleKeyRotate } from './keys.js';
import { LedgerClient, type AccountProfile, type FunderView, type Moderation, type ProjectView, type Sponsor } from './ledger.js';
import { gatewayBase, handleModelCall } from './proxy.js';
import { mintCard, settlePartner, stripeWebhook } from './rails.js';
import { renderDocPage, renderItemPage, renderMessage, renderProject, renderSessionPage, renderSessionsPage, renderTeamPage, type ProjectSlots } from './site.js';
import { readTeamEdit, readTeamFile, validTeamAccount } from './team.js';
import { accountEvents, agentEvents, itemEvents, sessionEvents } from './stream.js';
import { isStale, syncAllStale, syncProfile } from './sync.js';
import { grantsAccount, hasScope, type Env } from './types.js';
import { LOGO_SVG } from './ui.js';
import { renderActivitySvg, renderNowSvg, renderRoadmapSvg, renderRunwaySvg } from './widgets.js';

// The routes: the books, the keys, the rails, the stream, the timeline and a project's page, with an app around
// them. The app is tried first on every request and may answer; what it does not answer falls through to
// the core. The core serves no door of its own onto money in: an app brings those (Open Autonomy's patronage),
// or an operator mints through the admin route.
export interface RouteTools {
  env: Env;
  ledger: LedgerClient;
  url: URL;
  path: string;
  dec: (s: string) => string;
  // A method guard: null for GET, a 405 otherwise.
  get(): Response | null;
  isAdmin(): boolean;
  privateHtml(body: string, status?: number): Response;
  // A funder's key gives grant credits from its own books to a project: money in for the project, once per key.
  give(from: string, to: unknown, usdCents: unknown, note: unknown, key?: string, purpose?: unknown, by?: string): Promise<{ ok: boolean; error?: string; to_balance_usd_cents?: number }>;
  fundingAccount: string;
  grantsAccount: string;
}
export interface App {
  route?(req: Request, env: Env, ctx: ExecutionContext, tools: RouteTools): Promise<Response | undefined>;
  page?: {
    // What the app puts on a project's page: panels beside the books, a line in the header.
    project?(account: string, view: ProjectView, tools: RouteTools): Promise<ProjectSlots>;
    // A giver's own page (`/p/@login`); absent, the books answer as JSON.
    funder?(view: FunderView, tools: RouteTools): Promise<Response | undefined>;
  };
  // The identity door for a human act on a page (a team roster edit begins here). Absent: the page is read-only.
  identity?: { begin(req: Request, env: Env, intent: unknown): Promise<Response> };
  scheduled?(event: ScheduledController, env: Env): Promise<void>;
}

export function worker(app: App = {}): ExportedHandler<Env> {
  return {
    async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      try {
        return await route(req, env, ctx, app);
      } catch (err) {
        console.error('[platform] unhandled error', err);
        return error('internal_error', 500);
      }
    },
    // The app's own clock first (Open Autonomy accrues its sponsors monthly), then every public project's docs refreshed.
    async scheduled(event: ScheduledController, env: Env): Promise<void> {
      await app.scheduled?.(event, env);
      console.log('[platform] docs sync', await syncAllStale(env));
    },
  };
}

const SVG = { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'max-age=300, s-maxage=300' };
const NO_STORE = { 'cache-control': 'no-store' };
const privateHtml = (body: string, status = 200): Response => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...NO_STORE } });
export const fundingAccount = (env: Env): string => env.DEFAULT_FUNDING_ACCOUNT || 'open-autonomy-org/open-autonomy';
// A funder gives grant credits from their own books to a project: money in for the project, once per key.
export async function give(env: Env, from: string, to: unknown, usdCents: unknown, note: unknown, key?: string, purpose?: unknown, by?: string): Promise<{ ok: boolean; error?: string; to_balance_usd_cents?: number; from_balance_usd_cents?: number }> {
  if (typeof to !== 'string' || !/^[^/\s@]+\/[^/\s]+$/.test(to) || typeof usdCents !== 'number' || !Number.isFinite(usdCents) || usdCents < 1) return { ok: false, error: 'invalid_request' };
  const ledger = new LedgerClient(env.LIMITS);
  if (!(await ledger.project(to)).found) return { ok: false, error: 'no_such_project' };
  return ledger.grant(from, to, Math.floor(usdCents), key, typeof note === 'string' ? note : undefined, purpose, by);
}
export const isAdmin = (req: Request, env: Env): boolean => { const t = req.headers.get('x-admin-token'); return Boolean(t && env.AGENT_PROXY_ADMIN_TOKEN && t === env.AGENT_PROXY_ADMIN_TOKEN); };
const dec = decodeURIComponent;
const EMPTY_ROADMAP: Roadmap = { schema: ROADMAP_SCHEMA, items: [] };

export async function route(req: Request, env: Env, ctx: ExecutionContext, app: App = {}): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const ledger = new LedgerClient(env.LIMITS);
  const get = (): Response | null => (req.method === 'GET' ? null : methodNotAllowed());

  if (path === '/healthz') return json({ ok: true, commit: env.DEPLOY_COMMIT ? env.DEPLOY_COMMIT.slice(0, 7) : null });
  if (path === '/favicon.svg') return new Response(LOGO_SVG, { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'max-age=86400' } });
  if (path === '/favicon.ico') return new Response(null, { status: 204 });
  const tools: RouteTools = { env, ledger, url, path, dec, get, isAdmin: () => isAdmin(req, env), privateHtml, give: (...a) => give(env, ...a), fundingAccount: fundingAccount(env), grantsAccount: grantsAccount(env) };
  const answered = await app.route?.(req, env, ctx, tools);
  if (answered) return answered;

  // ---- the site ----
  if (path === '/') { if (get()) return get()!; return Response.redirect(`${url.origin}/p/${encodeURIComponent(fundingAccount(env))}`, 302); }
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/p\/(.+)\/team$/))) {
    const account = dec(m[1]);
    if (!validTeamAccount(account)) return error('invalid_account', 400);
    const view = await ledger.project(account);
    if (!view.found) return privateHtml(renderMessage(account, false, 'No such project', 'This project is not listed.'), 404);
    if (req.method === 'POST') {
      if (req.headers.get('origin') !== url.origin) return error('invalid_origin', 403);
      if (Number(req.headers.get('content-length')) > 16_000) return error('form_too_large', 413);
      if (!app.identity) return privateHtml(renderMessage(account, false, 'Team change not started', 'This deployment has no identity door for editing the roster on the page; edit the committed config instead.'), 501);
      try { return await app.identity.begin(req, env, readTeamEdit(account, await req.formData())); }
      catch (e) { return privateHtml(renderMessage(account, false, 'Team change not started', (e as Error).message), 400); }
    }
    if (get()) return get()!;
    try {
      const file = await readTeamFile(env, account);
      return privateHtml(renderTeamPage(account, file, url.searchParams.get('edit') ?? undefined, undefined, Boolean(app.identity)));
    } catch (e) { return privateHtml(renderTeamPage(account, undefined, undefined, (e as Error).message), 503); }
  }
  // A funder gives from the page: their key, an amount, a word. The key is a bearer sent once, never kept.
  if ((m = path.match(/^\/p\/(.+)\/about$/))) {
    const account = dec(m[1]);
    const view = await ledger.project(account);
    if (!view.found) return html(renderMessage(account, false, 'No such project', `No project found for ${account}.`), 404);
    return html(renderDocPage(account, 'About', view.profile.about_md));
  }
  if ((m = path.match(/^\/p\/(.+)\/sessions$/))) {
    if (get()) return get()!;
    const account = dec(m[1]);
    const view = await ledger.project(account);
    if (!view.found) return html(renderMessage(account, false, 'No such project', `No project found for ${account}.`), 404);
    const stream = await ledger.sessions(account, 100);
    return html(renderSessionsPage(account, stream.sessions, stream.live, Date.now()));
  }
  if ((m = path.match(/^\/p\/(.+)\/sessions\/([^/]+)$/))) {
    if (get()) return get()!;
    const got = await ledger.session(dec(m[1]), dec(m[2]));
    if (!got.ok || !got.session) return html(renderMessage(dec(m[1]), false, 'No such session', 'Nothing was narrated under that key.'), 404);
    return html(renderSessionPage(dec(m[1]), got.session, Date.now()));
  }
  if ((m = path.match(/^\/p\/(.+)\/items\/([^/]+)$/))) {
    if (get()) return get()!;
    const [view, item, road] = await Promise.all([ledger.project(dec(m[1])), ledger.item(dec(m[1]), dec(m[2])), ledger.roadmap(dec(m[1]))]);
    if (!view.found) return html(renderMessage(dec(m[1]), false, 'No such project', `No project found for ${dec(m[1])}.`), 404);
    return html(renderItemPage(view, item, road.revision?.roadmap ?? EMPTY_ROADMAP, Date.now()));
  }
  if ((m = path.match(/^\/p\/(.+)$/))) {
    if (get()) return get()!;
    const account = dec(m[1]);
    if (account.startsWith('@')) { const f = await ledger.funder(account); if (!f.found) return html(renderMessage(account, false, 'No such funder', `No funder found for ${account}.`), 404); return (await app.page?.funder?.(f, tools)) ?? json(f, { headers: NO_STORE }); }
    const view = await ledger.project(account);
    if (!view.found) return html(renderMessage(account, false, 'No such project', `No project found for ${account}.`), 404);
    if (view.is_project && isStale(view.profile.synced_at)) ctx.waitUntil(syncProfile(env, account));
    const [stream, road, slots] = await Promise.all([ledger.sessions(account, 50), ledger.roadmap(account), app.page?.project?.(account, view, tools) ?? Promise.resolve({})]);
    return html(renderProject(view, stream.sessions, stream.live, road.revision?.roadmap ?? EMPTY_ROADMAP, road.revision, { view: url.searchParams.get('view') ?? undefined, sort: url.searchParams.get('sort') ?? undefined }, slots));
  }

  // ---- admin: through the reviewed workflow only ----
  if (path.startsWith('/admin/')) {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    if (path === '/admin/status') { if (get()) return get()!; return json(await ledger.status()); }
    if (path === '/admin/reset-daily') { if (req.method !== 'POST') return methodNotAllowed(); return json(await ledger.resetDaily()); }
    // The books, whole: an export is every storage entry; an import restores one into an empty worker, or
    // over this one when the reviewed caller says replace.
    if (path === '/admin/export') { if (get()) return get()!; return json(await ledger.exportAll(), { headers: NO_STORE }); }
    if (path === '/admin/import') {
      if (req.method !== 'POST') return methodNotAllowed();
      const body = parseJson<{ entries?: Array<[string, unknown]>; replace?: boolean }>(await req.text());
      if (!body || !Array.isArray(body.entries)) return error('invalid_request');
      const r = await ledger.importAll(body.entries, body.replace === true);
      return json(r, { status: r.ok ? 200 : r.error === 'not_empty' ? 409 : 400 });
    }
    if ((m = path.match(/^\/admin\/keys\/([^/]+)\/revoke$/))) { if (req.method !== 'POST') return methodNotAllowed(); const r = await ledger.keyRevoke(dec(m[1])); return json(r, { status: r.ok ? 200 : 404 }); }
    if ((m = path.match(/^\/admin\/accounts\/([^/]+)\/(mint|grant|sync|profile|moderate|keys)$/))) {
      const id = dec(m[1]);
      if (m[2] === 'keys') { if (get()) return get()!; return json(await ledger.keys(id)); }
      if (req.method !== 'POST') return methodNotAllowed();
      if (m[2] === 'sync') return json({ ok: await syncProfile(env, id), account: id });
      const body = parseJson<Record<string, unknown>>(await req.text()) ?? {};
      if (m[2] === 'mint') { if (typeof body.amount_usd_cents !== 'number') return error('invalid_request'); return json(await ledger.mint(id, body.amount_usd_cents, body.key as string | undefined, body.sponsor as Sponsor | undefined, body.for)); }
      if (m[2] === 'grant') { if (typeof body.to !== 'string' || typeof body.amount_usd_cents !== 'number') return error('invalid_request'); const r = await ledger.grant(id, body.to, body.amount_usd_cents, body.key as string | undefined, undefined, body.for); return json(r, { status: r.ok ? 200 : 400 }); }
      if (m[2] === 'profile') return json(await ledger.setProfile(id, (body.profile as Partial<AccountProfile>) ?? {}, body.goal_days as number | undefined));
      if (typeof body.status !== 'string') return error('invalid_request');
      return json(await ledger.moderate(id, body.status as Moderation, body.reason as string | undefined, { tagline_override: body.tagline_override as string | undefined, cover_override: body.cover_override as string | undefined }));
    }
    if ((m = path.match(/^\/admin\/accounts\/([^/]+)\/sessions\/([^/]+)$/))) { if (req.method !== 'DELETE') return methodNotAllowed(); const r = await ledger.sessionDelete(dec(m[1]), dec(m[2])); return json(r, { status: r.ok ? 200 : 404 }); }
    return error('not_found', 404);
  }

  if (path === '/webhooks/stripe') return stripeWebhook(req, env);
  // Grant credits: a funder's key gives to a project; a funder's books are public.
  if (path === '/v1/grants/give') {
    if (req.method !== 'POST') return methodNotAllowed();
    const claims = await authedClaims(req, env);
    if (!claims) return error('auth_failed', 401);
    if (!hasScope(claims, 'give')) return error('scope_required', 403, { scope: 'give' });
    const body = parseJson<{ to?: string; usd_cents?: number; note?: string; key?: string; for?: unknown }>(await req.text()) ?? {};
    const r = await give(env, claims.account, body.to, body.usd_cents, body.note, typeof body.key === 'string' ? `give:${claims.account}:${body.key}` : `give:${crypto.randomUUID()}`, body.for);
    return json({ ...r, from: claims.account }, { status: r.ok ? 200 : r.error === 'insufficient_balance' ? 402 : r.error === 'no_such_project' || r.error === 'no_such_item' ? 404 : 400 });
  }
  if ((m = path.match(/^\/v1\/funders\/([^/]+)$/))) { if (get()) return get()!; const f = await ledger.funder(`@${dec(m[1]).replace(/^@/, '').toLowerCase()}`); return json(f, { status: f.found ? 200 : 404, headers: NO_STORE }); }
  // The rails beyond the model, on a spending key: a card minted against the balance, a partner's charge.
  if (path === '/v1/rails/card' || path === '/v1/rails/partner') {
    const claims = await authedClaims(req, env);
    if (!claims) return error('auth_failed', 401);
    if (!hasScope(claims, 'pay')) return error('scope_required', 403, { scope: 'pay' });
    return path === '/v1/rails/card' ? mintCard(req, env, claims) : settlePartner(req, env, claims);
  }
  // ---- keys ----
  if (path === '/v1/keys/challenge') return handleKeyChallenge(req, env);
  if (path === '/v1/keys/mint') return handleKeyMint(req, env);
  if (path === '/v1/keys/rotate') return handleKeyRotate(req, env);
  if (path === '/v1/keys') return handleKeyList(req, env);

  // ---- the development stream ----
  if (path === '/v1/agent/events') return agentEvents(req, env);
  // An owner-side driver's push: the normalized roadmap, on a steer-scoped key. The account is the key's.
  if (path === '/v1/agent/roadmap') {
    if (req.method !== 'POST') return methodNotAllowed();
    const claims = await authedClaims(req, env);
    if (!claims) return error('auth_failed', 401);
    // A substrate narrates the roadmap it works (narrate); an owner-side driver steers it (steer).
    if (!hasScope(claims, 'steer') && !hasScope(claims, 'narrate')) return error('scope_required', 403, { scope: 'narrate' });
    const body = parseJson<{ source?: string; roadmap?: Roadmap; by?: string }>(await req.text());
    if (!body?.roadmap || typeof body.source !== 'string') return error('invalid_request');
    const r = await ledger.roadmapSet(claims.account, body.roadmap, body.source, typeof body.by === 'string' ? body.by : claims.kid);
    return json(r, { status: r.ok ? 200 : 400 });
  }
  if ((m = path.match(/^\/v1\/accounts\/([^/]+)\/roadmap$/))) { if (get()) return get()!; const r = await ledger.roadmap(dec(m[1])); return json(r, { status: r.ok ? 200 : 404, headers: NO_STORE }); }
  if ((m = path.match(/^\/v1\/accounts\/([^/]+)\/roadmap\/revisions$/))) { if (get()) return get()!; return json(await ledger.roadmapRevisions(dec(m[1]), Number(url.searchParams.get('limit') ?? 20)), { headers: NO_STORE }); }
  if ((m = path.match(/^\/v1\/accounts\/([^/]+)\/sessions$/))) { if (get()) return get()!; return json(await ledger.sessions(dec(m[1]), Number(url.searchParams.get('limit') ?? 30)), { headers: NO_STORE }); }
  if ((m = path.match(/^\/v1\/accounts\/([^/]+)\/sessions\/([^/]+)\/events$/))) return sessionEvents(env, dec(m[1]), dec(m[2]), req);
  if ((m = path.match(/^\/v1\/accounts\/([^/]+)\/sessions\/([^/]+)$/))) { if (get()) return get()!; const r = await ledger.session(dec(m[1]), dec(m[2])); return json(r, { status: r.ok ? 200 : 404, headers: NO_STORE }); }
  if ((m = path.match(/^\/v1\/accounts\/([^/]+)\/items\/([^/]+)\/events$/))) return itemEvents(env, dec(m[1]), dec(m[2]), req);
  if ((m = path.match(/^\/v1\/accounts\/([^/]+)\/events$/))) return accountEvents(env, dec(m[1]), req);
  if ((m = path.match(/^\/v1\/accounts\/([^/]+)\/items\/([^/]+)$/))) { if (get()) return get()!; return json(await ledger.item(dec(m[1]), dec(m[2])), { headers: NO_STORE }); }
  if (path === '/v1/funding/sessions') { if (get()) return get()!; return json(await ledger.sessions(fundingAccount(env), Number(url.searchParams.get('limit') ?? 30)), { headers: NO_STORE }); }

  // ---- the books, public ----
  const calls = async (account: string) => json(await ledger.calls(account, Number(url.searchParams.get('limit') ?? 50), url.searchParams.get('before') ?? undefined), { headers: NO_STORE });
  if ((m = path.match(/^\/v1\/accounts\/([^/]+)\/calls$/))) { if (get()) return get()!; return calls(dec(m[1])); }
  if (path === '/v1/funding/calls') { if (get()) return get()!; return calls(fundingAccount(env)); }
  const widget = async (account: string, kind: string): Promise<Response> => {
    if (kind === 'runway') return new Response(renderRunwaySvg(await ledger.funding(account)), { headers: SVG });
    if (kind === 'activity') return new Response(renderActivitySvg(await ledger.funding(account)), { headers: SVG });
    if (kind === 'roadmap') { const road = await ledger.roadmap(account); return new Response(renderRoadmapSvg(road.revision?.roadmap.items ?? []), { headers: SVG }); }
    const [stream, view] = await Promise.all([ledger.sessions(account, 20), ledger.project(account)]);
    return new Response(renderNowSvg(stream.sessions, stream.live, view.profile.schedule_json), { headers: { ...SVG, 'cache-control': 'max-age=60, s-maxage=60' } });
  };
  if ((m = path.match(/^\/v1\/accounts\/([^/]+)\/(runway|activity|roadmap|now)\.svg$/))) { if (get()) return get()!; return widget(dec(m[1]), m[2]); }
  if ((m = path.match(/^\/v1\/funding\/(runway|activity|roadmap|now)\.svg$/))) { if (get()) return get()!; return widget(fundingAccount(env), m[1]); }
  if ((m = path.match(/^\/v1\/accounts\/([^/]+)$/))) { if (get()) return get()!; return json(await ledger.funding(dec(m[1]))); }
  if (path === '/v1/funding') { if (get()) return get()!; return json(await ledger.funding(fundingAccount(env))); }

  // ---- the model rail: a stock provider SDK pointed at this host ----
  if (path === '/v1/messages' || path === '/v1/chat/completions' || path === '/v1/responses') {
    const claims = await authedClaims(req, env);
    if (!claims) return error('auth_failed', 401);
    if (!hasScope(claims, 'spend')) return error('scope_required', 403, { scope: 'spend' });
    return handleModelCall(req, env, claims, ctx, path);
  }
  if (path === '/v1/models') {
    const claims = await authedClaims(req, env);
    if (!claims) return error('auth_failed', 401);
    return json({ object: 'list', data: claims.models.map((id) => ({ id, object: 'model', owned_by: 'open-autonomy' })) });
  }
  // The gateway's catalog, for an owner choosing a key's models: the model ids alone, read through the platform's
  // own gateway key, for any holder of a valid key of the platform.
  if (path === '/v1/catalog') {
    const claims = await authedClaims(req, env);
    if (!claims) return error('auth_failed', 401);
    // The gateway pages its list (has_more, next_cursor); every page is read.
    type Listed = { id?: string; name?: string; model?: string } | string;
    const ids: string[] = [];
    let cursor: string | undefined;
    let first: unknown;
    for (let page = 0; page < 40; page++) {
      const upstream = await fetch(`${gatewayBase(env)}/v1/models${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: { authorization: `Bearer ${env.MODEL_GATEWAY_API_KEY ?? ''}` } }).catch(() => undefined);
      if (!upstream?.ok) { if (page === 0) return error('upstream_unavailable', 502); break; }
      const body = await upstream.json().catch(() => ({})) as { data?: Listed[]; models?: Listed[]; has_more?: boolean; next_cursor?: string };
      if (page === 0) first = body;
      const listed: Listed[] = Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : [];
      for (const m of listed) { const id = typeof m === 'string' ? m : m.model ?? m.id ?? m.name; if (typeof id === 'string') ids.push(id); }
      if (!body.has_more || !body.next_cursor || body.next_cursor === cursor) break;
      cursor = body.next_cursor;
    }
    const unique = [...new Set(ids)].sort();
    // The gateway's own shape when nothing was read from it: passed through, so the catalog is never silently empty.
    return unique.length ? json({ object: 'list', data: unique.map((id) => ({ id, object: 'model' })) }) : json({ object: 'list', data: [], upstream: first });
  }
  return error('not_found', 404);
}
