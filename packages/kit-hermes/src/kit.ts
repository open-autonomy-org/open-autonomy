// The kit engine. A kit is a template directory rendered with the project's identity — its name and its
// platform account — into a complete repository. Two kinds of files come out of it:
//   kit-owned   the agent's home, the reporter, the container stack, the landing workflows: what the kit
//               keeps current. `check` tells how the project stands against it; `upgrade` merges the kit's
//               change into the project's copy three-way, the recorded version's render as the ancestor.
//   seeded      README, the board's seed, CONTRIBUTING.md, the constitution, changelog, AGENTS.md, license, the publish
//               policy: the project's own files, written once as a courtesy and never touched again. The agent's setup
//               (.open-autonomy/agent.json: its model, settings and jobs) is kit-owned and merged like the rest.
// `.open-autonomy/kit.json` records which kit, which version and which parameters made the repo: the anchor
// `check` and `upgrade` read, so neither needs to be told anything twice.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ancestor } from './ancestor.ts';
import { LEGACY_FILES, legacyAgent } from './migrate.ts';

// The kit's version is the package's: one number, in package.json, that a release bumps.
export const KIT = { name: 'hermes', version: (JSON.parse(readFileSync(resolve(import.meta.dir, '..', 'package.json'), 'utf8')) as { version: string }).version } as const;
export const KIT_FILE = '.open-autonomy/kit.json';
// The kit is a lineage (docs/decisions/0006): an abstract base every subject runs, and one skew laid over it, whole
// files, a later key winning. A skew is what its PM does and to whom; a PM knows only its own skew. A skew may extend
// another: soc2 is self-build with the SOC 2 layer of docs/decisions/0008 laid over it, so its PM is self-build's.
export const SKEWS = ['self-build', 'manage-project', 'manage-organization', 'soc2'] as const;
export type Skew = (typeof SKEWS)[number];
// A child's copy of a parent's or base's file replaces it whole: change the copy whenever the original changes
// (soc2 carries PRODUCTION.md and project-communications with the seams text added).
const PARENT: Partial<Record<Skew, Skew>> = { soc2: 'self-build' };
const lineage = (skew: Skew): Skew[] => [...(PARENT[skew] ? lineage(PARENT[skew]!) : []), skew];
const BASE = resolve(import.meta.dir, '..', 'base');
const SKEW_DIR = (skew: Skew): string => resolve(import.meta.dir, '..', 'skews', skew);

export interface KitParams { project: string; account: string }
export interface KitRecord { kit: string; skew: Skew; version: string; params: KitParams }
export function validateSkew(s: unknown): Skew {
  if (typeof s !== 'string' || !(SKEWS as readonly string[]).includes(s)) throw new Error(`skew: one of ${SKEWS.join(', ')}`);
  return s as Skew;
}

// What the kit keeps current. Everything else in the template is seeded once.
// A project's own, seeded once: its config (the treasurer's too: the model is the project's choice for both profiles),
// its board seed, its schedule, and any skill of its own outside hermes/skills/open-autonomy/ (the kit's shared skills).
// The agent setup (.open-autonomy/agent.json, docs/decisions/0007) is kit-owned: the kit's changes reach it by the
// three-way merge, the project's own edits kept.
const OWNED = [/^hermes\/(?!kanban\.seed\.json$|cron\/webhooks\.seed\.json$|skills\/(?!open-autonomy\/))/, /^\.open-autonomy\/(agent\.json|agent\.ts|reporter\.ts|mint-key\.ts|start\.ts|fleet\.ts|host\.ts|container(?:-home|-process)?\.ts|community\.ts|maintain\.ts|scrum\.ts|valve\.ts|credentials\.ts|codex-auth\.ts|reporting\.ts|SETUP\.md|PRODUCTION\.md|package\.json|sdk\/|rehearsal\/)/, /^container\//, /^\.github\/workflows\/(ci|land|pages)\.yml$/];
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
// 'not_open', 3.2.0 the first with seams.ts (docs/decisions/0008), which the kit vendors and `check` reads, and 3.4.0
// the first with statements.ts (docs/decisions/0012), which the vendored client imports.
// Refuse to vendor below the floor rather than write a client that fails months later on the host.
const SDK_MIN = '3.4.0';
const SDK_PKG = Bun.resolveSync('@open-autonomy/sdk/package.json', import.meta.dir);
const SDK_SRC = resolve(dirname(SDK_PKG), 'src');
const order = (v: string): number[] => v.split('.').map(Number);
const below = (a: string, b: string): boolean => { const [x, y] = [order(a), order(b)]; for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0); return false; };
const sdkVersion = JSON.parse(readFileSync(SDK_PKG, 'utf8')).version as string;
if (below(sdkVersion, SDK_MIN)) throw new Error(`This kit vendors @open-autonomy/sdk ${sdkVersion}; it needs ${SDK_MIN} or newer. The kit's published dependency is stale: reinstall the current create-open-autonomy, or publish the kit against the current SDK.`);
const SDK_FILES = ['client.ts', 'roadmap.ts', 'drivers.ts', 'team.ts', 'seams.ts', 'statements.ts'];

// Every base file, then every file of the skew's lineage over it, rendered. Placeholders are `__PROJECT__`, `__ACCOUNT__`
// (and `__ACCOUNT_ENC__`, the account as a URL path segment, and `__OWNER__`, the account's owner); binary-looking files pass through untouched. A
// substitution is identical in every render with the same parameters, so it never conflicts in an upgrade.
export function render(params: KitParams, skew: Skew): Map<string, Buffer> {
  validateParams(params); validateSkew(skew);
  const out = new Map<string, Buffer>();
  for (const dir of [BASE, ...lineage(skew).map(SKEW_DIR)]) for (const rel of walk(dir)) {
    const raw = readFileSync(join(dir, rel));
    const text = raw.toString('utf8');
    // The template ships its gitignore as `_gitignore`: a `.gitignore` never survives npm's pack rules.
    const out_rel = rel === '_gitignore' ? '.gitignore' : rel;
    const rendered = /[\x00]/.test(text) ? raw : Buffer.from(text.replaceAll('__PROJECT__', params.project).replaceAll('__ACCOUNT_ENC__', encodeURIComponent(params.account)).replaceAll('__ACCOUNT__', params.account).replaceAll('__OWNER__', params.account.split('/')[0]));
    out.set(out_rel, rendered);
  }
  for (const f of SDK_FILES) out.set(`.open-autonomy/sdk/${f}`, readFileSync(join(SDK_SRC, f)));
  out.set(KIT_FILE, Buffer.from(record({ kit: KIT.name, skew, version: KIT.version, params })));
  return out;
}

export function readKit(dir: string): KitRecord {
  const p = join(dir, KIT_FILE);
  if (!existsSync(p)) throw new Error(`${p} is missing: not a repository this kit made (create or adopt it first)`);
  const rec = JSON.parse(readFileSync(p, 'utf8')) as Partial<KitRecord>;
  if (rec.kit !== KIT.name) throw new Error(`${p} names kit ${rec.kit}, not ${KIT.name}`);
  // The version names the ancestor an upgrade fetches from the registry: a release number and nothing else, never a
  // dependency spec or a path.
  if (typeof rec.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(rec.version)) throw new Error(`${p} records no kit release version (x.y.z)`);
  // A record older than the skews was made by the one brain there was: it is self-build.
  return { kit: rec.kit, skew: validateSkew(rec.skew ?? 'self-build'), version: rec.version, params: validateParams(rec.params ?? {}) };
}
function record(rec: KitRecord): string {
  return `${JSON.stringify({ kit: rec.kit, skew: rec.skew, version: rec.version, params: rec.params } satisfies KitRecord, null, 2)}\n`;
}

export interface Outcome { written: string[]; skipped: string[] }

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

// check: the project against the kit. Which version it is at; which kit-owned files it has changed since (its own
// edits, a merge's result, a file it removed); which carry an unresolved merge. A project is a branch of its skew
// (docs/decisions/0006), so divergence is its right and is reported, never an error. An old version and an
// unresolved merge are.
export interface Status { version: string; current: boolean; diverged: string[]; conflicted: string[]; config: string[] }
export function check(dir: string): Status {
  const rec = readKit(dir);
  const diverged: string[] = [];
  const conflicted: string[] = [];
  for (const [rel, want] of render(rec.params, rec.skew)) {
    if (!isOwned(rel) || rel === KIT_FILE) continue;
    const at = join(dir, rel);
    if (!existsSync(at)) { diverged.push(`${rel}: removed here`); continue; }
    const have = readFileSync(at);
    if (hasMarkers(have)) conflicted.push(rel);
    else if (!eq(have, want)) diverged.push(`${rel}: changed here`);
  }
  return { version: rec.version, current: rec.version === KIT.version, diverged, conflicted, config: declarations(dir) };
}

// The project's own declarations in config.yaml: the roster must read, and declared seams (ADR 0008) must use the
// three doors and, once anyone is on the roster, name a scope some member holds (a project just created has no roster
// yet, and filling it is the owner's first act). A problem here is the project's to fix, not the kit's.
function declarations(dir: string): string[] {
  const at = join(dir, '.open-autonomy', 'config.yaml');
  if (!existsSync(at)) return [];
  const text = readFileSync(at, 'utf8');
  const out: string[] = [];
  // Loaded here, after the SDK version gate above, so an SDK too old to have seams.ts fails with that gate's message.
  const { parseTeamConfig } = require(join(SDK_SRC, 'team.ts')) as typeof import('@open-autonomy/sdk/team');
  const { parseSeamsConfig } = require(join(SDK_SRC, 'seams.ts')) as typeof import('@open-autonomy/sdk/seams');
  let scopes: Set<string> | null = null;
  try {
    const members = parseTeamConfig(text).members;
    if (members.length) scopes = new Set(members.flatMap((m) => m.scopes));
  } catch (e) { out.push((e as Error).message); }
  try {
    const seams = parseSeamsConfig(text);
    for (const s of seams?.seams ?? []) if (scopes && !scopes.has(s.scope)) out.push(`Seam ${s.id} is held by scope ${s.scope}, which no roster member has.`);
  } catch (e) { out.push((e as Error).message); }
  return out;
}
const eq = (a: Buffer, b: Buffer): boolean => Buffer.compare(a, b) === 0;
const binary = (b: Buffer): boolean => b.includes(0);
const hasMarkers = (b: Buffer): boolean => !binary(b) && /^<{7} /m.test(b.toString('utf8')) && /^>{7} /m.test(b.toString('utf8'));

// upgrade: a three-way merge of every kit-owned file. Ancestor: the kit at the recorded version, rendered with the
// project's parameters (ancestor.ts). Theirs: this kit's render. Ours: the file in the project. A file the project
// never touched takes the kit's change whole; a file the kit never touched keeps the project's; a file both changed
// is merged line by line, and where the same lines moved apart the conflict stays in the file, marked, for an agent
// in the project's own session to resolve, keeping the project's intent and the kit's change. A file the kit retired
// goes if the project left it alone and stays if the project changed it. The record moves to this version whatever
// the merge left behind: the files now embody it, conflicts included, and a rerun refuses until they are resolved.
export interface Upgrade { from: string; to: string; written: string[]; merged: string[]; kept: string[]; conflicts: string[]; retired: string[] }
export async function upgrade(dir: string): Promise<Upgrade> {
  const rec = readKit(dir);
  const before = check(dir);
  if (before.conflicted.length) throw new Error(`unresolved merge markers in ${before.conflicted.join(', ')}: resolve them and commit before upgrading again`);
  const base = await ancestor(rec.version, rec.params, rec.skew);
  const theirs = render(rec.params, rec.skew);
  const out: Upgrade = { from: rec.version, to: KIT.version, written: [], merged: [], kept: [], conflicts: [], retired: [] };
  // The layout change (docs/decisions/0007): a project still carrying its agent setup as Hermes's files gets its
  // .open-autonomy/agent.json derived from them — its own model, settings and jobs, not the kit's defaults — and
  // those files and the seed hook retired. The loop below then leaves agent.json alone this once: the project's
  // own values are its version, and the next upgrade merges against this kit's render.
  const derived = legacyAgent(dir);
  if (derived) {
    put(join(dir, '.open-autonomy/agent.json'), '.open-autonomy/agent.json', Buffer.from(`${JSON.stringify(derived, null, 2)}\n`));
    out.written.push('.open-autonomy/agent.json (from the project\'s own Hermes config and job seed)');
    for (const rel of LEGACY_FILES) if (existsSync(join(dir, rel))) { rmSync(join(dir, rel), { force: true }); prune(dir, rel); out.retired.push(rel); }
  }
  // Migrate only missing planning notes, using this project's seed rather than
  // the template's hello task. The live board is reconciled by PM, never by upgrade.
  if (!existsSync(join(dir, 'ROADMAP.md'))) {
    const seedFile = join(dir, 'hermes/kanban.seed.json');
    if (existsSync(seedFile)) {
      const seed = JSON.parse(readFileSync(seedFile, 'utf8')) as { tasks: Array<{ key: string; title: string; acceptance?: string[]; held?: string }> };
      const notes = seed.tasks.map((t) => `## ${t.key}: ${t.title}\n\nStatus: historical intention; reconcile with the live board and landed work.\nDispatch: hold\n\nSource: [committed seed](hermes/kanban.seed.json), key \`${t.key}\`. This is not evidence of current priority or completion.\n${t.held ? `\nExisting hold: ${t.held}\n` : ''}\nCompletion:\n${(t.acceptance ?? []).map((a) => `- ${a}`).join('\n')}\n`).join('\n');
      put(join(dir, 'ROADMAP.md'), 'ROADMAP.md', Buffer.from(`# ${rec.params.project} roadmap\n\nNotable intentions maintained by the Hermes PM scrum. Imported historical intentions await reconciliation; existing tasks, owners and holds remain intact.\n\n${notes}\nPM must reconcile this import against landed history and the live board before dispatch. Distill notable landed changes into CHANGELOG.md; retain outstanding release and verification outcomes here. Routine activity stays in source history.\n`));
      out.written.push('ROADMAP.md');
    }
  }
  for (const rel of new Set([...base.keys(), ...theirs.keys()])) {
    if (rel === KIT_FILE || !isOwned(rel)) continue;
    if (derived && rel === '.open-autonomy/agent.json') continue;
    if (derived && LEGACY_FILES.includes(rel)) continue;
    const at = join(dir, rel);
    const o = existsSync(at) ? readFileSync(at) : undefined;
    const b = base.get(rel);
    const t = theirs.get(rel);
    if (t === undefined) {
      // The kit retired this file.
      if (o === undefined) continue;
      if (b !== undefined && eq(o, b)) { rmSync(at, { force: true }); prune(dir, rel); out.retired.push(rel); } else out.kept.push(`${rel}: changed here, retired by the kit`);
      continue;
    }
    if (o === undefined) {
      if (b === undefined) { put(at, rel, t); out.written.push(rel); } else out.kept.push(`${rel}: removed here${eq(b, t) ? '' : ' (the kit changed it since)'}`);
      continue;
    }
    if (eq(o, t)) continue;
    if (b !== undefined && eq(o, b)) { put(at, rel, t); out.written.push(rel); continue; }
    if (b !== undefined && eq(b, t)) { out.kept.push(`${rel}: changed here, unchanged in the kit`); continue; }
    if (binary(o) || binary(t) || (b !== undefined && binary(b))) { out.kept.push(`${rel}: binary, changed here and in the kit; take the kit's by hand`); continue; }
    const m = merge(rel, o, b ?? Buffer.alloc(0), t, rec.version);
    put(at, rel, m.text);
    (m.clean ? out.merged : out.conflicts).push(rel);
  }
  // A project that commits its host package's lockfile: the start installs it frozen, so a package.json the
  // upgrade changed with the lock left behind would stop every start. The lock is re-resolved here, beside it.
  const hostPackage = '.open-autonomy/package.json';
  const lock = join(dir, '.open-autonomy', 'bun.lock');
  if (existsSync(lock) && [...out.written, ...out.merged].includes(hostPackage)) {
    const r = spawnSync('bun', ['install', '--lockfile-only'], { cwd: join(dir, '.open-autonomy'), encoding: 'utf8', timeout: 120_000 });
    if (r.status === 0) out.written.push('.open-autonomy/bun.lock');
    // a lock left stale is a start that refuses: held like a conflict, so nothing lands until it is re-resolved
    else out.conflicts.push(`.open-autonomy/bun.lock (could not be re-resolved: ${(r.stderr || r.error?.message || '').trim().slice(-200)}; run \`bun install\` in .open-autonomy)`);
  }
  // Repair the exact empty-list spelling emitted by older kits. Other project
  // policy, including malformed custom values, remains the owner's to resolve.
  const policyFile = join(dir, '.open-autonomy/config.yaml');
  if (existsSync(policyFile)) {
    const policy = readFileSync(policyFile, 'utf8');
    const repaired = policy.replace(/^  private:          # session ids or job names that never publish, whatever their kind\n    - \[\]\n(?=\s*\n)/m, '  private: []       # session IDs, job IDs or job names that never publish\n');
    if (repaired !== policy) { writeFileSync(policyFile, repaired); out.written.push('.open-autonomy/config.yaml'); }
  }
  writeFileSync(join(dir, KIT_FILE), record({ ...rec, version: KIT.version }));
  return out;
}

function merge(rel: string, ours: Buffer, base: Buffer, theirs: Buffer, from: string): { clean: boolean; text: Buffer } {
  const tmp = mkdtempSync(join(tmpdir(), 'oa-merge-'));
  try {
    const [o, b, t] = ['ours', 'base', 'theirs'].map((n) => join(tmp, n));
    writeFileSync(o, ours); writeFileSync(b, base); writeFileSync(t, theirs);
    // Exit status is the number of conflicts; --diff3 shows the ancestor's lines between the two sides.
    const r = spawnSync('git', ['merge-file', '-p', '--diff3', '-L', `${rel} (this project)`, '-L', `kit ${from}`, '-L', `kit ${KIT.version}`, o, b, t], { timeout: 30_000 });
    if (r.status === null || r.status < 0 || r.status > 127) throw new Error(`git merge-file failed on ${rel}: ${(r.stderr ?? Buffer.alloc(0)).toString().trim()}`);
    return { clean: r.status === 0, text: r.stdout };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
function put(at: string, rel: string, content: Buffer): void {
  mkdirSync(dirname(at), { recursive: true });
  writeFileSync(at, content, { mode: rel.endsWith('.sh') ? 0o755 : 0o644 });
}
// A directory a retirement emptied goes too.
function prune(dir: string, rel: string): void {
  let d = dirname(rel);
  while (d && d !== '.') { try { if (readdirSync(join(dir, d)).length) return; rmSync(join(dir, d), { recursive: true }); } catch { return; } d = dirname(d); }
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
  return { written, skipped };
}

