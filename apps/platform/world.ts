#!/usr/bin/env bun
// The platform as a world service: the REAL worker under `wrangler dev`, its upstreams pointed at the twins the world
// injected — the model rail on the model twin, GitHub on the GitHub twin, the card rail on the Stripe twin, money in
// on the Polar twin. The worker takes those as ordinary configuration, so nothing in the backend or the app knows it
// is in a world. The world gives PORT and --persist-to (the books). world/world.config.json declares this service.
import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { constants } from 'node:os';

const TREE = resolve(import.meta.dir, '..', '..');
const { MODEL_PRICES } = await import(resolve(TREE, 'packages/backend/src/pricing.ts'));
const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const need = (name: string): string => { const v = process.env[name]; if (!v) { console.error(`apps/platform/world.ts: ${name} is required (the world injects it)`); process.exit(2); } return v; };
const MODEL = process.env.OPEN_AUTONOMY_MODEL ?? 'zai/glm-5.3-flash';
const PREVIOUS_MODEL = `${MODEL}-previous`;
const port = need('PORT');
const persist = arg('--persist-to') ?? resolve('.volter/platform-state');
const vars: Record<string, string> = {
  MODEL_GATEWAY_URL: need('GATEWAY_TWIN_URL'),
  MODEL_GATEWAY_API_KEY: process.env.MODEL_GATEWAY_API_KEY ?? 'world-gateway-key',
  AGENT_PROXY_ADMIN_TOKEN: process.env.AGENT_PROXY_ADMIN_TOKEN ?? 'world-admin',
  AGENT_PROXY_HMAC_SECRET: process.env.AGENT_PROXY_HMAC_SECRET ?? 'world-hmac-secret',
  GITHUB_API_BASE: need('GITHUB_TWIN_URL'),
  GITHUB_RAW_BASE: 'http://127.0.0.1:9/raw', // dead on purpose: the docs sync falls back to the twin's contents API
  GITHUB_OAUTH_BASE: need('GITHUB_TWIN_URL'),
  GITHUB_OAUTH_CLIENT_ID: 'world-open-autonomy',
  GITHUB_OAUTH_CLIENT_SECRET: 'world-oauth-secret',
  GIVE_SESSION_HMAC_SECRET: 'world-give-session-secret',
  // Represents the platform operator's read:org credential; the funder's OAuth token remains scope-free.
  GITHUB_TOKEN: 'world-bot',
  DEPLOY_COMMIT: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: TREE, encoding: 'utf8' }).trim(),
  // The owner's previous model is a world-only name for the same model: priced like it, so a run reserves against
  // a flash-class ceiling and not the unlisted-model ceiling (which would refuse a second call in flight on $5).
  MODEL_PRICES_JSON: JSON.stringify({ [PREVIOUS_MODEL]: MODEL_PRICES[MODEL] }),
  DEFAULT_FUNDING_ACCOUNT: need('OPEN_AUTONOMY_ACCOUNT'),
  DEFAULT_SPONSOR_ACCOUNT: 'open-autonomy-org/grants',
  GRANTS_ACCOUNT: 'open-autonomy-org/grants',
};
// The card rail's issuer is the Stripe twin. The platform's webhook endpoint is enrolled on it here, the
// way an operator enrols one in the Stripe dashboard, and the twin's signing secret for it becomes the
// worker's STRIPE_WEBHOOK_SECRET. Enrolled for the real-time authorization decision and the capture.
if (process.env.STRIPE_TWIN_URL) {
  vars.STRIPE_API_BASE = process.env.STRIPE_TWIN_URL;
  vars.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? 'sk_test_world';
  vars.ISSUING_BILLING_ADDRESS_JSON = JSON.stringify({ line1: '1 World Street', city: 'Twin City', state: 'CA', postal_code: '00000', country: 'US' });
  const res = await fetch(`${process.env.STRIPE_TWIN_URL}/v1/webhook_endpoints`, { method: 'POST', headers: { authorization: `Bearer ${vars.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body: `url=${encodeURIComponent(`http://127.0.0.1:${port}/webhooks/stripe`)}&enabled_events[0]=issuing_authorization.request&enabled_events[1]=issuing_authorization.created&enabled_events[2]=issuing_transaction.created` });
  const endpoint = await res.json().catch(() => ({})) as { secret?: string };
  if (!res.ok || !endpoint.secret) { console.error(`apps/platform/world.ts: cannot enrol the webhook endpoint on the Stripe twin (${res.status})`); process.exit(2); }
  vars.STRIPE_WEBHOOK_SECRET = endpoint.secret;
}
// People sign in with Volter (ADR 0011) on the Volter identity twin. The platform is registered on it here the way an
// operator registers a product at id.volter.ai: the operator creates the confidential client through the service's
// admin routes, and its id and secret become the worker's. It is `native` because the service admits a loopback http
// redirect only for native clients; production registers a web client whose redirect is https. The people and the
// operator's sign-in are the twin's own seeding doors (/_twin/people, /_twin/login). The funder is a Volter person whose linked GitHub account is the GitHub
// twin's octocat, by the id that twin gives it, so the login the platform reads back from GitHub is octocat's.
if (process.env.VOLTER_IDENTITY_TWIN_URL) {
  const id = process.env.VOLTER_IDENTITY_TWIN_URL.replace(/\/$/, '');
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${id}${path}`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const person = async (body: object): Promise<string> => { const r = await post('/_twin/people', body); const p = await r.json().catch(() => ({})) as { id?: string }; if (!r.ok || !p.id) { console.error(`apps/platform/world.ts: cannot seed a Volter person (${r.status})`); process.exit(2); } return p.id; };
  const operator = await person({ email: 'operator@open-autonomy.test', name: 'Operator' });
  const octocat = await fetch(`${process.env.GITHUB_TWIN_URL}/users/octocat`).then((r) => r.json()).catch(() => ({})) as { id?: number };
  if (!octocat.id) { console.error('apps/platform/world.ts: the GitHub twin did not answer for octocat'); process.exit(2); }
  await person({ email: 'octocat@open-autonomy.test', name: 'The Octocat', github_id: String(octocat.id), github_login: 'octocat' });
  const login = await post('/_twin/login', { person: operator });
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const admin = { authorization: 'Bearer world-identity-admin', cookie };
  const client = await post('/admin/clients', { client_name: 'Open Autonomy', redirect_uris: [`http://127.0.0.1:${port}/give/callback`, `http://localhost:${port}/give/callback`], token_endpoint_auth_method: 'client_secret_post', application_type: 'native', skip_consent: true, scope: 'openid profile email' }, admin);
  const registered = await client.json().catch(() => ({})) as { client_id?: string; client_secret?: string };
  if (!client.ok || !registered.client_id || !registered.client_secret) { console.error(`apps/platform/world.ts: cannot register the platform on the Volter identity twin (${client.status})`); process.exit(2); }
  vars.VOLTER_ISSUER = id;
  vars.VOLTER_CLIENT_ID = registered.client_id;
  vars.VOLTER_CLIENT_SECRET = registered.client_secret;
}
// Money in is the Polar twin. It stores products, checkouts and orders but delivers no webhooks, so the
// worker's signing secret is the world's own and the probe signs the events Polar would send.
if (process.env.POLAR_TWIN_URL) {
  vars.POLAR_API_BASE = process.env.POLAR_TWIN_URL;
  vars.POLAR_ACCESS_TOKEN = 'polar_at_world';
  vars.POLAR_WEBHOOK_SECRET = `whsec_${Buffer.from('world-polar-secret').toString('base64')}`;
}
// The dashboard's browser half is built into the assets before the worker starts, as a deployment's `build` does.
execFileSync('bun', ['run', 'build'], { cwd: import.meta.dir, stdio: 'inherit' });
const inspector = await (async () => { const s = Bun.serve({ port: 0, fetch: () => new Response('') }); const p = s.port; s.stop(true); return p; })();
const args = ['wrangler', 'dev', '--port', port, '--inspector-port', String(inspector), '--persist-to', persist, '--show-interactive-dev-session', 'false'];
for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
// One foreground process. World captures failure and owns this entire process group.
// wrangler writes its full debug log to a file of its own: in the World's log directory for this service, so the log
// is kept with the World's (and survives the next boot as logs/previous) instead of in a HOME the next boot wipes.
const wranglerLog = process.env.VOLTER_WORLD_SERVICE_LOG_DIR ? { WRANGLER_LOG_PATH: process.env.VOLTER_WORLD_SERVICE_LOG_DIR } : {};
const child = spawn('bunx', args, { cwd: import.meta.dir, stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true', NODE_OPTIONS: '', ...wranglerLog } });
child.on('error', (error) => { console.error(error); process.exit(1); });
// wrangler's end is this process's end: its exit code, or the same signal re-raised (the World records a signal as
// one, where exiting 1 would pass a crash off as an ordinary failure).
child.on('exit', (code, signal) => {
  // A signal the runtime ignores (SIGPIPE) survives the re-raise, and one it cannot name back (Bun reports macOS's 30
  // as SIGPWR) cannot be re-raised; either way the status a shell gives the signal follows.
  if (signal) {
    process.removeAllListeners(signal);
    try { process.kill(process.pid, signal); } catch { /* not a signal this runtime can send */ }
    const n = constants.signals[signal];
    process.exit(n ? 128 + n : 1);
  }
  process.exit(code ?? 0);
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
