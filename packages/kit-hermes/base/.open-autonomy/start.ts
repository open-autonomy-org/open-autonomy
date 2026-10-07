#!/usr/bin/env bun
// The install's start: what launchd, systemd or Docker runs. The keeper itself, which starts and stops this install's
// processes, is the kit's code, consumed from the kit package this directory installs (create-open-autonomy's
// keeper/start.ts) and never a copy in the project, so every install runs the keeper its pinned kit version ships.
// This file only finds the keeper. On a first boot, when the package is not installed yet, it installs this
// directory's dependencies first. After that the keeper keeps them current.
//
//   bun .open-autonomy/start.ts [--home <dir>] [--secrets <dir>] [--project <dir>] [--origin <url>] [--valve <port>]
//   bun .open-autonomy/start.ts --container <name> | --fleet <fleet.json>
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { installHostRuntime, runtimeInstallIdentity } from './install-runtime.ts';

const keeper = resolve(import.meta.dir, 'node_modules', 'create-open-autonomy', 'keeper', 'start.ts');
if (!existsSync(keeper)) {
  const argv = process.argv.slice(2);
  const arg = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  // A start that drops privileges (--as) must not install as root what the agent's user then runs.
  if (arg('--as')) { console.error(`start: the kit's keeper is not installed in ${import.meta.dir}; install it as the agent's user first (bun .open-autonomy/install-runtime.ts). Nothing was started.`); process.exit(1); }
  // A committed lock pins the install. One git does not track is this host's scratch.
  const tracked = (file: string) => { try { execFileSync('git', ['ls-files', '--error-unmatch', relative(resolve(import.meta.dir, '..'), file)], { cwd: resolve(import.meta.dir, '..'), stdio: 'ignore' }); return true; } catch { return false; } };
  const lock = ['bun.lock', 'bun.lockb'].map((file) => resolve(import.meta.dir, file)).some((file) => existsSync(file) && tracked(file));
  const options = { directory: import.meta.dir, registry: arg('--runtime-registry'), archive: arg('--runtime-package') };
  // The install is a child this start waits on, so a stop signal reaches it too, and this start exits once it has.
  let install: { kill(signal?: number | NodeJS.Signals): void } | undefined;
  let stopped = false;
  const stop = () => { stopped = true; install?.kill('SIGTERM'); };
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, stop);
  console.log(`start: the kit's keeper is not installed; installing ${import.meta.dir}'s dependencies`);
  try {
    await installHostRuntime({ ...options, environment: process.env as Record<string, string>, frozen: lock, started: (child) => { install = child; if (stopped) child.kill('SIGTERM'); } });
  } catch (error) {
    if (stopped) process.exit(0);
    console.error(`start: ${(error as Error).message}. Finalize the adopter-owned host lock inside its World with bun .open-autonomy/install-runtime.ts --update-lock, review/commit it, then retry. A committed lock stays frozen. Nothing was started.`);
    process.exit(1);
  }
  if (stopped) process.exit(0);
  await Bun.write(resolve(import.meta.dir, 'node_modules', '.open-autonomy-install'), `${runtimeInstallIdentity(options)}\n`);
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.off(signal, stop);
  if (!existsSync(keeper)) { console.error(`start: ${import.meta.dir}/package.json does not install the kit (create-open-autonomy), whose keeper this start runs. Nothing was started.`); process.exit(1); }
}
await import(keeper);
