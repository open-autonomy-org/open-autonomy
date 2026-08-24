// The issuing bridge (rails PR-2: scaffold + mint). One flow, causally ordered:
//   verified approval artifact → treasury keyed reserve → float gate → Stripe exact-amount
//   virtual card → Binding `armed`.
// The treasury is upstream of every dollar: a refused reserve means NO card, ever; the
// deterministic reserve id (rsv:issuing-bridge:<job_ref>) makes retried mints converge on
// the same hold and the same card. Real-time auth (PR-3) and settlement (PR-4) land next;
// their webhook routes are deliberately absent — an unrouted path is a 404, never a stub
// that could be mistaken for enforcement.

import { verifyApprovalArtifact } from './approval.ts';
import { decideAuthorization, verifyStripeSignature } from './webhooks.ts';
import { cancelCard, ensureCardholder, listTransactionsSince, StripeError } from './stripe.ts';
import { createCard } from './stripe.ts';
import { reserveIdForJobRef, treasuryRelease, treasuryReserve, treasurySettle } from './treasury.ts';
import type { Binding } from './card-registry.ts';

export { CardRegistry } from './card-registry.ts';

export interface Env {
  ADMIN_TOKEN: string;
  APPROVAL_PUBKEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  CARDS: DurableObjectNamespace;
  CARD_EXPIRY_MARGIN_SECONDS: string;
  FLOAT_WATERMARK_CENTS: string;
  STRIPE_API_BASE: string;
  STRIPE_KEY: string;
  TREASURY_SUPPLIER_TOKEN: string;
  TREASURY_URL: string;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}
function refuse(status: number, error: string, detail?: string): Response {
  return json({ error, ...(detail === undefined ? {} : { detail }), ok: false }, status);
}

function registry(env: Env): DurableObjectStub {
  return env.CARDS.get(env.CARDS.idFromName('singleton'));
}

async function registryCall(env: Env, path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await registry(env).fetch(`https://registry${path}`, {
    method: 'POST',
    ...(body === undefined ? { body: '{}' } : { body: JSON.stringify(body) }),
  });
  return await response.json() as Record<string, unknown>;
}

async function mintCard(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null) as { approval?: string } | null;
  if (body === null || typeof body.approval !== 'string') return refuse(400, 'invalid_request', 'body must carry the signed approval artifact');
  const artifact = await verifyApprovalArtifact(env.APPROVAL_PUBKEY, body.approval);
  if (artifact === undefined) return refuse(401, 'approval_invalid', 'the approval artifact signature or shape is invalid');

  // Mint idempotency spine: an existing binding for this job_ref IS the answer.
  const existing = await registryCall(env, '/lookup-job-ref', { job_ref: artifact.job_ref });
  if (existing.binding !== null) {
    const binding = existing.binding as Binding;
    return json({ card_id: binding.card_id, replay: true, reserve_id: binding.reserve_id, status: binding.status }, 200);
  }

  // Causal step 1 — the treasury reserve. Every refusal surfaces verbatim: unfunded → 402,
  // banned → 403, the supplier plane's own status mapping preserved.
  const reserve = await treasuryReserve(env, {
    account: artifact.account,
    amountCents: artifact.amount_cents,
    item: `procurement card for ${artifact.job_ref}`,
    jobRef: artifact.job_ref,
    ttlSeconds: artifact.ttl_seconds,
  });
  if (reserve.ok !== true) {
    const status = reserve.error === 'account_balance_exhausted' ? 402
      : reserve.error === 'account_banned' ? 403
        : reserve.error === 'supplier_cap_exceeded' ? 402
          : 409;
    return refuse(status, String(reserve.error ?? 'reserve_failed'));
  }
  const reserveId = reserveIdForJobRef(artifact.job_ref);

  // Causal step 2 — the global float watermark: armed-but-unsettled exposure may never
  // exceed the physical Issuing balance allocation. Refusal releases the fresh hold.
  const float = await registryCall(env, '/float');
  const watermark = Number(env.FLOAT_WATERMARK_CENTS);
  if ((float.armed_total_cents as number) + artifact.amount_cents > watermark) {
    await treasuryRelease(env, reserveId).catch(() => undefined);
    return refuse(409, 'float_watermark_exceeded', `armed total would exceed the ${watermark}-cent float watermark`);
  }

  // Causal step 3 — Stripe, idempotency-keyed on the reserve id end-to-end.
  let cardId: string;
  let cardholderId: string;
  try {
    cardholderId = await ensureCardholder(env, artifact.account);
    const card = await createCard(env, { amountCents: artifact.amount_cents, cardholderId, reserveId });
    cardId = card.id;
  } catch (error) {
    // No card, no exposure: release the hold and surface the failure. A retry re-runs the
    // whole chain with identical keys.
    await treasuryRelease(env, reserveId).catch(() => undefined);
    if (error instanceof StripeError) return refuse(502, 'stripe_mint_failed', error.message);
    throw error;
  }

  const marginSeconds = Number(env.CARD_EXPIRY_MARGIN_SECONDS) || 300;
  const binding: Binding = {
    account: artifact.account,
    amount_cents: artifact.amount_cents,
    approval_ref: `${artifact.approver}@${artifact.approved_at}`,
    auth_log: [],
    card_id: cardId,
    cardholder_id: cardholderId,
    expires_at_ms: Date.now() + Math.max(1, artifact.ttl_seconds - marginSeconds) * 1000,
    job_ref: artifact.job_ref,
    merchant_lock: artifact.merchant_lock,
    reserve_id: reserveId,
    status: 'armed',
  };
  const armed = await registryCall(env, '/arm', { binding });
  if (typeof armed.halted === 'string') {
    // The minting fuse is blown (an orphan incident): no new exposure until a human resets.
    await cancelCard(env, cardId).catch(() => undefined);
    await treasuryRelease(env, reserveId).catch(() => undefined);
    return refuse(503, 'minting_halted', armed.halted);
  }
  if (armed.replay === true) {
    // A concurrent mint won the race: cancel our duplicate card; the hold is shared (same key).
    await cancelCard(env, cardId).catch(() => undefined);
    const winner = armed.binding as Binding;
    return json({ card_id: winner.card_id, replay: true, reserve_id: winner.reserve_id, status: winner.status }, 200);
  }
  return json({ card_id: cardId, replay: false, reserve_id: reserveId, status: 'armed' }, 201);
}

// PR-3 — the real-time authorization webhook. Response contract (Stripe's synchronous
// issuing_authorization.request): 200 with {approved: boolean} inside the 2s window.
async function authWebhook(request: Request, env: Env): Promise<Response> {
  const payload = await request.text();
  const verified = await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET, request.headers.get('stripe-signature'), payload, Date.now());
  if (!verified) return refuse(401, 'signature_invalid');
  let event: { type?: string; data?: { object?: { id?: string; card?: { id?: string }; merchant_data?: { category_code?: string; name?: string; network_id?: string }; pending_request?: { amount?: number } } } };
  try {
    event = JSON.parse(payload) as typeof event;
  } catch {
    return refuse(400, 'invalid_json');
  }
  if (event.type !== 'issuing_authorization.request') return refuse(400, 'unexpected_event_type');
  const authorization = event.data?.object;
  const cardId = authorization?.card?.id;
  if (typeof cardId !== 'string' || typeof authorization?.id !== 'string') return refuse(400, 'invalid_request');
  const lookup = await registryCall(env, '/lookup-card', { card_id: cardId });
  const binding = lookup.binding as Binding | null;
  const decision = await decideAuthorization(env, binding, {
    amountCents: authorization.pending_request?.amount ?? 0,
    merchant: {
      ...(authorization.merchant_data?.category_code === undefined ? {} : { mcc: authorization.merchant_data.category_code }),
      ...(authorization.merchant_data?.name === undefined ? {} : { name: authorization.merchant_data.name }),
      ...(authorization.merchant_data?.network_id === undefined ? {} : { network_id: authorization.merchant_data.network_id }),
    },
    nowMs: Date.now(),
  });
  // The DO latch is the atomic word: it records EVERY decision and resolves auth races to
  // a single approval.
  const latch = await registryCall(env, '/latch-auth', {
    authorization_id: authorization.id,
    card_id: cardId,
    decision: decision.approved ? 'approved' : 'declined',
    reason: decision.reason,
    ts: new Date().toISOString(),
  });
  return json({ approved: latch.latched === true });
}

// PR-4 — settlement: capture transaction → idempotent treasury settle with the Stripe txn
// as the receipt → binding 'settled' → card canceled → float decremented. An orphan
// transaction (no binding) is acknowledged 200 but flagged — the PR-5 reconciler turns it
// into an incident; swallowing it silently would hide a real-money leak.
async function txnWebhook(request: Request, env: Env): Promise<Response> {
  const payload = await request.text();
  const verified = await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET, request.headers.get('stripe-signature'), payload, Date.now());
  if (!verified) return refuse(401, 'signature_invalid');
  let event: { type?: string; data?: { object?: { amount?: number; card?: { id?: string }; id?: string; type?: string } } };
  try {
    event = JSON.parse(payload) as typeof event;
  } catch {
    return refuse(400, 'invalid_json');
  }
  if (event.type !== 'issuing_transaction.created') return refuse(400, 'unexpected_event_type');
  const transaction = event.data?.object;
  const cardId = transaction?.card?.id;
  if (typeof cardId !== 'string' || typeof transaction?.id !== 'string') return refuse(400, 'invalid_request');
  if (transaction.type !== 'capture') return json({ ignored: true, reason: `non-capture transaction type ${String(transaction.type)}` });
  // Stripe issuing captures are NEGATIVE amounts (a debit); the settled figure is its magnitude.
  const settledCents = Math.abs(transaction.amount ?? 0);
  const outcome = await registryCall(env, '/settle', { amount_cents: settledCents, card_id: cardId, txn_id: transaction.id });
  if (outcome.orphan === true) {
    // Real money moved on a card the bridge never minted: THE incident. Blow the fuse.
    await registryCall(env, '/incident', { at: new Date().toISOString(), card_id: cardId, reason: `orphan transaction ${transaction.id} on unminted card ${cardId}`, txn_id: transaction.id });
    return json({ incident: true, orphan: true, txn_id: transaction.id }, 202);
  }
  if (outcome.closed === true) return json({ closed: true, status: outcome.status, txn_id: transaction.id }, 202);
  if (outcome.replay === true) return json({ replay: true, settled: outcome.settled });
  const binding = outcome.binding as Binding;
  const settle = await treasurySettle(env, { amountCents: settledCents, receiptRef: transaction.id, reserveId: binding.reserve_id });
  await cancelCard(env, cardId).catch(() => undefined);
  return json({ settled: settle.ok === true, treasury: settle.ok === true ? 'settled' : String(settle.error) });
}

// The reconciler: replay Stripe's own transaction log against the Bindings — a dropped
// settlement webhook back-fills; a transaction the bridge cannot account for is the
// orphan incident. This is the independent check that the webhook path cannot lie to.
async function reconcileSweep(env: Env): Promise<{ backfilled: number; incidents: number; scanned: number }> {
  const watermark = await registryCall(env, '/reconcile-watermark');
  const since = watermark.last_reconciled_txn_created as number;
  const transactions = await listTransactionsSince(env, since);
  let backfilled = 0;
  let incidents = 0;
  let advanceTo = since;
  for (const transaction of transactions.sort((left, right) => left.created - right.created)) {
    advanceTo = Math.max(advanceTo, transaction.created);
    if (transaction.type !== 'capture') continue;
    const outcome = await registryCall(env, '/settle', { amount_cents: Math.abs(transaction.amount), card_id: transaction.card, txn_id: transaction.id });
    if (outcome.orphan === true || outcome.closed === true) {
      incidents += 1;
      await registryCall(env, '/incident', {
        at: new Date().toISOString(),
        card_id: transaction.card,
        reason: outcome.orphan === true
          ? `reconciler: orphan transaction ${transaction.id} on unminted card ${transaction.card}`
          : `reconciler: capture ${transaction.id} on a ${String(outcome.status)} binding`,
        txn_id: transaction.id,
      });
      continue;
    }
    if (outcome.replay === true) continue; // webhook already settled it — the normal case
    const binding = outcome.binding as Binding;
    await treasurySettle(env, { amountCents: Math.abs(transaction.amount), receiptRef: transaction.id, reserveId: binding.reserve_id });
    await cancelCard(env, transaction.card).catch(() => undefined);
    backfilled += 1;
  }
  await registryCall(env, '/reconcile-watermark', { advance_to: advanceTo });
  return { backfilled, incidents, scanned: transactions.length };
}

// The janitor (cron): expired armed cards leave the float, their Stripe cards cancel, and
// their treasury holds release — every leg idempotent, so a crashed sweep re-runs whole.
async function janitorSweep(env: Env): Promise<{ expired: number }> {
  const sweep = await registryCall(env, '/sweep-expired', { now_ms: Date.now() });
  const expired = sweep.expired as Binding[];
  for (const binding of expired) {
    await cancelCard(env, binding.card_id).catch(() => undefined);
    await treasuryRelease(env, binding.reserve_id).catch(() => undefined);
  }
  return { expired: expired.length };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'issuing-bridge' });
    if (url.pathname === '/v1/cards' && request.method === 'POST') return mintCard(request, env);
    if (url.pathname === '/webhooks/stripe/auth' && request.method === 'POST') return authWebhook(request, env);
    if (url.pathname === '/webhooks/stripe/txn' && request.method === 'POST') return txnWebhook(request, env);
    if (url.pathname === '/v1/cards' && request.method === 'GET') {
      // Operator visibility (read-only); real auth rides PR-3's shared secret decision.
      const list = await registryCall(env, '/list');
      return json({ bindings: (list.bindings as Binding[]).map(({ auth_log, ...rest }) => ({ ...rest, auth_entries: auth_log.length })) });
    }
    if (url.pathname === '/janitor/sweep' && request.method === 'POST') return json(await janitorSweep(env));
    if (url.pathname === '/janitor/reconcile' && request.method === 'POST') return json(await reconcileSweep(env));
    if (url.pathname === '/v1/status' && request.method === 'GET') return json(await registryCall(env, '/status'));
    if (url.pathname === '/v1/fuse-reset' && request.method === 'POST') {
      // The human-only reset: an incident investigation ends with a person turning minting
      // back on — money movement never self-heals its own kill switch.
      if (request.headers.get('x-admin-token') !== env.ADMIN_TOKEN || env.ADMIN_TOKEN === '') return refuse(401, 'auth_failed');
      return json(await registryCall(env, '/fuse-reset'));
    }
    return refuse(404, 'not_found');
  },
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await janitorSweep(env);
    await reconcileSweep(env).catch(() => undefined);
  },
};
