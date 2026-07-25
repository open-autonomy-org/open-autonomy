import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  disableZtrackIntegration,
  enableZtrackIntegration,
  ZTRACK_SERVICE_HOOK_ID,
} from './ztrack-integration.ts';

const roots: string[] = [];

function gitRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'oa-ztrack-integration-'));
  roots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

function recorder(root: string): { path: string; calls: string } {
  const calls = join(root, 'ztrack-calls.jsonl');
  const path = join(root, 'ztrack-fixture.cjs');
  writeFileSync(path, `#!/usr/bin/env node
require('node:fs').appendFileSync(
  ${JSON.stringify(calls)},
  JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2) }) + '\\n',
);
`);
  chmodSync(path, 0o700);
  return { path, calls };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('ztrack integration adapter', () => {
  test('registers OA through ztrack public hooks with fixed argv and no shell', () => {
    const root = gitRepo();
    const ztrack = recorder(root);
    const launcher = join(root, 'oa.ts');
    writeFileSync(launcher, '');

    enableZtrackIntegration(root, {
      launcherPath: launcher,
      ztrackPath: ztrack.path,
      nodePath: process.execPath,
    });

    const call = JSON.parse(readFileSync(ztrack.calls, 'utf8').trim());
    const canonicalRoot = realpathSync(root);
    expect(call.cwd).toBe(canonicalRoot);
    expect(call.args).toEqual([
      'hooks',
      'add',
      '--event',
      'project:invoke',
      '--id',
      ZTRACK_SERVICE_HOOK_ID,
      '--timeout-ms',
      '12000',
      '--',
      realpathSync(process.execPath),
      realpathSync(launcher),
      'integration',
      'ztrack',
      'wake',
      '--project',
      canonicalRoot,
    ]);
  });

  test('removes only OA-owned registration through the same public API', () => {
    const root = gitRepo();
    const ztrack = recorder(root);
    disableZtrackIntegration(root, ztrack.path);
    const call = JSON.parse(readFileSync(ztrack.calls, 'utf8').trim());
    expect(call.args).toEqual(['hooks', 'remove', ZTRACK_SERVICE_HOOK_ID]);
  });

  test('missing compatible local ztrack names the explicit ensure fallback', () => {
    const root = gitRepo();
    const launcher = join(root, 'oa.ts');
    writeFileSync(launcher, '');
    expect(() => enableZtrackIntegration(root, {
      launcherPath: launcher,
      ztrackPath: join(root, 'missing-ztrack'),
    })).toThrow('service remains available through `oa service ensure`');
  });
});
