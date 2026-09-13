// create-open-autonomy runtime: the host runtime for a real installation, materialized from the checkout, so
// no installation hand-builds its own. The kit's container mode is one shape (container/README.md): World owns
// one executor whose lifecycle is the kit's `container/executor.ts`; the host runs `start.ts --container`
// (the valves, the reporter, the gateway supervision) as World's foreground command; the machine's service
// manager keeps that command alive. This verb writes exactly those files, outside the agent-writable checkout:
//
//   <runtime>/releases/kit-<rev>/    the kit at the checkout's HEAD (.open-autonomy and container/executor.ts),
//                                    its dependencies installed: the trusted host copy a changed checkout does not touch
//   <runtime>/world.json             the World definition: the executor service and its environment
//   <runtime>/build-world.json       the image build through World, against the reviewed checkout
//   <runtime>/state/                 the host reporter's state; <runtime>/world/ World's own state root
//   the launchd unit                 World `run` with the foreground command (a systemd unit when a Linux host exists)
//
//   create-open-autonomy runtime <dir> [--runtime <dir>] [--secrets <dir>] [--valve <port>] [--provider colima:<profile>]
//                                      [--docker-host <url>] [--prepare-volumes]
//
// Run it again after `upgrade` lands: a new release is cut and the unit points at it; the running service keeps
// the old release until the service manager restarts it (the commands are printed, never run). It creates the
// volumes only when asked (--prepare-volumes), once: an empty home is a new agent with the old name, and the
// executor refuses to start without them.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { KIT, check, readKit } from './kit.ts';

export interface RuntimeOpts { runtime?: string; secrets?: string; valve: number; provider?: string; dockerHost?: string; prepareVolumes: boolean }
const say = (m: string) => console.log(m);
const MARK = 'written by create-open-autonomy runtime';
const run = (cmd: string[], cwd?: string, timeout = 120_000) => spawnSync(cmd[0], cmd.slice(1), { cwd, encoding: 'utf8', timeout });
const ok = (r: ReturnType<typeof run>): boolean => r.status === 0;
const out = (r: ReturnType<typeof run>): string => (r.stdout ?? '').trim();

export function runtime(dir: string, opts: RuntimeOpts): void {
  if (platform() !== 'darwin') throw new Error('the runtime writes a launchd unit; a systemd unit comes with the first Linux host');
  const rec = readKit(dir);
  const { project, account } = rec.params;
  if (rec.version !== KIT.version) throw new Error(`${dir} is at kit ${rec.version}; run \`create-open-autonomy upgrade\` and land it before cutting a runtime release of ${KIT.version}`);
  const drift = check(dir).drift;
  if (drift.length) throw new Error(`the kit-owned files have drifted (${drift.length}); upgrade and land them first:\n  ${drift.join('\n  ')}`);
  // The host runs the kit's reviewed code. A file the project took over under .open-autonomy/ or container/ is the
  // project's, not the kit's, and does not enter the trusted release unseen: reconcile it with the kit first.
  const taken = rec.divergences.filter((d) => d.startsWith('.open-autonomy/') || d.startsWith('container/'));
  if (taken.length) throw new Error(`the project has taken over host files the runtime would ship (${taken.join(', ')}); reconcile them with the kit before cutting a release`);
  const rev = out(run(['git', 'rev-parse', 'HEAD'], dir));
  if (!/^[0-9a-f]{40}$/.test(rev)) throw new Error(`${dir} is not a git checkout at a commit`);
  if (out(run(['git', 'status', '--porcelain', '--', '.open-autonomy', 'container'], dir))) throw new Error('.open-autonomy or container/ has uncommitted changes; the runtime is cut from a landed revision');
  const home = homedir();
  // A unit this verb wrote is rewritten onto the new release; one made by hand is the operator's to move aside first.
  const unitPath = join(home, 'Library', 'LaunchAgents', `org.open-autonomy.${project}.plist`);
  if (existsSync(unitPath) && !readFileSync(unitPath, 'utf8').includes(MARK)) throw new Error(`${unitPath} exists and was not written by this verb; move it aside to let the kit own the service`);
  const runtimeDir = resolve(opts.runtime ?? join(home, '.local/state/open-autonomy', account, 'runtime'));
  const secrets = resolve(opts.secrets ?? join(home, '.config/open-autonomy', account));
  const root = join(runtimeDir, 'world');
  const container = `oa-${project}`;
  const image = `${project}-agent:local`;
  const volumes = [`${container}-home`, `${container}-checkout`];
  const dockerEnv = { ...process.env, ...(opts.dockerHost ? { DOCKER_HOST: opts.dockerHost } : {}) };
  const docker = (args: string[]) => spawnSync('docker', args, { encoding: 'utf8', timeout: 30_000, env: dockerEnv });
  for (const name of ['agent.env', 'treasurer.env', 'github-app.json']) if (!existsSync(join(secrets, name))) throw new Error(`${join(secrets, name)} is missing; the container runtime needs the platform keys and the project's GitHub App (setup prepares them)`);

  // ---- the release: the kit at this revision, dependencies installed ----
  const release = join(runtimeDir, 'releases', `kit-${rev.slice(0, 8)}`);
  const kitDir = join(release, '.open-autonomy');
  if (!existsSync(join(kitDir, 'start.ts'))) {
    mkdirSync(release, { recursive: true, mode: 0o750 });
    const archive = spawnSync('git', ['archive', 'HEAD', '.open-autonomy', 'container/executor.ts'], { cwd: dir, maxBuffer: 256 * 1024 * 1024 });
    if (archive.status !== 0) throw new Error(`could not archive the kit at ${rev.slice(0, 8)}: ${archive.stderr?.toString().trim()}`);
    const extract = spawnSync('tar', ['-x', '-C', release], { input: archive.stdout });
    if (extract.status !== 0) throw new Error(`could not extract the kit into ${release}: ${extract.stderr?.toString().trim()}`);
    const install = run(['bun', 'install', '--no-save'], kitDir, 300_000);
    if (!ok(install)) throw new Error(`bun install in ${kitDir} failed: ${(install.stderr ?? '').trim()}`);
    writeFileSync(join(release, 'source.json'), `${JSON.stringify({ repository: account, revision: rev, kit: KIT.version }, null, 2)}\n`);
    say(`release: ${release}`);
  } else say(`release: ${release} (already cut)`);
  const worldCli = join(dirname(Bun.resolveSync('@volter/twin-world/package.json', kitDir)), 'src', 'cli.ts');
  if (!existsSync(worldCli)) throw new Error('the release has no World CLI; its package.json must depend on @volter/twin-world');
  for (const d of [root, join(runtimeDir, 'state')]) mkdirSync(d, { recursive: true, mode: 0o700 });

  // ---- the executor's image and volumes ----
  if (!ok(docker(['version', '--format', '{{.Server.Version}}']))) say(`docker: not reachable${opts.dockerHost ? ` at ${opts.dockerHost}` : ''}; the checks below are skipped until it is`);
  else {
    if (!ok(docker(['image', 'inspect', '--format', '{{.Id}}', image]))) say(`image ${image}: missing; build it with the printed World command`);
    for (const v of volumes) {
      if (ok(docker(['volume', 'inspect', '--format', '{{.Name}}', v]))) continue;
      if (opts.prepareVolumes) { const c = docker(['volume', 'create', v]); if (!ok(c)) throw new Error(`could not create volume ${v}: ${(c.stderr ?? '').trim()}`); say(`volume ${v}: created, empty; clone the repository into the checkout volume as container/README.md says before loading the unit`); }
      else say(`volume ${v}: missing; --prepare-volumes creates it once`);
    }
  }
  {
    const build = { id: `${project}-image`, description: 'Build the executor image through World against the reviewed checkout; down releases the build reservation and keeps the image.', resources: { memoryMiB: 4096, writableStorageMiB: 16384 },
      services: [{ id: 'build', type: 'external', cwd: resolve(dir), external: { up: ['sh', '-c', `sh container/build-hermes.sh && docker build --target managed --file container/Dockerfile --tag ${image} .`], down: ['true'], status: ['docker', 'image', 'inspect', '--format', '{{.Id}}', image] } }],
      ...(opts.dockerHost ? { env: { DOCKER_HOST: opts.dockerHost } } : {}) };
    writeFileSync(join(runtimeDir, 'build-world.json'), `${JSON.stringify(build, null, 2)}\n`);
    say(`build: bun ${worldCli} up ${join(runtimeDir, 'build-world.json')} --root ${root}   (then doctor and down ${project}-image)`);
  }

  // ---- the World definition ----
  const executor = join(release, 'container', 'executor.ts');
  const world = { id: `${project}-runtime`, description: `${account}: native Hermes in one executor; the credential valves and the SDK reporter on this host as World's foreground command.`,
    stripEnv: ['HERMES_*', 'OPENAI_*'], resources: { memoryMiB: 3072, writableStorageMiB: 16384 },
    services: [{ id: 'executor', type: 'external', external: { up: ['bun', executor, 'up'], status: ['bun', executor, 'status'], down: ['bun', executor, 'down'] } }],
    env: { OA_EXECUTOR_CONTAINER: container, OA_EXECUTOR_IMAGE: image, OA_EXECUTOR_VOLUMES: volumes.join(','), ...(opts.provider ? { OA_EXECUTOR_PROVIDER: opts.provider } : {}), ...(opts.dockerHost ? { DOCKER_HOST: opts.dockerHost } : {}) } };
  writeFileSync(join(runtimeDir, 'world.json'), `${JSON.stringify(world, null, 2)}\n`);

  // ---- the service unit: World `run`, the host command in the foreground ----
  const bun = process.execPath;
  const command = [bun, worldCli, 'run', join(runtimeDir, 'world.json'), '--env-file', join(runtimeDir, 'world.env'), '--root', root, '--',
    bun, join(kitDir, 'start.ts'), '--container', container, '--state', join(runtimeDir, 'state'), '--secrets', secrets, '--config', join(kitDir, 'config.yaml'), '--valve', String(opts.valve)];
  const log = join(runtimeDir, 'service.log');
  const path = [dirname(bun), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
  const label = `org.open-autonomy.${project}`;
  const unit = unitPath;
  mkdirSync(dirname(unit), { recursive: true });
  const rewrite = existsSync(unit);
  const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  writeFileSync(unit, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><!-- ${MARK} --><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array>${command.map((a) => `<string>${xml(a)}</string>`).join('')}</array>
  <key>WorkingDirectory</key><string>${xml(runtimeDir)}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(path)}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>ExitTimeOut</key><integer>30</integer>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>
`, { mode: 0o644 });
  const load = [`launchctl bootout gui/$(id -u)/${label} 2>/dev/null; launchctl bootstrap gui/$(id -u) ${unit}`, `launchctl kickstart -k gui/$(id -u)/${label}   (a running service, onto the new release)`];
  say(`runtime: ${runtimeDir}\n  world: ${join(runtimeDir, 'world.json')} (executor ${container} on ${image}; volumes ${volumes.join(', ')}${opts.provider ? `; provider ${opts.provider}` : ''})\n  unit: ${unit}${rewrite ? ' (rewritten onto this release)' : ''}\n  valves: ${opts.valve}–${opts.valve + 3} on this host`);
  say(`start or move the service yourself (this verb never does):\n  ${load.join('\n  ')}\nThe agent reports what runs it (kit ${KIT.version}, this host, the executor image) on its page's Agent tab once up.`);
}
