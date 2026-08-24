// Incident + fuse tests (PR-5 core): an orphan capture blows the minting fuse, halted mints
// release their holds, and only the admin token turns minting back on.
import { beforeEach, describe, expect, test } from 'bun:test';
import worker, { CardRegistry, type Env } from '../src/index.ts';

const encoder = new TextEncoder();
function toB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
let keys: CryptoKeyPair;
let pubkeyB64url: string;

async function stripeSign(payload: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', encoder.encode('whsec_test'), { hash: 'SHA-256', name: 'HMAC' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`)));
  return `t=${timestamp},v1=${[...mac].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

class MemoryState {
  private readonly map = new Map<string, unknown>();
  storage = {
    get: async <T>(key: string): Promise<T | undefined> => this.map.get(key) as T | undefined,
    put: async (key: string, value: unknown): Promise<void> => { this.map.set(key, value); },
  };
}

let releases: string[];

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
  releases = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://treasury.test')) {
      if (url.includes('/v1/supplier/release')) releases.push(typeof init?.body === 'string' ? init.body : '');
      return Response.json({ ok: true, status: 'held' });
    }
    if (url.startsWith('https://stripe.test')) {
      if (url.includes('/cardholders')) return Response.json({ id: 'ich_i' });
      if (url.includes('/issuing/cards/')) return Response.json({ id: url.split('/').at(-1) });
      cardCounter += 1;
      return Response.json({ id: `ic_inc_${cardCounter}` });
    }
    return realFetch(input as never, init);
  }) as typeof fetch;
});

async function mint(env: Env, jobRef: string): Promise<Response> {
  const artifact = {
    account: 'acme/app', amount_cents: 500, approved_at: '2026-08-24T12:00:00.000Z',
    approver: 'operator:alice@example.com', job_ref: jobRef, merchant_lock: {}, ttl_seconds: 3_600,
  };
  const payload = encoder.encode(JSON.stringify(artifact));
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, payload));
  return worker.fetch(new Request('https://bridge.test/v1/cards', { body: JSON.stringify({ approval: `${toB64url(payload)}.${toB64url(signature)}` }), method: 'POST' }), env);
}

describe('the orphan incident + minting fuse', () => {
  test('an orphan capture blows the fuse; mints halt (releasing their holds) until the admin reset', async () => {
    const env = makeEnv();
    expect((await mint(env, 'job_i1')).status).toBe(201);
    const payload = JSON.stringify({ data: { object: { amount: -123, card: { id: 'ic_ghost' }, id: 'ipi_orphan1', type: 'capture' } }, type: 'issuing_transaction.created' });
    const orphan = await worker.fetch(new Request('https://bridge.test/webhooks/stripe/txn', { body: payload, headers: { 'stripe-signature': await stripeSign(payload) }, method: 'POST' }), env);
    expect(orphan.status).toBe(202);
    expect(((await orphan.json()) as { incident: boolean }).incident).toBe(true);
    const status = await worker.fetch(new Request('https://bridge.test/v1/status'), env);
    const statusBody = (await status.json()) as { incidents: unknown[]; minting_fuse: string | null };
    expect(statusBody.incidents.length).toBe(1);
    expect(statusBody.minting_fuse).toContain('ipi_orphan1');
    // A mint during the incident refuses 503 AND releases the hold it took.
    const halted = await mint(env, 'job_i2');
    expect(halted.status).toBe(503);
    expect(((await halted.json()) as { error: string }).error).toBe('minting_halted');
    expect(releases.some((body) => body.includes('rsv:issuing-bridge:job_i2'))).toBe(true);
    // Reset requires the admin token — money movement never self-heals its kill switch.
    const badReset = await worker.fetch(new Request('https://bridge.test/v1/fuse-reset', { headers: { 'x-admin-token': 'wrong' }, method: 'POST' }), env);
    expect(badReset.status).toBe(401);
    const reset = await worker.fetch(new Request('https://bridge.test/v1/fuse-reset', { headers: { 'x-admin-token': 'admin_test' }, method: 'POST' }), env);
    expect(reset.status).toBe(200);
    expect((await mint(env, 'job_i3')).status).toBe(201);
  });
});
