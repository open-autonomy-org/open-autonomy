// create-open-autonomy fleet: several projects together on one executor (base/.open-autonomy/fleet.ts). Writes the
// fleet's runtime directory — its definition, World's executor definition with one volume per checkout — creates the
// volumes once when asked, and prints the two commands: World up, then the host start. It never starts anything and
// writes no service unit: a fleet starts by an explicit command.
//
//   create-open-autonomy fleet <runtime-dir> --name <fleet> --image <image> --project owner/repo=<origin> [--project …]
//                              [--provider colima:<profile>] [--docker-host <url>] [--memory 3g] [--cpus 2] [--prepare-volumes]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function fleet(dir: string, opts: { name: string; image: string; projects: string[]; provider?: string; dockerHost?: string; memory?: string; cpus?: string; prepareVolumes: boolean }): void {
  const say = (m: string) => console.log(m);
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/.test(opts.name)) throw new Error('--name: lowercase letters, digits, - and _');
  if (!/^[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9._-]+)?(?:@sha256:[a-f0-9]{64})?$/.test(opts.image)) throw new Error('--image: an image reference');
  const projects = opts.projects.map((p) => {
    const i = p.indexOf('=');
    const account = i > 0 ? p.slice(0, i) : '', origin = i > 0 ? p.slice(i + 1) : '';
    if (!/^[\w.-]+\/[\w.-]+$/.test(account) || !/^(https?:\/\/|git@)[\w.@:/-]+$/.test(origin)) throw new Error(`--project ${p}: owner/repo=<https or ssh origin>`);
    const name = account.split('/')[1].toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) throw new Error(`${account}: the repository name is not a Hermes profile id`);
    return { account, origin, name };
  });
  if (!projects.length) throw new Error('at least one --project owner/repo=<origin>');
  const dup = projects.map((p) => p.name).find((n, i, a) => a.indexOf(n) !== i);
  if (dup) throw new Error(`two projects claim the profile ${dup}`);
  const container = `oa-fleet-${opts.name}`;
  const mounts = [`${container}-home=/opt/data`, ...projects.map((p) => `${container}-${p.name}=/work/${p.name}`)];
  const runtimeDir = resolve(dir);
  mkdirSync(runtimeDir, { recursive: true });
  const dockerEnv = { ...process.env, ...(opts.dockerHost ? { DOCKER_HOST: opts.dockerHost } : {}) };
  const docker = (args: string[]) => spawnSync('docker', args, { encoding: 'utf8', timeout: 30_000, env: dockerEnv });
  for (const m of mounts) {
    const v = m.split('=')[0];
    const have = docker(['volume', 'inspect', '--format', '{{.Name}}', v]).status === 0;
    if (have) say(`volume ${v}: present`);
    else if (opts.prepareVolumes) { const r = docker(['volume', 'create', v]); if (r.status !== 0) throw new Error(`volume ${v}: ${r.stderr.trim()}`); say(`volume ${v}: created`); }
    else say(`volume ${v}: missing; --prepare-volumes creates it once`);
  }
  writeFileSync(join(runtimeDir, 'fleet.json'), `${JSON.stringify({ container, projects: projects.map(({ account, origin }) => ({ account, origin })) }, null, 2)}\n`);
  const executor = resolve(import.meta.dir, '..', 'base', 'container', 'executor.ts');
  // What the host writes for this World is the reporters' state and World's bookkeeping; the home and checkouts are
  // Docker volumes on the engine's disk. The bound names the host's need, as the project runtime's does.
  const world = { id: `${opts.name}-fleet`, description: `The ${opts.name} fleet: one executor, ${projects.length} project(s)`, stripEnv: ['HERMES_*', 'OPENAI_*'], resources: { memoryMiB: 3072, writableStorageMiB: 2048 },
    services: [{ id: 'executor', type: 'external', external: { up: ['bun', executor, 'up'], status: ['bun', executor, 'status'], down: ['bun', executor, 'down'] } }],
    env: { OA_EXECUTOR_CONTAINER: container, OA_EXECUTOR_IMAGE: opts.image, OA_EXECUTOR_VOLUMES: mounts.join(','), OA_EXECUTOR_MEMORY: opts.memory ?? '3g', OA_EXECUTOR_CPUS: opts.cpus ?? '2',
      ...(opts.provider ? { OA_EXECUTOR_PROVIDER: opts.provider } : {}), ...(opts.dockerHost ? { DOCKER_HOST: opts.dockerHost } : {}) } };
  writeFileSync(join(runtimeDir, 'world.json'), `${JSON.stringify(world, null, 2)}\n`);
  if (!existsSync(join(runtimeDir, 'world.env'))) writeFileSync(join(runtimeDir, 'world.env'), '');
  const start = resolve(import.meta.dir, '..', 'base', '.open-autonomy', 'start.ts');
  say(`fleet ${opts.name}: ${runtimeDir}\n  definition: ${join(runtimeDir, 'fleet.json')} (${projects.map((p) => p.account).join(', ')})\n  world: ${join(runtimeDir, 'world.json')} (executor ${container} on ${opts.image}; ${mounts.length} volumes)\n` +
    `  up:    bun <twin-world cli> up ${join(runtimeDir, 'world.json')} --env-file ${join(runtimeDir, 'world.env')} --root <world root>\n` +
    `  start: bun ${start} --fleet ${join(runtimeDir, 'fleet.json')} --valve 8787\n  down:  the World's down; nothing starts this fleet but these two commands`);
}
