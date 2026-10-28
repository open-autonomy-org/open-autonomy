// Source mode validates the kit's existing workspace and versioned ancestor links before native code runs.
// Published installed packages retain their package default unless source mode is explicitly selected.
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function layout(kit: string): string | undefined {
  return basename(kit) === 'kit-hermes' && basename(dirname(kit)) === 'packages' ? resolve(kit, '../..') : undefined;
}
export function sourceMode(): boolean {
  // Detect the layout before looking for Git or the SDK: incomplete source must refuse, never become public mode.
  return process.env.OPEN_AUTONOMY_SOURCE_ONLY === '1' || !!process.env.OPEN_AUTONOMY_SOURCE || !!layout(resolve(import.meta.dir, '..'));
}
export function sourceEnvironment(): Record<string, string> {
  return Object.fromEntries(['OPEN_AUTONOMY_SOURCE_ONLY', 'OPEN_AUTONOMY_SOURCE', 'OPEN_AUTONOMY_KIT_CACHE']
    .flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name]!]]));
}
export function kitSource(version: string, directory: string | undefined) {
  if (!directory?.trim()) throw new Error('kit source mode requires OPEN_AUTONOMY_SOURCE: the selected Open Autonomy source checkout; registry code is never a fallback');
  const root = realpathSync(resolve(directory));
  const kit = resolve(root, 'packages/kit-hermes'), sdk = resolve(root, 'packages/sdk');
  const manifest = JSON.parse(readFileSync(resolve(kit, 'package.json'), 'utf8'));
  const expected = /^(?:workspace:)?(\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?)$/.exec(manifest.dependencies?.['@open-autonomy/sdk'] ?? '')?.[1];
  const dependency = JSON.parse(readFileSync(resolve(sdk, 'package.json'), 'utf8'));
  if (manifest.name !== 'create-open-autonomy' || manifest.version !== version || !expected)
    throw new Error(`kit source ${kit} must be create-open-autonomy@${version} with an exact SDK dependency; found ${manifest.name}@${manifest.version}`);
  if (dependency.name !== '@open-autonomy/sdk' || dependency.version !== expected)
    throw new Error(`kit source SDK ${sdk} must be @open-autonomy/sdk@${expected}; found ${dependency.name}@${dependency.version}`);
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10_000 });
    if (result.status !== 0) throw new Error(`kit source Git ${args[0]} failed in ${root}: ${(result.stderr || result.stdout).trim()}`);
    return result.stdout.trim();
  };
  if (realpathSync(git('rev-parse', '--show-toplevel')) !== root || realpathSync(kit) !== kit || realpathSync(sdk) !== sdk)
    throw new Error(`kit source ${root} must be the owning source checkout, with its kit and SDK inside it`);
  git('ls-files', '--error-unmatch', 'packages/kit-hermes/package.json', 'packages/kit-hermes/src/cli.ts', 'packages/sdk/package.json', 'packages/sdk/src/index.ts');
  const cli = realpathSync(resolve(kit, manifest.bin?.['create-open-autonomy'] ?? ''));
  if (cli !== resolve(kit, 'src/cli.ts')) throw new Error(`kit source ${kit} must select its native src/cli.ts bin`);
  return { root, kit, sdk, cli, version, sdkVersion: expected, commit: git('rev-parse', 'HEAD') };
}
export function preparedKitSource(source: ReturnType<typeof kitSource>): string {
  const actual = realpathSync(Bun.resolveSync('@open-autonomy/sdk/package.json', dirname(source.cli)));
  if (actual !== resolve(source.sdk, 'package.json'))
    throw new Error(`kit source ${source.kit} resolves its SDK outside selected source ${source.sdk}: ${actual}`);
  return actual;
}
export function ancestorSource(version: string) {
  const cache = process.env.OPEN_AUTONOMY_KIT_CACHE;
  if (!cache) throw new Error(`kit source upgrade from ${version} requires OPEN_AUTONOMY_KIT_CACHE with that version's kit and SDK source links; registry code is never a fallback`);
  const dir = resolve(cache, version), kitLink = resolve(dir, 'node_modules/create-open-autonomy'), sdkLink = resolve(dir, 'node_modules/@open-autonomy/sdk');
  if (!lstatSync(kitLink).isSymbolicLink() || !lstatSync(sdkLink).isSymbolicLink()) throw new Error(`kit ancestor ${dir} must link its owning kit and SDK source`);
  const kit = realpathSync(kitLink), source = kitSource(version, resolve(kit, '../..'));
  if (source.kit !== kit || realpathSync(sdkLink) !== source.sdk) throw new Error(`kit ancestor ${dir} must link the kit and exact SDK in the same owning source checkout`);
  preparedKitSource(source);
  return { ...source, dir };
}
export function executingSource(version: string): string | undefined {
  if (!sourceMode()) return undefined;
  const root = layout(resolve(import.meta.dir, '..'));
  // An installed registry package is never a substitute for the selected source, even at the same version.
  if (!root) throw new Error('kit source mode requires execution from the owning packages/kit-hermes source; registry code is never a fallback');
  const source = kitSource(version, root);
  if (process.env.OPEN_AUTONOMY_SOURCE && realpathSync(resolve(process.env.OPEN_AUTONOMY_SOURCE)) !== source.root) {
    // A historical renderer may itself enforce source mode. Only its already validated, versioned source-cache
    // link permits that import; keep the selected current source in the environment for subsequent upgrades.
    const selectedVersion = JSON.parse(readFileSync(resolve(process.env.OPEN_AUTONOMY_SOURCE, 'packages/kit-hermes/package.json'), 'utf8')).version;
    kitSource(selectedVersion, process.env.OPEN_AUTONOMY_SOURCE);
    if (selectedVersion === version || ancestorSource(version).kit !== source.kit)
      throw new Error(`executing kit ${source.kit} is outside selected OPEN_AUTONOMY_SOURCE ${process.env.OPEN_AUTONOMY_SOURCE}`);
  }
  const sdk = preparedKitSource(source);
  process.env.OPEN_AUTONOMY_SOURCE_ONLY = '1';
  process.env.OPEN_AUTONOMY_SOURCE ??= source.root;
  return sdk;
}
