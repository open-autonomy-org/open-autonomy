#!/usr/bin/env bun
// The agent's key sidecar and its narrator. The agent's container never holds the project's standing key:
// its Hermes points at this process (`OPEN_AUTONOMY_BASE_URL=http://sidecar:8787/v1`, any dummy key), and
// this process — running beside it with the real key mounted read-only — forwards the model routes to the
// platform with the real bearer. A transcript that prints the agent's environment shows a dummy.
//
// It is also where the agent's runs become receipts. Hermes pushes signed lifecycle events (its outbound
// webhooks: on_session_start, post_llm_call, post_tool_call, on_session_end) to /hermes-hook here, and this
// translates them into the platform's CloudEvents on the standing key. Hermes needs no credential and no
// knowledge of the platform, and nothing tails its database.
//
//   OPEN_AUTONOMY_KEY=… OPEN_AUTONOMY_BASE_URL=https://open-autonomy.org/v1 bun agent-sidecar.ts [--port 8787]
//   (or AGENT_ENV_FILE=/path/to/agent.env: a KEY=value file, re-read when it changes — a rotated key is
//    picked up without a restart, and a world can start the sidecar before its key exists)
//
// Only the model routes pass. Key management (/v1/keys/*) and admin routes never do: a rotated key would be
// a key the agent could read.
import { existsSync, readFileSync, statSync } from 'node:fs';

const envFile = process.env.AGENT_ENV_FILE;
let cached: { at: number; env: Record<string, string> } = { at: 0, env: {} };
function keyEnv(): Record<string, string> {
  const fromProcess = { OPEN_AUTONOMY_KEY: process.env.OPEN_AUTONOMY_KEY, OPEN_AUTONOMY_BASE_URL: process.env.OPEN_AUTONOMY_BASE_URL };
  if (fromProcess.OPEN_AUTONOMY_KEY) return fromProcess as Record<string, string>;
  if (!envFile || !existsSync(envFile)) return {};
  const at = statSync(envFile).mtimeMs;
  if (at !== cached.at) {
    const env: Record<string, string> = {};
    for (const line of readFileSync(envFile, 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2]; }
    cached = { at, env };
  }
  return cached.env;
}
const base = (): string => (keyEnv().OPEN_AUTONOMY_BASE_URL ?? 'https://open-autonomy.org/v1').replace(/\/$/, '');
const key = (): string | undefined => keyEnv().OPEN_AUTONOMY_KEY;
const portArg = process.argv.indexOf('--port');
const port = Number((portArg >= 0 ? process.argv[portArg + 1] : undefined) || process.env.PORT || 8787);

const ALLOWED = new Set(['/v1/chat/completions', '/v1/messages', '/v1/responses', '/v1/models', '/v1/agent/events']);

Bun.serve({
  hostname: '0.0.0.0',
  port,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/healthz') return new Response(key() ? 'ok' : 'no key yet');
    if (url.pathname === '/hermes-hook') return await hermesHook(req);
    if (!ALLOWED.has(url.pathname) && !url.pathname.startsWith('/v1/models/')) {
      return Response.json({ error: { code: 'not_forwarded', message: 'the sidecar forwards model routes only' } }, { status: 403 });
    }
    // A clean request: the body buffered (one honest Content-Length), only the headers that carry meaning.
    // Copying a client's transport headers through a proxy is how Cloudflare's edge ends up blocking it.
    const headers = new Headers();
    for (const h of ['content-type', 'accept']) { const v = req.headers.get(h); if (v) headers.set(h, v); }
    const bearer = key();
    if (!bearer) return Response.json({ error: { code: 'no_key', message: 'the sidecar has no standing key yet' } }, { status: 503 });
    headers.set('authorization', `Bearer ${bearer}`);
    headers.set('user-agent', 'open-autonomy-agent-sidecar');
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
    const upstream = await fetch(`${base()}${url.pathname.replace(/^\/v1/, '')}${url.search}`, { method: req.method, headers, body });
    const out = new Headers(upstream.headers);
    out.delete('content-encoding');
    out.delete('content-length');
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
});
console.log(`agent-sidecar: forwarding ${[...ALLOWED].join(', ')} and narrating /hermes-hook → ${base()} on :${port}`);

// ---- narration: Hermes's outbound webhooks → the platform's job receipts ---------------------------------
// One Hermes session is one job. Its key is the session id, so a receipt is addressable by the same name the
// harness uses. Turns carry their offset, so a retried delivery is idempotent. The platform redacts at
// intake; this sends the fields a reader needs and nothing else.
type Turn = { ts?: string; role: 'user' | 'assistant' | 'tool'; text?: string; tool?: string; args?: string; result?: string };
const runs = new Map<string, { seq: number; started: boolean; lastText?: string; item?: string }>();
// Which sessions become public receipts. `cron` (the default) is the scheduled runs — the funded work —
// and leaves a Discord conversation private. `all` is for a world, whose one-shot sessions are not named
// cron_* and whose books are disposable.
const NARRATE_ALL = (process.env.OPEN_AUTONOMY_NARRATE_SESSIONS ?? 'cron') === 'all';
const CRON_SESSION = /^cron_[a-z0-9]+_\d{8}_\d{6}$/;
const narratable = (session: string): boolean => NARRATE_ALL || CRON_SESSION.test(session);
const brief = (v: unknown, max = 2000): string => (typeof v === 'string' ? v : JSON.stringify(v ?? '')).slice(0, max);

async function send(type: 'started' | 'turns' | 'finished', subject: string, data: Record<string, unknown>, time?: string): Promise<boolean> {
  const bearer = key();
  if (!bearer) return false;
  const res = await fetch(`${base()}/agent/events`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/cloudevents+json' },
    body: JSON.stringify({ specversion: '1.0', id: crypto.randomUUID(), source: 'hermes://outbound-webhook', type: `org.open-autonomy.job.${type}`, subject, time: time ?? new Date().toISOString(), datacontenttype: 'application/json', data }),
  }).catch(() => null);
  if (!res?.ok) console.error(`narrate ${type} ${subject}: ${res ? `${res.status} ${(await res.text()).slice(0, 160)}` : 'unreachable'}`);
  return Boolean(res?.ok);
}

async function hermesHook(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const body = await req.json().catch(() => null) as { hook_event_name?: string; session_id?: string; tool_name?: string; args?: unknown; extra?: Record<string, unknown> } | null;
  const event = body?.hook_event_name;
  const session = body?.session_id;
  // Only the scheduled runs are receipts: a chat in Discord is not a job, and its turns are not public.
  if (!event || !session || !narratable(session)) return Response.json({ ok: true, ignored: true });
  const extra = body.extra ?? {};
  const run = runs.get(session) ?? { seq: 0, started: false };
  runs.set(session, run);

  if (event === 'on_session_start' && !run.started) {
    run.started = await send('started', session, { job_name: 'build-roadmap', title: String(extra.title ?? 'build-roadmap') });
    return Response.json({ ok: run.started });
  }
  if (!run.started) { // a run whose start we missed (the sidecar restarted): open the receipt now
    run.started = await send('started', session, { job_name: 'build-roadmap' });
    if (!run.started) return Response.json({ ok: false });
  }

  if (event === 'post_tool_call') {
    const turns: Turn[] = [
      { role: 'assistant', tool: String(body.tool_name ?? 'tool'), args: brief(body.args ?? extra.args, 600) },
      { role: 'tool', tool: String(body.tool_name ?? 'tool'), result: brief(extra.result) },
    ];
    if (await send('turns', session, { seq: run.seq, turns })) run.seq += turns.length;
    return Response.json({ ok: true });
  }
  if (event === 'post_llm_call') {
    const text = brief(extra.assistant_response, 8000);
    if (!text.trim()) return Response.json({ ok: true });
    run.lastText = text;
    if (await send('turns', session, { seq: run.seq, turns: [{ role: 'assistant', text }] })) run.seq += 1;
    return Response.json({ ok: true });
  }
  if (event === 'on_session_end') {
    const ok = extra.completed === true && extra.interrupted !== true;
    await send('finished', session, { status: ok ? 'done' : 'failed', report: run.lastText, ended_at: new Date().toISOString() });
    runs.delete(session);
    return Response.json({ ok: true });
  }
  return Response.json({ ok: true, ignored: true });
}
