// create-open-autonomy fleet: several projects together on one executor (base/.open-autonomy/fleet.ts). Writes the
// fleet's runtime directory — its definition, World's executor definition with one volume per checkout — creates the
// volumes once when asked, and prints the two commands: World up, then the host start. It never starts anything and
// writes no service unit: a fleet starts by an explicit command.
//
//   create-open-autonomy fleet <runtime-dir> --name <fleet> --image <image> --project owner/repo=<origin> [--project …]
//                              [--provider colima:<profile>] [--docker-host <url>] [--memory 3g] [--cpus 2] [--prepare-volumes]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { KIT, readKit, upgrade } from './kit.ts';

// create-open-autonomy upgrade --fleet <fleet.json>: every project of a fleet onto this kit, from this kit. Each
// project is cloned fresh from its origin, upgraded (the same three-way merge as `upgrade`), committed and landed the
// way that repository lands changes: a `land/kit-<version>` branch where a landing workflow takes branches, main
// itself where none stands. A project whose merge leaves conflicts is not pushed; its clone stays for an agent to
// resolve. Returns whether every project is now on this kit.
export async function upgradeFleet(file: string): Promise<boolean> {
  const say = (m: string) => console.log(m);
  const def = JSON.parse(readFileSync(resolve(file), 'utf8')) as { projects?: Array<{ account: string; origin: string }> };
  if (!def.projects?.length) throw new Error(`${file}: no projects`);
  let all = true;
  for (const p of def.projects) {
    const dir = mkdtempSync(join(tmpdir(), `oa-upgrade-${p.account.split('/')[1]}-`));
    const git = (...args: string[]) => {
      const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', timeout: 300_000 });
      if (r.status !== 0) throw new Error(`${p.account}: git ${args[0]} failed: ${(r.stderr || r.stdout).trim()}`);
      return r.stdout.trim();
    };
    try {
      git('clone', '-q', '--depth', '1', p.origin, '.');
      const from = readKit(dir).version;
      if (from === KIT.version) { say(`${p.account}: at ${from}`); rmSync(dir, { recursive: true, force: true }); continue; }
      const u = await upgrade(dir);
      if (u.conflicts.length) {
        all = false;
        say(`${p.account}: ${from} → ${u.to} left ${u.conflicts.length} conflict(s) in ${dir} (${u.conflicts.join(', ')}); resolve, commit and land there`);
        continue;
      }
      git('add', '-A');
      git('commit', '-q', '-m', `kit-${u.to}: take the kit upgrade`);
      const branch = existsSync(join(dir, '.github/workflows/land.yml'));
      git('push', '-q', 'origin', branch ? `HEAD:refs/heads/land/kit-${u.to}` : 'HEAD:main');
      say(`${p.account}: ${from} → ${u.to}: ${u.written.length} taken whole, ${u.merged.length} merged, ${u.kept.length} kept, ${u.retired.length} retired; ${branch ? `pushed land/kit-${u.to} for its landing workflow` : 'landed on main'}`);
      for (const k of u.kept) say(`  kept: ${k}`);
      rmSync(dir, { recursive: true, force: true });
    } catch (e) {
      all = false;
      say(`${p.account}: ${(e as Error).message} (clone at ${dir})`);
    }
  }
  return all;
}

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
  // A checkout volume mounts at a path the image does not carry, so Docker leaves its root to root; the executor runs
  // with every capability dropped and cannot chown it. The volume is made the agent's once, here, from the image.
  if (opts.prepareVolumes) for (const m of mounts.slice(1)) {
    const [v, target] = m.split('=');
    const r = spawnSync('docker', ['run', '--rm', '--user', '0', '--entrypoint', 'sh', '--mount', `type=volume,source=${v},target=${target}`, opts.image, '-c', `chown hermes:hermes ${target}`], { encoding: 'utf8', timeout: 60_000, env: dockerEnv });
    if (r.status !== 0) throw new Error(`volume ${v}: cannot make it the agent's: ${r.stderr.trim()}`);
    say(`volume ${v}: the agent's`);
  }
  writeFileSync(join(runtimeDir, 'fleet.json'), `${JSON.stringify({ container, projects: projects.map(({ account, origin }) => ({ account, origin })) }, null, 2)}\n`);
  const executor = resolve(import.meta.dir, '..', 'base', 'container', 'executor.ts');
  // What the host writes for this World is the reporters' state and World's bookkeeping; the home and checkouts are
  // Docker volumes on the engine's disk. The bound names the host's need, as the project runtime's does.
  const memory = opts.memory ?? '3g';
  const memoryMiB = (() => { const m = /^(\d+)([kmg]?)$/.exec(memory); if (!m) throw new Error('--memory takes Docker\'s own value, e.g. 3g'); const n = Number(m[1]); return m[2] === 'g' ? n * 1024 : m[2] === 'k' ? Math.ceil(n / 1024) : m[2] === 'm' ? n : Math.ceil(n / 1048576); })();
  const world = { id: `${opts.name}-fleet`, description: `The ${opts.name} fleet: one executor, ${projects.length} project(s)`, stripEnv: ['HERMES_*', 'OPENAI_*'], resources: { memoryMiB, writableStorageMiB: 512 * (projects.length + 1) },
    services: [{ id: 'executor', type: 'external', external: { up: ['bun', executor, 'up'], status: ['bun', executor, 'status'], down: ['bun', executor, 'down'] } }],
    env: { OA_EXECUTOR_CONTAINER: container, OA_EXECUTOR_IMAGE: opts.image, OA_EXECUTOR_VOLUMES: mounts.join(','), OA_EXECUTOR_MEMORY: memory, OA_EXECUTOR_CPUS: opts.cpus ?? '2',
      ...(opts.provider ? { OA_EXECUTOR_PROVIDER: opts.provider } : {}), ...(opts.dockerHost ? { DOCKER_HOST: opts.dockerHost } : {}) } };
  writeFileSync(join(runtimeDir, 'world.json'), `${JSON.stringify(world, null, 2)}\n`);
  if (!existsSync(join(runtimeDir, 'world.env'))) writeFileSync(join(runtimeDir, 'world.env'), '');
  // The start runs from a rendered kit (a project's .open-autonomy/ carries kit.json and the installed host tools),
  // never from the kit's template: the organization's own checkout is the natural one.
  const start = '<a rendered project>/.open-autonomy/start.ts';
  say(`fleet ${opts.name}: ${runtimeDir}\n  definition: ${join(runtimeDir, 'fleet.json')} (${projects.map((p) => p.account).join(', ')})\n  world: ${join(runtimeDir, 'world.json')} (executor ${container} on ${opts.image}; ${mounts.length} volumes)\n` +
    `  up:    bun <twin-world cli> up ${join(runtimeDir, 'world.json')} --env-file ${join(runtimeDir, 'world.env')} --root <world root>\n` +
    `  start: bun ${start} --fleet ${join(runtimeDir, 'fleet.json')} --valve 8787\n  down:  the World's down; nothing starts this fleet but these two commands`);
}
