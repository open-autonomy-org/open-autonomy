#!/usr/bin/env bun
// Owner-side credential handoff, independent of any checkout or agent runtime. The browser agent
// supplies provider configuration; this process alone receives, exchanges and saves the secret.
import { spawnSync } from 'node:child_process';
import { createPrivateKey, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';

// Shared by secret producers. Resolve existing symlink ancestors before checking the Git boundary;
// return the canonical directory so setup can also exclude a project not yet initialized with Git.
export function checkCredentialDirectory(directory: string): string {
  if (!isAbsolute(directory)) throw new Error('Credential destination must be an absolute path outside a repository.');
  let parent = directory;
  while (!existsSync(parent)) parent = dirname(parent);
  const git = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: realpathSync(parent), encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
  if (git.error) throw new Error('Git must be available to verify that the credential destination is outside a repository.');
  if (git.status === 0) throw new Error('Credentials cannot be saved inside a repository. Choose the runtime host’s protected credential directory.');
  if (!git.stderr.includes('not a git repository')) throw new Error('Cannot verify the credential destination’s Git boundary. Resolve the Git error before receiving a secret.');
  return join(realpathSync(parent), relative(parent, directory));
}

function credentialPath(out: string): void {
  if (!isAbsolute(out)) throw new Error('Credential destination must be an absolute path outside a repository.');
  checkCredentialDirectory(dirname(out));
  try { lstatSync(out); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw new Error('Cannot inspect the credential destination.'); }
  throw new Error('Credential destination already exists; no credential was replaced.');
}

interface AppCredential { app_id: number; private_key: string; repository: string; slug?: string }
interface Receipt { saved: string; app_id?: number; slug?: string }
const json = (body: unknown): string => `${JSON.stringify(body, null, 2)}\n`;
const repositoryName = (name: string): void => { if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(name)) throw new Error('GitHub repository must be owner/name.'); };

export function receiveCredential(out: string, githubRepository?: string) {
  credentialPath(out);
  if (githubRepository) repositoryName(githubRepository);
  mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
  const state = randomBytes(24).toString('hex');
  const destination = out.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  let resolveDone!: (receipt: Receipt) => void;
  let rejectDone!: (error: Error) => void;
  const done = new Promise<Receipt>((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  let consumed = false;
  const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'same-origin', 'content-security-policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" };
  const reply = (text: string, status = 200) => new Response(text, { status, headers });
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0, maxRequestBodySize: 1024 * 1024,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.headers.get('host') !== server.url.host) return reply('Unexpected host.', 403);
      if (consumed) return reply('This receiver has already accepted a handoff.', 409);
      if (!githubRepository && req.method === 'GET' && url.pathname === '/') return reply(`<!doctype html><html><title>Save a credential</title><h1>Save a credential</h1><p>Paste the credential directly here. It is saved on this host and never returned to the setup agent.</p><p>Destination: <code>${destination}</code></p><form method="post" action="/"><input type="hidden" name="state" value="${state}"><label>Credential <input name="credential" type="password" autocomplete="off" required></label><button>Save credential</button></form></html>`);
      let value: string;
      let receipt: Receipt = { saved: out };
      if (githubRepository) {
        if (req.method !== 'GET' || url.pathname !== '/callback') return reply('Use this receiver as the GitHub manifest redirect URL.', 404);
        if (url.searchParams.get('state') !== state || !url.searchParams.get('code')) return reply('Invalid callback.', 403);
        consumed = true;
        try {
          const code = encodeURIComponent(url.searchParams.get('code')!);
          const res = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, { method: 'POST', signal: AbortSignal.timeout(30_000), headers: { accept: 'application/vnd.github+json', 'user-agent': 'open-autonomy-credentials' } });
          if (!res.ok) throw new Error('exchange failed');
          const raw = await res.json() as { id: number; pem: string; slug: string };
          if (!Number.isSafeInteger(raw.id) || raw.id <= 0 || typeof raw.pem !== 'string' || typeof raw.slug !== 'string' || !/^[a-z0-9-]+$/i.test(raw.slug)) throw new Error('invalid response');
          createPrivateKey(raw.pem);
          value = json({ app_id: raw.id, private_key: raw.pem, slug: raw.slug, repository: githubRepository } satisfies AppCredential);
          receipt = { ...receipt, app_id: raw.id, slug: raw.slug };
        } catch {
          rejectDone(new Error('GitHub credential exchange failed. Inspect the existing app before starting another creation flow.'));
          return reply('Credential exchange failed. See the setup terminal.', 502);
        }
      } else {
        if (req.method !== 'POST' || url.pathname !== '/') return reply('Not found.', 404);
        if (req.headers.get('origin') !== server.url.origin || !req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return reply('Submit from this receiver’s own page.', 403);
        const form = new URLSearchParams(await req.text());
        if (form.get('state') !== state) return reply('Invalid handoff.', 403);
        value = form.get('credential') ?? '';
        if (!value.trim()) return reply('A credential is required.', 400);
        consumed = true;
      }
      try {
        // Exclusive creation also catches another receiver finishing while this one was waiting.
        credentialPath(out);
        writeFileSync(out, value, { flag: 'wx', mode: 0o600 });
        resolveDone(receipt);
        return reply('<!doctype html><title>Credential saved</title><p>Credential saved. You can close this tab.</p>');
      } catch {
        rejectDone(new Error('Could not save the credential exclusively at the selected destination. No existing credential was replaced.'));
        return reply('Credential could not be saved. See the setup terminal.', 500);
      }
    },
  });
  const timeout = setTimeout(() => rejectDone(new Error('Credential handoff timed out. No new handoff was completed.')), 10 * 60_000);
  return { url: server.url.origin, callback: `${server.url.origin}/callback`, state, done, close: () => { clearTimeout(timeout); server.stop(true); } };
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1]; };
  try {
    const out = flag('--out');
    if (!out || argv[0] !== 'receive') throw new Error('Usage: open-autonomy-credentials receive --out /protected/file [--github-app owner/repo]');
    const receiver = receiveCredential(out, flag('--github-app'));
    console.log(json(flag('--github-app') ? { callback: receiver.callback, state: receiver.state } : { url: receiver.url }));
    try { console.log(json(await receiver.done)); }
    finally { await Bun.sleep(200); receiver.close(); }
  } catch (error) { console.error(`credentials: ${(error as Error).message}`); process.exitCode = 1; }
}
