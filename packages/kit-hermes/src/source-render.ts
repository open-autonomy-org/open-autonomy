// Render a historical ancestor in its own Bun module graph and SDK environment. The selected target owns the
// upgrade; this child returns ancestor bytes without changing the parent's environment or running migrations.
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { KitParams, Skew } from './kit.ts';
import { kitLabel, kitSource, type KitSource } from './source.ts';

export function renderSource(source: KitSource, params: KitParams, skew: Skew): Map<string, Buffer> {
  const code = `import { readFileSync } from 'node:fs';
const { module, params, skew } = JSON.parse(readFileSync(0, 'utf8'));
const kit = await import(module);
const render = kit.renderFiles ?? kit.render;
if (typeof render !== 'function') throw new Error('source kit exports no renderer');
process.stdout.write(JSON.stringify([...render(params, skew)].map(([path, bytes]) => [path, bytes.toString('base64')])));`;
  const result = spawnSync(process.execPath, ['--eval', code], {
    cwd: source.root, env: { ...process.env, OPEN_AUTONOMY_SOURCE_ONLY: '1', OPEN_AUTONOMY_SOURCE: source.root,
      ...(process.env.OPEN_AUTONOMY_KIT_CACHE ? { OPEN_AUTONOMY_KIT_CACHE: resolve(process.env.OPEN_AUTONOMY_KIT_CACHE) } : {}) },
    input: JSON.stringify({ module: pathToFileURL(join(source.kit, 'src/kit.ts')).href, params, skew }),
    encoding: 'utf8', timeout: 10_000, maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`kit source ${kitLabel({ version: source.version, sourceRevision: source.commit })} could not render in its own source: ${(result.stderr || result.error?.message || 'no output').trim()}`);
  kitSource(source.version, source.root, source.commit, true);
  const rows = JSON.parse(result.stdout) as Array<[string, string]>;
  return new Map(rows.map(([path, bytes]) => [path, Buffer.from(bytes, 'base64')]));
}
