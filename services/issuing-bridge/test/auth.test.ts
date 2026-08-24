// Real-time authorization tests (PR-3): the five-clause decision, the single-use latch,
// and fail-closed treasury behavior — driven through the worker's real webhook handler
// with genuinely signed Stripe payloads.
import { beforeEach, describe, expect, test } from 'bun:test';
import worker, { CardRegistry, type Env } from '../src/index.ts';

const encoder = new TextEncoder();
function toB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

let keys: CryptoKeyPair;
let pubkeyB64url: string;

async function signArtifact(artifact: Record<string, unknown>): Promise<string> {
  const payload = encoder.encode(JSON.stringify(artifact));
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, payload));
  return `${toB64url(payload)}.${toB64url(signature)}`;
}

async function stripeSign(secret: string, payload: string, atMs = Date.now()): Promise<string> {
  const timestamp = Math.floor(atMs / 1000);
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { hash: 'SHA-256', name: 'HMAC' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`)));
  const hex = [...mac].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${hex}`;
}

class MemoryState {
  private readonly map = new Map<string, unknown>();
  storage = {
    get: async <T>(key: string): Promise<T | undefined> => this.map.get(key) as T | undefined,
    put: async (key: string, value: unknown): Promise<void> => { this.map.set(key, value); },
  };
}

let reserveStatus: string;
let treasuryDown: boolean;

function makeEnv(): Env {
  const registryInstance = new CardRegistry(new MemoryState() as never);
  return {
    ADMIN_TOKEN: 'admin_test',
    APPROVAL_PUBKEY: pubkeyB64url,
    CARDS: {
      idFromName: () => 'singleton',
      get: () => ({ fetch: (url: string | Request, init?: RequestInit) => registryInstance.fetch(new Request(url as string, init)) }),
    } as never,
    CARD_EXPIRY_MARGIN_SECONDS: '300',
    FLOAT_WATERMARK_CENTS: '100000',
    STRIPE_API_BASE: 'https://stripe.test',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_KEY: 'sk_test_x',
    TREASURY_SUPPLIER_TOKEN: 'sup.issuing-bridge.secret',
    TREASURY_URL: 'https://treasury.test',
  };
}

const realFetch = globalThis.fetch;
let cardCounter = 0;
beforeEach(async () => {
  if (keys === undefined) {
    keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair;
    pubkeyB64url = toB64url(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)));
  }
  reserveStatus = 'held';
  treasuryDown = false;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://treasury.test')) {
      if (treasuryDown) throw new Error('connection refused');
      if (url.includes('/v1/supplier/reserves/')) return Response.json({ ok: true, status: reserveStatus });
      return Response.json({ ok: true });
    }
    if (url.startsWith('https://stripe.test')) {
      if (url.includes('/cardholders')) return Response.json({ id: 'ich_a' });
      cardCounter += 1;
      return Response.json({ id: `ic_auth_${cardCounter}` });
    }
    return realFetch(input as never, init);
  }) as typeof fetch;
});

async function mintArmedCard(env: Env, jobRef: string): Promise<string> {
  const approval = await signArtifact({
    account: 'acme/app', amount_cents: 750, approved_at: '2026-08-24T12:00:00.000Z',
    approver: 'operator:alice@example.com', job_ref: jobRef,
    merchant_lock: { name_pattern: 'ACME' }, ttl_seconds: 3_600,
  });
  const response = await worker.fetch(new Request('https://bridge.test/v1/cards', { body: JSON.stringify({ approval }), method: 'POST' }), env);
  return ((await response.json()) as { card_id: string }).card_id;
}

async function fireAuth(env: Env, cardId: string, overrides: Record<string, unknown> = {}, options: { badSignature?: boolean } = {}): Promise<Response> {
  const payload = JSON.stringify({
    data: { object: { card: { id: cardId }, id: `iauth_${Math.random().toString(36).slice(2, 10)}`, merchant_data: { category_code: '5943', name: 'ACME SUPPLIES INC', network_id: 'net_1' }, pending_request: { amount: 700 }, ...overrides } },
    type: 'issuing_authorization.request',
  });
  const signature = options.badSignature === true ? 't=1,v1=deadbeef' : await stripeSign('whsec_test', payload);
  return worker.fetch(new Request('https://bridge.test/webhooks/stripe/auth', { body: payload, headers: { 'stripe-signature': signature }, method: 'POST' }), env);
}

describe('real-time authorization', () => {
  test('rejects an unverifiable signature outright', async () => {
    const env = makeEnv();
    const response = await fireAuth(env, 'ic_whatever', {}, { badSignature: true });
    expect(response.status).toBe(401);
  });

  test('approves exactly once: the single-use latch declines the second authorization', async () => {
    const env = makeEnv();
    const cardId = await mintArmedCard(env, 'job_auth1');
    const first = await fireAuth(env, cardId);
    expect(((await first.json()) as { approved: boolean }).approved).toBe(true);
    const second = await fireAuth(env, cardId);
    expect(((await second.json()) as { approved: boolean }).approved).toBe(false);
  });

  test('declines amount over the lock, merchant mismatch, and unknown cards', async () => {
    const env = makeEnv();
    const cardId = await mintArmedCard(env, 'job_auth2');
    const over = await fireAuth(env, cardId, { pending_request: { amount: 800 } });
    expect(((await over.json()) as { approved: boolean }).approved).toBe(false);
    const wrongMerchant = await fireAuth(env, cardId, { merchant_data: { name: 'SOMEONE ELSE' } });
    expect(((await wrongMerchant.json()) as { approved: boolean }).approved).toBe(false);
    const unknown = await fireAuth(env, 'ic_ghost');
    expect(((await unknown.json()) as { approved: boolean }).approved).toBe(false);
    // The valid auth still approves after the declined attempts (declines never latch).
    const ok = await fireAuth(env, cardId);
    expect(((await ok.json()) as { approved: boolean }).approved).toBe(true);
  });

  test('fails closed: reserve not held, and treasury unreachable, both decline', async () => {
    const env = makeEnv();
    const cardId = await mintArmedCard(env, 'job_auth3');
    reserveStatus = 'released';
    const notHeld = await fireAuth(env, cardId);
    expect(((await notHeld.json()) as { approved: boolean }).approved).toBe(false);
    treasuryDown = true;
    const down = await fireAuth(env, cardId);
    expect(((await down.json()) as { approved: boolean }).approved).toBe(false);
    // Recovery: treasury back + held → the card is still armed (declines never consumed it).
    treasuryDown = false;
    reserveStatus = 'held';
    const recovered = await fireAuth(env, cardId);
    expect(((await recovered.json()) as { approved: boolean }).approved).toBe(true);
  });
});
