import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { servicePaths } from './service.ts';

export const ZTRACK_SERVICE_HOOK_ID = 'open-autonomy.service';
const ZTRACK_HOOK_EVENT = 'project:invoke';

export interface ZtrackIntegrationOptions {
  launcherPath: string;
  ztrackPath?: string;
  nodePath?: string;
}

function localZtrack(projectRoot: string, override?: string): string {
  const candidate = override ?? join(
    projectRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'ztrack.cmd' : 'ztrack',
  );
  if (!existsSync(candidate)) {
    throw new Error(
      `[oa] ztrack integration requires the repository's local ztrack executable at ${candidate}; ` +
      `the service remains available through \`oa service ensure\``,
    );
  }
  return realpathSync(candidate);
}

function detail(result: ReturnType<typeof spawnSync>): string {
  return String(result.error?.message || result.stderr || result.stdout || `exited ${result.status ?? 'without a status'}`)
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 500);
}

function runZtrack(projectRoot: string, args: string[], override?: string): void {
  const executable = localZtrack(projectRoot, override);
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 128 * 1024,
  });
  if (result.status !== 0 || result.error) {
    throw new Error(`[oa] ztrack hook registration failed: ${detail(result)}`);
  }
}

/**
 * Downstream adapter for ztrack's public project-hook CLI. Open Autonomy owns the
 * callback and registration; ztrack receives no OA-specific files or schema.
 */
export function enableZtrackIntegration(cwd: string, options: ZtrackIntegrationOptions): void {
  const paths = servicePaths(cwd);
  const launcher = realpathSync(options.launcherPath);
  const node = realpathSync(options.nodePath ?? process.execPath);
  runZtrack(paths.projectRoot, [
    'hooks',
    'add',
    '--event',
    ZTRACK_HOOK_EVENT,
    '--id',
    ZTRACK_SERVICE_HOOK_ID,
    '--timeout-ms',
    '12000',
    '--',
    node,
    launcher,
    'integration',
    'ztrack',
    'wake',
    '--project',
    paths.projectRoot,
  ], options.ztrackPath);
}

export function disableZtrackIntegration(cwd: string, ztrackPath?: string): void {
  const paths = servicePaths(cwd);
  runZtrack(paths.projectRoot, ['hooks', 'remove', ZTRACK_SERVICE_HOOK_ID], ztrackPath);
}
