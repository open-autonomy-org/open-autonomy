#!/usr/bin/env bun
// The platform as a world service: the REAL worker under `wrangler dev`, its upstreams pointed at the
// twins the world injected. The worker takes those as ordinary configuration, so nothing in apps/platform
// knows it is in a world. The world gives PORT and --persist-to (the local Durable Object storage).
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const need = (name: string): string => { const v = process.env[name]; if (!v) { console.error(`world/platform.ts: ${name} is required (the world injects it)`); process.exit(2); } return v; };
const port = need('PORT');
const persist = arg('--persist-to') ?? resolve('.volter/platform-state');
const vars: Record<string, string> = {
  MODEL_GATEWAY_URL: need('GATEWAY_TWIN_URL'),
  MODEL_GATEWAY_API_KEY: process.env.MODEL_GATEWAY_API_KEY ?? 'world-gateway-key',
  AGENT_PROXY_ADMIN_TOKEN: process.env.AGENT_PROXY_ADMIN_TOKEN ?? 'world-admin',
  AGENT_PROXY_HMAC_SECRET: process.env.AGENT_PROXY_HMAC_SECRET ?? 'world-hmac-secret',
  GITHUB_API_BASE: need('GITHUB_TWIN_URL'),
  GITHUB_RAW_BASE: 'http://127.0.0.1:9/raw', // dead on purpose: the docs sync falls back to the twin's contents API
  DEFAULT_FUNDING_ACCOUNT: process.env.OPEN_AUTONOMY_ACCOUNT ?? `cookbook/${process.env.WORLD_COOKBOOK ?? 'todo-cli'}`,
  DEFAULT_SPONSOR_ACCOUNT: process.env.OPEN_AUTONOMY_ACCOUNT ?? `cookbook/${process.env.WORLD_COOKBOOK ?? 'todo-cli'}`,
};
// The card rail's issuer is the Stripe twin. The platform's webhook endpoint is enrolled on it here, the
// way an operator enrols one in the Stripe dashboard, and the twin's signing secret for it becomes the
// worker's STRIPE_WEBHOOK_SECRET. Enrolled for the real-time authorization decision and the capture.
if (process.env.STRIPE_TWIN_URL) {
  vars.STRIPE_API_BASE = process.env.STRIPE_TWIN_URL;
  vars.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? 'sk_test_world';
  const res = await fetch(`${process.env.STRIPE_TWIN_URL}/v1/webhook_endpoints`, { method: 'POST', headers: { authorization: `Bearer ${vars.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body: `url=${encodeURIComponent(`http://127.0.0.1:${port}/webhooks/stripe`)}&enabled_events[0]=issuing_authorization.request&enabled_events[1]=issuing_authorization.created&enabled_events[2]=issuing_transaction.created` });
  const endpoint = await res.json().catch(() => ({})) as { secret?: string };
  if (!res.ok || !endpoint.secret) { console.error(`world/platform.ts: cannot enrol the webhook endpoint on the Stripe twin (${res.status})`); process.exit(2); }
  vars.STRIPE_WEBHOOK_SECRET = endpoint.secret;
}
// Money in is the Polar twin. It stores products, checkouts and orders but delivers no webhooks, so the
// worker's signing secret is the world's own and the probe signs the events Polar would send.
if (process.env.POLAR_TWIN_URL) {
  vars.POLAR_API_BASE = process.env.POLAR_TWIN_URL;
  vars.POLAR_ACCESS_TOKEN = 'polar_at_world';
  vars.POLAR_WEBHOOK_SECRET = `whsec_${Buffer.from('world-polar-secret').toString('base64')}`;
}
const inspector = await (async () => { const s = Bun.serve({ port: 0, fetch: () => new Response('') }); const p = s.port; s.stop(true); return p; })();
const args = ['wrangler', 'dev', '--port', port, '--inspector-port', String(inspector), '--persist-to', persist, '--show-interactive-dev-session', 'false'];
for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
// Supervised the way a deployment supervises its worker: wrangler's dev proxy is known to drop under a long
// session, and the books live on disk, so a restart on the same port loses nothing but the request in flight.
let stopping = false;
let child: ReturnType<typeof spawn> | undefined;
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true', NODE_OPTIONS: '' };
const start = () => {
  child = spawn('bunx', args, { cwd: resolve(import.meta.dir, '..', 'apps', 'platform'), stdio: 'inherit', env });
  child.on('exit', (code) => {
    if (stopping) process.exit(code ?? 0);
    console.error(`world/platform.ts: wrangler dev exited (${code}); restarting on :${port}`);
    setTimeout(start, 2000);
  });
};
const stop = () => { stopping = true; child?.kill('SIGTERM'); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
start();
