import { constantTimeEqual } from './http.js';
import type { Env } from './types.js';

// The card rail's vendor: Stripe Issuing, through its form-encoded REST wire, and its webhook signature.
// Only what the rail needs: a cardholder per account, a card per mint, a card canceled after one use, and
// the authorization decisions when the endpoint is not real-time.

export const stripeConfigured = (env: Env): boolean => Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);

function encode(params: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((x, i) => out.push(...(typeof x === 'object' ? encode(x as Record<string, unknown>, `${key}[${i}]`) : [`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(x))}`])));
    else if (typeof v === 'object') out.push(...encode(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export async function stripe<T = Record<string, unknown>>(env: Env, method: 'GET' | 'POST', path: string, params: Record<string, unknown> = {}): Promise<{ ok: boolean; status: number; body: T }> {
  const base = (env.STRIPE_API_BASE ?? 'https://api.stripe.com').replace(/\/$/, '');
  const body = method === 'POST' ? encode(params).join('&') : undefined;
  const query = method === 'GET' && Object.keys(params).length ? `?${encode(params).join('&')}` : '';
  const res = await fetch(`${base}${path}${query}`, { method, headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2025-08-27.basil' }, body });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) as T };
}

// `Stripe-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<payload>")>`, within five minutes.
export async function verifyStripeSignature(secret: string, payload: string, header: string | null, now = Date.now()): Promise<boolean> {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300 || !parts.v1) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return constantTimeEqual(hex, parts.v1);
}
