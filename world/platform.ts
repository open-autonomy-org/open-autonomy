#!/usr/bin/env bun
// The platform as a world service: the REAL worker under `wrangler dev`, its upstreams pointed at the
// twins the world injected (GATEWAY_TWIN_URL is the model gateway, GITHUB_TWIN_URL is GitHub). The worker
// takes those as ordinary configuration, so nothing in platform/ knows it is in a world. The world gives
// PORT and --persist-to (the local Durable Object storage: the books live there for the world's life).
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const arg = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const need = (name: string): string => { const v = process.env[name]; if (!v) { console.error(`world/platform.ts: ${name} is required (the world injects it)`); process.exit(2); } return v; };
const port = need('PORT');
const persist = arg('--persist-to') ?? resolve('.volter/platform-state');
// The model gateway is the world's gateway service: the openai twin playing the gateway's wire, with the
// cookbook's scenario. Nothing here ever reaches a real model.
const vars: Record<string, string> = {
  MODEL_GATEWAY_URL: need('GATEWAY_TWIN_URL'),
  MODEL_GATEWAY_API_KEY: process.env.MODEL_GATEWAY_API_KEY ?? 'world-gateway-key',
  AGENT_PROXY_ADMIN_TOKEN: process.env.AGENT_PROXY_ADMIN_TOKEN ?? 'world-admin',
  AGENT_PROXY_HMAC_SECRET: process.env.AGENT_PROXY_HMAC_SECRET ?? 'world-hmac-secret',
  GITHUB_API_BASE: need('GITHUB_TWIN_URL'),
  GITHUB_RAW_BASE: 'http://127.0.0.1:9/raw', // dead on purpose: the docs sync falls back to the twin's contents API
  ENFORCE_ACCOUNT_BALANCE: 'true',
  DEFAULT_FUNDING_ACCOUNT: process.env.OPEN_AUTONOMY_ACCOUNT ?? 'open-autonomy-org/open-autonomy',
  DEFAULT_SPONSOR_ACCOUNT: process.env.OPEN_AUTONOMY_ACCOUNT ?? 'open-autonomy-org/open-autonomy',
};
const inspector = await (async () => { const s = Bun.serve({ port: 0, fetch: () => new Response('') }); const p = s.port; s.stop(true); return p; })();
const args = ['wrangler', 'dev', '--port', port, '--inspector-port', String(inspector), '--persist-to', persist, '--show-interactive-dev-session', 'false'];
for (const [k, v] of Object.entries(vars)) args.push('--var', `${k}:${v}`);
// `wrangler dev` is supervised here the way a deployment supervises its worker: its dev proxy is known to
// drop ("Network connection lost") under a long session, and the books live on disk (--persist-to), so a
// restart on the same port loses nothing but the request in flight.
let stopping = false;
let child: ReturnType<typeof spawn> | undefined;
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true', NODE_OPTIONS: '' }; // workerd is not a Node app; the injector has nothing to intercept here
const start = () => {
  child = spawn('bunx', args, { cwd: resolve('platform'), stdio: 'inherit', env });
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
