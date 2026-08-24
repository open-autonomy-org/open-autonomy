// Settlement + janitor tests (PR-4): the full happy path mint→auth→capture→settle with the
// treasury receipt, replayed-webhook idempotency, orphan flagging, and the expiry sweep
// releasing float + holds.
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

interface Recorded { body: string; url: string }
let upstreamCalls: Recorded[];
let cardCounter = 0;

function makeEnv(ttlSeconds = 3_600): { env: Env; mint: (jobRef: string) => Promise<string> } {
  const registryInstance = new CardRegistry(new MemoryState() as never);
  const env: Env = {
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
  const mint = async (jobRef: string): Promise<string> => {
    const artifact = {
      account: 'acme/app', amount_cents: 750, approved_at: '2026-08-24T12:00:00.000Z',
      approver: 'operator:alice@example.com', job_ref: jobRef,
      merchant_lock: {}, ttl_seconds: ttlSeconds,
    };
    const payload = encoder.encode(JSON.stringify(artifact));
    const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', keys.privateKey, payload));
    const approval = `${toB64url(payload)}.${toB64url(signature)}`;
    const response = await worker.fetch(new Request('https://bridge.test/v1/cards', { body: JSON.stringify({ approval }), method: 'POST' }), env);
    return ((await response.json()) as { card_id: string }).card_id;
  };
  return { env, mint };
}

const realFetch = globalThis.fetch;
beforeEach(async () => {
  if (keys === undefined) {
    keys = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']) as CryptoKeyPair;
    pubkeyB64url = toB64url(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)));
  }
  upstreamCalls = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    upstreamCalls.push({ body: typeof init?.body === 'string' ? init.body : '', url });
    if (url.startsWith('https://treasury.test')) return Response.json({ ok: true, status: 'held' });
    if (url.startsWith('https://stripe.test')) {
      if (url.includes('/cardholders')) return Response.json({ id: 'ich_s' });
      if (url.includes('/issuing/cards/')) return Response.json({ id: url.split('/').at(-1), status: 'canceled' });
      cardCounter += 1;
      return Response.json({ id: `ic_settle_${cardCounter}` });
    }
    return realFetch(input as never, init);
  }) as typeof fetch;
});

async function fireTxn(env: Env, cardId: string, txnId: string, amount = -750): Promise<Response> {
  const payload = JSON.stringify({
    data: { object: { amount, card: { id: cardId }, id: txnId, type: 'capture' } },
    type: 'issuing_transaction.created',
  });
  return worker.fetch(new Request('https://bridge.test/webhooks/stripe/txn', { body: payload, headers: { 'stripe-signature': await stripeSign(payload) }, method: 'POST' }), env);
}

describe('settlement + janitor', () => {
  test('capture settles the treasury with the txn receipt, cancels the card, and replays idempotently', async () => {
    const { env, mint } = makeEnv();
    const cardId = await mint('job_s1');
    const settled = await fireTxn(env, cardId, 'ipi_txn_1');
    expect(settled.status).toBe(200);
    expect(((await settled.json()) as { settled: boolean }).settled).toBe(true);
    const settle = upstreamCalls.find((call) => call.url.includes('/v1/supplier/settle'))!;
    const body = JSON.parse(settle.body) as Record<string, unknown>;
    expect(body.reserve_id).toBe('rsv:issuing-bridge:job_s1');
    expect(body.amount_usd_cents).toBe(750);
    expect(body.receipt_ref).toBe('ipi_txn_1');
    expect(upstreamCalls.filter((call) => call.url.includes(`/issuing/cards/${cardId}`)).length).toBe(1);
    // Replay: same webhook again — one treasury settle total, acknowledged as a replay.
    const replay = await fireTxn(env, cardId, 'ipi_txn_1');
    expect(((await replay.json()) as { replay: boolean }).replay).toBe(true);
    expect(upstreamCalls.filter((call) => call.url.includes('/v1/supplier/settle')).length).toBe(1);
  });

  test('an orphan transaction is acknowledged 202 and flagged — never silently absorbed', async () => {
    const { env } = makeEnv();
    const response = await fireTxn(env, 'ic_never_minted', 'ipi_orphan');
    expect(response.status).toBe(202);
    expect(((await response.json()) as { orphan: boolean }).orphan).toBe(true);
    expect(upstreamCalls.filter((call) => call.url.includes('/v1/supplier/settle'))).toEqual([]);
  });

  test('the janitor expires armed cards: float restored, card canceled, hold released', async () => {
    const { env, mint } = makeEnv(301); // expires_at = now + 1s (margin 300)
    const cardId = await mint('job_s2');
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const sweep = await worker.fetch(new Request('https://bridge.test/janitor/sweep', { method: 'POST' }), env);
    expect(((await sweep.json()) as { expired: number }).expired).toBe(1);
    expect(upstreamCalls.filter((call) => call.url.includes(`/issuing/cards/${cardId}`)).length).toBe(1);
    const release = upstreamCalls.filter((call) => call.url.includes('/v1/supplier/release'));
    expect(release.length).toBe(1);
    expect(JSON.parse(release[0]!.body).reserve_id).toBe('rsv:issuing-bridge:job_s2');
    // A capture arriving AFTER expiry is refused as closed (202, flagged for the
    // reconciler) — settling it would double-decrement the float on a released hold.
    const late = await fireTxn(env, cardId, 'ipi_late');
    expect(late.status).toBe(202);
    expect(((await late.json()) as { closed: boolean; status: string }).closed).toBe(true);
    expect(((await (await fireTxn(env, cardId, 'ipi_late2')).json()) as { status: string }).status).toBe('expired');
    expect(upstreamCalls.filter((call) => call.url.includes('/v1/supplier/settle'))).toEqual([]);
  });
});
