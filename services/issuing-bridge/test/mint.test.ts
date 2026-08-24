// Mint-path tests: the causal chain (signature → reserve → float → Stripe → binding) with
// every refusal rung, driven through the worker's real fetch handler against an in-memory
// DO and a scripted treasury/stripe fetch. The rehearsal-world drill (both twins under
// volter-world) rides the same surface in the PR-2 checklist.
import { beforeEach, describe, expect, test } from 'bun:test';
import worker, { CardRegistry, type Env } from '../src/index.ts';

const encoder = new TextEncoder();
function toB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

let keys: CryptoKeyPair;
let pubkeyB64url: string;

async function signArtifact(artifact: Record<string, unknown>, tamper = false): Promise<string> {
  const payload = encoder.encode(JSON.stringify(artifact));
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, payload));
  if (tamper) signature[0]! ^= 0xff;
  return `${toB64url(payload)}.${toB64url(signature)}`;
}

function artifactFor(jobRef: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    account: 'acme/app',
    amount_cents: 750,
    approved_at: '2026-08-24T12:00:00.000Z',
    approver: 'operator:alice@example.com',
    job_ref: jobRef,
    merchant_lock: { name_pattern: 'ACME SUPPLIES' },
    ttl_seconds: 3_600,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------------------
// Harness: in-memory DO + scripted upstreams.

class MemoryState {
  private readonly map = new Map<string, unknown>();
  storage = {
    get: async <T>(key: string): Promise<T | undefined> => this.map.get(key) as T | undefined,
    put: async (key: string, value: unknown): Promise<void> => { this.map.set(key, value); },
  };
}

interface Recorded { method: string; url: string; body: string }
let upstreamCalls: Recorded[];
let treasuryScript: Record<string, unknown>;
let stripeFails: boolean;

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
    FLOAT_WATERMARK_CENTS: '1000',
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
  upstreamCalls = [];
  treasuryScript = { ok: true };
  stripeFails = false;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = typeof init?.body === 'string' ? init.body : '';
    upstreamCalls.push({ body, method: init?.method ?? 'GET', url });
    if (url.startsWith('https://treasury.test')) {
      if (url.includes('/v1/supplier/reserve')) return Response.json(treasuryScript);
      return Response.json({ ok: true });
    }
    if (url.startsWith('https://stripe.test')) {
      if (stripeFails) return Response.json({ error: { message: 'issuing is down' } }, { status: 500 });
      if (url.includes('/cardholders')) return Response.json({ id: 'ich_test1' });
      if (url.includes('/issuing/cards/')) return Response.json({ id: url.split('/').at(-1), status: 'canceled' });
      return Response.json({ id: `ic_${body.length}_${upstreamCalls.length}` });
    }
    return realFetch(input as never, init);
  }) as typeof fetch;
});

async function mint(approval: string, env: Env): Promise<Response> {
  return worker.fetch(new Request('https://bridge.test/v1/cards', { body: JSON.stringify({ approval }), method: 'POST' }), env);
}

describe('the mint path', () => {
  test('refuses a tampered approval signature — no treasury call is ever made', async () => {
    const env = makeEnv();
    const response = await mint(await signArtifact(artifactFor('job_a'), true), env);
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: string }).error).toBe('approval_invalid');
    expect(upstreamCalls.filter((call) => call.url.includes('treasury'))).toEqual([]);
  });

  test('surfaces treasury refusals verbatim: unfunded 402, banned 403 — and mints no card', async () => {
    const env = makeEnv();
    treasuryScript = { error: 'account_balance_exhausted', ok: false };
    const unfunded = await mint(await signArtifact(artifactFor('job_b')), env);
    expect(unfunded.status).toBe(402);
    treasuryScript = { error: 'account_banned', ok: false };
    const banned = await mint(await signArtifact(artifactFor('job_c')), env);
    expect(banned.status).toBe(403);
    expect(upstreamCalls.filter((call) => call.url.includes('stripe'))).toEqual([]);
  });

  test('mints once and replays idempotently on the same job_ref', async () => {
    const env = makeEnv();
    const approval = await signArtifact(artifactFor('job_d'));
    const first = await mint(approval, env);
    expect(first.status).toBe(201);
    const minted = (await first.json()) as { card_id: string; replay: boolean; reserve_id: string; status: string };
    expect(minted.replay).toBe(false);
    expect(minted.reserve_id).toBe('rsv:issuing-bridge:job_d');
    expect(minted.status).toBe('armed');
    // The reserve request rode the keyed contract with the procurement category.
    const reserve = upstreamCalls.find((call) => call.url.includes('/v1/supplier/reserve'))!;
    const reserveBody = JSON.parse(reserve.body) as Record<string, unknown>;
    expect(reserveBody.account).toBe('acme/app');
    expect(reserveBody.amount_usd_cents).toBe(750);
    expect(reserveBody.category).toBe('procurement');
    expect(reserveBody.key).toBe('job_d');
    expect(reserveBody.ttl_seconds).toBe(3_600);
    const replay = await mint(approval, env);
    expect(replay.status).toBe(200);
    const replayed = (await replay.json()) as { card_id: string; replay: boolean };
    expect(replayed.replay).toBe(true);
    expect(replayed.card_id).toBe(minted.card_id);
    // The replay short-circuits before any new upstream call.
    expect(upstreamCalls.filter((call) => call.url.includes('/issuing/cards') && !call.url.includes('/issuing/cards/')).length).toBe(1);
  });

  test('refuses past the float watermark and releases the fresh hold', async () => {
    const env = makeEnv();
    const first = await mint(await signArtifact(artifactFor('job_e')), env);
    expect(first.status).toBe(201);
    const over = await mint(await signArtifact(artifactFor('job_f', { amount_cents: 400 })), env);
    expect(over.status).toBe(409);
    expect(((await over.json()) as { error: string }).error).toBe('float_watermark_exceeded');
    const release = upstreamCalls.filter((call) => call.url.includes('/v1/supplier/release'));
    expect(release.length).toBe(1);
    expect(JSON.parse(release[0]!.body).reserve_id).toBe('rsv:issuing-bridge:job_f');
  });

  test('releases the hold when Stripe fails — no exposure without a card', async () => {
    const env = makeEnv();
    stripeFails = true;
    const response = await mint(await signArtifact(artifactFor('job_g')), env);
    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: string }).error).toBe('stripe_mint_failed');
    expect(upstreamCalls.filter((call) => call.url.includes('/v1/supplier/release')).length).toBe(1);
  });
});
