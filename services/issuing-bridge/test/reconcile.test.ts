// Reconciler tests (PR-5b): the independent replay of Stripe's transaction log — a dropped
// settlement webhook back-fills, an unaccountable transaction raises the incident, and the
// watermark only advances.
import { beforeEach, describe, expect, test } from 'bun:test';
import worker, { CardRegistry, type Env } from '../src/index.ts';

const encoder = new TextEncoder();
function toB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
let keys: CryptoKeyPair;
let pubkeyB64url: string;

class MemoryState {
  private readonly map = new Map<string, unknown>();
  storage = {
    get: async <T>(key: string): Promise<T | undefined> => this.map.get(key) as T | undefined,
    put: async (key: string, value: unknown): Promise<void> => { this.map.set(key, value); },
  };
}

let stripeTransactions: Array<{ amount: number; card: string; created: number; id: string; type: string }>;
let settles: string[];
let cardCounter = 0;

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
beforeEach(async () => {
  if (keys === undefined) {
    keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair;
    pubkeyB64url = toB64url(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)));
  }
  stripeTransactions = [];
  settles = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith('https://treasury.test')) {
      if (url.includes('/v1/supplier/settle')) settles.push(typeof init?.body === 'string' ? init.body : '');
      return Response.json({ ok: true, status: 'held' });
    }
    if (url.startsWith('https://stripe.test')) {
      if (url.includes('/issuing/transactions')) {
        const after = Number(new URL(url).searchParams.get('created[gt]'));
        return Response.json({ data: stripeTransactions.filter((transaction) => transaction.created > after) });
      }
      if (url.includes('/cardholders')) return Response.json({ id: 'ich_r' });
      if (url.includes('/issuing/cards/')) return Response.json({ id: url.split('/').at(-1)!.split('?')[0] });
      cardCounter += 1;
      return Response.json({ id: `ic_rec_${cardCounter}` });
    }
    return realFetch(input as never, init);
  }) as typeof fetch;
});

async function mint(env: Env, jobRef: string): Promise<string> {
  const artifact = {
    account: 'acme/app', amount_cents: 600, approved_at: '2026-08-24T12:00:00.000Z',
    approver: 'operator:alice@example.com', job_ref: jobRef, merchant_lock: {}, ttl_seconds: 3_600,
  };
  const payload = encoder.encode(JSON.stringify(artifact));
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, payload));
  const response = await worker.fetch(new Request('https://bridge.test/v1/cards', { body: JSON.stringify({ approval: `${toB64url(payload)}.${toB64url(signature)}` }), method: 'POST' }), env);
  return ((await response.json()) as { card_id: string }).card_id;
}

const reconcile = (env: Env) => worker.fetch(new Request('https://bridge.test/janitor/reconcile', { method: 'POST' }), env);

describe('the reconciler', () => {
  test('back-fills a dropped settlement webhook and advances the watermark exactly once', async () => {
    const env = makeEnv();
    const cardId = await mint(env, 'job_r1');
    stripeTransactions = [{ amount: -600, card: cardId, created: 1_000, id: 'ipi_dropped', type: 'capture' }];
    const first = await reconcile(env);
    const outcome = (await first.json()) as { backfilled: number; incidents: number; scanned: number };
    expect(outcome).toEqual({ backfilled: 1, incidents: 0, scanned: 1 });
    expect(settles.length).toBe(1);
    expect(JSON.parse(settles[0]!).receipt_ref).toBe('ipi_dropped');
    // Second sweep: the watermark has advanced — nothing rescanned, nothing double-settled.
    const second = await reconcile(env);
    expect(((await second.json()) as { scanned: number }).scanned).toBe(0);
    expect(settles.length).toBe(1);
  });

  test('an unaccountable transaction in the sweep raises the incident and blows the fuse', async () => {
    const env = makeEnv();
    stripeTransactions = [{ amount: -50, card: 'ic_never_ours', created: 2_000, id: 'ipi_alien', type: 'capture' }];
    const swept = await reconcile(env);
    expect(((await swept.json()) as { incidents: number }).incidents).toBe(1);
    const artifact = {
      account: 'acme/app', amount_cents: 600, approved_at: '2026-08-24T12:00:00.000Z',
      approver: 'operator:alice@example.com', job_ref: 'job_r2', merchant_lock: {}, ttl_seconds: 3_600,
    };
    const payload = encoder.encode(JSON.stringify(artifact));
    const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, payload));
    const halted = await worker.fetch(new Request('https://bridge.test/v1/cards', { body: JSON.stringify({ approval: `${toB64url(payload)}.${toB64url(signature)}` }), method: 'POST' }), env);
    expect(halted.status).toBe(503);
    expect(((await halted.json()) as { error: string }).error).toBe('minting_halted');
    const status = await worker.fetch(new Request('https://bridge.test/v1/status'), env);
    expect(((await status.json()) as { minting_fuse: string | null }).minting_fuse).toContain('ipi_alien');
  });
});
