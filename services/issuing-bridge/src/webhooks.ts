// Stripe webhook verification + the real-time authorization decision (rails PR-3).
//
// The decision is the product: an issuing_authorization.request must be answered inside
// Stripe's 2-second window with approve/decline, and approval REQUIRES a live treasury
// hold — the causal-upstream check. Fail-closed everywhere: unverifiable signature,
// unknown card, mismatched merchant, expired binding, an unreachable treasury, or a
// second authorization on a single-use card are all declines with logged reasons.

import { treasuryReserveGet } from './treasury.ts';
import type { Binding } from './card-registry.ts';
import type { Env } from './index.ts';

const encoder = new TextEncoder();

function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

/** Stripe's `stripe-signature: t=<unix>,v1=<hex hmac-sha256(secret, "<t>.<payload>")>`.
 * Tolerance bounds replay (Stripe's own default posture: 5 minutes). */
export async function verifyStripeSignature(secret: string, header: string | null, payload: string, nowMs: number, toleranceSeconds = 300): Promise<boolean> {
  if (header === null) return false;
  const parts = new Map(header.split(',').map((piece) => {
    const eq = piece.indexOf('=');
    return [piece.slice(0, eq), piece.slice(eq + 1)] as const;
  }));
  const timestamp = Number(parts.get('t'));
  const signature = parts.get('v1');
  if (!Number.isFinite(timestamp) || signature === undefined) return false;
  if (Math.abs(nowMs / 1000 - timestamp) > toleranceSeconds) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { hash: 'SHA-256', name: 'HMAC' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`)));
  const expected = [...mac].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return timingSafeEqualHex(expected, signature);
}

export interface AuthDecision {
  approved: boolean;
  reason: string;
}

/** The merchant lock: every declared facet must match. An empty lock matches anything —
 * the exact-amount + single-use + expiry clauses still bound it. */
export function merchantMatches(lock: Binding['merchant_lock'], merchant: { mcc?: string; name?: string; network_id?: string }): boolean {
  if (lock.network_id !== undefined && lock.network_id !== merchant.network_id) return false;
  if (lock.mcc !== undefined && lock.mcc !== merchant.mcc) return false;
  if (lock.name_pattern !== undefined) {
    const name = (merchant.name ?? '').toUpperCase();
    if (!name.includes(lock.name_pattern.toUpperCase())) return false;
  }
  return true;
}

/** Clauses 1-4 run against the binding snapshot; clause 5 (the live treasury hold) runs in
 * the worker BEFORE the DO latch so an unreachable treasury can never approve. The DO
 * performs the latch atomically — the race between two simultaneous auths resolves to one
 * approval by construction. */
export async function decideAuthorization(env: Env, binding: Binding | null, auth: {
  amountCents: number;
  merchant: { mcc?: string; name?: string; network_id?: string };
  nowMs: number;
}): Promise<AuthDecision> {
  if (binding === null) return { approved: false, reason: 'unknown-card' };
  if (binding.status !== 'armed') return { approved: false, reason: `not-armed:${binding.status}` };
  if (auth.amountCents > binding.amount_cents) return { approved: false, reason: `amount-exceeds-lock:${auth.amountCents}>${binding.amount_cents}` };
  if (!merchantMatches(binding.merchant_lock, auth.merchant)) return { approved: false, reason: 'merchant-lock-mismatch' };
  if (auth.nowMs >= binding.expires_at_ms) return { approved: false, reason: 'binding-expired' };
  // Clause 5 — the treasury is causally upstream: no live hold, no approval. Unreachable
  // or slow (past the auth budget) is a DECLINE, never an assumption.
  try {
    const reserve = await treasuryReserveGet(env, binding.reserve_id);
    if (reserve.ok !== true || reserve.status !== 'held') {
      return { approved: false, reason: `reserve-not-held:${String(reserve.status ?? reserve.error ?? 'unknown')}` };
    }
  } catch {
    return { approved: false, reason: 'treasury-unreachable-fail-closed' };
  }
  return { approved: true, reason: 'armed-reserve-held' };
}
