// The kit engine. A kit is a template directory rendered with the project's identity — its name and its
// platform account — into a complete repository. Two kinds of files come out of it:
//   kit-owned   the agent's home, the reporter, the container stack, the landing workflows: what the kit
//               keeps current. `check` diffs them against a fresh render; `upgrade` rewrites them.
//   seeded      README, the board's seed, CONTRIBUTING.md, the constitution, changelog, AGENTS.md, license, the model config, the publish
//               policy: the project's own files, written once as a courtesy and never touched again.
// `.open-autonomy/kit.json` records which kit, which version and which parameters made the repo: the anchor
// `check` and `upgrade` read, so neither needs to be told anything twice.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// The kit's version is the package's: one number, in package.json, that a release bumps.
export const KIT = { name: 'hermes', version: (JSON.parse(readFileSync(resolve(import.meta.dir, '..', 'package.json'), 'utf8')) as { version: string }).version } as const;
export const KIT_FILE = '.open-autonomy/kit.json';
// The kit is a lineage (docs/decisions/0006): an abstract base every subject runs, and one skew laid over it, whole
// files, a later key winning. A skew is what its PM does and to whom; a PM knows only its own skew.
export const SKEWS = ['self-build', 'manage-project', 'manage-organization'] as const;
export type Skew = (typeof SKEWS)[number];
const BASE = resolve(import.meta.dir, '..', 'base');
const SKEW_DIR = (skew: Skew): string => resolve(import.meta.dir, '..', 'skews', skew);

export interface KitParams { project: string; account: string }
export interface KitRecord { kit: string; skew: Skew; version: string; params: KitParams; divergences: string[] }
export function validateSkew(s: unknown): Skew {
  if (typeof s !== 'string' || !(SKEWS as readonly string[]).includes(s)) throw new Error(`skew: one of ${SKEWS.join(', ')}`);
  return s as Skew;
}

// What the kit keeps current. Everything else in the template is seeded once.
// A project's own, seeded once: its config (the treasurer's too: the model is the project's choice for both profiles),
// its board seed, its schedule, and any skill of its own outside hermes/skills/open-autonomy/ (the kit's shared skills).
const OWNED = [/^hermes\/(?!config\.yaml$|kanban\.seed\.json$|cron\/jobs\.seed\.json$|cron\/webhooks\.seed\.json$|profiles\/treasurer\/config\.yaml$|skills\/(?!open-autonomy\/))/, /^\.open-autonomy\/(reporter\.ts|mint-key\.ts|start\.ts|host\.ts|container(?:-home|-process)?\.ts|community\.ts|maintain\.ts|scrum\.ts|valve\.ts|credentials\.ts|codex-auth\.ts|reporting\.ts|SETUP\.md|PRODUCTION\.md|package\.json|sdk\/|rehearsal\/)/, /^container\//, /^\.github\/workflows\/(ci|land)\.yml$/];
export const isOwned = (rel: string): boolean => OWNED.some((re) => re.test(rel));

export function validateParams(p: Partial<KitParams>): KitParams {
  if (!p.project || p.project.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.project)) throw new Error('project: use a lowercase runtime slug of at most 64 characters (letters and digits separated by hyphens), such as audit-desk; put the display name in branding/brand.json');
  if (!p.account || !/^[\w.-]+\/[\w.-]+$/.test(p.account)) throw new Error('account: owner/repo, the GitHub repository the platform funds');
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

// The Open Autonomy SDK (the interface: the client, the timeline codec, the drivers, the roster model) is vendored
// into the generated repository under .open-autonomy/sdk, kit-owned, so the reporter and the key tool run from a
// bare clone with no package to publish or install. The host tools beside it (the valve, the credential handoff,
// the Codex connection, the Supercode adapter) are the kit's own files.
// A generated project reads the platform through the SDK this kit vendors into it. The published kit pins that
// dependency, and a stale pin ships a client that silently cannot do what the project needs: 3.1.0 is the first
// that sends the project's key on reads, without which a project whose page is not open reads its own sessions as
// 'not_open'. Refuse to vendor below the floor rather than write a client that fails months later on the host.
const SDK_MIN = '3.1.0';
const SDK_PKG = Bun.resolveSync('@open-autonomy/sdk/package.json', import.meta.dir);
const SDK_SRC = resolve(dirname(SDK_PKG), 'src');
const order = (v: string): number[] => v.split('.').map(Number);
const below = (a: string, b: string): boolean => { const [x, y] = [order(a), order(b)]; for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0); return false; };
const sdkVersion = JSON.parse(readFileSync(SDK_PKG, 'utf8')).version as string;
if (below(sdkVersion, SDK_MIN)) throw new Error(`This kit vendors @open-autonomy/sdk ${sdkVersion}; it needs ${SDK_MIN} or newer. The kit's published dependency is stale: reinstall the current create-open-autonomy, or publish the kit against the current SDK.`);
const SDK_FILES = ['client.ts', 'roadmap.ts', 'drivers.ts', 'team.ts'];

// Every base file, then every file of the skew over it, rendered. Placeholders are `__PROJECT__` and `__ACCOUNT__`
// (and `__ACCOUNT_ENC__`, the account as a URL path segment); binary-looking files pass through untouched. A
// substitution is identical in every render with the same parameters, so it never conflicts in an upgrade.
export function render(params: KitParams, skew: Skew): Map<string, Buffer> {
  validateParams(params); validateSkew(skew);
  const out = new Map<string, Buffer>();
  for (const dir of [BASE, SKEW_DIR(skew)]) for (const rel of walk(dir)) {
    const raw = readFileSync(join(dir, rel));
    const text = raw.toString('utf8');
    // The template ships its gitignore as `_gitignore`: a `.gitignore` never survives npm's pack rules.
    const out_rel = rel === '_gitignore' ? '.gitignore' : rel;
    const rendered = /[\x00]/.test(text) ? raw : Buffer.from(text.replaceAll('__PROJECT__', params.project).replaceAll('__ACCOUNT_ENC__', encodeURIComponent(params.account)).replaceAll('__ACCOUNT__', params.account));
    out.set(out_rel, rendered);
  }
  for (const f of SDK_FILES) out.set(`.open-autonomy/sdk/${f}`, readFileSync(join(SDK_SRC, f)));
  out.set(KIT_FILE, Buffer.from(`${JSON.stringify({ kit: KIT.name, skew, version: KIT.version, params, divergences: [] } satisfies KitRecord, null, 2)}\n`));
  return out;
}

export function readKit(dir: string): KitRecord {
  const p = join(dir, KIT_FILE);
  if (!existsSync(p)) throw new Error(`${p} is missing: not a repository this kit made (create or adopt it first)`);
  const rec = JSON.parse(readFileSync(p, 'utf8')) as KitRecord;
  if (rec.kit !== KIT.name) throw new Error(`${p} names kit ${rec.kit}, not ${KIT.name}`);
  // A record older than the skews was made by the one brain there was: it is self-build.
  return { ...rec, skew: validateSkew(rec.skew ?? 'self-build'), params: validateParams(rec.params), divergences: Array.isArray(rec.divergences) ? rec.divergences : [] };
}

export interface Outcome { written: string[]; skipped: string[]; drift: string[] }

// create: every file, into an empty or new directory.
export function create(dir: string, params: KitParams, skew: Skew = 'self-build'): Outcome {
  if (existsSync(dir) && readdirSync(dir).filter((n) => n !== '.git').length) throw new Error(`${dir} is not empty: use adopt for an existing repository`);
  return write(dir, render(params, skew), () => true);
}

// adopt: into an existing repository, writing only what is missing. The project's own files stay.
export function adopt(dir: string, params: KitParams, skew: Skew = 'self-build'): Outcome {
  if (!existsSync(dir)) throw new Error(`${dir} does not exist`);
  return write(dir, render(params, skew), (rel) => !existsSync(join(dir, rel)));
}

// check: the kit-owned files against a fresh render of the recorded parameters. A file the project has
// deliberately taken over is named in kit.json's `divergences` and is left out.
export function check(dir: string): Outcome {
  const rec = readKit(dir);
  const rendered = render(rec.params, rec.skew);
  const drift: string[] = [];
  for (const [rel, want] of rendered) {
    if (!isOwned(rel) || rec.divergences.includes(rel)) continue;
    const at = join(dir, rel);
    const have = existsSync(at) ? readFileSync(at) : null;
    if (!have || Buffer.compare(have, want) !== 0) drift.push(`${rel}: ${have ? 'differs from' : 'missing; in'} the kit`);
  }
  for (const rel of retired(dir, rendered, rec)) drift.push(`${rel}: retired from the kit`);
  return { written: [], skipped: [], drift };
}

// Kit-owned files the repository has that the kit no longer renders: what an earlier kit made and this one
// retired. `upgrade` removes them; a project that keeps one names it in `divergences`. Only the families the
// kit writes are looked at — never the agent's runtime state beside them (its database, sessions, logs, .env).
const RETIRABLE = [/^\.open-autonomy\/rehearsal\/(README\.md|(?:actions|lib|platform|run|seed|stack|story)\.ts)$/, /^hermes\/(skills\/open-autonomy|hooks|scripts|plugins)\//, /^\.open-autonomy\/([a-z-]+\.ts|sdk\/)/, /^container\//, /^\.github\/workflows\/(ci|land)\.yml$/];
function retired(dir: string, rendered: Map<string, Buffer>, rec: KitRecord): string[] {
  const out: string[] = [];
  for (const root of ['hermes/skills', 'hermes/hooks', 'hermes/scripts', 'hermes/plugins', '.open-autonomy', 'container', '.github/workflows']) {
    const at = join(dir, root);
    if (!existsSync(at)) continue;
    for (const rel of walk(at).map((f) => `${root}/${f}`)) if (RETIRABLE.some((re) => re.test(rel)) && isOwned(rel) && !rendered.has(rel) && !rec.divergences.includes(rel)) out.push(rel);
  }
  return out;
}

// upgrade: check, then rewrite the drifted kit-owned files and stamp the kit version.
export function upgrade(dir: string): Outcome {
  const rec = readKit(dir);
  const rendered = render(rec.params, rec.skew);
  const before = check(dir);
  // Migrate only missing planning notes, using this project's seed rather than
  // the template's hello task. The live board is reconciled by PM, never by upgrade.
  if (!existsSync(join(dir, 'ROADMAP.md'))) {
    const seedFile = join(dir, 'hermes/kanban.seed.json');
    if (existsSync(seedFile)) {
      const seed = JSON.parse(readFileSync(seedFile, 'utf8')) as { tasks: Array<{ key: string; title: string; acceptance?: string[]; held?: string }> };
      const notes = seed.tasks.map((t) => `## ${t.key}: ${t.title}\n\nStatus: historical intention; reconcile with the live board and landed work.\nDispatch: hold\n\nSource: [committed seed](hermes/kanban.seed.json), key \`${t.key}\`. This is not evidence of current priority or completion.\n${t.held ? `\nExisting hold: ${t.held}\n` : ''}\nCompletion:\n${(t.acceptance ?? []).map((a) => `- ${a}`).join('\n')}\n`).join('\n');
      rendered.set('ROADMAP.md', Buffer.from(`# ${rec.params.project} roadmap\n\nNotable intentions maintained by the Hermes PM scrum. Imported historical intentions await reconciliation; existing tasks, owners and holds remain intact.\n\n${notes}\nPM must reconcile this import against landed history and the live board before dispatch. Distill notable landed changes into CHANGELOG.md; retain outstanding release and verification outcomes here. Routine activity stays in source history.\n`));
    }
  }
  const out = write(dir, rendered, (rel) => (isOwned(rel) && !rec.divergences.includes(rel)) || rel === KIT_FILE || (rel === 'ROADMAP.md' && !existsSync(join(dir, rel))));
  // Repair the exact empty-list spelling emitted by older kits. Other project
  // policy, including malformed custom values, remains the owner's to resolve.
  const policyFile = join(dir, '.open-autonomy/config.yaml');
  if (existsSync(policyFile)) {
    const policy = readFileSync(policyFile, 'utf8');
    const repaired = policy.replace(/^  private:          # session ids or job names that never publish, whatever their kind\n    - \[\]\n(?=\s*\n)/m, '  private: []       # session IDs, job IDs or job names that never publish\n');
    if (repaired !== policy) { writeFileSync(policyFile, repaired); out.written.push('.open-autonomy/config.yaml'); }
  }
  const gone = retired(dir, rendered, rec);
  for (const rel of gone) { rmSync(join(dir, rel), { force: true }); out.written.push(`${rel} (retired)`); }
  // A directory the retirement emptied goes too.
  for (const rel of [...new Set(gone.map((r) => dirname(r)))]) { try { if (!readdirSync(join(dir, rel)).length) rmSync(join(dir, rel), { recursive: true }); } catch { /* gone */ } }
  // The record keeps the project's divergences and its skew; only the version moves (a record older than the
  // skews gains the one it was always on).
  writeFileSync(join(dir, KIT_FILE), `${JSON.stringify({ kit: rec.kit, skew: rec.skew, version: KIT.version, params: rec.params, divergences: rec.divergences } satisfies KitRecord, null, 2)}\n`);
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
