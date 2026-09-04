import { constantTimeEqual, error, json } from './http.js';
import { LedgerClient, type Sponsor } from './ledger.js';
import type { Env } from './types.js';

// GitHub Sponsors webhook intake. Configured once in the org's Sponsors settings with a shared secret, it
// keeps the active recurring-sponsor list current with no GitHub token: created / tier_changed / edited
// upsert, cancelled removes. One-time sponsorships are credited immediately. Recurring sponsorships become
// funding through the monthly accrue cron, because GitHub fires no per-renewal event.

interface SponsorshipPayload {
  action?: string;
  sponsorship?: {
    node_id?: string;
    created_at?: string;
    sponsor?: { login?: string; avatar_url?: string };
    tier?: { monthly_price_in_cents?: number; is_one_time?: boolean };
  };
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handleSponsorsWebhook(req: Request, env: Env, account: string): Promise<Response> {
  if (req.method !== 'POST') return error('method_not_allowed', 405);
  if (!env.GITHUB_SPONSORS_WEBHOOK_SECRET) return error('webhook_not_configured', 503);
  const event = req.headers.get('x-github-event');
  const body = await req.text();
  const header = req.headers.get('x-hub-signature-256');
  if (!header || !constantTimeEqual(header, `sha256=${await hmacHex(env.GITHUB_SPONSORS_WEBHOOK_SECRET, body)}`)) return error('invalid_signature', 401);
  if (event === 'ping') return json({ ok: true, pong: true });
  if (event !== 'sponsorship') return json({ ok: true, ignored: event });

  const payload = JSON.parse(body) as SponsorshipPayload;
  const s = payload.sponsorship;
  const login = s?.sponsor?.login;
  if (!login || !s?.tier) return error('invalid_payload', 400);
  const amount = s.tier.monthly_price_in_cents ?? 0;
  const sponsor: Sponsor = { login, avatar_url: s.sponsor?.avatar_url, monthly_usd_cents: amount };
  const ledger = new LedgerClient(env.LIMITS);
  switch (payload.action) {
    case 'created':
      if (s.tier.is_one_time) await ledger.mint(account, amount, `onetime:${s.node_id ?? `${login}:${s.created_at ?? ''}`}`, sponsor);
      else await ledger.sponsorUpsert(account, sponsor);
      break;
    case 'tier_changed':
    case 'edited':
      if (!s.tier.is_one_time) await ledger.sponsorUpsert(account, sponsor);
      break;
    case 'cancelled':
      await ledger.sponsorRemove(account, login);
      break;
    default:
      break; // pending_* and anything else: acknowledged, no state change
  }
  return json({ ok: true, action: payload.action });
}
