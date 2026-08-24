// Minimal Stripe Issuing client over fetch — base URL is env (STRIPE_API_BASE) so a
// rehearsal world points the bridge at the stripe TWIN with zero code changes. Idempotency
// keys ride the treasury reserve id, so a retried mint re-runs the SAME Stripe requests.

export interface StripeEnvLike {
  STRIPE_API_BASE: string;
  STRIPE_KEY: string;
}

export class StripeError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'StripeError';
  }
}

function form(body: Record<string, string>): string {
  return new URLSearchParams(body).toString();
}

async function call(env: StripeEnvLike, path: string, body: Record<string, string>, idempotencyKey?: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${env.STRIPE_API_BASE.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }),
    },
    body: form(body),
    signal: AbortSignal.timeout(10_000),
  });
  const parsed = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const message = (parsed.error as { message?: string } | undefined)?.message ?? `stripe ${path} failed`;
    throw new StripeError(response.status, message);
  }
  return parsed;
}

/** One cardholder per treasury account, deterministic by idempotency key. */
export async function ensureCardholder(env: StripeEnvLike, account: string): Promise<string> {
  const cardholder = await call(env, '/v1/issuing/cardholders', {
    billing_country: 'US',
    'billing[address][city]': 'San Francisco',
    'billing[address][country]': 'US',
    'billing[address][line1]': '1 Autonomous Way',
    'billing[address][postal_code]': '94100',
    'billing[address][state]': 'CA',
    name: `org ${account}`,
    type: 'company',
  }, `cardholder:${account}`);
  return cardholder.id as string;
}

/** Exact-amount, single-use-by-policy virtual card; spending_controls is defense-in-depth
 * behind the real-time auth hook, never the primary control. */
export async function createCard(env: StripeEnvLike, input: { cardholderId: string; amountCents: number; reserveId: string }): Promise<{ id: string }> {
  const card = await call(env, '/v1/issuing/cards', {
    cardholder: input.cardholderId,
    currency: 'usd',
    'spending_controls[spending_limits][0][amount]': String(input.amountCents),
    'spending_controls[spending_limits][0][interval]': 'all_time',
    status: 'active',
    type: 'virtual',
  }, input.reserveId);
  return { id: card.id as string };
}

export async function cancelCard(env: StripeEnvLike, cardId: string): Promise<void> {
  await call(env, `/v1/issuing/cards/${encodeURIComponent(cardId)}`, { status: 'canceled' }, `cancel:${cardId}`);
}
