import { expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startContainerProcess, checkContainerGit } from '../src/container-process.ts';

test('the container lease closes on EOF and preserves native restart exit status', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-container-process-'));
  const path = process.env.PATH;
  // Exercise the actual in-container Python launcher without requiring a daemon
  // in unit tests. World acceptance separately exercises Docker's real stdin.
  writeFileSync(join(root, 'docker'), '#!/bin/sh\nshift 5\nexec "$@"\n');
  chmodSync(join(root, 'docker'), 0o700);
  process.env.PATH = `${root}:${path}`;
  const script = join(root, 'worker.ts');
  writeFileSync(script, `import {writeFileSync} from 'node:fs';
process.on('SIGUSR1',()=>process.exit(75));
process.on('SIGTERM',()=>{writeFileSync(${JSON.stringify(join(root, 'closed'))},'stopped');process.exit(0)});
writeFileSync(${JSON.stringify(join(root, 'ready'))},String(process.pid));
setInterval(()=>{},1000);`);
  async function ready() {
    for (let i = 0; i < 100 && !existsSync(join(root, 'ready')); i++) await Bun.sleep(20);
    expect(existsSync(join(root, 'ready'))).toBe(true);
  }
  let child: ReturnType<typeof startContainerProcess> | undefined;
  try {
    expect(() => startContainerProcess({ container: '--privileged', command: ['true'], cwd: root })).toThrow();
    child = startContainerProcess({ container: 'fixture', command: [process.execPath, script], cwd: root });
    await ready();
    const pid = Number(readFileSync(join(root, 'ready'), 'utf8'));
    await child.close();
    expect(await child.exited).toBe(0);
    expect(readFileSync(join(root, 'closed'), 'utf8')).toBe('stopped');
    expect(() => process.kill(pid, 0)).toThrow();
    rmSync(join(root, 'ready'));
    child = startContainerProcess({ container: 'fixture', command: [process.execPath, script], cwd: root });
    await ready(); child.restart();
    expect(await child.exited).toBe(75);
    rmSync(join(root, 'ready')); rmSync(join(root, 'closed'));
    const owner = join(root, 'owner.ts');
    writeFileSync(owner, `import {startContainerProcess} from ${JSON.stringify(new URL('../src/container-process.ts', import.meta.url).pathname)};
await startContainerProcess({container:'fixture',command:${JSON.stringify([process.execPath, script])},cwd:${JSON.stringify(root)}}).exited;`);
    const host = Bun.spawn([process.execPath, owner], { env: { ...process.env }, stdout: 'ignore', stderr: 'inherit' });
    try {
      await ready(); host.kill('SIGKILL'); await host.exited;
      for (let i = 0; i < 100 && !existsSync(join(root, 'closed')); i++) await Bun.sleep(20);
      expect(existsSync(join(root, 'closed'))).toBe(true);
    } finally { if (host.exitCode === null) host.kill('SIGKILL'); await host.exited; }

  } finally {
    await child?.close();
    process.env.PATH = path;
    rmSync(root, { recursive: true, force: true });
  }
});

test('Git readiness rejects missing mappings and a read-only App before allowing the prepared connection', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-git-readiness-'));
  const path = process.env.PATH;
  writeFileSync(join(root, 'docker'), '#!/bin/sh\nshift 4\nexec "$@"\n');
  chmodSync(join(root, 'docker'), 0o700);
  process.env.PATH = `${root}:${path}`;
  let writable = false, calls = 0;
  const valve = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(req) {
    calls++;
    expect(req.method).toBe('GET'); // Verification never submits a pack or changes a ref.
    const service = new URL(req.url).searchParams.get('service');
    if (service === 'git-receive-pack' && !writable) return new Response('Contents: write required', { status: 403 });
    return new Response(`001f# service=${service}\n0000`, { headers: { 'content-type': `application/x-${service}-advertisement` } });
  } });
  const options = { container: 'fixture', home: root, workspace: root, account: 'owner/project', baseUrl: valve.url.origin };
  const git = (...args: string[]) => {
    const result = Bun.spawnSync([Bun.which('git')!, '-C', root, ...args], { stdout: 'ignore', stderr: 'ignore' });
    expect(result.exitCode).toBe(0);
  };
  try {
    git('init', '-q'); git('remote', 'add', 'origin', 'https://github.com/owner/project.git');
    await expect(checkContainerGit(options)).rejects.toThrow('Project Git is not ready');
    expect(calls).toBe(0);
    git('config', `url.${valve.url.origin}/owner/project.insteadOf`, 'https://github.com/owner/project');
    await expect(checkContainerGit(options)).rejects.toThrow('Contents: write');
    expect(calls).toBe(2);
    writable = true;
    git('remote', 'set-url', '--push', 'origin', 'https://github.com/other/project.git');
    await expect(checkContainerGit(options)).rejects.toThrow('Project Git is not ready');
    expect(calls).toBe(2);
    git('remote', 'set-url', '--push', 'origin', 'https://github.com/owner/project.git');
    await checkContainerGit(options);
    expect(calls).toBe(4);
    git('config', '--add', 'remote.origin.pushurl', 'https://github.com/other/project.git');
    await expect(checkContainerGit(options)).rejects.toThrow('Project Git is not ready');
    expect(calls).toBe(4);
  } finally { valve.stop(true); process.env.PATH = path; rmSync(root, { recursive: true, force: true }); }
});
