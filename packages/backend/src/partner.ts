// The partner hold wire: account-scoped keys, explicit credit quotes and immutable reconciliation receipts.
import { json, methodNotAllowed, parseJson } from './http.js';
import { LedgerClient } from './ledger.js';
import type { Env, KeyClaims } from './types.js';

export interface PartnerQuote {
  partner: string;
  key: string;
  usd_cents: number;
  credits: number;
  usd_cents_per_credit: number;
  reference: string;
  item?: string;
}
export interface PartnerReceipt extends PartnerQuote {
  account: string;
  request_id: string;
  recipient: string;
  status: 'held' | 'captured' | 'released';
  created_at: string;
  closed_at?: string;
  // Set when the operator, not the payer, released an abandoned hold.
  closed_by?: 'operator';
  captured_usd_cents?: number;
  captured_credits?: number;
}
export type PartnerResult = { ok: true; reservation: PartnerReceipt } | { ok: false; error: string; [detail: string]: unknown };
export const partnerId = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9][a-z0-9.-]{0,63}$/.test(s);
export const partnerKey = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(s);
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
export function partnerQuote(body: Record<string, unknown>): PartnerQuote | undefined {
  if (!partnerId(body.partner) || !partnerKey(body.key) || !positive(body.usd_cents) || !positive(body.credits) || !positive(body.usd_cents_per_credit)) return;
  if (body.credits * body.usd_cents_per_credit !== body.usd_cents || !Number.isSafeInteger(body.credits * body.usd_cents_per_credit)) return;
  if (typeof body.reference !== 'string' || !body.reference.trim() || body.reference.length > 200) return;
  if (body.item !== undefined && (typeof body.item !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(body.item))) return;
  return { partner: body.partner, key: body.key, usd_cents: body.usd_cents, credits: body.credits, usd_cents_per_credit: body.usd_cents_per_credit, reference: body.reference, ...(body.item !== undefined ? { item: body.item as string } : {}) };
}
export function sameQuote(a: PartnerQuote, b: PartnerQuote): boolean {
  return a.partner === b.partner && a.key === b.key && a.usd_cents === b.usd_cents && a.credits === b.credits && a.usd_cents_per_credit === b.usd_cents_per_credit && a.reference === b.reference && a.item === b.item;
}
export const partnerStorageKey = (account: string, partner: string, key: string): string => `partner:${JSON.stringify([account, partner, key])}`;

// All operations need pay authority, including reconciliation. The account is carried from verified claims.
export async function partnerReservation(req: Request, env: Env, claims: KeyClaims, partner?: string, key?: string, action?: string): Promise<Response> {
  const op = partner === undefined ? 'create' : action ?? 'get';
  if (req.method !== (op === 'get' ? 'GET' : 'POST')) return methodNotAllowed();
  const parsed = op === 'get' ? {} : parseJson<unknown>(await req.text());
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ ok: false, error: 'invalid_request' }, { status: 400 });
  const result = await new LedgerClient(env.LIMITS).call<PartnerResult>('partner_reservation', {
    action: op, account: claims.account, kid: claims.kid, scopes: claims.scopes, payload: parsed,
    ...(partner !== undefined ? { partner, key } : {}), daily_cap_usd_cents: Number(env.MAX_GLOBAL_DAILY_USD_CENTS ?? 5000),
  });
  const status = result.ok ? 200 : result.error === 'auth_failed' ? 401
    : ['scope_required', 'account_banned', 'rail_off', 'partner_not_allowed', 'amount_over_bound'].includes(result.error) ? 403
    : result.error === 'not_found' ? 404
    : ['key_conflict', 'reservation_closed', 'reservation_missing'].includes(result.error) ? 409
    : ['insufficient_funds', 'global_daily_spend_limit_reached', 'spend_limit_reached'].includes(result.error) ? 402
    : result.error === 'rate_limit_reached' ? 429 : 400;
  return json(result, { status, headers: { 'cache-control': 'no-store' } });
}
