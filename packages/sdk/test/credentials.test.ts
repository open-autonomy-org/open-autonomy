// Credential boundary invariants: private exclusive writes, no repository writes, no cross-origin
// handoff, and no secret in receipts or error messages. No live provider credential is used.
import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureCredential, checkCredentialDirectory, receiveCredential } from '../src/credentials.ts';
const roots: string[] = [];
const receivers: ReturnType<typeof receiveCredential>[] = [];
const root = () => { const dir = mkdtempSync(join(tmpdir(), 'oa-credential-test-')); roots.push(dir); return dir; };
const receive = (file: string, repo?: string) => { const receiver = receiveCredential(file, repo); receivers.push(receiver); return receiver; };
afterEach(() => { for (const receiver of receivers.splice(0)) receiver.close(); for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test('credential is private and exclusive, while browser response and receipt contain no secret', async () => {
  const file = join(root(), 'token');
  const receiver = receive(file);
  const secret = 'synthetic-credential-for-test';
  const response = await fetch(receiver.url, { method: 'POST', headers: { origin: receiver.url }, body: new URLSearchParams({ state: receiver.state, credential: secret }) });
  expect(response.status).toBe(200);
  expect(await response.text()).not.toContain(secret);
  const receipt = await receiver.done;
  expect(JSON.stringify(receipt)).not.toContain(secret);
  expect(readFileSync(file, 'utf8')).toBe(secret);
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(() => receiveCredential(file)).toThrow('already exists');
  const replay = await fetch(receiver.url, { method: 'POST', headers: { origin: receiver.url }, body: new URLSearchParams({ state: receiver.state, credential: 'replacement' }) });
  expect(replay.status).toBe(409);
  expect(readFileSync(file, 'utf8')).toBe(secret);
});

test('wrong origin and state cannot save a credential or consume the receiver', async () => {
  const file = join(root(), 'token');
  const receiver = receive(file);
  for (const [origin, state] of [['https://unrelated.example', receiver.state], [receiver.url, 'wrong']]) {
    const response = await fetch(receiver.url, { method: 'POST', headers: { origin }, body: new URLSearchParams({ state, credential: 'synthetic' }) });
    expect(response.status).toBe(403);
    expect(existsSync(file)).toBe(false);
  }
  const page = await fetch(receiver.url);
  expect(page.headers.get('cache-control')).toBe('no-store');
  expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
});

test('repository destinations and symlinks to them are refused before writing', () => {
  const dir = root(); const repo = join(dir, 'repo'); mkdirSync(repo);
  expect(spawnSync('git', ['init', '-q', repo]).status).toBe(0);
  const alias = join(dir, 'alias'); symlinkSync(repo, alias);
  for (const at of [repo, alias]) expect(() => receiveCredential(join(at, 'new-directory', 'token'))).toThrow('inside a repository');
  expect(existsSync(join(repo, 'new-directory'))).toBe(false);
});

test('credential directory validation permits existing storage but rejects Git metadata and bare repositories', () => {
  const dir = root(); const protectedDir = join(dir, 'protected'); mkdirSync(protectedDir);
  const alias = join(dir, 'alias'); symlinkSync(protectedDir, alias);
  expect(checkCredentialDirectory(protectedDir)).toBe(realpathSync(protectedDir));
  expect(checkCredentialDirectory(join(alias, 'new'))).toBe(join(realpathSync(protectedDir), 'new'));
  const repo = join(dir, 'repo'); const bare = join(dir, 'bare');
  expect(spawnSync('git', ['init', '-q', repo]).status).toBe(0);
  expect(spawnSync('git', ['init', '-q', '--bare', bare]).status).toBe(0);
  for (const at of [repo, join(repo, '.git'), bare]) expect(() => checkCredentialDirectory(join(at, 'credentials'))).toThrow('inside a repository');
  expect(() => checkCredentialDirectory('relative')).toThrow('absolute path');
});

test('GitHub handoff rejects callbacks without the receiver state before exchanging any code', async () => {
  const file = join(root(), 'app.json'); const receiver = receive(file, 'example/project');
  const response = await fetch(`${receiver.callback}?code=synthetic&state=wrong`);
  expect(response.status).toBe(403);
  expect(existsSync(file)).toBe(false);
});

test('a receiver cannot overwrite an existing or dangling symlink destination', () => {
  const dir = root();
  const target = join(dir, 'existing');
  writeFileSync(target, 'synthetic-original');
  for (const [name, destination] of [['linked', target], ['dangling', join(dir, 'missing')]]) {
    const link = join(dir, name);
    symlinkSync(destination, link);
    expect(() => receiveCredential(link)).toThrow('already exists');
  }
  expect(readFileSync(target, 'utf8')).toBe('synthetic-original');
  expect(existsSync(join(dir, 'missing'))).toBe(false);
});

test('browser capture transfers only one visible field from the expected page and returns no page data', async () => {
  const secret = 'synthetic-displayed-token';
  const expectedPage = 'https://provider.example/app/123/token';
  let currentPage = expectedPage;
  let value = secret;
  let width = 100;
  let type = 'password';
  let childCount = 0;
  let tag = 'INPUT';
  let selectorCount = 1;
  let receivedBody = '';
  const controller = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(request) {
    receivedBody = await request.text();
    const { code, holder } = JSON.parse(receivedBody);
    expect(holder).toBe('setup');
    const element = {
      ownerDocument: { defaultView: { location: { href: currentPage }, getComputedStyle: () => ({ visibility: 'visible', display: 'block' }) } },
      getBoundingClientRect: () => ({ width, height: 20 }), tagName: tag, type, value, textContent: value, children: { length: childCount },
    };
    const page = { locator: (selector: string) => {
      expect(selector).toBe('#credential');
      return { evaluate: (fn: (element: unknown, options: unknown) => unknown, options: unknown, action: { timeout: number }) => {
        expect(action.timeout).toBe(1000);
        if (selectorCount !== 1) throw new Error(`strict locator error with page content: ${secret}`);
        return fn(element, options);
      } };
    } };
    const result = await new Function('page', `return (async () => { ${code} })()`)(page);
    expect(JSON.stringify(result)).not.toContain(secret);
    // Even noisy controller diagnostics must stay out of the public receipt/errors.
    return Response.json({ ok: true, result, logs: [{ text: secret }] });
  } });
  const dir = root();
  const capture = (name: string, field: 'value' | 'text' = 'value') => captureCredential({ out: join(dir, name), browser: controller.url.origin, holder: 'setup', page: expectedPage, selector: '#credential', field });
  try {
    const receipt = await capture('token');
    expect(receipt).toEqual({ saved: join(dir, 'token') });
    expect(receivedBody).not.toContain(secret);
    expect(readFileSync(receipt.saved, 'utf8')).toBe(secret);
    expect(statSync(receipt.saved).mode & 0o777).toBe(0o600);
    await expect(capture('token')).rejects.toThrow('already exists');
    tag = 'CODE';
    expect(await capture('text-token', 'text')).toEqual({ saved: join(dir, 'text-token') });
    for (const scenario of ['wrong-page', 'hidden', 'hidden-input', 'masked', 'multiple', 'whole-page']) {
      currentPage = scenario === 'wrong-page' ? 'https://unrelated.example/' : expectedPage;
      width = scenario === 'hidden' ? 0 : 100;
      type = scenario === 'hidden-input' ? 'hidden' : 'password';
      value = scenario === 'masked' ? '••••••••' : secret;
      selectorCount = scenario === 'multiple' ? 2 : 1;
      tag = scenario === 'whole-page' ? 'BODY' : 'INPUT';
      childCount = scenario === 'whole-page' ? 3 : 0;
      let message = '';
      try { await capture(scenario, scenario === 'whole-page' ? 'text' : 'value'); }
      catch (error) { message = (error as Error).message; }
      expect(message).toContain('No save was confirmed');
      expect(message).not.toContain(secret);
      expect(existsSync(join(dir, scenario))).toBe(false);
    }
  } finally { controller.stop(true); }
});

test('browser capture refuses remote controllers and unsafe source URLs before creating storage', async () => {
  const out = join(root(), 'not-created', 'token');
  const options = { out, browser: 'http://127.0.0.1:1234', holder: 'setup', page: 'https://provider.example/app/token', selector: '#token', field: 'value' as const };
  for (const browser of ['https://remote.example', 'http://127.0.0.1:1234/eval', 'http://user:password@localhost:1234']) {
    await expect(captureCredential({ ...options, browser })).rejects.toThrow('loopback HTTP origin');
  }
  for (const page of ['http://remote.example/token', 'https://provider.example/token?secret=hidden', 'https://provider.example/token#secret']) {
    await expect(captureCredential({ ...options, page })).rejects.toThrow('without credentials');
  }
  expect(existsSync(join(out, '..'))).toBe(false);
});
