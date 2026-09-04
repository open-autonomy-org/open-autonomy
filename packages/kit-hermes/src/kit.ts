// The kit engine. A kit is a template directory rendered with the project's identity — its name and its
// platform account — into a complete repository. Two kinds of files come out of it:
//   kit-owned   the agent's home, the reporter, the container stack, the landing workflows: what the kit
//               keeps current. `check` diffs them against a fresh render; `upgrade` rewrites them.
//   seeded      README, roadmap, vision, changelog, AGENTS.md, license, the model config, the publish
//               policy: the project's own files, written once as a courtesy and never touched again.
// `.open-autonomy/kit.json` records which kit, which version and which parameters made the repo: the anchor
// `check` and `upgrade` read, so neither needs to be told anything twice.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export const KIT = { name: 'hermes', version: '2.0.0' } as const;
export const KIT_FILE = '.open-autonomy/kit.json';
const TEMPLATE = resolve(import.meta.dir, '..', 'template');

export interface KitParams { project: string; account: string }
export interface KitRecord { kit: string; version: string; params: KitParams; divergences: string[] }

// What the kit keeps current. Everything else in the template is seeded once.
const OWNED = [/^hermes\/(?!config\.yaml$)/, /^\.open-autonomy\/(reporter\.ts|mint-key\.ts|roadmap\.ts|package\.json|sdk\/)/, /^container\//, /^\.github\/workflows\/(ci|land)\.yml$/];
export const isOwned = (rel: string): boolean => OWNED.some((re) => re.test(rel));

export function validateParams(p: Partial<KitParams>): KitParams {
  if (!p.project || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(p.project)) throw new Error('project: a short name (letters, digits, . _ -)');
  if (!p.account || !/^[^/\s]+\/[^/\s]+$/.test(p.account)) throw new Error('account: owner/repo, the GitHub repository the platform funds');
  return { project: p.project, account: p.account };
}

function walk(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base)); else out.push(relative(base, full));
  }
  return out.sort();
}

// The Open Autonomy SDK is vendored into the generated repository under .open-autonomy/sdk, kit-owned, so
// the reporter and the key tool run from a bare clone with no package to publish or install.
const SDK_SRC = resolve(dirname(Bun.resolveSync('@open-autonomy/sdk/package.json', import.meta.dir)), 'src');
const SDK_FILES = ['client.ts', 'roadmap.ts', 'drivers.ts', 'rails.ts'];

// Every template file, rendered. Placeholders are `__PROJECT__` and `__ACCOUNT__` (and `__ACCOUNT_ENC__`,
// the account as a URL path segment); binary-looking files pass through untouched.
export function render(params: KitParams): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const rel of walk(TEMPLATE)) {
    const raw = readFileSync(join(TEMPLATE, rel));
    const text = raw.toString('utf8');
    const rendered = /[\x00]/.test(text) ? raw : Buffer.from(text.replaceAll('__PROJECT__', params.project).replaceAll('__ACCOUNT_ENC__', encodeURIComponent(params.account)).replaceAll('__ACCOUNT__', params.account));
    out.set(rel, rendered);
  }
  for (const f of SDK_FILES) out.set(`.open-autonomy/sdk/${f}`, readFileSync(join(SDK_SRC, f)));
  out.set(KIT_FILE, Buffer.from(`${JSON.stringify({ kit: KIT.name, version: KIT.version, params, divergences: [] } satisfies KitRecord, null, 2)}\n`));
  return out;
}

export function readKit(dir: string): KitRecord {
  const p = join(dir, KIT_FILE);
  if (!existsSync(p)) throw new Error(`${p} is missing: not a repository this kit made (create or adopt it first)`);
  const rec = JSON.parse(readFileSync(p, 'utf8')) as KitRecord;
  if (rec.kit !== KIT.name) throw new Error(`${p} names kit ${rec.kit}, not ${KIT.name}`);
  return { ...rec, params: validateParams(rec.params), divergences: Array.isArray(rec.divergences) ? rec.divergences : [] };
}

export interface Outcome { written: string[]; skipped: string[]; drift: string[] }

// create: every file, into an empty or new directory.
export function create(dir: string, params: KitParams): Outcome {
  if (existsSync(dir) && readdirSync(dir).filter((n) => n !== '.git').length) throw new Error(`${dir} is not empty: use adopt for an existing repository`);
  return write(dir, render(params), () => true);
}

// adopt: into an existing repository, writing only what is missing. The project's own files stay.
export function adopt(dir: string, params: KitParams): Outcome {
  if (!existsSync(dir)) throw new Error(`${dir} does not exist`);
  return write(dir, render(params), (rel) => !existsSync(join(dir, rel)));
}

// check: the kit-owned files against a fresh render of the recorded parameters. A file the project has
// deliberately taken over is named in kit.json's `divergences` and is left out.
export function check(dir: string): Outcome {
  const rec = readKit(dir);
  const rendered = render(rec.params);
  const drift: string[] = [];
  for (const [rel, want] of rendered) {
    if (!isOwned(rel) || rec.divergences.includes(rel)) continue;
    const at = join(dir, rel);
    const have = existsSync(at) ? readFileSync(at) : null;
    if (!have || Buffer.compare(have, want) !== 0) drift.push(`${rel}: ${have ? 'differs from' : 'missing; in'} the kit`);
  }
  return { written: [], skipped: [], drift };
}

// upgrade: check, then rewrite the drifted kit-owned files and stamp the kit version.
export function upgrade(dir: string): Outcome {
  const rec = readKit(dir);
  const rendered = render(rec.params);
  const before = check(dir);
  const out = write(dir, rendered, (rel) => (isOwned(rel) && !rec.divergences.includes(rel)) || rel === KIT_FILE);
  // The record keeps the project's divergences; only the version moves.
  writeFileSync(join(dir, KIT_FILE), `${JSON.stringify({ ...rec, version: KIT.version } satisfies KitRecord, null, 2)}\n`);
  return { ...out, drift: before.drift };
}

function write(dir: string, files: Map<string, Buffer>, should: (rel: string) => boolean): Outcome {
  const written: string[] = [];
  const skipped: string[] = [];
  for (const [rel, content] of files) {
    if (!should(rel)) { skipped.push(rel); continue; }
    const at = join(dir, rel);
    if (existsSync(at) && Buffer.compare(readFileSync(at), content) === 0) { skipped.push(rel); continue; }
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, content, { mode: rel.endsWith('.sh') ? 0o755 : 0o644 });
    written.push(rel);
  }
  return { written, skipped, drift: [] };
}

export const templateFiles = (): string[] => walk(TEMPLATE);
