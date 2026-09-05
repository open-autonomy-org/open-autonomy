#!/usr/bin/env bun
// The key valve: the project's key lives here and nowhere the agent or the reporter can read. Both point
// at this process (OPEN_AUTONOMY_BASE_URL=http://valve:8787/v1, any dummy key) and it forwards to the
// platform with the real bearer. Only the model routes and the narration route pass; key management and
// admin routes never do, so a rotated key is never a key the agent could read.
//
//   AGENT_ENV_FILE=/secrets/agent.env bun key-valve.ts [--port 8787]
//   (a KEY=value file, re-read when it changes: a rotated key is picked up without a restart)
import { existsSync, readFileSync, statSync } from 'node:fs';

const envFile = process.env.AGENT_ENV_FILE;
let cached: { at: number; env: Record<string, string> } = { at: 0, env: {} };
function keyEnv(): Record<string, string> {
  if (process.env.OPEN_AUTONOMY_KEY) return { OPEN_AUTONOMY_KEY: process.env.OPEN_AUTONOMY_KEY, OPEN_AUTONOMY_BASE_URL: process.env.OPEN_AUTONOMY_BASE_URL ?? '' };
  if (!envFile || !existsSync(envFile)) return {};
  const at = statSync(envFile).mtimeMs;
  if (at !== cached.at) {
    const env: Record<string, string> = {};
    for (const line of readFileSync(envFile, 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2]; }
    cached = { at, env };
  }
  return cached.env;
}
const base = (): string => (keyEnv().OPEN_AUTONOMY_BASE_URL || 'https://open-autonomy.org/v1').replace(/\/$/, '');
const key = (): string | undefined => keyEnv().OPEN_AUTONOMY_KEY;
const portArg = process.argv.indexOf('--port');
const port = Number((portArg >= 0 ? process.argv[portArg + 1] : undefined) || process.env.PORT || 8787);
// The model routes, the narration route, and the two other rails (a card, a partner charge): the platform
// bounds each rail by the owner's config, and every settlement lands on the public audit trail.
const FORWARDED = new Set(['/v1/chat/completions', '/v1/messages', '/v1/responses', '/v1/models', '/v1/agent/events', '/v1/rails/card', '/v1/rails/partner']);
// Public reads the reporter needs to resume where the platform is (its own account's sessions).
const isPublicRead = (path: string, method: string) => method === 'GET' && /^\/v1\/accounts\/[^/]+\/(sessions|items)(\/|$)/.test(path);

Bun.serve({
  hostname: '0.0.0.0',
  port,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/healthz') return new Response(key() ? 'ok' : 'no key yet');
    if (!FORWARDED.has(url.pathname) && !isPublicRead(url.pathname, req.method)) return Response.json({ error: { code: 'not_forwarded', message: 'the valve forwards the model routes, the narration route, the rails and public reads of this account only' } }, { status: 403 });
    const bearer = key();
    if (!bearer) return Response.json({ error: { code: 'no_key', message: 'the valve has no key yet' } }, { status: 503 });
    // A clean request: the body buffered (one honest Content-Length), only the headers that carry meaning.
    const headers = new Headers();
    for (const h of ['content-type', 'accept', 'anthropic-version', 'anthropic-beta', 'last-event-id']) { const v = req.headers.get(h); if (v) headers.set(h, v); }
    headers.set('authorization', `Bearer ${bearer}`);
    headers.set('user-agent', 'open-autonomy-key-valve');
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
    const upstream = await fetch(`${base()}${url.pathname.replace(/^\/v1/, '')}${url.search}`, { method: req.method, headers, body });
    const out = new Headers(upstream.headers);
    out.delete('content-encoding');
    out.delete('content-length');
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
});
console.log(`key-valve: forwarding ${[...FORWARDED].join(', ')} → ${base()} on :${port}`);
