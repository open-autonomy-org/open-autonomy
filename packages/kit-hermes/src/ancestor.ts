// The ancestor of an upgrade: the kit as it was when the project last took it, rendered with the project's own
// parameters. The published package of that version is the archive (the registry holds every release), fetched
// once into ~/.cache/open-autonomy/kit/<version>/ and rendered by its own engine, so the ancestor is exactly what
// that kit wrote, whatever this kit's rendering has become since. The current version renders here, with no fetch.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { KIT, KIT_FILE, render, type KitParams, type Skew } from './kit.ts';

export async function ancestor(version: string, params: KitParams, skew: Skew): Promise<Map<string, Buffer>> {
  const out = version === KIT.version ? render(params, skew) : await renderWith(version, fetchKit(version), params, skew);
  out.delete(KIT_FILE);
  return out;
}

function fetchKit(version: string): string {
  const dir = join(process.env.OPEN_AUTONOMY_KIT_CACHE ?? join(homedir(), '.cache', 'open-autonomy', 'kit'), version);
  const pkg = join(dir, 'node_modules', 'create-open-autonomy', 'package.json');
  if (existsSync(pkg) && (JSON.parse(readFileSync(pkg, 'utf8')) as { version: string }).version === version) return dir;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: 'open-autonomy-kit-ancestor', private: true, dependencies: { 'create-open-autonomy': version } }, null, 2)}\n`);
  const r = spawnSync('bun', ['install', '--silent'], { cwd: dir, encoding: 'utf8', timeout: 180_000 });
  if (r.status !== 0 || !existsSync(pkg)) throw new Error(`create-open-autonomy@${version}, the kit this project last took, could not be fetched into ${dir}: ${(r.stderr || r.stdout || 'no output').trim().split('\n').pop()}. The merge needs its render as the ancestor.`);
  return dir;
}

async function renderWith(version: string, dir: string, params: KitParams, skew: Skew): Promise<Map<string, Buffer>> {
  const mod = await import(pathToFileURL(join(dir, 'node_modules', 'create-open-autonomy', 'src', 'kit.ts')).href) as { render?: (p: KitParams, s?: Skew) => Map<string, Buffer> };
  if (typeof mod.render !== 'function') throw new Error(`create-open-autonomy@${version} cannot render: too old to be an ancestor`);
  // A kit older than the skews takes only the parameters; there was one brain, and it is self-build.
  return mod.render(params, skew);
}
