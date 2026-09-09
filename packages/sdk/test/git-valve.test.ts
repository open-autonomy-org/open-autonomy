import { expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Unit protocol fixtures; the World separately proves real Git and twin state.
test('Git stays repository-scoped, keeps credentials on the host and replays a binary POST after refresh', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oa-git-valve-'));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  let minted = 0;
  const bodies: Uint8Array[] = [], credentials: string[] = [];
  const upstream = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
    if (new URL(req.url).pathname === '/app/installations/1/access_tokens') {
      expect(await req.json()).toEqual({ repositories: ['project'] });
      return Response.json({ token: `synthetic-${++minted}`, expires_at: '2100-01-01T00:00:00Z', permissions: { contents: 'write' } });
    }
    credentials.push(req.headers.get('authorization') ?? '');
    bodies.push(new Uint8Array(await req.arrayBuffer()));
    return credentials.length === 1 ? new Response('expired', { status: 401 }) : new Response(new Uint8Array([0, 255, 10, 128]));
  } });
  writeFileSync(join(dir, 'app.json'), JSON.stringify({ app_id: 1, installation_id: 1, repository: 'owner/project', private_key: privateKey, api: upstream.url.origin }), { mode: 0o600 });
  const reservation = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
  const port = reservation.port!; reservation.stop(true);
  const proc = Bun.spawn([process.execPath, new URL('../src/valve.ts', import.meta.url).pathname, '--github-app', `${dir}/app.json:${port}`], { stdout: 'ignore', stderr: 'pipe' });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/healthz')).ok) break; } catch {} await Bun.sleep(10); }
    for (const path of ['/owner/other.git/info/refs?service=git-upload-pack', '/owner/project.git/config', '/owner/project.git/info/refs?service=git-receive-pack&extra=1', '/app/installations/1/access_tokens']) {
      expect((await fetch(base + path)).status).toBe(403);
    }
    expect(minted).toBe(0);
    const binary = new Uint8Array([0, 128, 255, 10, 13, 0]);
    const response = await fetch(base + '/owner/project.git/git-receive-pack', { method: 'POST', headers: { authorization: 'Bearer container-placeholder', 'content-type': 'application/x-git-receive-pack-request', 'git-protocol': 'version=2' }, body: binary });
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0, 255, 10, 128]));
    expect(bodies).toEqual([binary, binary]);
    expect(credentials).toEqual([1, 2].map(n => 'Basic ' + Buffer.from(`x-access-token:synthetic-${n}`).toString('base64')));
    expect(minted).toBe(2);
  } finally { proc.kill(); await proc.exited; upstream.stop(true); rmSync(dir, { recursive: true, force: true }); }
});

test('a read-only installation cannot push through the Git valve', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oa-git-readonly-'));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  let gitRequests = 0;
  const upstream = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(req) {
    if (new URL(req.url).pathname.endsWith('/access_tokens')) return Response.json({ token: 'synthetic-read-only', expires_at: '2100-01-01T00:00:00Z', permissions: { contents: 'read' } });
    gitRequests++; return new Response('advertisement');
  } });
  writeFileSync(join(dir, 'app.json'), JSON.stringify({ app_id: 1, installation_id: 1, repository: 'owner/project', private_key: privateKey, api: upstream.url.origin }), { mode: 0o600 });
  const reservation = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
  const port = reservation.port!; reservation.stop(true);
  const proc = Bun.spawn([process.execPath, new URL('../src/valve.ts', import.meta.url).pathname, '--github-app', `${dir}/app.json:${port}`], { stdout: 'ignore', stderr: 'pipe' });
  const base = `http://127.0.0.1:${port}/owner/project.git`;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/healthz`)).ok) break; } catch {} await Bun.sleep(10); }
    expect((await fetch(base + '/info/refs?service=git-upload-pack')).status).toBe(200);
    expect((await fetch(base + '/info/refs?service=git-receive-pack')).status).toBe(403);
    expect((await fetch(base + '/git-receive-pack', { method: 'POST', body: 'pack' })).status).toBe(403);
    expect(gitRequests).toBe(1);
  } finally { proc.kill(); await proc.exited; upstream.stop(true); rmSync(dir, { recursive: true, force: true }); }
});
