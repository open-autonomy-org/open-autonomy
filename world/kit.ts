#!/usr/bin/env bun
// The kit's proof (bun world/run.ts kit): the SDK and the kit publish to the npm registry twin the way the
// release workflow publishes them (bun publish with an .npmrc token), a fresh directory becomes a project with
// `bun create open-autonomy` from that registry alone, and the generated repository passes its own check and
// the installed kit's. The registry twin holds only what was published: the create step proves the two
// packages carry everything a project needs; the check's tooling (typescript, bun's types) is installed the
// way a clean machine installs it, from npm outside the world's seal.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, need } from './lib.ts';

const registry = need('NPM_REGISTRY_TWIN_URL').replace(/\/$/, '');
const fail = (m: string) => { throw new Error(`kit: ${m}`); };
const home = mkdtempSync(join(tmpdir(), 'oa-kit-home-'));
mkdirSync(join(home, 'tmp'), { recursive: true });
writeFileSync(join(home, '.npmrc'), `registry=${registry}/\n//${registry.replace(/^https?:\/\//, '')}/:_authToken=twin-token\n`);
const outside = (): Record<string, string> => { const env: Record<string, string> = {}; for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(https?_proxy|all_proxy|no_proxy|node_options|node_extra_ca_certs|npm_config_registry|bun_config_registry)$/i.test(k)) env[k] = v; return env; };
const run = (label: string, cmd: string[], cwd: string, env: Record<string, string>): string => {
  const r = Bun.spawnSync({ cmd, cwd, env, stdout: 'pipe', stderr: 'pipe' });
  const out = `${r.stdout.toString()}${r.stderr.toString()}`;
  if (r.exitCode !== 0) fail(`${label} failed (${r.exitCode}):\n${out.slice(-1500)}`);
  return out;
};
// bunx caches a package's `latest` for a day under the temp dir; a temp dir of this run's own means the kit created
// here is the kit published here.
const inWorld = { ...process.env as Record<string, string>, HOME: home, BUN_INSTALL_CACHE_DIR: join(home, 'cache'), TMPDIR: join(home, 'tmp') };

// 1. Publish, the SDK first: the kit depends on it and `bun publish` writes the workspace dependency as its version.
for (const pkg of ['packages/sdk', 'packages/kit-hermes']) run(`publish ${pkg}`, ['bun', 'publish', '--access', 'public', '--registry', `${registry}/`], join(ROOT, pkg), inWorld);
const kit = (await fetch(`${registry}/create-open-autonomy`).then((r) => r.json().catch(() => ({})))) as { 'dist-tags'?: { latest?: string }; versions?: Record<string, { dependencies?: Record<string, string> }> };
const version = kit['dist-tags']?.latest;
if (!version) fail('create-open-autonomy is not on the registry twin after publishing');
const dep = kit.versions?.[version]?.dependencies?.['@open-autonomy/sdk'];
if (!dep || dep.startsWith('workspace:')) fail(`the published kit depends on the SDK as ${dep ?? 'nothing'}, not a version`);

// 2. A clean directory becomes a project from the registry alone.
const work = mkdtempSync(join(tmpdir(), 'oa-kit-create-'));
const created = run('bun create open-autonomy', ['bun', 'create', `open-autonomy@${JSON.parse(readFileSync(join(ROOT, 'packages/kit-hermes/package.json'), 'utf8')).version}`, 'probe', '--project', 'probe', '--account', 'cookbook/probe'], work, inWorld);
const project = join(work, 'probe');
// The project came from THIS kit, not a cached tarball of an earlier one with the same name: its record names the
// version the package here declares.
const local = JSON.parse(readFileSync(join(ROOT, 'packages/kit-hermes/package.json'), 'utf8')) as { version: string };
const record = JSON.parse(readFileSync(join(project, '.open-autonomy/kit.json'), 'utf8')) as { version?: string };
if (record.version !== local.version) fail(`the created project records kit ${record.version}, not the ${local.version} packed here — a stale package was served`);
for (const f of ['CONSTITUTION.md', 'CONTRIBUTING.md', 'hermes/SOUL.md', 'hermes/kanban.seed.json', 'hermes/skills/open-autonomy/develop/SKILL.md', 'hermes/profiles/treasurer/SOUL.md', '.open-autonomy/reporter.ts', '.open-autonomy/sdk/client.ts', 'container/compose.yml']) if (!(await Bun.file(join(project, f)).exists())) fail(`the created project lacks ${f}\n${created.slice(-800)}`);

// 3. The generated repository passes its own check (its tooling from npm, as a clean machine gets it) and the installed kit's.
run('bun install (the project)', ['bun', 'install'], project, outside());
run('bun run check (the project)', ['bun', 'run', 'check'], project, outside());
run('create-open-autonomy check', ['bun', 'x', `create-open-autonomy@${version}`, 'check', project], work, inWorld);
console.log(`kit: OK — @open-autonomy/sdk and create-open-autonomy ${version} published to the registry twin; \`bun create open-autonomy\` from it made a project that passes its check and the kit's`);
