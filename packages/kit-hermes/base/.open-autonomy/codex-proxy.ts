// The host Codex HTTP door. Its listener belongs to the host service, independently of board generations.
// Codex alone owns login storage and refresh; this module never keeps a credential between requests.
import { codexAccess, type CodexAccess } from './codex-auth.ts';
import { responseWork } from './work-ledger.ts';

export function serveCodex(port: number, identity?: { binding: string; instance: string }) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Codex proxy needs an unprivileged port');
  const upstream = 'https://chatgpt.com/backend-api/codex';
  const forward = (req: Request, path: string, tokens: CodexAccess, body?: ArrayBuffer): Promise<Response> => {
    const headers = new Headers(req.headers);
    for (const h of ['host', 'authorization', 'chatgpt-account-id', 'content-length', 'connection', 'accept-encoding']) headers.delete(h);
    headers.set('authorization', `Bearer ${tokens.accessToken}`);
    headers.set('ChatGPT-Account-Id', tokens.accountId);
    headers.set('originator', 'codex_cli_rs');
    headers.set('user-agent', 'codex_cli_rs/0.153.2');
    return responseWork('call', 'codex.upstream', () => fetch(`${upstream}${path}`, { method: req.method, headers, body, redirect: 'manual' }), body?.byteLength);
  };
  return Bun.serve({
    hostname: '127.0.0.1', port, idleTimeout: 255,
    async fetch(req) {
      return responseWork('door', 'codex.request', async () => {
      const url = new URL(req.url);
      // Readiness identifies this listener without starting an authentication process or disclosing its store.
      if (url.pathname === '/readyz' && identity) return Response.json({ service: 'open-autonomy-codex-proxy', protocol: 1, pid: process.pid, ...identity });
      if (url.pathname === '/healthz') {
        try { await codexAccess(); return new Response('ok · host Codex login\n'); }
        catch (error) { return new Response(`unavailable: ${error instanceof Error ? error.message : 'host Codex startup or authentication failed'}\n`, { status: 503 }); }
      }
      if (!url.pathname.startsWith('/backend-api/codex/')) return new Response('not found: the Codex backend lives under /backend-api/codex/\n', { status: 404 });
      try {
        const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
        const path = url.pathname.slice('/backend-api/codex'.length) + url.search;
        let tokens = await codexAccess();
        let response = await forward(req, path, tokens, body);
        if (response.status === 401) {
          await response.body?.cancel();
          tokens = await codexAccess({ rejectedToken: tokens.accessToken });
          response = await forward(req, path, tokens, body);
        }
        const headers = new Headers(response.headers);
        for (const h of ['content-encoding', 'content-length', 'transfer-encoding']) headers.delete(h);
        return new Response(response.body, { status: response.status, headers });
      } catch (error) {
        return Response.json({ error: { code: 'codex_unavailable', message: (error as Error).message } }, { status: 502 });
      }
      });
    },
  });
}
