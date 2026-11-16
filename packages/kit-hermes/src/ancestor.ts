// The ancestor of an upgrade: the kit as it was when the project last took it, rendered with the project's own
// parameters. Source mode requires its exact owning source through explicit cache links (ADR 0036). For public
// package installs the published package of that version is the archive (the registry holds every release), fetched
// once into ~/.cache/open-autonomy/kit/<version>/ and rendered by its own engine, so the ancestor is exactly what
// that kit wrote, whatever this kit's rendering has become since. The current version renders here, with no fetch.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { KIT, KIT_FILE, currentKit, render, type KitParams, type Skew } from './kit.ts';
import { ancestorSource, kitLabel, sameKit, sourceMode, type KitIdentity } from './source.ts';

export async function ancestor(identity: KitIdentity, params: KitParams, skew: Skew): Promise<Map<string, Buffer>> {
  const fromSource = sourceMode() || identity.sourceRevision !== undefined;
  const out = fromSource
    ? sameKit(identity, currentKit()) ? render(params, skew) : renderSource(ancestorSource(identity.version, identity.sourceRevision), params, skew)
    : identity.version === KIT.version ? render(params, skew) : await renderWith(identity.version, fetchKit(identity.version), params, skew);
  out.delete(KIT_FILE);
  return out;
}

function fetchKit(version: string): string {
  const dir = join(process.env.OPEN_AUTONOMY_KIT_CACHE ?? join(homedir(), '.cache', 'open-autonomy', 'kit'), version);
  const pkg = join(dir, 'node_modules', 'create-open-autonomy', 'package.json');
  if (existsSync(pkg) && (JSON.parse(readFileSync(pkg, 'utf8')) as { version: string }).version === version) return dir;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'open-autonomy-kit-ancestor', private: true, dependencies: { 'create-open-autonomy': version } }, null, 2)}\n`);
  const r = spawnSync('pnpm', ['--config.nodeLinker=hoisted', 'install', '--silent', '--package-import-method', 'hardlink', '--allow-build', 'esbuild'], { cwd: dir, encoding: 'utf8', timeout: 180_000 });
  const got = existsSync(pkg) ? JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string; version?: string } : {};
  if (r.status !== 0 || got.name !== 'create-open-autonomy' || got.version !== version) throw new Error(`create-open-autonomy@${version}, the kit this project last took, could not be fetched into ${dir}: ${(r.stderr || r.stdout || 'no output').trim().split('\n').pop()}. The merge needs its render as the ancestor. A version the registry never held (a kit taken from a source checkout) is supplied from source: its packages/kit-hermes as ${join(dir, 'node_modules', 'create-open-autonomy')} and its packages/sdk as ${join(dir, 'node_modules', '@open-autonomy', 'sdk')}, both at that version's commit.`);
  return dir;
}

// Historical code gets only its own selected source environment, in a private module graph. In particular,
// old executingSource implementations may reject the current root or compare package versions themselves.
function renderSource(source: ReturnType<typeof ancestorSource>, params: KitParams, skew: Skew): Map<string, Buffer> {
  const code = `import { readFileSync } from 'node:fs';
const { module, params, skew } = JSON.parse(readFileSync(0, 'utf8'));
const { render } = await import(module);
if (typeof render !== 'function') throw new Error('ancestor kit exports no renderer');
process.stdout.write(JSON.stringify([...render(params, skew)].map(([path, bytes]) => [path, bytes.toString('base64')])));`;
  const result = spawnSync(process.execPath, ['--eval', code], {
    cwd: source.root, env: { ...process.env, OPEN_AUTONOMY_SOURCE_ONLY: '1', OPEN_AUTONOMY_SOURCE: source.root,
      ...(process.env.OPEN_AUTONOMY_KIT_CACHE ? { OPEN_AUTONOMY_KIT_CACHE: resolve(process.env.OPEN_AUTONOMY_KIT_CACHE) } : {}) },
    input: JSON.stringify({ module: pathToFileURL(join(source.kit, 'src/kit.ts')).href, params, skew }),
    encoding: 'utf8', timeout: 10_000, maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`kit ancestor ${kitLabel({ version: source.version, sourceRevision: source.commit })} could not render in its own source: ${(result.stderr || result.error?.message || 'no output').trim()}`);
  const rows = JSON.parse(result.stdout) as Array<[string, string]>;
  return new Map(rows.map(([path, bytes]) => [path, Buffer.from(bytes, 'base64')]));
}

async function renderWith(version: string, dir: string, params: KitParams, skew: Skew): Promise<Map<string, Buffer>> {
  const mod = await import(pathToFileURL(join(dir, 'node_modules', 'create-open-autonomy', 'src', 'kit.ts')).href) as { render?: (p: KitParams, s?: Skew) => Map<string, Buffer> };
  if (typeof mod.render !== 'function') throw new Error(`create-open-autonomy@${version} cannot render: too old to be an ancestor`);
  // A kit older than the skews takes only the parameters; there was one brain, and it is self-build.
  return mod.render(params, skew);
}
