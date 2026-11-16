// Source mode validates owning revisions and ancestor links; only identity recording requires a clean tree.
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
  const selected = sourceMode(), cache = process.env.OPEN_AUTONOMY_KIT_CACHE;
  const root = process.env.OPEN_AUTONOMY_SOURCE ?? layout(resolve(import.meta.dir, '..'));
  return { ...(selected ? { OPEN_AUTONOMY_SOURCE_ONLY: '1', ...(root ? { OPEN_AUTONOMY_SOURCE: resolve(root) } : {}) } : {}),
    ...(cache === undefined ? {} : { OPEN_AUTONOMY_KIT_CACHE: selected && cache ? resolve(cache) : cache }) };
}
export interface KitIdentity { version: string; sourceRevision?: string }
export const kitLabel = (identity: KitIdentity): string => `${identity.version}${identity.sourceRevision ? `@${identity.sourceRevision}` : ''}`;
export function sameKit(a: KitIdentity, b: KitIdentity): boolean {
  return a.version === b.version && a.sourceRevision === b.sourceRevision;
}
export function kitSource(version: string | undefined, directory: string | undefined, sourceRevision?: string, clean = false) {
  if (!directory?.trim()) throw new Error('kit source mode requires OPEN_AUTONOMY_SOURCE: the selected Open Autonomy source checkout; registry code is never a fallback');
  const root = realpathSync(resolve(directory));
  const kit = resolve(root, 'packages/kit-hermes'), sdk = resolve(root, 'packages/sdk');
  const manifest = JSON.parse(readFileSync(resolve(kit, 'package.json'), 'utf8'));
  version ??= manifest.version;
  const expected = /^(?:workspace:)?(\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?)$/.exec(manifest.dependencies?.['@open-autonomy/sdk'] ?? '')?.[1];
  const dependency = JSON.parse(readFileSync(resolve(sdk, 'package.json'), 'utf8'));
  if (manifest.name !== 'create-open-autonomy' || typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version) || manifest.version !== version || !expected)
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
  if (clean && git('status', '--porcelain', '--untracked-files=normal')) throw new Error(`kit source ${root} must be clean: source identity names an exact committed tree`);
  const commit = git('rev-parse', 'HEAD');
  if (sourceRevision && commit !== sourceRevision) throw new Error(`kit source ${root} must remain at ${sourceRevision}; found ${commit}`);
  return { root, kit, sdk, cli, version, sdkVersion: expected, commit };
}
export type KitSource = ReturnType<typeof kitSource>;
export function preparedKitSource(source: ReturnType<typeof kitSource>): string {
  const actual = realpathSync(Bun.resolveSync('@open-autonomy/sdk/package.json', dirname(source.cli)));
  if (actual !== resolve(source.sdk, 'package.json'))
    throw new Error(`kit source ${source.kit} resolves its SDK outside selected source ${source.sdk}: ${actual}`);
  return actual;
}
export function ancestorSource(version: string, sourceRevision?: string) {
  if (sourceRevision !== undefined && !/^[0-9a-f]{40}$/.test(sourceRevision)) throw new Error(`invalid kit source revision ${sourceRevision}: expected a full Git commit`);
  const identity = sourceRevision ?? version;
  const cache = process.env.OPEN_AUTONOMY_KIT_CACHE;
  if (!cache) throw new Error(`kit source upgrade from ${identity} requires OPEN_AUTONOMY_KIT_CACHE with that ancestor's kit and SDK source links; registry code is never a fallback`);
  const dir = resolve(cache, identity), kitLink = resolve(dir, 'node_modules/create-open-autonomy'), sdkLink = resolve(dir, 'node_modules/@open-autonomy/sdk');
  if (!lstatSync(kitLink).isSymbolicLink() || !lstatSync(sdkLink).isSymbolicLink()) throw new Error(`kit ancestor ${dir} must link its owning kit and SDK source`);
  const kit = realpathSync(kitLink), source = kitSource(version, resolve(kit, '../..'), sourceRevision, true);
  if (source.kit !== kit || realpathSync(sdkLink) !== source.sdk) throw new Error(`kit ancestor ${dir} must link the kit and exact SDK in the same owning source checkout`);
  preparedKitSource(source);
  return { ...source, dir };
}
export function executingSource(version: string): KitSource | undefined {
  if (!sourceMode()) return undefined;
  const root = layout(resolve(import.meta.dir, '..'));
  if (!root) throw new Error('kit source mode requires the selected source native CLI; an installed package cannot supply its upgrade engine');
  const source = kitSource(version, root);
  const selectedRoot = process.env.OPEN_AUTONOMY_SOURCE ? realpathSync(resolve(process.env.OPEN_AUTONOMY_SOURCE)) : source.root;
  if (selectedRoot !== source.root) throw new Error(`executing kit ${source.kit} is outside selected OPEN_AUTONOMY_SOURCE ${selectedRoot}; run that source's native CLI so its upgrade migrations apply`);
  preparedKitSource(source);
  return source;
}
