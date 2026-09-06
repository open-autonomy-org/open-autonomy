#!/usr/bin/env bun
// The valve: a credential-injecting sidecar for one Open Autonomy key per port. The key lives in a file only this
// process reads; the agent is configured with this address and the literal word `valve` as its key, and sees no
// credential. Only the routes an agent legitimately uses pass — the model routes, the narration routes (the stream,
// the roadmap), the rails, and public reads of its own account — so key management and admin never reach the
// platform from the agent's side. Held outside the agent's process, the key survives anything the agent prints
// or commits, which is the whole point: everything the agent produces is public.
//
//   open-autonomy-valve --key /secrets/agent.env:8787 [--key /secrets/treasurer.env:8788]
//   (each file `OPEN_AUTONOMY_BASE_URL=…` and `OPEN_AUTONOMY_KEY=…`, re-read when it changes: a rotated key is
//   picked up without a restart; /healthz on each port says when its key expires)
import { existsSync, readFileSync, statSync } from 'node:fs';

// Each key file is served on its own port: `--key <file>:<port>`, repeatable. A file is re-read when it changes,
// so a rotated key is picked up without a restart.
const keys: Array<{ file: string; port: number }> = [];
for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === '--key') { const [file, port] = String(process.argv[i + 1]).split(':'); keys.push({ file, port: Number(port || 8787 + keys.length) }); }
if (!keys.length) { console.error('usage: open-autonomy-valve --key <file>:<port> [--key <file>:<port> …]'); process.exit(2); }
const caches = new Map<string, { at: number; env: Record<string, string> }>();
function keyEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const at = statSync(file).mtimeMs;
  const cached = caches.get(file);
  if (!cached || at !== cached.at) {
    const env: Record<string, string> = {};
    for (const line of readFileSync(file, 'utf8').split('\n')) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m) env[m[1]] = m[2]; }
    caches.set(file, { at, env });
    announce(file, env.OPEN_AUTONOMY_KEY);
  }
  return caches.get(file)!.env;
}
// The key says when it expires (its claims are readable; only the signature is not). Announced whenever the
// file changes, warned inside fourteen days, and answered on /healthz so the reporter can log it too.
function expiry(token: string | undefined): { kid: string; account: string; exp: string; days: number } | undefined {
  try {
    const claims = JSON.parse(Buffer.from((token ?? '').split('.')[0], 'base64url').toString('utf8')) as { kid?: string; account?: string; exp?: string };
    if (!claims.exp) return undefined;
    return { kid: claims.kid ?? '?', account: claims.account ?? '?', exp: claims.exp, days: Math.floor((Date.parse(claims.exp) - Date.now()) / 86_400_000) };
  } catch { return undefined; }
}
const status = (file: string): string => { const e = expiry(keyEnv(file).OPEN_AUTONOMY_KEY); return e ? `key ${e.kid} for ${e.account} expires ${e.exp} (${e.days} day${e.days === 1 ? '' : 's'})${e.days < 14 ? ' — rotate it: bun .open-autonomy/mint-key.ts --rotate' : ''}` : 'no key yet'; };
function announce(file: string, token: string | undefined): void {
  const e = expiry(token);
  console.log(`valve: ${file}: ${e ? status(file) : 'no readable key in the file'}`);
  if (e && e.days < 14) console.warn(`valve: WARNING the key in ${file} expires in ${e.days} day${e.days === 1 ? '' : 's'}`);
}
const base = (file: string): string => (keyEnv(file).OPEN_AUTONOMY_BASE_URL || 'https://open-autonomy.org/v1').replace(/\/$/, '');
const key = (file: string): string | undefined => keyEnv(file).OPEN_AUTONOMY_KEY;
// The model routes, the narration routes (the stream and the roadmap), and the two other rails (a card, a partner charge): the platform
// bounds each rail by the owner's config, and every settlement lands on the public audit trail.
const FORWARDED = new Set(['/v1/chat/completions', '/v1/messages', '/v1/responses', '/v1/models', '/v1/catalog', '/v1/agent/events', '/v1/agent/roadmap', '/v1/rails/card', '/v1/rails/partner']);
// Public reads the reporter needs to resume where the platform is (its own account's sessions).
const isPublicRead = (path: string, method: string) => method === 'GET' && /^\/v1\/accounts\/[^/]+\/(sessions|items)(\/|$)/.test(path);

for (const { file, port } of keys) Bun.serve({
  hostname: '0.0.0.0',
  port,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/healthz') return new Response(key(file) ? `ok · ${status(file)}` : 'no key yet');
    if (!FORWARDED.has(url.pathname) && !isPublicRead(url.pathname, req.method)) return Response.json({ error: { code: 'not_forwarded', message: 'the valve forwards the model routes, the narration route, the rails and public reads of this account only' } }, { status: 403 });
    const bearer = key(file);
    if (!bearer) return Response.json({ error: { code: 'no_key', message: 'the valve has no key yet' } }, { status: 503 });
    // A clean request: the body buffered (one honest Content-Length), only the headers that carry meaning.
    const headers = new Headers();
    for (const h of ['content-type', 'accept', 'anthropic-version', 'anthropic-beta', 'last-event-id']) { const v = req.headers.get(h); if (v) headers.set(h, v); }
    headers.set('authorization', `Bearer ${bearer}`);
    headers.set('user-agent', 'open-autonomy-valve');
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
    const upstream = await fetch(`${base(file)}${url.pathname.replace(/^\/v1/, '')}${url.search}`, { method: req.method, headers, body });
    const out = new Headers(upstream.headers);
    out.delete('content-encoding');
    out.delete('content-length');
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
});
for (const { file, port } of keys) console.log(`valve: ${file} → ${base(file)} on :${port}; forwarding ${[...FORWARDED].join(', ')}`);
