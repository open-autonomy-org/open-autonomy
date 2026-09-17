// The executor's lifecycle, as World calls it: `up`, `status`, `down`. One container, native Hermes inside, on two
// volumes that outlive it: the agent's home and its checkout. It never creates the volumes or the image: an empty
// home would be a new agent with the old name. `create-open-autonomy runtime` prepares those once; this refuses to
// start without them. Everything it needs arrives in World's environment (world.json `env`):
//   OA_EXECUTOR_CONTAINER   the container's name (oa-<project>)
//   OA_EXECUTOR_IMAGE       the image the runtime built (<project>-agent:local)
//   OA_EXECUTOR_VOLUMES     the home and checkout volumes, comma-separated
//   OA_EXECUTOR_PROVIDER    optional: a provider to resume before Docker answers (colima:<profile>)
//   DOCKER_HOST             which daemon, as Docker reads it
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const phase = process.argv[2];
if (!['up', 'status', 'down'].includes(phase ?? '')) throw new Error('expected up, status or down');
const env = (name: string): string => { const v = process.env[name]?.trim(); if (!v) throw new Error(`${name} is required in the World definition`); return v; };
const container = env('OA_EXECUTOR_CONTAINER');
const image = env('OA_EXECUTOR_IMAGE');
const volumes = env('OA_EXECUTOR_VOLUMES').split(',').map((v) => v.trim()).filter(Boolean);
const provider = process.env.OA_EXECUTOR_PROVIDER?.trim();
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
if (!NAME.test(container) || volumes.length !== 2 || !volumes.every((v) => NAME.test(v))) throw new Error('The executor needs a container name and its two volumes');
if (!/^[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9._-]+)?(?:@sha256:[a-f0-9]{64})?$/.test(image)) throw new Error('The executor needs an image reference');
const call = (command: string, args: string[], timeout = 30_000) => spawnSync(command, args, { encoding: 'utf8', timeout, env: process.env });
const must = (r: ReturnType<typeof call>, what: string): string => { if (r.status !== 0) throw new Error(`${what}: ${(r.stderr || r.error?.message || r.stdout || `exit ${r.status}`).trim()}`); return r.stdout.trim(); };
const docker = (args: string[], timeout?: number) => call('docker', args, timeout);
const exists = (): boolean => Boolean(must(docker(['ps', '-a', '--filter', `name=^/${container}$`, '--format', '{{.Names}}']), 'lookup'));

try {
  if (phase === 'up' && provider?.startsWith('colima:')) {
    const profile = provider.slice('colima:'.length);
    if (!existsSync(join(process.env.COLIMA_HOME || join(homedir(), '.colima'), profile, 'colima.yaml'))) throw new Error(`colima profile ${profile} is not configured; refusing to create one`);
    if (call('colima', ['--profile', profile, 'status']).status !== 0) must(call('colima', ['--profile', profile, 'start', '--activate=false', '--save-config=false', '--ssh-config=false'], 180_000), 'provider resume');
  }
  must(docker(['version', '--format', '{{.Server.Version}}']), 'Docker unavailable');
  if (phase === 'up') {
    for (const v of volumes) must(docker(['volume', 'inspect', '--format', '{{.Name}}', v]), `volume ${v} is missing; an empty home would be a new agent (create-open-autonomy runtime --prepare-volumes makes it once)`);
    must(docker(['image', 'inspect', '--format', '{{.Id}}', image]), `image ${image} is missing; build it with the runtime's build definition`);
    if (exists()) throw new Error(`${container} already exists (a run World lost track of); stop it yourself with docker stop ${container}, then start again`);
    must(docker(['run', '--init', '--detach', '--rm', '--name', container,
      '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '256', '--memory', '1536m', '--cpus', '2',
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=268435456',
      '--mount', `type=volume,source=${volumes[0]},target=/opt/data`, '--mount', `type=volume,source=${volumes[1]},target=/work/project`,
      image], 60_000), 'executor start');
    console.log(`${container} up on ${image}; home and checkout volumes retained`);
  } else if (phase === 'status') {
    console.log(must(docker(['inspect', '--format', '{{.State.Running}}', container]), 'status'));
  } else if (exists()) {
    must(docker(['stop', '--time', '15', container], 60_000), 'executor stop');
    console.log(`${container} stopped; volumes and image retained`);
  } else console.log('nothing to stop; volumes and image retained');
} catch (error) {
  console.error(`executor ${phase}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
