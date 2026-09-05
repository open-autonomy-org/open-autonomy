import type { Roadmap } from '@open-autonomy/sdk/roadmap';
import { error, html, json, methodNotAllowed, parseJson } from './http.js';
import { authedClaims, handleKeyChallenge, handleKeyList, handleKeyMint, handleKeyRotate } from './keys.js';
import { LedgerClient, LimitLedger, type AccountProfile, type Moderation, type Sponsor, type Tier } from './ledger.js';
import { handleModelCall } from './proxy.js';
import { mintCard, settlePartner, stripeWebhook } from './rails.js';
import { renderExplore, renderItemPage, renderMessage, renderProject, renderSessionPage, renderSessionsPage } from './site.js';
import { handleSponsorsWebhook } from './sponsors.js';
import { agentEvents, itemEvents, sessionEvents } from './stream.js';
import { isStale, syncAllStale, syncProfile } from './sync.js';
import { hasScope, type Env } from './types.js';
import { LOGO_SVG } from './ui.js';
import { renderActivitySvg, renderNowSvg, renderRoadmapSvg, renderRunwaySvg } from './widgets.js';

export { LimitLedger };

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(req, env, ctx);
    } catch (err) {
      console.error('[platform] unhandled error', err);
      return error('internal_error', 500);
    }
  },
  // Monthly: credit the sponsor account with its active recurring sponsorships (idempotent on the month),
  // then refresh every public project's docs.
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    const key = new Date(event.scheduledTime).toISOString().slice(0, 7);
    const result = await new LedgerClient(env.LIMITS).accrue(sponsorAccount(env), key);
    console.log('[platform] monthly accrue', sponsorAccount(env), key, JSON.stringify(result));
    console.log('[platform] docs sync', await syncAllStale(env));
  },
} satisfies ExportedHandler<Env>;

const SVG = { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'max-age=300, s-maxage=300' };
const NO_STORE = { 'cache-control': 'no-store' };
const fundingAccount = (env: Env): string => env.DEFAULT_FUNDING_ACCOUNT || 'open-autonomy-org/open-autonomy';
const sponsorAccount = (env: Env): string => env.DEFAULT_SPONSOR_ACCOUNT || fundingAccount(env);
const isAdmin = (req: Request, env: Env): boolean => { const t = req.headers.get('x-admin-token'); return Boolean(t && env.AGENT_PROXY_ADMIN_TOKEN && t === env.AGENT_PROXY_ADMIN_TOKEN); };
const dec = decodeURIComponent;
const EMPTY_ROADMAP: Roadmap = { schema: 'open-autonomy.roadmap.v3', items: [] };

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const ledger = new LedgerClient(env.LIMITS);
  const get = (): Response | null => (req.method === 'GET' ? null : methodNotAllowed());

  if (path === '/healthz') return new Response('ok');
  if (path === '/favicon.svg') return new Response(LOGO_SVG, { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'max-age=86400' } });
  if (path === '/favicon.ico') return new Response(null, { status: 204 });

  // ---- the site ----
  if (path === '/') {
    if (get()) return get()!;
    const { entries } = await ledger.directory();
    for (const e of entries) if (e.is_project && isStale(e.profile.synced_at)) ctx.waitUntil(syncProfile(env, e.account));
    return html(renderExplore(entries));
  }
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/p\/(.+)\/redeem$/))) {
    if (req.method !== 'POST') return methodNotAllowed();
    const account = dec(m[1]);
    const code = String((await req.formData()).get('code') ?? '').trim();
    if (!code) return html(renderMessage(account, false, 'Coupon not redeemed', 'Enter a coupon code.'), 400);
    const result = await ledger.couponRedeem(code, account);
    const message = result.ok ? `Added $${((result.amount_usd_cents ?? 0) / 100).toFixed(2)} to ${account}.` : redeemMessage(result.error);
    return html(renderMessage(account, result.ok, result.ok ? 'Coupon redeemed' : 'Coupon not redeemed', message), result.ok ? 200 : 400);
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
    const view = await ledger.project(account);
    if (!view.found) return html(renderMessage(account, false, 'No such project', `No project found for ${account}.`), 404);
    if (view.is_project && isStale(view.profile.synced_at)) ctx.waitUntil(syncProfile(env, account));
    const [stream, road] = await Promise.all([ledger.sessions(account, 50), ledger.roadmap(account)]);
    return html(renderProject(view, stream.sessions, stream.live, road.revision?.roadmap ?? EMPTY_ROADMAP, road.revision));
  }

  // ---- admin: through the reviewed workflow only ----
  if (path.startsWith('/admin/')) {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    if (path === '/admin/status') { if (get()) return get()!; return json(await ledger.status()); }
    if (path === '/admin/reset-daily') { if (req.method !== 'POST') return methodNotAllowed(); return json(await ledger.resetDaily()); }
    if (path === '/admin/coupons') {
      if (req.method === 'GET') return json(await ledger.couponList());
      if (req.method !== 'POST') return methodNotAllowed();
      const body = parseJson<{ amount_usd_cents?: number; from?: string; sponsor?: Sponsor; code?: string; expires_at?: string }>(await req.text());
      if (!body || typeof body.amount_usd_cents !== 'number') return error('invalid_request');
      const result = await ledger.couponCreate(body as { amount_usd_cents: number });
      return json(result, { status: result.ok ? 200 : 409 });
    }
    if ((m = path.match(/^\/admin\/keys\/([^/]+)\/revoke$/))) { if (req.method !== 'POST') return methodNotAllowed(); const r = await ledger.keyRevoke(dec(m[1])); return json(r, { status: r.ok ? 200 : 404 }); }
    if ((m = path.match(/^\/admin\/accounts\/([^/]+)\/(mint|grant|accrue|sync|profile|moderate|keys)$/))) {
      const id = dec(m[1]);
      if (m[2] === 'keys') { if (get()) return get()!; return json(await ledger.keys(id)); }
      if (req.method !== 'POST') return methodNotAllowed();
      if (m[2] === 'sync') return json({ ok: await syncProfile(env, id), account: id });
      const body = parseJson<Record<string, unknown>>(await req.text()) ?? {};
      if (m[2] === 'mint') { if (typeof body.amount_usd_cents !== 'number') return error('invalid_request'); return json(await ledger.mint(id, body.amount_usd_cents, body.key as string | undefined, body.sponsor as Sponsor | undefined)); }
      if (m[2] === 'grant') { if (typeof body.to !== 'string' || typeof body.amount_usd_cents !== 'number') return error('invalid_request'); const r = await ledger.grant(id, body.to, body.amount_usd_cents, body.key as string | undefined); return json(r, { status: r.ok ? 200 : 400 }); }
      if (m[2] === 'accrue') { if (typeof body.key !== 'string') return error('invalid_request'); return json(await ledger.accrue(id, body.key)); }
      if (m[2] === 'profile') return json(await ledger.setProfile(id, (body.profile as Partial<AccountProfile>) ?? {}, body.goal_days as number | undefined, body.tiers as Tier[] | undefined));
      if (typeof body.status !== 'string') return error('invalid_request');
      return json(await ledger.moderate(id, body.status as Moderation, body.reason as string | undefined, { tagline_override: body.tagline_override as string | undefined, cover_override: body.cover_override as string | undefined }));
    }
    if ((m = path.match(/^\/admin\/accounts\/([^/]+)\/sessions\/([^/]+)$/))) { if (req.method !== 'DELETE') return methodNotAllowed(); const r = await ledger.sessionDelete(dec(m[1]), dec(m[2])); return json(r, { status: r.ok ? 200 : 404 }); }
    return error('not_found', 404);
  }

  if (path === '/webhooks/github-sponsors') return handleSponsorsWebhook(req, env, sponsorAccount(env));
  if (path === '/webhooks/stripe') return stripeWebhook(req, env);
  // The rails beyond the model, on a spending key: a card minted against the balance, a partner's charge.
  if (path === '/v1/rails/card' || path === '/v1/rails/partner') {
    const claims = await authedClaims(req, env);
    if (!claims) return error('auth_failed', 401);
    if (!hasScope(claims, 'spend')) return error('scope_required', 403, { scope: 'spend' });
    return path === '/v1/rails/card' ? mintCard(req, env, claims) : settlePartner(req, env, claims);
  }
  if (path === '/v1/coupons/redeem') {
    if (req.method !== 'POST') return methodNotAllowed();
    const body = parseJson<{ code?: string; account?: string }>(await req.text());
    if (!body?.code || !body.account) return error('invalid_request');
    const result = await ledger.couponRedeem(body.code, body.account);
    return json(result, { status: result.ok ? 200 : result.error === 'coupon_not_found' ? 404 : result.error === 'coupon_already_redeemed' ? 409 : 400 });
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
    if (!hasScope(claims, 'steer')) return error('scope_required', 403, { scope: 'steer' });
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
  return error('not_found', 404);
}

function redeemMessage(code?: string): string {
  switch (code) {
    case 'coupon_not_found': return 'That coupon code was not found.';
    case 'coupon_already_redeemed': return 'That coupon has already been redeemed.';
    case 'coupon_expired': return 'That coupon has expired.';
    case 'insufficient_balance': return 'The coupon issuer no longer has the balance to back it.';
    default: return 'Coupon could not be redeemed.';
  }
}
