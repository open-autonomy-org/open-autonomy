// Credential boundary invariants: private exclusive writes, no repository writes, no cross-origin
// handoff, and no secret in receipts or error messages. No live provider credential is used.
import { afterEach, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { receiveCredential } from '../src/credentials.ts';
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
