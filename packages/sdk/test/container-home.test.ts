import { expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { prepareContainerHome, writeContainerEnvironment } from '../src/container-home.ts';

test('local home uses fetched configuration while preserving interrupted work and native state', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-home-')), originalPath = process.env.PATH;
  const upstream = join(root, 'origin'), workspace = join(root, 'checkout'), home = join(root, 'home');
  mkdirSync(upstream); mkdirSync(home);
  writeFileSync(join(root, 'docker'), '#!/bin/sh\nshift 5\nexec "$@"\n'); chmodSync(join(root, 'docker'), 0o700);
  process.env.PATH = `${root}:${originalPath}`;
  const git = (cwd: string, ...args: string[]) => {
    const r = Bun.spawnSync(['git', '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', '-C', cwd, ...args], { stdout: 'pipe', stderr: 'ignore' });
    if (r.exitCode) throw new Error('Fixture Git failed: ' + args[0]);
    return r.stdout.toString().trim();
  };
  const write = (file: string, value: string) => { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, value); };
  try {
    git(upstream, 'init', '-qb', 'main'); git(upstream, 'config', 'user.name', 'Fixture'); git(upstream, 'config', 'user.email', 'fixture@example.test');
    write(join(upstream, 'hermes/config.yaml'), 'committed: true\n');
    write(join(upstream, 'hermes/profiles/treasurer/config.yaml'), 'committed: true\n');
    write(join(upstream, 'hermes/.env'), 'NEVER_COPY=committed\n');
    write(join(upstream, '.open-autonomy/config.yaml'), 'account: owner/project\n');
    git(upstream, 'add', '.'); git(upstream, 'commit', '-qm', 'Configuration');
    git(root, 'clone', '-q', upstream, workspace);
    write(join(workspace, 'hermes/config.yaml'), 'unlanded: true\n');
    write(join(workspace, 'unfinished.txt'), 'keep this work');
    write(join(home, 'state.db'), 'keep native state');
    write(join(home, 'skills/open-autonomy/removed/SKILL.md'), 'obsolete');
    write(join(home, '.env'), 'EXISTING=native\nGITHUB_TOKEN=old\n');
    const result = await prepareContainerHome({ container: 'fixture', home, workspace });
    expect(result.dirty).toBe(true);
    expect(result.config).toBe('account: owner/project\n');
    expect(readFileSync(join(home, 'config.yaml'), 'utf8')).toBe('committed: true\n');
    expect(readFileSync(join(workspace, 'hermes/config.yaml'), 'utf8')).toBe('unlanded: true\n');
    expect(readFileSync(join(workspace, 'unfinished.txt'), 'utf8')).toBe('keep this work');
    expect(readFileSync(join(home, 'state.db'), 'utf8')).toBe('keep native state');
    expect(existsSync(join(home, 'skills/open-autonomy/removed'))).toBe(false);
    await writeContainerEnvironment({ container: 'fixture', home, env: { GITHUB_TOKEN: 'valve', DISCORD_HOME_CHANNEL: '123', DISCORD_BOT_TOKEN: 'synthetic-only' } });
    expect(parseEnv(readFileSync(join(home, '.env'), 'utf8'))).toEqual({ EXISTING: 'native', GITHUB_TOKEN: 'valve', DISCORD_HOME_CHANNEL: '123', DISCORD_BOT_TOKEN: 'synthetic-only' });
    git(workspace, 'restore', 'hermes/config.yaml'); rmSync(join(workspace, 'unfinished.txt'));
    write(join(upstream, 'hermes/config.yaml'), 'committed: newer\n'); git(upstream, 'add', '.'); git(upstream, 'commit', '-qm', 'New config');
    const clean = await prepareContainerHome({ container: 'fixture', home, workspace });
    expect(clean.dirty).toBe(false);
    expect(git(workspace, 'rev-parse', 'HEAD')).toBe(clean.revision);
    expect(readFileSync(join(home, 'config.yaml'), 'utf8')).toBe('committed: newer\n');
  } finally { process.env.PATH = originalPath; rmSync(root, { recursive: true, force: true }); }
});
