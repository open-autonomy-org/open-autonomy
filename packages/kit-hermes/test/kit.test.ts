import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KIT, adopt, check, create, isOwned, readKit, render, upgrade } from '../src/kit.ts';

const params = { project: 'todo-cli', account: 'cookbook/todo-cli' };
const tmp = () => mkdtempSync(join(tmpdir(), 'oa-kit-'));

describe('the Hermes kit', () => {
  test('create writes the full boilerplate, rendered from the identity parameters, and records the kit', () => {
    const dir = tmp();
    const out = create(dir, params);
    for (const f of ['README.md', 'ROADMAP.yml', 'docs/VISION.md', 'CHANGELOG.md', 'AGENTS.md', 'LICENSE', '.gitignore', 'package.json',
      'hermes/config.yaml', 'hermes/SOUL.md', 'hermes/cron/jobs.seed.json', 'hermes/scripts/file-roadmap-item.sh', 'hermes/skills/open-autonomy/roadmap/SKILL.md', 'hermes/skills/open-autonomy/land/SKILL.md', 'hermes/skills/open-autonomy/verify-in-world/SKILL.md', 'hermes/skills/open-autonomy/rails/SKILL.md', 'hermes/hooks/schedule-seed/handler.py',
      '.open-autonomy/config.yaml', '.open-autonomy/reporter.ts', '.open-autonomy/mint-key.ts', '.open-autonomy/roadmap.ts', '.open-autonomy/sdk/client.ts', '.open-autonomy/sdk/roadmap.ts', '.open-autonomy/sdk/drivers.ts', '.open-autonomy/kit.json',
      'container/compose.yml', 'container/Dockerfile', 'container/Dockerfile.valve', 'container/Dockerfile.reporter', 'container/key-valve.ts', 'container/hermes.pin', 'container/build-hermes.sh',
      '.github/workflows/ci.yml', '.github/workflows/land.yml']) {
      expect(existsSync(join(dir, f))).toBe(true);
    }
    expect(out.written.length).toBeGreaterThan(20);
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');
    expect(readme.startsWith('# todo-cli\n')).toBe(true);
    expect(readme.includes('open-autonomy.org/v1/accounts/cookbook%2Ftodo-cli/runway.svg')).toBe(true);
    expect(readme.includes('__')).toBe(false);
    expect(readFileSync(join(dir, '.open-autonomy/config.yaml'), 'utf8').includes('account: cookbook/todo-cli')).toBe(true);
    expect(readKit(dir)).toEqual({ kit: 'hermes', version: KIT.version, params, divergences: [] });
    // The model and the license are the project's, never the kit's.
    expect(isOwned('hermes/config.yaml')).toBe(false);
    expect(isOwned('LICENSE')).toBe(false);
    expect(isOwned('hermes/SOUL.md')).toBe(true);
    expect(isOwned('.open-autonomy/sdk/client.ts')).toBe(true);
    expect(() => create(dir, params)).toThrow(/not empty/);
  });

  test('a generated repo passes its own check from a bare directory', () => {
    const dir = tmp();
    create(dir, params);
    const r = Bun.spawnSync({ cmd: ['bun', 'run', 'check'], cwd: dir, stdout: 'pipe', stderr: 'pipe' });
    expect(r.exitCode).toBe(0);
    // Its reporter and key tool typecheck against the vendored SDK alone (no reference to this monorepo).
    for (const f of ['.open-autonomy/mint-key.ts', '.open-autonomy/sdk/client.ts', '.open-autonomy/sdk/roadmap.ts', 'container/key-valve.ts']) {
      expect(readFileSync(join(dir, f), 'utf8').includes('packages/')).toBe(false);
    }
  });

  test('adopt writes only what is missing; check and upgrade keep the kit-owned files current', () => {
    const dir = tmp();
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'README.md'), '# mine\n');
    writeFileSync(join(dir, 'package.json'), '{"name":"mine","scripts":{"check":"bun test"}}\n');
    const out = adopt(dir, params);
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe('# mine\n');
    expect(out.skipped).toContain('README.md');
    expect(existsSync(join(dir, 'hermes/SOUL.md'))).toBe(true);
    expect(check(dir).drift).toEqual([]);
    // A kit-owned file edited in place drifts; a seeded one does not.
    writeFileSync(join(dir, 'hermes/SOUL.md'), 'You are someone else.\n');
    writeFileSync(join(dir, 'hermes/config.yaml'), 'model:\n  default: something/else\n');
    expect(check(dir).drift).toEqual(['hermes/SOUL.md: differs from the kit']);
    const up = upgrade(dir);
    expect(up.written).toContain('hermes/SOUL.md');
    expect(readFileSync(join(dir, 'hermes/SOUL.md'), 'utf8')).toBe(render(params).get('hermes/SOUL.md')!.toString('utf8'));
    expect(readFileSync(join(dir, 'hermes/config.yaml'), 'utf8')).toBe('model:\n  default: something/else\n');
    expect(check(dir).drift).toEqual([]);
    // A file the project takes over is named in kit.json and left alone.
    const rec = readKit(dir);
    writeFileSync(join(dir, '.open-autonomy/kit.json'), JSON.stringify({ ...rec, divergences: ['hermes/SOUL.md'] }));
    writeFileSync(join(dir, 'hermes/SOUL.md'), 'You are someone else.\n');
    expect(check(dir).drift).toEqual([]);
    upgrade(dir);
    expect(readFileSync(join(dir, 'hermes/SOUL.md'), 'utf8')).toBe('You are someone else.\n');
    expect(readKit(dir).divergences).toEqual(['hermes/SOUL.md']);
  });
});
