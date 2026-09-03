#!/usr/bin/env bun
// The agent's key sidecar. The agent's container never holds the project's standing key: its Hermes points
// at this process (`OPEN_AUTONOMY_BASE_URL=http://sidecar:8787/v1`, any dummy key), and this process — running
// beside it with the real key mounted read-only — forwards the model routes to the platform with the real
// bearer. A transcript that prints the agent's environment shows a dummy; a transcript that prints this
// process's environment cannot exist, because the agent has no way to reach it.
//
//   OPEN_AUTONOMY_KEY=… OPEN_AUTONOMY_BASE_URL=https://open-autonomy.org/v1 bun agent-sidecar.ts [--port 8787]
//   (or AGENT_ENV_FILE=/path/to/agent.env: a KEY=value file, read once at start)
//
// Only the model routes pass. Key management (/v1/keys/*) and admin routes never do: a rotated key would be
// a key the agent could read.
import { existsSync, readFileSync } from 'node:fs';

const envFile = process.env.AGENT_ENV_FILE;
if (envFile && existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const KEY = process.env.OPEN_AUTONOMY_KEY;
const BASE = (process.env.OPEN_AUTONOMY_BASE_URL ?? 'https://open-autonomy.org/v1').replace(/\/$/, '');
const portArg = process.argv.indexOf('--port');
const port = Number((portArg >= 0 ? process.argv[portArg + 1] : undefined) || process.env.PORT || 8787);
if (!KEY) { console.error('agent-sidecar: OPEN_AUTONOMY_KEY is required (env or AGENT_ENV_FILE)'); process.exit(2); }

// The model routes, plus the reporter's event intake (it runs beside the agent and is keyless too).
const ALLOWED = new Set(['/v1/chat/completions', '/v1/messages', '/v1/responses', '/v1/models', '/v1/agent/events']);

Bun.serve({
  hostname: '0.0.0.0',
  port,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/healthz') return new Response('ok');
    if (!ALLOWED.has(url.pathname) && !url.pathname.startsWith('/v1/models/')) {
      return Response.json({ error: { code: 'not_forwarded', message: 'the sidecar forwards model routes only' } }, { status: 403 });
    }
    // A clean request: the body buffered (one honest Content-Length), only the headers that carry meaning.
    // Copying a client's transport headers through a proxy is how Cloudflare's edge ends up blocking it.
    const headers = new Headers();
    for (const h of ['content-type', 'accept']) { const v = req.headers.get(h); if (v) headers.set(h, v); }
    headers.set('authorization', `Bearer ${KEY}`);
    headers.set('user-agent', 'open-autonomy-agent-sidecar');
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
    const upstream = await fetch(`${BASE}${url.pathname.replace(/^\/v1/, '')}${url.search}`, { method: req.method, headers, body });
    const out = new Headers(upstream.headers);
    out.delete('content-encoding');
    out.delete('content-length');
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
});
console.log(`agent-sidecar: forwarding ${[...ALLOWED].join(', ')} → ${BASE} on :${port}`);
