// The executor's lifecycle, as World calls it: `up`, `status`, `down`. One container, native Hermes inside, on
// volumes that outlive it: the home and the checkout. World owns when this runs; this owns what it touches, and
// remembers it in an ownership receipt beside World's instance data so `down` retires exactly what `up` made and
// nothing else. It never creates the volumes or the image: an empty home would be a new agent with the old name.
// `create-open-autonomy runtime` prepares those once; this refuses to start without them.
//
// Everything it needs arrives in World's environment (world.json `env`):
//   OA_EXECUTOR_CONTAINER   the container's name (oa-<project>)
//   OA_EXECUTOR_IMAGE       the image the runtime built (<project>-agent:local)
//   OA_EXECUTOR_VOLUMES     the home and checkout volumes, comma-separated (oa-<project>-home,oa-<project>-checkout)
//   OA_EXECUTOR_PROVIDER    optional: a provider to resume before Docker answers (colima:<profile>)
//   OA_EXECUTOR_LIMITS      optional: memory,cpus,pids (1536m,2,256)
//   DOCKER_HOST / DOCKER_CONTEXT  which daemon, as Docker reads them
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const phase = process.argv[2];
if (!['up', 'status', 'down'].includes(phase ?? '')) throw new Error('expected up, status or down');
const env = (name: string, fallback?: string): string => { const v = process.env[name]?.trim(); if (v) return v; if (fallback !== undefined) return fallback; throw new Error(`${name} is required in the World definition`); };
const container = env('OA_EXECUTOR_CONTAINER');
const image = env('OA_EXECUTOR_IMAGE');
const volumes = env('OA_EXECUTOR_VOLUMES').split(',').map((v) => v.trim()).filter(Boolean);
const provider = process.env.OA_EXECUTOR_PROVIDER?.trim();
const [memory = '1536m', cpus = '2', pids = '256'] = env('OA_EXECUTOR_LIMITS', '1536m,2,256').split(',').map((v) => v.trim());
if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container) || volumes.length !== 2) throw new Error('The executor needs a container name and its two volumes');
const data = process.env.VOLTER_WORLD_DATA;
if (!data) throw new Error('World lifecycle context is required');
const LABEL = 'org.open-autonomy.executor';
const receiptPath = join(data, 'executor-ownership.json');
type Receipt = { token: string; containerId?: string; released?: boolean };
let receipt: Receipt | undefined = existsSync(receiptPath) ? (JSON.parse(readFileSync(receiptPath, 'utf8')) as Receipt) : undefined;
if (receipt && !/^[a-f0-9-]{36}$/.test(receipt.token ?? '')) throw new Error('executor ownership receipt is unreadable; reconcile it before World acts');
const save = () => { mkdirSync(data, { recursive: true }); writeFileSync(`${receiptPath}.tmp`, `${JSON.stringify(receipt)}\n`, { mode: 0o600 }); renameSync(`${receiptPath}.tmp`, receiptPath); };
const call = (command: string, args: string[], timeout = 30_000) => spawnSync(command, args, { encoding: 'utf8', timeout, env: process.env });
const must = (r: ReturnType<typeof call>, what: string): string => { if (r.status !== 0) throw new Error(`${what}: ${(r.stderr || r.error?.message || r.stdout || `exit ${r.status}`).trim()}`); return r.stdout.trim(); };
const docker = (args: string[], timeout?: number) => call('docker', args, timeout);

// The container this receipt owns, by its label and id; anything else with the name is not ours to touch.
function owned(): string | undefined {
  if (!receipt) return undefined;
  const ids = new Set(must(docker(['ps', '-a', '--no-trunc', '--filter', `label=${LABEL}=${receipt.token}`, '--format', '{{.ID}}']), 'ownership discovery').split(/\s+/).filter(Boolean));
  if (ids.size > 1) throw new Error('ambiguous executor ownership; refusing');
  const id = [...ids][0];
  if (!id) return undefined;
  if (receipt.containerId && receipt.containerId !== id) throw new Error('executor ownership mismatch; refusing');
  return id;
}

try {
  if (phase === 'up' && provider?.startsWith('colima:')) {
    const profile = provider.slice('colima:'.length);
    if (!existsSync(join(process.env.COLIMA_HOME || join(homedir(), '.colima'), profile, 'colima.yaml'))) throw new Error(`colima profile ${profile} is not configured; refusing to create one`);
    if (call('colima', ['--profile', profile, 'status']).status !== 0) {
      console.log(`resuming colima profile ${profile}`);
      must(call('colima', ['--profile', profile, 'start', '--activate=false', '--save-config=false', '--ssh-config=false'], 180_000), 'provider resume');
    }
  }
  if (phase === 'down' && (!receipt || receipt.released)) { console.log('nothing owned; volumes and image retained'); process.exit(0); }
  must(docker(['version', '--format', '{{.Server.Version}}']), 'Docker unavailable');
  if (phase === 'up') {
    for (const v of volumes) must(docker(['volume', 'inspect', '--format', '{{.Name}}', v]), `volume ${v} is missing; an empty home would be a new agent (create-open-autonomy runtime prepares it once)`);
    must(docker(['image', 'inspect', '--format', '{{.Id}}', image]), `image ${image} is missing; build it through the runtime's build definition`);
    if (must(docker(['ps', '-a', '--filter', `name=^/${container}$`, '--format', '{{.Names}}']), 'name lookup')) throw new Error(`${container} already exists; retire it through World before starting another`);
    if (receipt && !receipt.released) throw new Error('a prior executor is still owned; finish World teardown first');
    receipt = { token: randomUUID() };
    save();
    receipt.containerId = must(docker(['run', '--init', '--detach', '--rm', '--name', container, '--label', `${LABEL}=${receipt.token}`,
      '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', pids, '--memory', memory, '--cpus', cpus,
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=268435456',
      '--mount', `type=volume,source=${volumes[0]},target=/opt/data`, '--mount', `type=volume,source=${volumes[1]},target=/work/project`,
      image], 60_000), 'executor start');
    save();
    console.log(`${container} up on ${image}; home and checkout volumes retained`);
  } else if (phase === 'status') {
    if (!receipt || receipt.released) throw new Error('no owned executor');
    const id = owned();
    if (!id) throw new Error('owned executor is missing');
    if (must(docker(['inspect', '--format', '{{.State.Running}}|{{.Name}}', id]), 'status') !== `true|/${container}`) throw new Error('owned executor is stopped or renamed');
    console.log('true');
  } else {
    const id = owned();
    if (id) { must(docker(['stop', '--time', '15', id], 60_000), 'executor stop'); if (owned()) throw new Error('executor did not stop'); }
    receipt!.released = true;
    save();
    console.log('owned executor stopped; volumes and image retained');
  }
} catch (error) {
  console.error(`executor ${phase}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
