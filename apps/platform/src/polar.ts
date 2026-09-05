import { error, html, json, methodNotAllowed, parseJson } from './http.js';
import { LedgerClient, type Sponsor, type Tier } from './ledger.js';
import { renderMessage } from './site.js';
import type { Env } from './types.js';

// Money in through Polar, beside GitHub Sponsors: two doors onto the same books. Each project's tiers are Polar products the platform
// creates on first use and keeps in step (one monthly and one one-time product per tier). A patron's
// checkout is opened here and redirects to Polar; a paid order mints the amount to the project's account as
// a `mint` flow carrying the patron's name, never a card. Two doors learn of a paid order, each idempotent
// on the order's id: Polar's signed `order.paid` webhook, and the thanks page the patron lands on, which
// reads the checkout back from Polar. Renewals arrive as orders too, so recurring patronage needs no cron.

export const polarConfigured = (env: Env): boolean => Boolean(env.POLAR_ACCESS_TOKEN);
const base = (env: Env): string => (env.POLAR_API_BASE ?? 'https://api.polar.sh').replace(/\/$/, '');

export async function polar<T = Record<string, any>>(env: Env, method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ ok: boolean; status: number; body: T }> {
  const res = await fetch(`${base(env)}${path}`, { method, headers: { authorization: `Bearer ${env.POLAR_ACCESS_TOKEN}`, 'content-type': 'application/json', accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) as T };
}

// The products behind a project's tiers, created on first use: `<name>` monthly and `<name>, once`.
type ProductMap = Record<string, string>; // `${tierIndex}:${interval}` → product id
async function ensureProducts(env: Env, ledger: LedgerClient, account: string, tiers: Tier[], existing: ProductMap): Promise<ProductMap> {
  const products = { ...existing };
  let changed = false;
  for (const [i, t] of tiers.entries()) {
    for (const interval of ['month', 'once'] as const) {
      const key = `${i}:${interval}`;
      if (products[key]) continue;
      const created = await polar<{ id?: string }>(env, 'POST', '/v1/products/', {
        name: `${account} · ${t.name}${interval === 'once' ? ', once' : ''}`,
        description: `Patronage of ${account} through Open Autonomy: funds the project's agent.`,
        ...(interval === 'month' ? { recurring_interval: 'month' } : {}),
        prices: [{ amount_type: 'fixed', price_amount: t.usd_cents, price_currency: 'usd' }],
        metadata: { account, tier: String(i), interval },
      });
      if (!created.ok || !created.body.id) throw new Error(`polar: cannot create the product for ${account} tier ${i} (${created.status})`);
      products[key] = created.body.id;
      changed = true;
    }
  }
  if (changed) await ledger.setPolarProducts(account, products);
  return products;
}

// POST /v1/patrons/checkout {account, tier, interval} (a form from the page, or JSON) → 303 to Polar's checkout.
export async function patronCheckout(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed();
  if (!polarConfigured(env)) return error('patronage_not_configured', 503);
  const ct = req.headers.get('content-type') ?? '';
  const input = ct.includes('json') ? parseJson<Record<string, string>>(await req.text()) ?? {} : Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
  const account = String(input.account ?? '');
  const tier = Number(input.tier);
  const interval = input.interval === 'once' ? 'once' : 'month';
  if (!/^[^/\s]+\/[^/\s]+$/.test(account) || !Number.isInteger(tier) || tier < 0) return error('invalid_request');
  const ledger = new LedgerClient(env.LIMITS);
  const view = await ledger.project(account);
  if (!view.found || tier >= view.tiers.length) return error('no_such_tier', 404);
  const products = await ensureProducts(env, ledger, account, view.tiers, view.polar_products ?? {});
  const origin = new URL(req.url).origin;
  const created = await polar<{ id?: string; url?: string }>(env, 'POST', '/v1/checkouts/', {
    products: [products[`${tier}:${interval}`]],
    success_url: `${origin}/p/${encodeURIComponent(account)}/thanks?checkout_id={CHECKOUT_ID}`,
    metadata: { account, tier: String(tier), interval },
  });
  if (!created.ok || !created.body.id || !created.body.url) return error('checkout_unavailable', 502);
  await ledger.polarCheckoutPut({ id: created.body.id, account, tier, interval, usd_cents: view.tiers[tier].usd_cents, created_at: new Date().toISOString() });
  return ct.includes('json') ? json({ ok: true, checkout_id: created.body.id, url: created.body.url, usd_cents: view.tiers[tier].usd_cents, interval }) : new Response(null, { status: 303, headers: { location: created.body.url } });
}

interface PolarOrder { id: string; paid?: boolean; status?: string; total_amount?: number; net_amount?: number; amount?: number; checkout_id?: string | null; customer_id?: string | null; product_id?: string | null; billing_reason?: string; metadata?: Record<string, unknown>; customer?: { email?: string; name?: string | null } }

// A paid order becomes patronage on the books, once. The account comes from the checkout the platform
// opened, else from the order's metadata; the patron's name from Polar's customer, never their card.
export async function settleOrder(env: Env, ledger: LedgerClient, order: PolarOrder): Promise<{ ok: boolean; minted?: boolean; account?: string; error?: string }> {
  if (!order?.id || order.paid === false) return { ok: true, minted: false };
  let account = typeof order.metadata?.account === 'string' ? order.metadata.account : undefined;
  if (!account && order.checkout_id) account = (await ledger.polarCheckout(order.checkout_id)).checkout?.account;
  if (!account) return { ok: false, error: 'order_without_account' };
  const amount = Number(order.net_amount ?? order.total_amount ?? order.amount ?? 0);
  if (!(amount > 0)) return { ok: false, error: 'order_without_amount' };
  let customer = order.customer;
  if (!customer && order.customer_id) customer = (await polar<{ email?: string; name?: string | null }>(env, 'GET', `/v1/customers/${order.customer_id}`)).body;
  const email = customer?.email ?? '';
  const sponsor: Sponsor = { login: (email.split('@')[0] || customer?.name || 'patron').slice(0, 60), name: customer?.name ?? undefined, monthly_usd_cents: order.billing_reason?.startsWith('subscription') ? amount : undefined };
  const minted = await ledger.mint(account, amount, `polar:order:${order.id}`, sponsor);
  return { ok: minted.ok, minted: !minted.idempotent, account };
}

// GET /p/:account/thanks?checkout_id= — where Polar sends the patron back. The checkout is read from Polar
// and its paid order settled, so the books are right even if the webhook is late.
export async function thanksPage(env: Env, account: string, checkoutId: string | null): Promise<Response> {
  const ledger = new LedgerClient(env.LIMITS);
  if (!checkoutId || !polarConfigured(env)) return html(renderMessage(account, true, 'Thank you', 'Your patronage is on its way to the books.'));
  const checkout = await polar<{ status?: string; id?: string }>(env, 'GET', `/v1/checkouts/${checkoutId}`);
  const paid = checkout.ok && (checkout.body.status === 'confirmed' || checkout.body.status === 'succeeded');
  let minted = false;
  if (paid) {
    const orders = await polar<{ items?: PolarOrder[] }>(env, 'GET', `/v1/orders/?checkout_id=${encodeURIComponent(checkoutId)}`);
    for (const o of orders.body.items ?? []) { const r = await settleOrder(env, ledger, { ...o, checkout_id: o.checkout_id ?? checkoutId }); if (r.minted) minted = true; }
  }
  return html(renderMessage(account, paid, paid ? 'Thank you' : 'Not paid yet', paid ? `Your patronage of ${account} is on its books${minted ? ' now' : ''}. Every session and cent it funds shows on its page.` : 'Polar has not confirmed this checkout yet. The books update when it does.'));
}

// POST /webhooks/polar — Standard Webhooks: `webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64
// HMAC-SHA256(secret, "<id>.<timestamp>.<body>")>`, the secret base64 after `whsec_`, within five minutes.
export async function verifyPolarSignature(secret: string, body: string, headers: Headers, now = Date.now()): Promise<boolean> {
  const id = headers.get('webhook-id'); const ts = headers.get('webhook-timestamp'); const sig = headers.get('webhook-signature');
  if (!id || !ts || !sig || Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const raw = secret.startsWith('whsec_') ? Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0)) : new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)))));
  return sig.split(' ').some((part) => { const [v, s] = part.split(','); return v === 'v1' && s === expected; });
}

export async function polarWebhook(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed();
  if (!env.POLAR_WEBHOOK_SECRET) return error('patronage_not_configured', 503);
  const body = await req.text();
  if (!(await verifyPolarSignature(env.POLAR_WEBHOOK_SECRET, body, req.headers))) return error('invalid_signature', 401);
  const event = parseJson<{ type?: string; data?: PolarOrder }>(body);
  if (!event?.type) return error('invalid_event', 400);
  if (event.type === 'order.paid' || (event.type === 'order.created' && event.data?.paid)) {
    const r = await settleOrder(env, new LedgerClient(env.LIMITS), event.data as PolarOrder);
    return json(r, { status: r.ok ? 200 : 400 });
  }
  return json({ ok: true, ignored: event.type });
}
