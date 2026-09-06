#!/usr/bin/env bun
// The valve: a credential-injecting sidecar for one Open Autonomy key per port. The key lives in a file only this
// process reads; the agent is configured with this address and the literal word `valve` as its key, and sees no
// credential. Only the routes an agent legitimately uses pass — the model routes, the narration routes (the stream,
// the roadmap), the rails, and public reads of its own account — so key management and admin never reach the
// platform from the agent's side. Held outside the agent's process, the key survives anything the agent prints
// or commits, which is the whole point: everything the agent produces is public.
//
//   open-autonomy-valve --key /secrets/agent.env:8787 [--key /secrets/treasurer.env:8788] [--codex /secrets/codex.json:8789]
//   (each key file `OPEN_AUTONOMY_BASE_URL=…` and `OPEN_AUTONOMY_KEY=…`, re-read when it changes: a rotated key is
//   picked up without a restart; /healthz on each port says when its key expires)
//
// --codex: the owner's ChatGPT/Codex subscription login, held here the same way — the file as the Codex CLI keeps it
// (`tokens.access_token`, `refresh_token`, `id_token`, `account_id`), served under /backend-api/codex/* on its own port
// and forwarded to chatgpt.com's Codex backend with the bearer and the account header; the access token is refreshed
// ahead of its expiry (auth.openai.com, the Codex client id) and written back. Hermes's `openai-codex` provider is
// pointed at this port (HERMES_CODEX_BASE_URL) with a placeholder credential, so the login never enters the agent.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';

// Each key file is served on its own port: `--key <file>:<port>`, repeatable. A file is re-read when it changes,
// so a rotated key is picked up without a restart.
const keys: Array<{ file: string; port: number }> = [];
for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === '--key') { const [file, port] = String(process.argv[i + 1]).split(':'); keys.push({ file, port: Number(port || 8787 + keys.length) }); }
const codexArg = process.argv.includes('--codex') ? String(process.argv[process.argv.indexOf('--codex') + 1]) : undefined;
if (!keys.length && !codexArg) { console.error('usage: open-autonomy-valve --key <file>:<port> [--key <file>:<port> …] [--codex <tokens.json>:<port>]'); process.exit(2); }
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

// ── The Codex subscription ─────────────────────────────────────────────────────────────────────────────────────
const CODEX_UPSTREAM = 'https://chatgpt.com/backend-api/codex';
const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
interface CodexTokens { access_token: string; refresh_token: string; id_token?: string; account_id?: string }
const jwtClaims = (token: string): Record<string, any> => { try { const p = token.split('.')[1] ?? ''; return JSON.parse(Buffer.from(p + '='.repeat((4 - (p.length % 4)) % 4), 'base64url').toString('utf8')); } catch { return {}; } };
if (codexArg) {
  const [file, portRaw] = codexArg.split(':');
  const port = Number(portRaw || 8789);
  const read = (): { tokens: CodexTokens; [k: string]: unknown } => {
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { tokens?: CodexTokens };
    if (!doc.tokens?.access_token || !doc.tokens.refresh_token) throw new Error(`${file}: no tokens.access_token / tokens.refresh_token (the Codex CLI's auth.json shape)`);
    return doc as { tokens: CodexTokens };
  };
  const accountOf = (t: CodexTokens): string | undefined => t.account_id ?? jwtClaims(t.access_token)['https://api.openai.com/auth']?.chatgpt_account_id;
  const expiresAt = (t: CodexTokens): number => Number(jwtClaims(t.access_token).exp ?? 0) * 1000;
  let refreshing: Promise<CodexTokens> | undefined;
  // One refresh at a time; the new tokens (the refresh token rotates too) go back to the file before anyone uses them.
  const refresh = (): Promise<CodexTokens> => (refreshing ??= (async () => {
    try {
      const doc = read();
      const res = await fetch(CODEX_TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: doc.tokens.refresh_token, client_id: CODEX_CLIENT_ID }) });
      const body = await res.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; id_token?: string; error?: string };
      if (!res.ok || !body.access_token) throw new Error(`codex: refresh refused (${res.status} ${body.error ?? ''}) — log in again with the Codex CLI and copy its auth.json tokens to ${file}`);
      const tokens: CodexTokens = { ...doc.tokens, access_token: body.access_token, refresh_token: body.refresh_token ?? doc.tokens.refresh_token, ...(body.id_token ? { id_token: body.id_token } : {}) };
      writeFileSync(file, `${JSON.stringify({ ...doc, tokens, last_refresh: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
      console.log(`codex: access token refreshed, expires ${new Date(expiresAt(tokens)).toISOString()}`);
      return tokens;
    } finally { refreshing = undefined; }
  })());
  const fresh = async (): Promise<CodexTokens> => { const t = read().tokens; return expiresAt(t) - Date.now() < 5 * 60_000 ? refresh() : t; };
  const forward = async (req: Request, path: string, tokens: CodexTokens): Promise<Response> => {
    const headers = new Headers(req.headers);
    for (const h of ['host', 'authorization', 'chatgpt-account-id', 'content-length', 'connection', 'accept-encoding']) headers.delete(h);
    headers.set('authorization', `Bearer ${tokens.access_token}`);
    const account = accountOf(tokens); if (account) headers.set('ChatGPT-Account-Id', account);
    headers.set('originator', 'codex_cli_rs');
    headers.set('user-agent', 'codex_cli_rs/0.153.2');
    return fetch(`${CODEX_UPSTREAM}${path}`, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body, redirect: 'manual' });
  };
  Bun.serve({
    hostname: '127.0.0.1', port,
    async fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === '/healthz') { try { const t = read().tokens; return new Response(`ok · codex account ${accountOf(t) ?? '?'} · access token expires ${new Date(expiresAt(t)).toISOString()}\n`); } catch (e) { return new Response(`unavailable: ${(e as Error).message}\n`, { status: 503 }); } }
      if (!u.pathname.startsWith('/backend-api/codex/')) return new Response('not found: the Codex backend lives under /backend-api/codex/\n', { status: 404 });
      const path = u.pathname.slice('/backend-api/codex'.length) + u.search;
      try {
        let tokens = await fresh();
        let res = await forward(req, path, tokens);
        if (res.status === 401) { tokens = await refresh(); res = await forward(req.clone(), path, tokens); }
        const out = new Headers(res.headers); for (const h of ['content-encoding', 'content-length', 'transfer-encoding']) out.delete(h);
        return new Response(res.body, { status: res.status, headers: out });
      } catch (e) { return new Response(JSON.stringify({ error: { code: 'codex_unavailable', message: (e as Error).message } }), { status: 502, headers: { 'content-type': 'application/json' } }); }
    },
  });
  try { const t = read().tokens; console.log(`codex: ${file} → ${CODEX_UPSTREAM} on :${port} (account ${accountOf(t) ?? '?'}, access token expires ${new Date(expiresAt(t)).toISOString()})`); } catch (e) { console.error(`codex: ${(e as Error).message}`); process.exit(2); }
}
