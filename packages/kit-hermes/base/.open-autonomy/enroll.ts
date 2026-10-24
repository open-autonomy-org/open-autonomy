#!/usr/bin/env bun
// The install's enrollment on this machine: what Teams and the machine daemon are told about this install, as one-shot
// acts that are idempotent, run by the deployer pass (`maintain.ts restart`) once per revision the stack runs, after the
// start has rendered the home whose profile folders the agents run in; never by the keeper (start.ts), which only starts
// and stops processes. By hand: `bun .open-autonomy/enroll.ts` after a first start (SETUP.md).
//   - The checkout in this machine's workspace map, so the board's cards on the install's own repository
//     (`worktree:<owner>/<repo>`) get their solo worktrees from it (supercode docs/guides/teams.md, machine workspace maps).
//   - Each mail agent of .open-autonomy/agent.json (supercode docs/adr/0008): declared, its main session opened once in a
//     pane on this machine and kept across runs (`agent declare --open`).
//   - An agent with `every_machine` (the box maintainer): its instance on each other machine Teams reports online, opened
//     once by its launch key; that session declares itself its machine's agent of that name.
// Every one of these acts is Teams' or the daemon's to own (the board's decision record, D137 and D138 step 5: the daemon
// binds sessions to agents from the launch environment; Teams reconciles the machines). This tool goes when they do.
//
//   bun .open-autonomy/enroll.ts [--project <dir>] [--home <dir>]
// OPEN_AUTONOMY_SUPERCODE_BIN names another supercode build (a review or a World), as it does for the start.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, resolve } from 'node:path';
import { agentHarness, readAgent } from './agent.ts';

const argv = process.argv.slice(2);
const arg = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const project = resolve(arg('--project') ?? resolve(import.meta.dir, '..'));
const account = /^account:\s*(\S+)/m.exec(existsSync(resolve(project, '.open-autonomy', 'config.yaml')) ? readFileSync(resolve(project, '.open-autonomy', 'config.yaml'), 'utf8') : '')?.[1];
const home = resolve(arg('--home') ?? process.env.AGENT_HOME ?? resolve(homedir(), '.local', 'state', 'open-autonomy', ...(account ?? basename(project)).split('/'), 'home'));
const supercodeBin = process.env.OPEN_AUTONOMY_SUPERCODE_BIN || resolve(import.meta.dir, 'node_modules', '.bin', 'supercode');
const say = (m: string) => console.log(`enroll: ${m}`);
const setup = readAgent(project);
if (!setup) { console.error('enroll: no .open-autonomy/agent.json; nothing to enroll'); process.exit(1); }
const env: Record<string, string> = {};
for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith('HERMES_')) env[k] = v;
Object.assign(env, { PATH: `${resolve(import.meta.dir, 'node_modules', '.bin')}:${process.env.PATH ?? ''}`, SUPERCODE_BIN: supercodeBin });

// Each act is bounded: a door that does not answer reads as failed, and the next run tries again.
let child: ReturnType<typeof Bun.spawn> | undefined;
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, () => { child?.kill('SIGTERM'); process.exit(1); });
async function run(cmd: string[], cwd: string, boundMs = 120_000): Promise<{ ok: boolean; out: string; err: string }> {
  child = Bun.spawn({ cmd, cwd, env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  const proc = child;
  const bound = setTimeout(() => proc.kill('SIGTERM'), boundMs);
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  clearTimeout(bound);
  return { ok: code === 0, out: out.trim(), err: (proc.signalCode ? `${err}\nno answer within ${boundMs / 1000} s` : err).trim() };
}
const last = (text: string) => text.split('\n').at(-1) ?? '';

let failed = 0;
if (agentHarness(setup) !== 'hermes') {
  const registered = await run([supercodeBin, 'teams', 'workspace', 'register', project], project);
  say(registered.ok ? `the checkout ${project} is in this machine's workspace map` : `the checkout is not in this machine's workspace map: ${last(registered.err)}`);
  if (!registered.ok) failed++;
}
for (const [name, mailAgent] of Object.entries(setup.agents ?? {})) {
  const folder = resolve(home, 'profiles', mailAgent.profile);
  if (!existsSync(folder)) { say(`agent ${name}: no ${folder}; the start renders the home first (a lane that does not run ${mailAgent.profile} has none)`); continue; }
  const declared = await run([supercodeBin, 'agent', 'declare', name, '--open', mailAgent.program ?? 'claude', '--folder', folder,
    '--input', `You are the main session of agent ${name}. Your profile is ${resolve(folder, 'AGENTS.md')}: read it now and act as it. Roots addressed to ${name} reach you.`,
    ...(mailAgent.program ? ['--harness', mailAgent.program] : []),
    ...(mailAgent.idle_minutes ? ['--idle-minutes', String(mailAgent.idle_minutes)] : []),
    ...(mailAgent.owners_account_manager ? ['--owners-account-manager'] : [])], folder);
  if (!declared.ok) { say(`agent ${name} not declared: ${declared.err}`); failed++; continue; }
  say(declared.out);
  if (!mailAgent.every_machine) continue;
  const listed = await run([supercodeBin, 'teams', 'machines', 'list', '--json'], folder);
  // this machine, as the declaration just named it (sc:<machine>:agent:<name>)
  const here = /sc:([^:\s]+):agent:/.exec(declared.out)?.[1];
  // Only machines Teams reports online: an enrollment whose machine is gone (an old VM, a retired box) would refuse the
  // open and spend the server's rate limit on every run.
  const enrolled = listed.ok ? (JSON.parse(listed.out || '{}').items ?? []) as Array<{ name?: string; connection?: string }> : [];
  // This machine under any of the names Teams lists it by (`yuerans-macbook-pro`, `Yuerans-MacBook-Pro.local`).
  const same = (machine: string) => machine.toLowerCase().replace(/\.local$/, '') === String(here ?? '').toLowerCase().replace(/\.local$/, '');
  const machines = enrolled.filter((m) => m.connection === 'online').map((m) => m.name).filter((m): m is string => !!m && !same(m));
  const offline = enrolled.filter((m) => m.connection !== 'online' && m.name && !same(m.name)).map((m) => m.name);
  if (offline.length) say(`agent ${name}: not opened on ${offline.length} offline machine(s) (${offline.join(', ')}); each gets its instance at a run that finds it online`);
  if (!listed.ok) { say(`agent ${name}: no enrolled machines read (${last(listed.err)}); its instance is this machine's only`); failed++; }
  for (const machine of machines) {
    const opened = await run([supercodeBin, 'open', '--on', machine, '--new', mailAgent.program ?? 'claude', '--key', `agent-${name}`, '--cwd', folder, '--detach',
      '--input', `You are agent ${name}'s instance on machine ${machine}. Your profile is ${resolve(folder, 'AGENTS.md')}: read it now and act as it. First declare yourself this machine's ${name}: supercode agent declare ${name} --main <your own session id> --folder ${folder}.`], folder);
    say(opened.ok ? `agent ${name} on ${machine}: ${last(opened.out)}` : `agent ${name} not opened on ${machine}: ${last(opened.err)}`);
    if (!opened.ok) failed++;
  }
}
process.exit(failed ? 1 : 0);
