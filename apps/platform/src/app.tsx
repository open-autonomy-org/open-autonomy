// The open platform as an app around the backend: its doors onto money in (GitHub Sponsors, Polar, grant
// credits, coupons), the human giving page, and the GitHub login that lets an owner edit a roster on the page;
// on the core's pages, its slots: the pitch and the patrons on Explore, the tiers and the patrons wall on a
// project, the doors to buy credits or sponsor on a name's page. Everything here is tried before the core's
// routes; what it does not answer, the backend does.
import { LOGIN, LedgerClient, REPO, RESERVED, accountAt, authedClaims, configurePage, configureSync, error, hasScope, html, json, methodNotAllowed, parseJson, renderMessage, type App, type RouteTools, type Sponsor, type TeamEdit } from '@open-autonomy/backend';
import { beginGiveLogin, endGiveLogin, finishGiveLogin, giveSession, type GiveSession } from './give-auth.ts';
import { Patronage } from './patronage.ts';
import { patronCheckout, polarConfigured, polarWebhook, thanksPage } from './polar.ts';
import { accountSlots, directorySlots, whoNav } from './page/patronage.tsx';
import { landingPage } from './page/landing.tsx';
import { renderGivePage, type GivePageData } from './page/give.tsx';
import { handleSponsorsWebhook } from './sponsors.ts';
import { sponsorAccount, type Env } from './types.ts';

configurePage({ brand: 'open-autonomy' });
// Every page here is public: a private repository's front page is never served by it.
configureSync({ privateRepositories: 'refuse' });
const NO_STORE = { 'cache-control': 'no-store' };

export const app: App = {
  async route(req, coreEnv, ctx, t): Promise<Response | undefined> {
    const env = coreEnv as Env;
    const { path, url, ledger, get, dec, privateHtml } = t;
    const patronage = new Patronage(ledger);
    // ---- the human giving page: GitHub proves a login, the same grant moves the money ----
    if (path === '/give/login') { if (get()) return get()!; return beginGiveLogin(req, env, undefined, url.searchParams.get('next') ?? undefined); }
    if (path === '/give/callback') { if (get()) return get()!; return finishGiveLogin(req, env); }
    if (path === '/give/logout') { if (get()) return get()!; return endGiveLogin(req); }
    if (path === '/give') {
      const session = await giveSession(req, env);
      if (!session) return req.method === 'GET' ? privateHtml(renderGivePage()) : privateHtml(renderGivePage(), 401);
      let message: GivePageData['message'];
      if (req.method === 'POST') {
        const form = await req.formData();
        const funder = `@${session.login}`;
        const pool = t.grantsAccount;
        const source = String(form.get('source') ?? '');
        if (source !== funder && !(session.grants_admin && source === pool)) message = { ok: false, text: 'That source is not yours to give from.' };
        else {
          const attempt = String(form.get('key') ?? '');
          if (!/^[0-9a-f-]{36}$/i.test(attempt)) message = { ok: false, text: 'This giving attempt is invalid. Reload the page and try again.' };
          else {
            const amount = Number(form.get('usd_cents'));
            const result = await t.give(source, String(form.get('to') ?? ''), amount, String(form.get('note') ?? '').trim() || undefined, `give-page:${session.login}:${source}:${attempt}`, String(form.get('for') ?? 'unrestricted'), source === pool ? `@${session.login}` : undefined);
            message = result.ok
              ? { ok: true, text: `${source} granted $${(Math.floor(amount) / 100).toFixed(2)} to ${String(form.get('to'))}. It is on the project's books.` }
              : { ok: false, text: result.error === 'insufficient_balance' ? `${source} holds fewer credits than that.` : `The gift was refused: ${result.error}.` };
          }
        }
      } else if (req.method !== 'GET') return methodNotAllowed();
      return privateHtml(renderGivePage(await givePageData(ledger, t, session, message)), message?.ok === false ? 400 : 200);
    }
    // A funder gives from the page: their key, an amount, a word. The key is a bearer sent once, never kept.
    // A project's own doors on the platform: /owner/project/give, /owner/project/redeem; Polar's return at /owner/project/thanks or
    // /login/thanks for a funder buying credits. The segments hold to the core's shapes and reserved names, so a
    // fixed door such as /v1/funders/give is never shadowed.
    const m0 = path.match(/^\/([^/]+)(?:\/([^/]+))?\/(give|redeem|thanks)$/);
    const door = m0 && LOGIN.test(dec(m0[1])) && !RESERVED.has(dec(m0[1]).toLowerCase()) && (m0[2] === undefined || REPO.test(dec(m0[2]))) ? m0 : null;
    const at = door ? accountAt(dec(door[1]), door[2] === undefined ? undefined : dec(door[2])) : '';
    if (door && door[3] === 'give') {
      if (req.method !== 'POST') return methodNotAllowed();
      const account = at;
      const form = await req.formData();
      const claims = await authedClaims(new Request(req.url, { headers: { authorization: `Bearer ${String(form.get('key') ?? '').trim()}` } }), env);
      if (!claims || !hasScope(claims, 'give')) return html(renderMessage(account, false, 'Not given', 'That is not a funder key. Prove your GitHub login with the claim file and mint one: GET /v1/keys/challenge?funder=<login>.'), 401);
      const r = await t.give(claims.account, account, Number(form.get('usd_cents')), String(form.get('note') ?? '').trim() || undefined, `give:${crypto.randomUUID()}`, String(form.get('for') ?? '').trim() || undefined);
      return html(renderMessage(account, r.ok, r.ok ? 'Given' : 'Not given', r.ok ? `${claims.account} granted $${(Number(form.get('usd_cents')) / 100).toFixed(2)} to ${account}. It is on the books and on the page.` : r.error === 'insufficient_balance' ? `${claims.account} holds fewer credits than that.` : `The gift was refused: ${r.error}.`), r.ok ? 200 : 400);
    }
    if (door && door[3] === 'redeem') {
      if (req.method !== 'POST') return methodNotAllowed();
      const account = at;
      const code = String((await req.formData()).get('code') ?? '').trim();
      if (!code) return html(renderMessage(account, false, 'Coupon not redeemed', 'Enter a coupon code.'), 400);
      const result = await patronage.couponRedeem(code, account);
      const message = result.ok ? `Added $${((result.amount_usd_cents ?? 0) / 100).toFixed(2)} to ${account}.` : redeemMessage(result.error);
      return html(renderMessage(account, result.ok, result.ok ? 'Coupon redeemed' : 'Coupon not redeemed', message), result.ok ? 200 : 400);
    }
    if (door && door[3] === 'thanks') { if (get()) return get()!; return thanksPage(env, at, url.searchParams.get('checkout_id')); }
    let m: RegExpMatchArray | null;
    // ---- admin: coupons, the monthly accrual by hand, a project's tiers; through the reviewed workflow only ----
    if (path === '/admin/coupons') {
      if (!t.isAdmin()) return error('auth_failed', 401);
      if (req.method === 'GET') return json(await patronage.couponList());
      if (req.method !== 'POST') return methodNotAllowed();
      const body = parseJson<{ amount_usd_cents?: number; from?: string; sponsor?: Sponsor; code?: string; expires_at?: string }>(await req.text());
      if (!body || typeof body.amount_usd_cents !== 'number') return error('invalid_request');
      const result = await patronage.couponCreate(body as { amount_usd_cents: number });
      return json(result, { status: result.ok ? 200 : 409 });
    }
    if ((m = path.match(/^\/admin\/accounts\/([^/]+)\/(accrue|tiers)$/))) {
      if (!t.isAdmin()) return error('auth_failed', 401);
      if (req.method !== 'POST') return methodNotAllowed();
      const body = parseJson<Record<string, unknown>>(await req.text()) ?? {};
      if (m[2] === 'accrue') { if (typeof body.key !== 'string') return error('invalid_request'); return json(await patronage.accrue(dec(m[1]), body.key)); }
      if (!Array.isArray(body.tiers)) return error('invalid_request');
      return json(await patronage.setTiers(dec(m[1]), body.tiers as Array<{ usd_cents: number; name: string }>));
    }
    // ---- money in ----
    if (path === '/webhooks/github-sponsors') return handleSponsorsWebhook(req, env, sponsorAccount(env));
    if (path === '/webhooks/polar') return polarWebhook(req, env);
    if (path === '/v1/patrons/checkout') return patronCheckout(req, env);
    if (path === '/v1/coupons/redeem') {
      if (req.method !== 'POST') return methodNotAllowed();
      const body = parseJson<{ code?: string; account?: string }>(await req.text());
      if (!body?.code || !body.account) return error('invalid_request');
      const result = await patronage.couponRedeem(body.code, body.account);
      return json(result, { status: result.ok ? 200 : result.error === 'coupon_not_found' ? 404 : result.error === 'coupon_already_redeemed' ? 409 : 400 });
    }
    return undefined;
  },
  page: {
    // The give page's GitHub sign-in names the viewer on every page.
    async viewer(req, t) { const s = await giveSession(req, t.env as Env); return s ? { login: s.login, ...(s.id ? { id: s.id } : {}) } : undefined; },
    // The project's landing page and its whole story: the campaign around the core's records.
    async landing(base, t) {
      const patronage = await new Patronage(t.ledger).view(base.account);
      return landingPage(base, { brand: 'open-autonomy', patronage, polar: polarConfigured(t.env as Env), sponsor: sponsorAccount(t.env as Env) });
    },
    async directory(entries, t) {
      const patronage = new Patronage(t.ledger);
      const views = await Promise.all(entries.filter((e) => e.is_project && e.listed).map(async (e) => [e.account, await patronage.view(e.account)] as const));
      return { ...directorySlots(entries, Object.fromEntries(views), t.grantsAccount), nav: whoNav(t.who, t.url.pathname + t.url.search) };
    },
    async account(name, entries, _funder, t) {
      const patronage = new Patronage(t.ledger);
      const owned = entries.filter((e) => e.is_project && e.listed && e.account.toLowerCase().startsWith(`${name.toLowerCase()}/`));
      const views = await Promise.all(owned.map(async (e) => [e.account, await patronage.view(e.account)] as const));
      return { ...accountSlots({ name, sponsor: sponsorAccount(t.env as Env), polar: polarConfigured(t.env as Env), self: Boolean(t.who && t.who.login.toLowerCase() === name.toLowerCase()), entries, patronage: Object.fromEntries(views) }), nav: whoNav(t.who, t.url.pathname + t.url.search) };
    },
  },
  identity: { begin: (req, env, intent) => beginGiveLogin(req, env as Env, intent as TeamEdit) },
  // Monthly: credit the sponsor account with its active recurring sponsorships, idempotent on the month.
  async scheduled(event, env) {
    const key = new Date(event.scheduledTime).toISOString().slice(0, 7);
    const result = await new Patronage(new LedgerClient(env.LIMITS)).accrue(sponsorAccount(env as Env), key);
    console.log('[platform] monthly accrue', sponsorAccount(env as Env), key, JSON.stringify(result));
  },
};

async function givePageData(ledger: LedgerClient, t: RouteTools, session: GiveSession, message?: GivePageData['message']): Promise<GivePageData> {
  const pool = t.grantsAccount;
  const [directory, funder, poolView] = await Promise.all([ledger.directory(), ledger.funder(`@${session.login}`), session.grants_admin ? ledger.funder(pool) : undefined]);
  return { login: session.login, funder, projects: directory.entries.filter((entry) => entry.is_project && entry.listed && entry.account !== pool), ...(poolView ? { grants: { account: pool, view: poolView } } : {}), ...(message ? { message } : {}), attempt: crypto.randomUUID() };
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
export { NO_STORE };
