import { parseRailsConfig } from '@open-autonomy/sdk/rails';
import { error, json, methodNotAllowed, parseJson } from './http.js';
import { LedgerClient, type CardRecord } from './ledger.js';
import { stripe, stripeConfigured, verifyStripeSignature } from './stripe.js';
import type { Env, KeyClaims } from './types.js';

// The rails beyond the model: a card minted against the balance, and a partner's metered charge. Both
// are bounded by the owner in `.open-autonomy/config.yaml` (off unless a bound is set), both reserve
// against the balance and the daily rail like a model call, and both leave a record on the audit trail
// naming the rail, the merchant or partner, and the amount.

// POST /v1/rails/card {usd_cents, purpose?} (spend scope) → a single-use virtual card bounded to the
// amount and the owner's merchant categories. The card's details are what Stripe returns: last4 and
// expiry always; number and cvc where the account exposes them. The reservation is held until the card
// is used once (settled) or declined (released).
export async function mintCard(req: Request, env: Env, claims: KeyClaims): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed();
  if (!stripeConfigured(env)) return error('rail_not_configured', 503, { rail: 'card' });
  const body = parseJson<{ usd_cents?: number; purpose?: string }>(await req.text());
  if (!body || !Number.isInteger(body.usd_cents) || (body.usd_cents as number) <= 0) return error('invalid_amount');
  const ledger = new LedgerClient(env.LIMITS);
  const view = await ledger.project(claims.account);
  const rails = parseRailsConfig(view.profile.config_yaml ?? '');
  if (rails.card.max_usd_cents <= 0) return error('rail_off', 403, { rail: 'card', how: 'set rails.card.max_usd_cents in .open-autonomy/config.yaml' });
  if ((body.usd_cents as number) > rails.card.max_usd_cents) return error('amount_over_bound', 403, { max_usd_cents: rails.card.max_usd_cents });
  const requestId = crypto.randomUUID();
  const reserved = await ledger.reserve(requestId, claims.account, claims.kid, body.usd_cents as number, Number(env.MAX_GLOBAL_DAILY_USD_CENTS ?? 5000));
  if (!reserved.ok) return error(reserved.error, 402, { account: claims.account, balance_usd_cents: reserved.balance_usd_cents });

  let cardholder = view.stripe_cardholder;
  if (!cardholder) {
    const ch = await stripe<{ id?: string }>(env, 'POST', '/v1/issuing/cardholders', { name: `Open Autonomy · ${claims.account}`, type: 'company', billing: { address: { line1: '1 Open Autonomy Way', city: 'San Francisco', state: 'CA', postal_code: '94105', country: 'US' } }, metadata: { account: claims.account } });
    if (!ch.ok || !ch.body.id) { await ledger.release(requestId); return error('card_issuer_unavailable', 502); }
    cardholder = ch.body.id;
    await ledger.setCardholder(claims.account, cardholder);
  }
  const card = await stripe<{ id?: string; last4?: string; exp_month?: number; exp_year?: number; number?: string; cvc?: string }>(env, 'POST', '/v1/issuing/cards', {
    cardholder, currency: 'usd', type: 'virtual',
    spending_controls: { spending_limits: [{ amount: body.usd_cents, interval: 'per_authorization' }], ...(rails.card.categories.length ? { allowed_categories: rails.card.categories } : {}) },
    metadata: { account: claims.account, request_id: requestId, purpose: (body.purpose ?? '').slice(0, 200) },
  });
  if (!card.ok || !card.body.id) { await ledger.release(requestId); return error('card_issuer_unavailable', 502); }
  const record: CardRecord = { id: card.body.id, account: claims.account, request_id: requestId, usd_cents: body.usd_cents as number, categories: rails.card.categories, purpose: (body.purpose ?? '').slice(0, 200), last4: card.body.last4 ?? '', status: 'minted', created_at: new Date().toISOString() };
  await ledger.cardPut(record);
  const details = await stripe<{ number?: string; cvc?: string; exp_month?: number; exp_year?: number }>(env, 'GET', `/v1/issuing/cards/${card.body.id}`, { 'expand[]': ['number', 'cvc'] });
  return json({ ok: true, card: { id: record.id, last4: record.last4, exp_month: details.body.exp_month ?? card.body.exp_month, exp_year: details.body.exp_year ?? card.body.exp_year, number: details.body.number, cvc: details.body.cvc, usd_cents: record.usd_cents, categories: record.categories, single_use: true } });
}

// POST /v1/rails/partner {partner, usd_cents, unit?, quantity?, reference?} (spend scope) → the charge
// settles now, as a partner rail record. The owner names the partners and the most one charge may be.
export async function settlePartner(req: Request, env: Env, claims: KeyClaims): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed();
  const body = parseJson<{ partner?: string; usd_cents?: number; unit?: string; quantity?: number; reference?: string }>(await req.text());
  if (!body || typeof body.partner !== 'string' || !/^[a-z0-9][a-z0-9.-]{0,63}$/.test(body.partner)) return error('invalid_partner');
  if (!Number.isFinite(body.usd_cents) || (body.usd_cents as number) <= 0) return error('invalid_amount');
  const ledger = new LedgerClient(env.LIMITS);
  const view = await ledger.project(claims.account);
  const rails = parseRailsConfig(view.profile.config_yaml ?? '');
  if (rails.partner.max_usd_cents <= 0) return error('rail_off', 403, { rail: 'partner', how: 'set rails.partner.max_usd_cents and rails.partner.partners in .open-autonomy/config.yaml' });
  if (!rails.partner.partners.includes(body.partner)) return error('partner_not_allowed', 403, { partner: body.partner });
  if ((body.usd_cents as number) > rails.partner.max_usd_cents) return error('amount_over_bound', 403, { max_usd_cents: rails.partner.max_usd_cents });
  const requestId = crypto.randomUUID();
  const reserved = await ledger.reserve(requestId, claims.account, claims.kid, body.usd_cents as number, Number(env.MAX_GLOBAL_DAILY_USD_CENTS ?? 5000));
  if (!reserved.ok) return error(reserved.error, 402, { account: claims.account, balance_usd_cents: reserved.balance_usd_cents });
  await ledger.consume(requestId, body.usd_cents as number, { request_id: requestId, rail: 'partner', partner: body.partner, unit: typeof body.unit === 'string' ? body.unit.slice(0, 40) : undefined, quantity: typeof body.quantity === 'number' ? body.quantity : undefined, reference: typeof body.reference === 'string' ? body.reference.slice(0, 120) : undefined, reserved_usd_cents: body.usd_cents as number, actual_usd_cents: body.usd_cents as number, outcome: 'ok' });
  return json({ ok: true, rail: 'partner', partner: body.partner, usd_cents: body.usd_cents, request_id: requestId, balance_usd_cents: (await ledger.funding(claims.account)).balance_usd_cents });
}

// POST /webhooks/stripe — the issuer's events. A real-time `issuing_authorization.request` is decided here:
// approved only for a card this platform minted, unused, within its amount and the owner's categories. A
// `created` pending authorization (no real-time enrolment) gets the same decision through the API. A
// captured transaction settles the reservation on the books as a card rail record and retires the card.
export async function stripeWebhook(req: Request, env: Env): Promise<Response> {
  if (req.method !== 'POST') return methodNotAllowed();
  if (!stripeConfigured(env)) return error('rail_not_configured', 503, { rail: 'card' });
  const payload = await req.text();
  if (!(await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET!, payload, req.headers.get('stripe-signature')))) return error('invalid_signature', 401);
  const event = parseJson<{ type?: string; data?: { object?: Record<string, any> } }>(payload);
  const obj = event?.data?.object;
  if (!event?.type || !obj) return error('invalid_event', 400);
  const ledger = new LedgerClient(env.LIMITS);
  const cardId = typeof obj.card === 'string' ? obj.card : obj.card?.id;

  if (event.type === 'issuing_authorization.request' || event.type === 'issuing_authorization.created') {
    const card = cardId ? (await ledger.card(cardId)).card : undefined;
    const amount = Number(obj.amount ?? obj.pending_request?.amount ?? 0);
    const category = String(obj.merchant_data?.category ?? '');
    const approved = !!card && card.status === 'minted' && amount > 0 && amount <= card.usd_cents && (!card.categories.length || card.categories.includes(category));
    if (event.type === 'issuing_authorization.created' && obj.status !== 'pending') {
      // The issuer's own controls decided before asking. A decline on an unused card ends it here too: the
      // reservation is released and the card retired, so nothing stays held for a card that will not pay.
      if (card && card.status === 'minted' && obj.approved === false) {
        await ledger.cardPut({ ...card, status: 'declined', authorization: obj.id, merchant: String(obj.merchant_data?.name ?? ''), category });
        await ledger.release(card.request_id);
        await stripe(env, 'POST', `/v1/issuing/cards/${card.id}`, { status: 'canceled' });
        return json({ ok: true, declined: 'by the issuer' });
      }
      return json({ ok: true, ignored: 'not pending' });
    }
    // Only an unused card changes state here: a used one keeps its record, whatever asks again.
    if (card && card.status === 'minted') {
      await ledger.cardPut({ ...card, status: approved ? 'authorized' : 'declined', authorization: obj.id, merchant: String(obj.merchant_data?.name ?? ''), category });
      if (!approved) { await ledger.release(card.request_id); await stripe(env, 'POST', `/v1/issuing/cards/${card.id}`, { status: 'canceled' }); }
    }
    if (event.type === 'issuing_authorization.created') await stripe(env, 'POST', `/v1/issuing/authorizations/${obj.id}/${approved ? 'approve' : 'decline'}`, {});
    return json({ approved });
  }
  if (event.type === 'issuing_transaction.created' && obj.type === 'capture') {
    const card = cardId ? (await ledger.card(cardId)).card : undefined;
    if (!card || card.status === 'settled') return json({ ok: true, ignored: card ? 'already settled' : 'unknown card' });
    const spent = Math.abs(Number(obj.amount ?? 0));
    await ledger.consume(card.request_id, spent, { request_id: card.request_id, rail: 'card', merchant: String(obj.merchant_data?.name ?? card.merchant ?? ''), category: String(obj.merchant_data?.category ?? card.category ?? ''), card_last4: card.last4, reference: String(obj.id ?? ''), reserved_usd_cents: card.usd_cents, actual_usd_cents: spent, outcome: 'ok' });
    await ledger.cardPut({ ...card, status: 'settled', settled_usd_cents: spent });
    await stripe(env, 'POST', `/v1/issuing/cards/${card.id}`, { status: 'canceled' });
    return json({ ok: true, settled_usd_cents: spent });
  }
  return json({ ok: true, ignored: event.type });
}
