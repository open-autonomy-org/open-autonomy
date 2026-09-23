#!/usr/bin/env bun
// The platform as a world service: the REAL worker under `wrangler dev`, its upstreams pointed at the twins the world
// injected — the model rail on the model twin, GitHub on the GitHub twin, the card rail on the Stripe twin, money in
// on the Polar twin. The worker takes those as ordinary configuration, so nothing in the backend or the app knows it
// is in a world. The world gives PORT and --persist-to (the books). world/world.config.json declares this service.
import { execFileSync, spawn } from 'node:child_process';
import { resolve } from 'node:path';

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
const child = spawn('bunx', args, { cwd: import.meta.dir, stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true', NODE_OPTIONS: '' } });
child.on('error', (error) => { console.error(error); process.exit(1); });
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
