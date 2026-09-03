import { handleAnthropic } from './anthropic.js';
import { healthOptsFromEnv, limitsFromEnv } from './config.js';
import { error, json, methodNotAllowed, parseJson } from './errors.js';
import { isStale, syncAllStale, syncProfile } from './github-sync.js';
import { handleKeyChallenge, handleKeyMint, handleKeyRotate } from './keys.js';
import { LimitLedger, LimitLedgerClient, type Moderation, type Sponsor, type Tier, type AccountProfile } from './limit-ledger.js';
import { handleOpenAI } from './openai.js';
import { LOGO_SVG, renderExplore, renderProject, renderRedeemResult, renderRunSession } from './platform-html.js';
import { RunBudget, RunBudgetClient } from './run-budget.js';
import { renderRunwaySvg } from './runway-svg.js';
import { renderActivitySvg, renderRoadmapSvg } from './widgets-svg.js';
import { parseRoadmap } from './project-docs.js';
import { handleSponsorsWebhook } from './sponsors-webhook.js';
import { authedClaims, mintFromRequest } from './mint.js';
import { extractBearer } from './token.js';
import type { Env, MintRunRequest, RunClaims } from './types.js';

export { LimitLedger, RunBudget };

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(req, env, ctx);
    } catch (err) {
      console.error('[agent-model-proxy] unhandled error', err);
      return error('internal_error', 500);
    }
  },

  // Monthly cron (see [triggers] in wrangler.toml): mint the sponsor account with its active recurring
  // sponsorships. Idempotent on the YYYY-MM key. This is the recurring-funding path GitHub's webhook
  // can't provide (no per-renewal event).
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    const key = new Date(event.scheduledTime).toISOString().slice(0, 7); // YYYY-MM (UTC)
    const account = sponsorAccount(env);
    const result = await new LimitLedgerClient(env.LIMITS).accrue(account, key);
    console.log('[agent-model-proxy] monthly accrue', account, key, JSON.stringify(result));
    // Refresh every public project's GitHub-synced display metadata.
    const synced = await syncAllStale(env);
    console.log('[agent-model-proxy] profile sync', synced);
  },
} satisfies ExportedHandler<Env>;

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/healthz') return new Response('ok'); // the WORKER's own liveness
  // Org-fleet health (detect + surface, #66): aggregate counts only (no per-repo detail), so anyone — an
  // operator, the status page, or an external uptime check — can SEE when a loop has gone dark. `ok:false`
  // when any monitored org is in the down band. Notifying a human is the substrate runner's job, not this.
  if (path === '/health') {
    if (req.method !== 'GET') return methodNotAllowed();
    const res = await new LimitLedgerClient(env.LIMITS).health(healthOptsFromEnv(env, Date.now()));
    const worst = res.verdicts.filter((v) => v.band !== 'dormant').reduce((m, v) => Math.max(m, v.age_minutes), 0);
    return json({ ok: res.down === 0, monitored: res.monitored, down: res.down, worst_age_minutes: worst });
  }
  if (path === '/favicon.svg') return new Response(LOGO_SVG, { headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'max-age=86400' } });
  if (path === '/favicon.ico') return new Response(null, { status: 204 });

  // ---- Funding platform (server-rendered HTML storefront) ----
  // Explore grid: every discovered public project. Stale profiles refresh in the background.
  if (path === '/') {
    if (req.method !== 'GET') return methodNotAllowed();
    const { entries } = await new LimitLedgerClient(env.LIMITS).directory();
    for (const e of entries) if (e.is_project && isStale(e.profile.synced_at)) ctx.waitUntil(syncProfile(env, e.account));
    return html(renderExplore(entries));
  }
  // Coupon redemption form (must precede the project-page match — greedy capture).
  const redeemForm = path.match(/^\/p\/(.+)\/redeem$/);
  if (redeemForm) {
    if (req.method !== 'POST') return methodNotAllowed();
    const account = decodeURIComponent(redeemForm[1]);
    const form = await req.formData();
    const code = String(form.get('code') ?? '').trim();
    if (!code) return html(renderRedeemResult(account, false, 'Enter a coupon code.'), 400);
    const result = await new LimitLedgerClient(env.LIMITS).couponRedeem(code, account);
    const message = result.ok
      ? `Added $${((result.amount_usd_cents ?? 0) / 100).toFixed(2)} to ${account}.`
      : redeemMessage(result.error);
    return html(renderRedeemResult(account, result.ok, message), result.ok ? 200 : 400);
  }
  // Live session as JSON — what the slide-in drawer polls for live updates (public, same scope as the HTML
  // page below: the run's repo must equal the path account). No token: a public project's run is public.
  const runSessionJson = path.match(/^\/p\/(.+)\/runs\/([^/]+)\/session\.json$/);
  if (runSessionJson) {
    if (req.method !== 'GET') return methodNotAllowed();
    const account = decodeURIComponent(runSessionJson[1]);
    const runId = decodeURIComponent(runSessionJson[2]);
    const st = await new RunBudgetClient(env.RUNS, runId).status() as { claims?: RunClaims | null; session?: { updated_at: string; turns: unknown[] } | null; consumed_usd_cents?: number; request_count?: number; revoked?: boolean };
    if (!st.claims || st.claims.repo !== account) return error('run_not_found', 404);
    return json({
      run_id: runId, repo: st.claims.repo, issue: st.claims.issue, actor: st.claims.actor,
      purpose: st.claims.purpose ?? 'agent', github_run_id: st.claims.github_run_id,
      request_count: st.request_count ?? 0, consumed_usd_cents: st.consumed_usd_cents ?? 0,
      revoked: st.revoked ?? false, updated_at: st.session?.updated_at ?? '', turns: st.session?.turns ?? [],
    }, { headers: { 'cache-control': 'no-store' } });
  }

  // Live session view (human): the proxy-captured rolling window of a run's session, under its public
  // project. Server-side DO read (no token) — the session of a run in a public repo is public, exactly like
  // the project page. Must match BEFORE the generic project page (which would swallow the /runs/<id> suffix).
  const runSession = path.match(/^\/p\/(.+)\/runs\/([^/]+)$/);
  if (runSession) {
    if (req.method !== 'GET') return methodNotAllowed();
    const account = decodeURIComponent(runSession[1]);
    const runId = decodeURIComponent(runSession[2]);
    const st = await new RunBudgetClient(env.RUNS, runId).status() as { claims?: RunClaims | null; session?: { updated_at: string; turns: Array<{ role: string; text: string }> } | null; consumed_usd_cents?: number; request_count?: number; revoked?: boolean };
    if (!st.claims || st.claims.repo !== account) return html(renderRedeemResult(account, false, `No run ${runId} for ${account}.`), 404);
    return html(renderRunSession({
      run_id: runId,
      repo: st.claims.repo,
      issue: st.claims.issue,
      actor: st.claims.actor,
      purpose: st.claims.purpose ?? 'agent',
      github_run_id: st.claims.github_run_id,
      consumed_usd_cents: st.consumed_usd_cents ?? 0,
      request_count: st.request_count ?? 0,
      revoked: st.revoked ?? false,
      updated_at: st.session?.updated_at,
      turns: st.session?.turns ?? [],
    }, Date.now()));
  }

  // Creator page.
  const projectPage = path.match(/^\/p\/(.+)$/);
  if (projectPage) {
    if (req.method !== 'GET') return methodNotAllowed();
    const account = decodeURIComponent(projectPage[1]);
    const view = await new LimitLedgerClient(env.LIMITS).project(account);
    // Don't render a fake, zeroed-out page for an account that has never been seen.
    if (!view.found) return html(renderRedeemResult(account, false, `No project found for ${account}.`), 404);
    if (view.is_project && isStale(view.profile.synced_at)) ctx.waitUntil(syncProfile(env, account));
    const page = Math.max(0, Math.floor(Number(url.searchParams.get('p')) || 0));
    return html(renderProject(view, page));
  }

  if (path === '/admin/runs/mint') return mintRun(req, env);
  if (path === '/admin/limits/status') {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    if (req.method !== 'GET') return methodNotAllowed();
    return json(await new LimitLedgerClient(env.LIMITS).status());
  }
  // Bulk recovery: free the active-run slots of every run whose token has already expired (leaked
  // runs from workflows that died before their release step) and report what remains active. The
  // ledger also reaps lazily on each register, so this is the operator escape hatch, not the only path.
  if (path === '/admin/limits/reap') {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    if (req.method !== 'POST') return methodNotAllowed();
    return json(await new LimitLedgerClient(env.LIMITS).reap());
  }
  // Operator escape hatch: zero today's global daily spend rail (e.g. after a metering bug polluted the
  // counter and pinned the cap before the UTC rollover). Corrects the rail; leaves balances + reservations.
  if (path === '/admin/limits/reset-daily') {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    if (req.method !== 'POST') return methodNotAllowed();
    return json(await new LimitLedgerClient(env.LIMITS).resetDaily());
  }
  // Release every active run for a repo — the teardown hook for a disposable cell (its repo is being
  // deleted, so its in-flight runs are abandoned and must not pin active-run slots for the token TTL).
  const reapRepo = path.match(/^\/admin\/accounts\/([^/]+)\/reap-runs$/);
  if (reapRepo) {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    if (req.method !== 'POST') return methodNotAllowed();
    return json(await new LimitLedgerClient(env.LIMITS).reapRepo(decodeURIComponent(reapRepo[1])));
  }
  // GitHub Sponsors webhook: maintains the sponsor account's active-sponsor list (no token; HMAC-verified).
  if (path === '/webhooks/github-sponsors') return handleSponsorsWebhook(req, env, sponsorAccount(env));

  // Account funding ops (admin). mint = money in at a node; grant = transfer down the tree; accrue =
  // mint the month's recurring sponsorships.
  const acctOp = path.match(/^\/admin\/accounts\/([^/]+)\/(mint|grant|accrue)$/);
  if (acctOp) {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    if (req.method !== 'POST') return methodNotAllowed();
    const ledger = new LimitLedgerClient(env.LIMITS);
    const id = decodeURIComponent(acctOp[1]);
    const body = parseJson<{ amount_usd_cents?: number; to?: string; key?: string; sponsor?: Sponsor }>(await req.text()) ?? {};
    if (acctOp[2] === 'mint') {
      if (typeof body.amount_usd_cents !== 'number') return error('invalid_request');
      return json(await ledger.mint(id, body.amount_usd_cents, body.key, body.sponsor));
    }
    if (acctOp[2] === 'grant') {
      if (!body.to || typeof body.amount_usd_cents !== 'number') return error('invalid_request');
      const result = await ledger.grant(id, body.to, body.amount_usd_cents, body.key);
      return json(result, { status: result.ok ? 200 : 400 });
    }
    if (!body.key) return error('invalid_request'); // accrue
    return json(await ledger.accrue(id, body.key));
  }

  // Account curation (admin): set the operator-owned profile bits, moderate (ban/hide/pin), or force
  // a GitHub metadata sync now instead of waiting for the cron / next view.
  const acctAdmin = path.match(/^\/admin\/accounts\/([^/]+)\/(profile|moderate|sync)$/);
  if (acctAdmin) {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    if (req.method !== 'POST') return methodNotAllowed();
    const id = decodeURIComponent(acctAdmin[1]);
    const ledger = new LimitLedgerClient(env.LIMITS);
    if (acctAdmin[2] === 'sync') return json({ ok: await syncProfile(env, id), account: id });
    const body = parseJson<{ profile?: Partial<AccountProfile>; goal_days?: number; tiers?: Tier[]; status?: Moderation; reason?: string; tagline_override?: string; cover_override?: string }>(await req.text()) ?? {};
    if (acctAdmin[2] === 'profile') return json(await ledger.setProfile(id, body.profile ?? {}, body.goal_days, body.tiers));
    if (!body.status) return error('invalid_request');
    return json(await ledger.moderate(id, body.status, body.reason, { tagline_override: body.tagline_override, cover_override: body.cover_override }));
  }

  // Sponsorship coupons: issue + list (admin). A coupon is a bearer grant; `from` makes it transfer
  // from that account's balance, otherwise it mints on redeem.
  if (path === '/admin/coupons') {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    const ledger = new LimitLedgerClient(env.LIMITS);
    if (req.method === 'GET') return json(await ledger.couponList());
    if (req.method !== 'POST') return methodNotAllowed();
    const body = parseJson<{ amount_usd_cents?: number; from?: string; sponsor?: Sponsor; code?: string; expires_at?: string }>(await req.text());
    if (!body || typeof body.amount_usd_cents !== 'number') return error('invalid_request');
    const result = await ledger.couponCreate(body as { amount_usd_cents: number; from?: string; sponsor?: Sponsor; code?: string; expires_at?: string });
    return json(result, { status: result.ok ? 200 : 409 });
  }

  // Redeem a coupon into an account (public — the code is the bearer credential).
  if (path === '/v1/coupons/redeem') {
    if (req.method !== 'POST') return methodNotAllowed();
    const body = parseJson<{ code?: string; account?: string }>(await req.text());
    if (!body?.code || !body.account) return error('invalid_request');
    const result = await new LimitLedgerClient(env.LIMITS).couponRedeem(body.code, body.account);
    if (result.ok) return json(result);
    const status = result.error === 'coupon_not_found' ? 404 : result.error === 'coupon_already_redeemed' ? 409 : 400;
    return json(result, { status });
  }

  // Public per-account funding status + runway badge.
  // The public audit trail: every metered call charged to this account, newest first, paginated by cursor.
  const acctCalls = path.match(/^\/v1\/accounts\/([^/]+)\/calls$/);
  if (acctCalls) return callsJson(env, decodeURIComponent(acctCalls[1]), req);
  if (path === '/v1/funding/calls') return callsJson(env, fundingAccount(env), req);
  // Self-serve project keys: prove control of the repo (a claim file at HEAD), mint a standing key, rotate it.
  if (path === '/v1/keys/challenge') return handleKeyChallenge(req, env);
  if (path === '/v1/keys/mint') return handleKeyMint(req, env);
  if (path === '/v1/keys/rotate') return handleKeyRotate(req, env);
  const acctWidget = path.match(/^\/v1\/accounts\/([^/]+)\/(roadmap|activity)\.svg$/);
  if (acctWidget) return widgetSvg(env, decodeURIComponent(acctWidget[1]), acctWidget[2] as 'roadmap' | 'activity', req);
  if (path === '/v1/funding/roadmap.svg') return widgetSvg(env, fundingAccount(env), 'roadmap', req);
  if (path === '/v1/funding/activity.svg') return widgetSvg(env, fundingAccount(env), 'activity', req);
  const acctRunway = path.match(/^\/v1\/accounts\/([^/]+)\/runway\.svg$/);
  if (acctRunway) return runwaySvg(env, decodeURIComponent(acctRunway[1]), req);
  const acctStatus = path.match(/^\/v1\/accounts\/([^/]+)$/);
  if (acctStatus) {
    if (req.method !== 'GET') return methodNotAllowed();
    return json(await new LimitLedgerClient(env.LIMITS).funding(decodeURIComponent(acctStatus[1])));
  }
  // Default-account aliases (the canonical README badge URL).
  if (path === '/v1/funding') {
    if (req.method !== 'GET') return methodNotAllowed();
    return json(await new LimitLedgerClient(env.LIMITS).funding(fundingAccount(env)));
  }
  if (path === '/v1/funding/runway.svg') return runwaySvg(env, fundingAccount(env), req);

  const adminRun = path.match(/^\/admin\/runs\/([^/]+)(?:\/(revoke))?$/);
  if (adminRun) {
    if (!isAdmin(req, env)) return error('auth_failed', 401);
    const runId = decodeURIComponent(adminRun[1]);
    if (adminRun[2] === 'revoke') {
      if (req.method !== 'POST') return methodNotAllowed();
      await new RunBudgetClient(env.RUNS, runId).revoke();
      await new LimitLedgerClient(env.LIMITS).complete(runId);
      return json({ ok: true, run_id: runId });
    }
    if (req.method !== 'GET') return methodNotAllowed();
    return json(await new RunBudgetClient(env.RUNS, runId).status());
  }

  const statusRun = path.match(/^\/v1\/runs\/([^/]+)$/);
  if (statusRun) {
    const claims = await authedClaims(req, env);
    if (!claims) return error('auth_failed', 401);
    const runId = decodeURIComponent(statusRun[1]);
    if (runId !== claims.run_id) return error('forbidden_run', 403);
    return json(await new RunBudgetClient(env.RUNS, runId).status());
  }

  // Live session read: a token scoped to repo X may read the rolling session window of ANY run in repo X.
  // This is how the PM peers into a sibling run WHILE it executes — GitHub serves no in-progress logs, so the
  // proxy (which every model call flows through) is the only live vantage point. Repo-scoped, not run-scoped.
  const sessionRun = path.match(/^\/v1\/runs\/([^/]+)\/session$/);
  if (sessionRun) {
    if (req.method !== 'GET') return methodNotAllowed();
    const claims = await authedClaims(req, env);
    if (!claims) return error('auth_failed', 401);
    const runId = decodeURIComponent(sessionRun[1]);
    const target = await new RunBudgetClient(env.RUNS, runId).status() as { claims?: RunClaims | null; session?: { updated_at: string; turns: unknown[] } | null; request_count?: number; consumed_usd_cents?: number };
    if (!target.claims) return error('run_not_found', 404);
    if (target.claims.repo !== claims.repo) return error('forbidden_run', 403);
    return json({
      run_id: runId,
      repo: target.claims.repo,
      issue: target.claims.issue,
      actor: target.claims.actor,
      purpose: target.claims.purpose,
      request_count: target.request_count ?? 0,
      consumed_usd_cents: target.consumed_usd_cents ?? 0,
      session: target.session ?? { updated_at: '', turns: [] },
    });
  }

  const claims = await authedClaims(req, env);
  if (!claims) return error('auth_failed', 401);

  // Universal (native) routes: a stock provider SDK pointed at this host Just Works — Anthropic at
  // `/v1/messages`, OpenAI at `/v1/chat/completions` and `/v1/responses`. No prefix, no dialect.
  if (path === '/v1/messages') return handleAnthropic(req, env, claims, ctx);
  if (path === '/v1/chat/completions') return handleOpenAI(req, env, claims, ctx, '/v1/chat/completions');
  if (path === '/v1/responses') return handleOpenAI(req, env, claims, ctx, '/v1/responses');

  return error('not_found', 404);
}

async function mintRun(req: Request, env: Env): Promise<Response> {
  if (!isAdmin(req, env)) return error('auth_failed', 401);
  if (req.method !== 'POST') return methodNotAllowed();
  const body = parseJson<MintRunRequest>(await req.text());
  if (!body) return error('invalid_json');
  return mintFromRequest(env, body);
}

function isAdmin(req: Request, env: Env): boolean {
  const token = req.headers.get('x-admin-token');
  return Boolean(token && env.AGENT_PROXY_ADMIN_TOKEN && token === env.AGENT_PROXY_ADMIN_TOKEN);
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
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

// The account whose runway the default README badge (/v1/funding*) shows.
function fundingAccount(env: Env): string {
  return env.DEFAULT_FUNDING_ACCOUNT || 'volter-ai/open-autonomy';
}

// The account that org-level GitHub Sponsors funding lands on (the org's own project).
function sponsorAccount(env: Env): string {
  return env.DEFAULT_SPONSOR_ACCOUNT || fundingAccount(env);
}

async function callsJson(env: Env, account: string, req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed();
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const before = url.searchParams.get('before') ?? undefined;
  const page = await new LimitLedgerClient(env.LIMITS).calls(account, limit, before);
  return json(page, { headers: { 'cache-control': 'no-store' } });
}

const SVG_HEADERS = {
  'content-type': 'image/svg+xml; charset=utf-8',
  // Short cache so the README widgets update within minutes (GitHub's Camo proxy caches too).
  'cache-control': 'max-age=300, s-maxage=300',
};

async function widgetSvg(env: Env, account: string, kind: 'roadmap' | 'activity', req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed();
  const ledger = new LimitLedgerClient(env.LIMITS);
  if (kind === 'roadmap') {
    const view = await ledger.project(account);
    return new Response(renderRoadmapSvg(parseRoadmap(view.profile.roadmap_yml ?? '')), { headers: SVG_HEADERS });
  }
  return new Response(renderActivitySvg(await ledger.funding(account)), { headers: SVG_HEADERS });
}

async function runwaySvg(env: Env, account: string, req: Request): Promise<Response> {
  if (req.method !== 'GET') return methodNotAllowed();
  const snapshot = await new LimitLedgerClient(env.LIMITS).funding(account);
  return new Response(renderRunwaySvg(snapshot), {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Short cache so the README badge updates within minutes (GitHub's Camo proxy caches too).
      'cache-control': 'max-age=300, s-maxage=300',
    },
  });
}
