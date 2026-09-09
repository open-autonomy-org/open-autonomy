import { expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startContainerProcess } from '../src/container-process.ts';

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
