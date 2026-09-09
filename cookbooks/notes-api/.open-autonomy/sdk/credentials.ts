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

interface BrowserCapture {
  out: string;
  browser: string;
  holder: string;
  page: string;
  selector: string;
  field: 'value' | 'text' | 'direct-text';
}

// This fixed operation runs inside the existing normal-browser controller. The selected value
// goes directly to the receiver, never into eval's result, an exception, a log, or the clipboard.
const captureOperation = `
const { source, selector, field, receiver, state } = CAPTURE_OPTIONS;
try {
  const credential = await page.locator(selector).evaluate((element, options) => {
    const view = element.ownerDocument.defaultView;
    if (!view || view.location.href !== options.source) return { error: 'page_changed' };
    const style = view.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || style.visibility !== 'visible' || style.display === 'none') return { error: 'field_not_visible' };
    const tag = element.tagName.toLowerCase();
    let value;
    if (options.field === 'value') {
      if (!['input', 'textarea'].includes(tag) || element.type === 'hidden') return { error: 'field_not_input' };
      value = element.value;
    } else if (options.field === 'direct-text') {
      if (['html', 'body', 'form', 'input', 'textarea'].includes(tag)) return { error: 'field_not_direct_text' };
      const nodes = [...element.childNodes].filter(node => node.nodeType === 3 && node.textContent.trim());
      if (nodes.length !== 1) return { error: 'field_not_direct_text' };
      value = nodes[0].textContent;
    } else {
      if (['html', 'body', 'form', 'input', 'textarea'].includes(tag) || element.children.length) return { error: 'field_not_leaf_text' };
      value = element.textContent;
    }
    if (typeof value !== 'string' || !value.trim() || value.length > 65536 || /^[*•●·\\s]+$/.test(value)) return { error: 'field_empty_or_masked' };
    return { value };
  }, { source, field }, { timeout: 1000 });
  if (credential.error) return { captured: false, reason: credential.error };
  const response = await fetch(receiver, {
    method: 'POST', headers: { origin: receiver },
    body: new URLSearchParams({ state, credential: credential.value }),
    signal: AbortSignal.timeout(2000),
  });
  return { captured: response.ok, reason: response.ok ? 'saved' : 'receiver_refused' };
} catch {
  return { captured: false, reason: 'capture_failed' };
}
`;

export async function captureCredential(options: BrowserCapture): Promise<Receipt> {
  let browser: URL; let source: URL;
  try { browser = new URL(options.browser); source = new URL(options.page); }
  catch { throw new Error('Capture needs an existing loopback browser-controller URL and the exact credential page URL.'); }
  const loopback = (url: URL) => ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if (browser.protocol !== 'http:' || !loopback(browser) || browser.username || browser.password || browser.pathname !== '/' || browser.search || browser.hash) {
    throw new Error('Use the existing normal-browser controller’s loopback HTTP origin, not a browser debugging endpoint.');
  }
  if ((source.protocol !== 'https:' && !(source.protocol === 'http:' && loopback(source))) || source.username || source.password || source.search || source.hash) {
    throw new Error('Use a credential page on HTTPS (or local HTTP), without credentials, query parameters or fragments in its URL.');
  }
  if (!options.holder?.trim() || !options.selector?.trim() || !['value', 'text', 'direct-text'].includes(options.field)) {
    throw new Error('Capture needs the existing browser holder, one exact field selector, and --field value, text, or direct-text.');
  }
  const receiver = receiveCredential(options.out);
  let receipt: Receipt | undefined;
  void receiver.done.then(value => { receipt = value; }, () => {});
  try {
    const code = captureOperation.replace('CAPTURE_OPTIONS', () => JSON.stringify({ source: source.href, selector: options.selector, field: options.field, receiver: receiver.url, state: receiver.state }));
    let result: { ok?: boolean; result?: { captured?: boolean; reason?: string } };
    try {
      const response = await fetch(new URL('/eval', browser), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ holder: options.holder, code, timeout_ms: 4000 }),
        signal: AbortSignal.timeout(6000), redirect: 'error',
      });
      if (!response.ok) throw new Error();
      // Controller diagnostics/logs can contain page content. Never forward them to the agent.
      result = await response.json() as typeof result;
    } catch {
      if (receipt) return receipt;
      throw new Error('Browser capture could not complete. Check the existing controller and destination before retrying; do not regenerate the credential.');
    }
    if (receipt) return receipt;
    const reasons: Record<string, string> = {
      page_changed: 'The bound tab is no longer on the expected page.',
      field_not_visible: 'The selected field is not visible.',
      field_not_input: 'Value capture requires an input or textarea.',
      field_not_direct_text: 'Direct-text capture requires exactly one nonempty direct text node in the selected credential element.',
      field_not_leaf_text: 'Text capture requires a single text element with no child elements.',
      field_empty_or_masked: 'The selected field is empty, masked, or too large.',
      receiver_refused: 'Protected storage refused the handoff.',
    };
    const reason = result.ok && result.result?.reason;
    throw new Error(`${reason && Object.hasOwn(reasons, reason) ? reasons[reason] : 'The browser could not capture exactly one field in the bound tab.'} No save was confirmed. Inspect the existing page and destination before retrying; do not regenerate the credential.`);
  } finally { receiver.close(); }
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1]; };
  try {
    const out = flag('--out');
    if (out && argv[0] === 'capture' && !flag('--github-app')) {
      console.log(json(await captureCredential({ out, browser: flag('--browser') ?? '', holder: flag('--holder') ?? '', page: flag('--page') ?? '', selector: flag('--selector') ?? '', field: flag('--field') as BrowserCapture['field'] })));
      process.exit(0);
    }
    if (!out || argv[0] !== 'receive') throw new Error('Usage: open-autonomy-credentials receive --out /protected/file [--github-app owner/repo], or capture --out /protected/file --browser http://127.0.0.1:<controller-port> --holder <session> --page <exact-url> --selector <field> --field value|text|direct-text');
    const receiver = receiveCredential(out, flag('--github-app'));
    console.log(json(flag('--github-app') ? { callback: receiver.callback, state: receiver.state } : { url: receiver.url }));
    try { console.log(json(await receiver.done)); }
    finally { await Bun.sleep(200); receiver.close(); }
  } catch (error) { console.error(`credentials: ${(error as Error).message}`); process.exitCode = 1; }
}
