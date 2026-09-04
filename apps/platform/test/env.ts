// The worker under test, with an in-memory Durable Object and a fake model gateway. No network anywhere.
import worker from '../src/index.ts';
import { signKey } from '../src/keys.ts';
import type { Env, KeyClaims } from '../src/types.ts';

export const ctx: ExecutionContext = { waitUntil: (p) => { pending.push(p); } };
const pending: Promise<unknown>[] = [];
export async function settle(): Promise<void> { await Promise.all(pending.splice(0)); }

class MemoryStorage {
  private readonly values = new Map<string, unknown>();
  private alarm: number | null = null;
  async get<T = unknown>(key: string): Promise<T | undefined> { return this.values.get(key) as T | undefined; }
  async put<T>(key: string, value: T): Promise<void> { this.values.set(key, structuredClone(value)); }
  async delete(key: string): Promise<boolean> { return this.values.delete(key); }
  async list<T = unknown>(options: { prefix?: string; reverse?: boolean; limit?: number; end?: string } = {}): Promise<Map<string, T>> {
    let keys = [...this.values.keys()].filter((k) => !options.prefix || k.startsWith(options.prefix)).sort();
    if (options.end !== undefined) keys = keys.filter((k) => k < (options.end as string));
    if (options.reverse) keys.reverse();
    if (options.limit !== undefined) keys = keys.slice(0, options.limit);
    return new Map(keys.map((k) => [k, this.values.get(k) as T]));
  }
  async getAlarm(): Promise<number | null> { return this.alarm; }
  async setAlarm(time: number): Promise<void> { this.alarm = time; }
}

export class MemoryNamespace implements DurableObjectNamespace {
  private readonly instances = new Map<string, DurableObjectStub>();
  readonly storages = new Map<string, MemoryStorage>();
  constructor(private readonly create: (state: DurableObjectState) => DurableObject) {}
  idFromName(name: string): DurableObjectId { return name as unknown as DurableObjectId; }
  get(id: DurableObjectId): DurableObjectStub {
    const key = id as unknown as string;
    let stub = this.instances.get(key);
    if (!stub) {
      const storage = this.storages.get(key) ?? new MemoryStorage();
      this.storages.set(key, storage);
      const instance = this.create({ storage } as unknown as DurableObjectState);
      stub = { fetch: (input, init) => instance.fetch(new Request(input, init)) };
      this.instances.set(key, stub);
    }
    return stub;
  }
  // A redeploy: the same storage, a fresh object.
  restart(): void { this.instances.clear(); }
}

export interface FakeGateway { calls: Array<{ route: string; body: Record<string, unknown>; headers: Headers }>; respond: (route: string, body: Record<string, unknown>) => Response | Promise<Response> }

export function testEnv(gateway?: Partial<FakeGateway>): Env & { ns: MemoryNamespace; gateway: FakeGateway } {
  const { LimitLedger } = require('../src/ledger.ts') as typeof import('../src/ledger.ts');
  const ns = new MemoryNamespace((state) => new LimitLedger(state));
  const gw: FakeGateway = {
    calls: [],
    respond: gateway?.respond ?? ((route, body) => Response.json(route === '/v1/messages'
      ? { id: 'msg', type: 'message', model: body.model, content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 10, output_tokens: 5, cost: 0.0007 } }
      : { id: 'chatcmpl', model: body.model, choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0007 } })),
  };
  return {
    AGENT_PROXY_ADMIN_TOKEN: 'admin',
    AGENT_PROXY_HMAC_SECRET: 'test-secret',
    MODEL_GATEWAY_URL: 'https://gateway.test',
    MODEL_GATEWAY_API_KEY: 'gw-key',
    MAX_GLOBAL_DAILY_USD_CENTS: '5000',
    DEFAULT_FUNDING_ACCOUNT: 'acme/app',
    GITHUB_API_BASE: 'https://github.test',
    GITHUB_RAW_BASE: 'https://raw.test',
    STRIPE_API_BASE: 'https://stripe.test',
    STRIPE_SECRET_KEY: 'sk_test_fake',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    LIMITS: ns,
    ns,
    gateway: gw,
  };
}

// Every fetch the worker makes goes through here: the gateway answers model calls, GitHub is a tiny fake
// serving the claim file and the docs, and everything else is refused (the tests reach no network).
export const github: { files: Record<string, string>; repos: Record<string, Record<string, unknown>>; milestones: Record<string, unknown[]> } = { files: {}, repos: {}, milestones: {} };
export const stripe: { requests: Array<{ method: string; path: string; body: Record<string, string> }>; cards: Record<string, Record<string, any>>; decisions: string[] } = { requests: [], cards: {}, decisions: [] };
let current: ReturnType<typeof testEnv> | undefined;
export function useEnv(env: ReturnType<typeof testEnv>): ReturnType<typeof testEnv> { current = env; github.files = {}; github.repos = {}; github.milestones = {}; stripe.requests = []; stripe.cards = {}; stripe.decisions = []; return env; }
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init);
  const url = new URL(req.url);
  if (url.origin === 'https://gateway.test') {
    const body = JSON.parse(await req.text()) as Record<string, unknown>;
    current!.gateway.calls.push({ route: url.pathname, body, headers: req.headers });
    return current!.gateway.respond(url.pathname, body);
  }
  if (url.origin === 'https://raw.test') {
    const m = url.pathname.match(/^\/([^/]+\/[^/]+)\/HEAD\/(.+)$/);
    const text = m ? github.files[`${m[1]}:${m[2]}`] : undefined;
    return text === undefined ? new Response('', { status: 404 }) : new Response(text);
  }
  // A tiny Stripe Issuing: cardholders, cards, cards retrieved with their number, cards canceled,
  // authorizations approved or declined by the API. Everything it stores is inspectable by the test.
  if (url.origin === 'https://stripe.test') {
    const body = Object.fromEntries(new URLSearchParams(await req.text()));
    stripe.requests.push({ method: req.method, path: url.pathname, body });
    if (req.method === 'POST' && url.pathname === '/v1/issuing/cardholders') return Response.json({ id: `ich_${stripe.requests.length}`, object: 'issuing.cardholder' });
    if (req.method === 'POST' && url.pathname === '/v1/issuing/cards') { const id = `ic_${stripe.requests.length}`; stripe.cards[id] = { id, status: 'active', last4: '4242', exp_month: 12, exp_year: 2030, spending: body }; return Response.json(stripe.cards[id]); }
    const card = url.pathname.match(/^\/v1\/issuing\/cards\/(ic_\d+)$/);
    if (card && req.method === 'GET') return stripe.cards[card[1]] ? Response.json({ ...stripe.cards[card[1]], number: '4000000000004242', cvc: '123' }) : new Response('{}', { status: 404 });
    if (card && req.method === 'POST') { if (stripe.cards[card[1]]) stripe.cards[card[1]].status = body.status; return Response.json(stripe.cards[card[1]] ?? {}); }
    const decision = url.pathname.match(/^\/v1\/issuing\/authorizations\/(\w+)\/(approve|decline)$/);
    if (decision) { stripe.decisions.push(`${decision[1]}:${decision[2]}`); return Response.json({ id: decision[1], approved: decision[2] === 'approve' }); }
    return new Response('{}', { status: 404 });
  }
  if (url.origin === 'https://github.test') {
    const repo = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)$/);
    if (repo) return github.repos[repo[1]] ? Response.json(github.repos[repo[1]]) : new Response('', { status: 404 });
    const ms = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/milestones$/);
    if (ms) return github.milestones[ms[1]] ? Response.json(github.milestones[ms[1]]) : new Response('', { status: 404 });
    return new Response('', { status: 404 });
  }
  throw new Error(`test: unexpected fetch ${req.url}`);
}) as typeof fetch;

export async function request(env: Env, path: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  let body: BodyInit | undefined;
  if (init.body !== undefined) { body = typeof init.body === 'string' ? init.body : JSON.stringify(init.body); if (!headers.has('content-type')) headers.set('content-type', 'application/json'); }
  return worker.fetch(new Request(`https://platform.test${path}`, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body }), env, ctx);
}
export async function requestJson<T = any>(env: Env, path: string, init: Parameters<typeof request>[2] = {}): Promise<T> {
  return await (await request(env, path, init)).json() as T;
}
export const admin = { 'x-admin-token': 'admin' };
export async function fund(env: Env, account: string, cents = 1000): Promise<void> {
  const r = await requestJson(env, `/admin/accounts/${encodeURIComponent(account)}/mint`, { headers: admin, body: { amount_usd_cents: cents } });
  if (!r.ok) throw new Error(`fund: ${JSON.stringify(r)}`);
}
// A key for tests: signed like the platform signs one, registered on the books.
export async function mintKey(env: Env, account = 'acme/app', models = ['zai/glm-5.3-flash']): Promise<{ token: string; claims: KeyClaims }> {
  github.files[`${account}:.open-autonomy-claim`] = (await requestJson(env, `/v1/keys/challenge?account=${encodeURIComponent(account)}`)).claim;
  const r = await requestJson(env, '/v1/keys/mint', { body: { account, models } });
  if (!r.ok) throw new Error(`mintKey: ${JSON.stringify(r)}`);
  return { token: r.token, claims: r.key };
}
export { signKey };
