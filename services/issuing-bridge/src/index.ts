// The issuing bridge (rails PR-2: scaffold + mint). One flow, causally ordered:
//   verified approval artifact → treasury keyed reserve → float gate → Stripe exact-amount
//   virtual card → Binding `armed`.
// The treasury is upstream of every dollar: a refused reserve means NO card, ever; the
// deterministic reserve id (rsv:issuing-bridge:<job_ref>) makes retried mints converge on
// the same hold and the same card. Real-time auth (PR-3) and settlement (PR-4) land next;
// their webhook routes are deliberately absent — an unrouted path is a 404, never a stub
// that could be mistaken for enforcement.

import { verifyApprovalArtifact } from './approval.ts';
import { cancelCard, ensureCardholder, StripeError } from './stripe.ts';
import { createCard } from './stripe.ts';
import { reserveIdForJobRef, treasuryRelease, treasuryReserve } from './treasury.ts';
import type { Binding } from './card-registry.ts';

export { CardRegistry } from './card-registry.ts';

export interface Env {
  APPROVAL_PUBKEY: string;
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
  if (armed.replay === true) {
    // A concurrent mint won the race: cancel our duplicate card; the hold is shared (same key).
    await cancelCard(env, cardId).catch(() => undefined);
    const winner = armed.binding as Binding;
    return json({ card_id: winner.card_id, replay: true, reserve_id: winner.reserve_id, status: winner.status }, 200);
  }
  return json({ card_id: cardId, replay: false, reserve_id: reserveId, status: 'armed' }, 201);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'issuing-bridge' });
    if (url.pathname === '/v1/cards' && request.method === 'POST') return mintCard(request, env);
    if (url.pathname === '/v1/cards' && request.method === 'GET') {
      // Operator visibility (read-only); real auth rides PR-3's shared secret decision.
      const list = await registryCall(env, '/list');
      return json({ bindings: (list.bindings as Binding[]).map(({ auth_log, ...rest }) => ({ ...rest, auth_entries: auth_log.length })) });
    }
    return refuse(404, 'not_found');
  },
};
