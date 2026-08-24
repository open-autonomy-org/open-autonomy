// The bridge's treasury client — the bridge is JUST ANOTHER SUPPLIER of the generic
// supplier API (PR #294): keyed two-phase reserve → settle-with-receipt / release, plus the
// reserve-status lookup the real-time auth decision rides on. Contract grounded in
// services/agent-model-proxy/src/index.ts:265-287 and limit-ledger.ts supplierReserve/
// supplierSettle/supplierRelease/supplierReserveGet.

export interface TreasuryEnvLike {
  TREASURY_URL: string;
  TREASURY_SUPPLIER_TOKEN: string; // `sup.<id>.<secret>`
}

export type TreasuryResult = { ok: boolean; error?: string } & Record<string, unknown>;

async function call(env: TreasuryEnvLike, method: 'GET' | 'POST', path: string, body?: Record<string, unknown>, timeoutMs = 1_500): Promise<TreasuryResult> {
  const response = await fetch(`${env.TREASURY_URL.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.TREASURY_SUPPLIER_TOKEN}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return await response.json() as TreasuryResult;
}

/** Keyed reserve: the deterministic id `rsv:issuing-bridge:<key>` makes a retried mint
 * return the SAME hold — the treasury refuses a replayed key whose hold already closed. */
export function reserveIdForJobRef(jobRef: string): string {
  return `rsv:issuing-bridge:${jobRef}`;
}

export function treasuryReserve(env: TreasuryEnvLike, input: { account: string; amountCents: number; item: string; jobRef: string; ttlSeconds: number }): Promise<TreasuryResult> {
  return call(env, 'POST', '/v1/supplier/reserve', {
    account: input.account,
    amount_usd_cents: input.amountCents,
    category: 'procurement',
    item: input.item,
    key: input.jobRef,
    ttl_seconds: input.ttlSeconds,
  });
}

/** The causal-upstream check for real-time auth: MUST complete inside the auth budget and
 * MUST fail closed — a treasury that cannot answer is a declined authorization. */
export function treasuryReserveGet(env: TreasuryEnvLike, reserveId: string, timeoutMs = 1_200): Promise<TreasuryResult> {
  return call(env, 'GET', `/v1/supplier/reserves/${encodeURIComponent(reserveId)}`, undefined, timeoutMs);
}

export function treasurySettle(env: TreasuryEnvLike, input: { reserveId: string; amountCents: number; receiptRef: string }): Promise<TreasuryResult> {
  return call(env, 'POST', '/v1/supplier/settle', {
    amount_usd_cents: input.amountCents,
    receipt_ref: input.receiptRef,
    reserve_id: input.reserveId,
  });
}

export function treasuryRelease(env: TreasuryEnvLike, reserveId: string): Promise<TreasuryResult> {
  return call(env, 'POST', '/v1/supplier/release', { reserve_id: reserveId });
}
