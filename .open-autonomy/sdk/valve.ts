#!/usr/bin/env bun
// The valve: a credential-injecting sidecar for one Open Autonomy key per port. The key lives in a file only this
// process reads; the agent is configured with this address and the literal word `valve` as its key, and sees no
// credential. Only the routes an agent legitimately uses pass — the model routes, the narration routes (the stream,
// the roadmap), the rails, and public reads of its own account — so key management and admin never reach the
// platform from the agent's side. Held outside the agent's process, the key survives anything the agent prints
// or commits, which is the whole point: everything the agent produces is public.
//
//   open-autonomy-valve --key /secrets/agent.env:8787 [--key /secrets/treasurer.env:8788] [--codex 8789]
//                       [--github-app /secrets/github-app.json:8790] [--loopback]
// Host sidecars use --loopback; ordinary container valves retain their container interface.
//   (each key file `OPEN_AUTONOMY_BASE_URL=…` and `OPEN_AUTONOMY_KEY=…`, re-read when it changes: a rotated key is
//   picked up without a restart; /healthz on each port says when its key expires)
//
// --codex <port>: use the host's current Codex ChatGPT login through Codex's
// app-server authentication RPC. Codex owns storage and refresh. Both bare and
// container Hermes use the same valve with a stand-in credential; OA keeps no login copy.
//
// --github-app: the agent's own GitHub identity for its community desk — a GitHub App installed on the project's
// repository, its file `{app_id, repository, private_key, installation_id?}` (the app's PEM).
// Served on its own port as api.github.com is: the valve signs the app's JWT, mints an installation token scoped
// to that one repository ahead of every expiry, and forwards the desk's routes (the repository's issues and
// their comments, GraphQL for its discussions, and native HTTPS Git) with it. The agent is configured with GITHUB_API_URL at this port
// and GITHUB_TOKEN=valve; every comment it posts is the app's, and the key never enters it.
import { createPrivateKey, sign } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { codexAccess, type CodexAccess } from './codex-auth.ts';

// Each key file is served on its own port: `--key <file>:<port>`, repeatable. A file is re-read when it changes,
// so a rotated key is picked up without a restart.
const keys: Array<{ file: string; port: number }> = [];
for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === '--key') { const [file, port] = String(process.argv[i + 1]).split(':'); keys.push({ file, port: Number(port || 8787 + keys.length) }); }
const codexArg = process.argv.includes('--codex') ? String(process.argv[process.argv.indexOf('--codex') + 1]) : undefined;
const githubArg = process.argv.includes('--github-app') ? String(process.argv[process.argv.indexOf('--github-app') + 1]) : undefined;
if (!keys.length && !codexArg && !githubArg) { console.error('usage: open-autonomy-valve --key <file>:<port> [--key <file>:<port> …] [--codex <port>] [--github-app <app.json>:<port>]'); process.exit(2); }
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
const isPublicRead = (path: string, method: string) => method === 'GET' && /^\/v1\/accounts\/[^/]+(?:$|\/(sessions|items)(\/|$))/.test(path);

for (const { file, port } of keys) Bun.serve({
  hostname: process.argv.includes('--loopback') ? '127.0.0.1' : '0.0.0.0',
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
if (codexArg) {
  const port = Number(codexArg);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use --codex <port>; saved project login copies are no longer used.');
  const forward = async (req: Request, path: string, tokens: CodexAccess, body?: ArrayBuffer): Promise<Response> => {
    const headers = new Headers(req.headers);
    for (const h of ['host', 'authorization', 'chatgpt-account-id', 'content-length', 'connection', 'accept-encoding']) headers.delete(h);
    headers.set('authorization', `Bearer ${tokens.accessToken}`);
    headers.set('ChatGPT-Account-Id', tokens.accountId);
    headers.set('originator', 'codex_cli_rs');
    headers.set('user-agent', 'codex_cli_rs/0.153.2');
    return fetch(`${CODEX_UPSTREAM}${path}`, { method: req.method, headers, body, redirect: 'manual' });
  };
  Bun.serve({
    hostname: '127.0.0.1', port,
    // Match the model valve: reasoning streams can be quiet beyond Bun's 10-second default.
    idleTimeout: 255,
    async fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === '/healthz') { try { await codexAccess(); return new Response('ok · host Codex login\n'); } catch (error) { return new Response(`unavailable: ${error instanceof Error ? error.message : 'host Codex startup or authentication failed'}\n`, { status: 503 }); } }
      if (!u.pathname.startsWith('/backend-api/codex/')) return new Response('not found: the Codex backend lives under /backend-api/codex/\n', { status: 404 });
      const path = u.pathname.slice('/backend-api/codex'.length) + u.search;
      try {
        // A known-length body avoids chunked uploads rejected by the Codex backend and can be replayed after refresh.
        const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
        let tokens = await codexAccess();
        let res = await forward(req, path, tokens, body);
        if (res.status === 401) { await res.body?.cancel(); tokens = await codexAccess({ rejectedToken: tokens.accessToken }); res = await forward(req, path, tokens, body); }
        const out = new Headers(res.headers); for (const h of ['content-encoding', 'content-length', 'transfer-encoding']) out.delete(h);
        return new Response(res.body, { status: res.status, headers: out });
      } catch (e) { return new Response(JSON.stringify({ error: { code: 'codex_unavailable', message: (e as Error).message } }), { status: 502, headers: { 'content-type': 'application/json' } }); }
    },
  });
  console.log(`codex: host Codex login → ${CODEX_UPSTREAM} on :${port}`);
}

// ── The GitHub App ─────────────────────────────────────────────────────────────────────────────────────────────
interface GitHubApp { app_id: number | string; installation_id?: number | string; repository: string; private_key: string; api?: string }
if (githubArg) {
  const [file, portRaw] = githubArg.split(':');
  const port = Number(portRaw || 8790);
  const read = (): GitHubApp => {
    const doc = JSON.parse(readFileSync(file, 'utf8')) as Partial<GitHubApp>;
    if (!doc.app_id || !doc.repository || !doc.private_key) throw new Error(`${file}: needs app_id, repository (owner/name) and private_key (the app's PEM)`);
    return doc as GitHubApp;
  };
  const upstream = (): string => (read().api ?? 'https://api.github.com').replace(/\/$/, '');
  const b64 = (v: string | Buffer): string => Buffer.from(v).toString('base64url');
  // The app's JWT: RS256 over {iat, exp, iss}, ten minutes, the app id as the issuer.
  const appJwt = (app: GitHubApp): string => {
    const now = Math.floor(Date.now() / 1000);
    const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = b64(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: String(app.app_id) }));
    return `${head}.${body}.${b64(sign('sha256', Buffer.from(`${head}.${body}`), createPrivateKey(app.private_key)))}`;
  };
  type InstallationToken = { value: string; expiresAt: number; contents?: string };
  let token: InstallationToken | undefined;
  let minting: Promise<InstallationToken> | undefined;
  // One installation token at a time, scoped to the one repository the file names, an hour long, renewed with five
  // minutes to spare.
  const mint = (): Promise<InstallationToken> => (minting ??= (async () => {
    try {
      const app = read();
      const [, name] = app.repository.split('/');
      const headers = { authorization: `Bearer ${appJwt(app)}`, accept: 'application/vnd.github+json', 'user-agent': 'open-autonomy-valve', 'content-type': 'application/json' };
      let installationId = app.installation_id;
      if (!installationId) {
        // Manifest handoff saves the app key before installation. Credential use discovers the
        // installed app through GitHub; neither the saver nor the browser agent needs to edit a key file.
        const lookup = await fetch(`${upstream()}/repos/${app.repository}/installation`, { headers, signal: AbortSignal.timeout(30_000) });
        if (!lookup.ok) throw new Error(`github-app: repository installation unavailable (${lookup.status}); complete installation in the browser`);
        const installation = await lookup.json() as { id: number; app_id: number; suspended_at?: string | null };
        if (!Number.isSafeInteger(installation.id) || installation.id <= 0 || String(installation.app_id) !== String(app.app_id) || installation.suspended_at) throw new Error('github-app: repository installation does not identify an active installation of this app');
        installationId = installation.id;
      }
      const res = await fetch(`${upstream()}/app/installations/${installationId}/access_tokens`, { method: 'POST', headers, body: JSON.stringify({ repositories: [name] }) });
      const body = await res.json().catch(() => ({})) as { token?: string; expires_at?: string; message?: string; permissions?: { contents?: string } };
      if (!res.ok || !body.token) throw new Error(`github-app: installation token refused (${res.status} ${body.message ?? ''})`);
      token = { value: body.token, expiresAt: Date.parse(body.expires_at ?? '') || Date.now() + 55 * 60_000, contents: body.permissions?.contents };
      console.log(`github-app: installation token minted for ${app.repository}, expires ${new Date(token.expiresAt).toISOString()}`);
      return token;
    } finally { minting = undefined; }
  })());
  const fresh = (): Promise<InstallationToken> => (token && token.expiresAt - Date.now() > 5 * 60_000 ? Promise.resolve(token) : mint());
  // Repository-scoped review verdicts and community conversations can be written.
  // Rules, checks and release evidence are read-only; no administration routes are granted.
  const allowed = (app: GitHubApp, method: string, path: string): boolean => {
    const repo = `/repos/${app.repository}`;
    if (path === '/graphql') return method === 'POST';
    if (path === repo) return method === 'GET';
    if (!path.startsWith(`${repo}/`)) return false;
    const resource = path.slice(repo.length);
    if (method === 'GET' && /^\/(pulls|actions|releases|tags|commits|compare|check-runs|check-suites|statuses|rules|rulesets|branches)(\/|$)/.test(resource)) return true;
    if (method === 'POST' && /^\/pulls\/[0-9]+\/reviews$/.test(resource)) return true;
    if (method === 'PATCH' && path.startsWith(`${repo}/issues/`) && /^[0-9]+$/.test(path.slice(`${repo}/issues/`.length))) return true;
    if (/^\/(issues|discussions)(\/|$)/.test(resource)) return method === 'GET' || method === 'POST';
    return false;
  };
  // Git's ordinary smart-HTTP wire uses the same repository-scoped installation
  // token. No credential helper, token response or SSH transport enters the agent.
  const gitRoute = (app: GitHubApp, method: string, url: URL): 'read' | 'write' | undefined => {
    const root = [`/${app.repository}`, `/${app.repository}.git`].find(root => url.pathname.startsWith(root + '/'));
    if (!root) return;
    const path = url.pathname.slice(root.length);
    if (method === 'GET' && path === '/info/refs' && [...url.searchParams.keys()].join(',') === 'service') {
      if (url.searchParams.get('service') === 'git-upload-pack') return 'read';
      if (url.searchParams.get('service') === 'git-receive-pack') return 'write';
    }
    if (method === 'POST' && !url.search) {
      if (path === '/git-upload-pack') return 'read';
      if (path === '/git-receive-pack') return 'write';
    }
  };
  const gitUpstream = (): string => {
    const api = new URL(upstream());
    return api.hostname === 'api.github.com' ? 'https://github.com' : api.origin;
  };
  Bun.serve({
    hostname: '127.0.0.1', port, idleTimeout: 255,
    async fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === '/healthz') { try { const app = read(); return new Response(`ok · github app ${app.app_id} on ${app.repository}${token ? ` · installation token expires ${new Date(token.expiresAt).toISOString()} · contents ${token.contents ?? 'unknown'}` : ''}\n`); } catch (e) { return new Response(`unavailable: ${(e as Error).message}\n`, { status: 503 }); } }
      try {
        const app = read();
        const git = gitRoute(app, req.method, u);
        if (!git && !allowed(app, req.method, u.pathname)) return new Response(JSON.stringify({ message: `the valve forwards the community and Git routes of ${app.repository} only` }), { status: 403, headers: { 'content-type': 'application/json' } });
        let t = await fresh();
        // Buffer once so a 401 refresh can retry the same binary Git POST safely.
        const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
        const forward = async (credential: InstallationToken): Promise<Response> => {
          if (git && (git === 'write' ? credential.contents !== 'write' : !['read', 'write'].includes(credential.contents ?? ''))) {
            return Response.json({ message: `The project GitHub App needs Contents: ${git} for this Git operation. Complete the agreed installation permission before retrying.` }, { status: 403 });
          }
          const headers = new Headers(req.headers);
          for (const h of ['host', 'authorization', 'content-length', 'connection', 'accept-encoding']) headers.delete(h);
          headers.set('authorization', git ? `Basic ${Buffer.from('x-access-token:' + credential.value).toString('base64')}` : `Bearer ${credential.value}`);
          headers.set('user-agent', 'open-autonomy-valve');
          if (!headers.has('accept')) headers.set('accept', 'application/vnd.github+json');
          return fetch(`${git ? gitUpstream() : upstream()}${u.pathname}${u.search}`, { method: req.method, headers, body, redirect: 'manual' });
        };
        let res = await forward(t);
        if (res.status === 401) { t = await mint(); res = await forward(t); }
        if (git && res.status >= 300 && res.status < 400) return Response.json({ message: 'Git repository redirected; reconcile its configured location before retrying.' }, { status: 502 });
        const out = new Headers(res.headers); for (const h of ['content-encoding', 'content-length', 'transfer-encoding']) out.delete(h);
        return new Response(res.body, { status: res.status, headers: out });
      } catch (e) { return new Response(JSON.stringify({ message: (e as Error).message }), { status: 502, headers: { 'content-type': 'application/json' } }); }
    },
  });
  try { const app = read(); console.log(`github-app: ${file} → ${upstream()} on :${port} (app ${app.app_id}, installation ${app.installation_id ?? 'discovered on use'}, ${app.repository})`); } catch (e) { console.error(`github-app: ${(e as Error).message}`); process.exit(2); }
}
