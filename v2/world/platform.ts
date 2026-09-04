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
