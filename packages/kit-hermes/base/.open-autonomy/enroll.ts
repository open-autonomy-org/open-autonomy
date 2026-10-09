#!/usr/bin/env bun
// The install's enrollment on this machine: what Teams and the machine daemon are told about this install, as one-shot
// acts that are idempotent, run by the deployer pass (`maintain.ts restart`): full enrollment per revision, and health
// subscription reconciliation on every subsequent pass, after the
// start has rendered the home whose profile folders the agents run in; never by the keeper (start.ts), which only starts
// and stops processes. By hand: `bun .open-autonomy/enroll.ts` after a first start (SETUP.md).
//   - The checkout in this machine's workspace map, so the board's cards on the install's own repository
//     (`worktree:<owner>/<repo>`) get their solo worktrees from it (supercode docs/guides/teams.md, machine workspace maps).
//   - Each mail agent's profile folder, a sync root of this machine's Teams connector with its rule (`teams connect --cwd
//     FOLDER --add-root`), so the sessions it runs there reach Teams wherever the install's layout puts its home: its
//     Room reads the agent's session from there (supercode docs/guides/teams.md).
//   - Each mail agent of .open-autonomy/agent.json (supercode docs/adr/0008): declared, its main session opened once in a
//     pane on this machine and kept across runs (`agent declare --open`).
//   - An agent explicitly requesting `every_machine`: its instance on each other machine Teams reports online, opened
//     once by its launch key; that session declares itself its machine's agent of that name.
//   - An agent with `health_alarms`: subscribed, by its retained host agent address, to the machine-health
//     alarms of this machine and of each other machine Teams reports online (`teams health subscribe --machine`), so a
//     failure a machine's own records show reaches the same main session (supercode sdk/health).
// Each native act belongs to Teams or its machine daemon. The install only submits its declarations and subscriptions.
//
//   bun .open-autonomy/enroll.ts [--project <dir>] [--home <dir>] [--health-only]
// --health-only reads existing native declarations and retries fleet subscriptions; it opens no sessions or sync roots.
// OPEN_AUTONOMY_SUPERCODE_BIN names another supercode build (a review or a World), as it does for the start.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { agentHarness, readAgent } from './agent.ts';
import { supercodeBin as machineSupercode } from './machine-supercode.ts';

const argv = process.argv.slice(2);
const healthOnly = argv.includes('--health-only');
const arg = (name: string): string | undefined => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const project = resolve(arg('--project') ?? resolve(import.meta.dir, '..'));
const account = /^account:\s*(\S+)/m.exec(existsSync(resolve(project, '.open-autonomy', 'config.yaml')) ? readFileSync(resolve(project, '.open-autonomy', 'config.yaml'), 'utf8') : '')?.[1];
const home = resolve(arg('--home') ?? process.env.AGENT_HOME ?? resolve(homedir(), '.local', 'state', 'open-autonomy', ...(account ?? basename(project)).split('/'), 'home'));
// The host's installed release, or an explicitly named candidate inside a review World.
const supercodeBin = machineSupercode();
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
/** `target` is strictly inside `base` (both real paths): a relative path with no leading `..`, and not absolute (another
 *  drive on Windows). */
const within = (base: string, target: string): boolean => { const rel = relative(base, target); return rel !== '' && rel.split(sep)[0] !== '..' && !isAbsolute(rel); };

let failed = 0;
if (!healthOnly && agentHarness(setup) !== 'hermes') {
  const registered = await run([supercodeBin, 'teams', 'workspace', 'register', project], project);
  say(registered.ok ? `the checkout ${project} is in this machine's workspace map` : `the checkout is not in this machine's workspace map: ${last(registered.err)}`);
  if (!registered.ok) failed++;
}
for (const [name, mailAgent] of Object.entries(setup.agents ?? {})) {
  if (healthOnly && !mailAgent.health_alarms) continue;
  let declared: { ok: boolean; out: string; err: string };
  let real = home;
  if (healthOnly) {
    const shown = await run([supercodeBin, 'agent', 'show', name, '--json'], project);
    let address: string | undefined;
    try {
      const agent = (JSON.parse(shown.out) as Array<{ name?: string; main_session?: string }>).find((a) => a.name === name);
      const host = /^sc:([^:\s]+):[^:]+:.+$/.exec(agent?.main_session ?? '')?.[1];
      if (host) address = `sc:${host}:agent:${name}`;
    } catch { /* An absent or malformed declaration cannot be inferred from this machine's name. */ }
    declared = { ok: shown.ok && !!address, out: address ?? '', err: shown.err || 'no declared main session address' };
  } else {
    const folder = resolve(home, 'profiles', mailAgent.profile);
    if (!existsSync(folder)) { say(`agent ${name}: no ${folder}; the start renders the home first (a lane that does not run ${mailAgent.profile} has none)`); continue; }
    // The agent's folder by its real path, and only one inside the home's own profiles folder, itself inside the home
    // (both by their real paths): a profile, or profiles/ itself, that links somewhere else would make that folder, and
    // every session ever recorded there, this machine's to share. That one path is what is registered, declared and
    // opened, so the agent runs exactly in the folder that was registered.
    const homeReal = realpathSync(home);
    const profilesReal = realpathSync(resolve(home, 'profiles'));
    real = realpathSync(folder);
    if (!within(homeReal, profilesReal) || !within(profilesReal, real)) {
      say(`agent ${name}: ${folder} is refused: its real path ${real} is not inside the home's profiles folder ${resolve(homeReal, 'profiles')} (real path ${profilesReal})`);
      failed++;
      continue;
    }
    if (agentHarness(setup) !== 'hermes') {
      // The folder is this install's own layout, so it is registered from here on every run (idempotent): a home that
      // moves takes its root along at the next enrollment, and none is ever left to be added by hand.
      const harness = (mailAgent.program ?? 'claude') === 'codex' ? 'codex' : 'claude-code';
      // A foreground connector can already own this exact root and rule. Read those native records first: adding a
      // root is an installed-connector door; an existing root needs no service installation or restart.
      const roots = await run([supercodeBin, 'teams', 'roots', '--json'], real);
      let rootId: string | undefined;
      let rule: string | undefined;
      try {
        if (!roots.ok) throw new Error(`roots door failed: ${last(roots.err)}`);
        const items = JSON.parse(roots.out).data?.items;
        if (!Array.isArray(items) || !items.every((r) => r && typeof r.id === 'string' && r.id
          && typeof r.path === 'string' && r.path && Array.isArray(r.harnesses)
          && r.harnesses.every((h: unknown) => typeof h === 'string')))
          throw new Error('unsupported roots response; expected data.items with native root records');
        rootId = items.find((r) => r.path === real && r.harnesses.includes(harness))?.id;
        if (rootId) {
          const rules = await run([supercodeBin, 'teams', 'sync', 'list', '--json'], real);
          if (!rules.ok) throw new Error(`sync list door failed: ${last(rules.err)}`);
          const items = JSON.parse(rules.out).items;
          if (!Array.isArray(items) || !items.every((r) => r && typeof r.id === 'string' && r.id
            && typeof r.state === 'string' && r.selector && typeof r.selector === 'object'
            && !Array.isArray(r.selector) && (r.backfill === undefined || (r.backfill
              && typeof r.backfill === 'object' && !Array.isArray(r.backfill) && typeof r.backfill.mode === 'string'))
            && (r.selector.root_id === undefined || typeof r.selector.root_id === 'string')
            && (r.selector.harnesses === undefined || (Array.isArray(r.selector.harnesses)
              && r.selector.harnesses.every((h: unknown) => typeof h === 'string')))))
            throw new Error('unsupported sync response; expected items with native sync records');
          rule = items.find((r) => r.state === 'active' && r.selector.root_id === rootId
            && r.selector.harnesses?.length === 1 && r.selector.harnesses[0] === harness
            && r.backfill?.mode === 'all')?.id;
        }
      } catch (error) {
        // Unknown is not absent. Do not mutate roots, add a sync rule or open an agent on an unread capture state.
        say(`agent ${name}: sync capture is unknown (${String(error)}); no add-root or declaration attempted`);
        failed++;
        continue;
      }
      const rooted = rule ? { ok: true, out: '', err: '' }
        : await run([supercodeBin, 'teams', 'connect', '--cwd', real, '--add-root', '--harness', harness, '--backfill', 'all', '--json'], real);
      if (!rule && rooted.ok) { try { rule = JSON.parse(rooted.out).data?.rule?.id; } catch { /* No native rule receipt. */ } }
      // No rule is no capture (a machine context adds none; its custodian does): a failure, said and counted, so a run
      // never reads as enrolled while the agent's sessions stay off Teams.
      say(rule ? `agent ${name}: ${real} is a Teams sync root of this machine (${harness}; ${rule})`
        : rooted.ok ? `agent ${name}: ${real} is a root of this machine, but no sync rule selects it, so its sessions do not reach Teams (a machine context: its custodian adds the rule)`
        : `agent ${name}: ${real} is not a Teams sync root, so its sessions do not reach Teams: ${last(rooted.err)}`);
      if (!rule) failed++;
    }
    declared = await run([supercodeBin, 'agent', 'declare', name, '--open', mailAgent.program ?? 'claude', '--folder', real,
      '--input', `You are the main session of agent ${name}. Your profile is ${resolve(real, 'AGENTS.md')}: read it now and act as it. Roots addressed to ${name} reach you.`,
      ...(mailAgent.program ? ['--harness', mailAgent.program] : []),
      ...(mailAgent.idle_minutes ? ['--idle-minutes', String(mailAgent.idle_minutes)] : []),
      ...(mailAgent.owners_account_manager ? ['--owners-account-manager'] : [])], real);
  }
  if (!declared.ok) { say(`agent ${name} not declared: ${declared.err}`); failed++; continue; }
  say(declared.out);
  if (!mailAgent.every_machine && !mailAgent.health_alarms) continue;
  const listed = await run([supercodeBin, 'teams', 'machines', 'list', '--json'], real);
  // this machine, as the declaration just named it (sc:<machine>:agent:<name>)
  const here = /sc:([^:\s]+):agent:/.exec(declared.out)?.[1];
  // Only machines Teams reports online: an enrollment whose machine is gone (an old VM, a retired box) would refuse the
  // open and spend the server's rate limit on every run.
  const enrolled = listed.ok ? (JSON.parse(listed.out || '{}').items ?? []) as Array<{ name?: string; connection?: string }> : [];
  // This host under any of its enrolled names, with or without the local DNS suffix.
  const same = (machine: string) => machine.toLowerCase().replace(/\.local$/, '') === String(here ?? '').toLowerCase().replace(/\.local$/, '');
  const machines = enrolled.filter((m) => m.connection === 'online').map((m) => m.name).filter((m): m is string => !!m && !same(m));
  const offline = enrolled.filter((m) => m.connection !== 'online' && m.name && !same(m.name)).map((m) => m.name);
  if (offline.length) say(`agent ${name}: not reached on ${offline.length} offline machine(s) (${offline.join(', ')}); each is reached at a run that finds it online`);
  if (!listed.ok) { say(`agent ${name}: no enrolled machines read (${last(listed.err)}); this machine's is the only one reached`); failed++; }
  if (mailAgent.health_alarms) {
    // The agent's address by this machine's name, which its mailbox resolves to its main session wherever the alarm is
    // filed: mail filed for another machine waits there until the mail watch carries it here. Idempotent: a subscription
    // already held is held once.
    const address = here ? `sc:${here}:agent:${name}` : null;
    if (!address) { say(`agent ${name}: its declaration named no machine, so it is subscribed to no machine's health alarms`); failed++; }
    else for (const machine of [null, ...machines]) {
      const subscribed = await run([supercodeBin, 'teams', 'health', 'subscribe', address, ...(machine ? ['--machine', machine] : [])], real);
      say(subscribed.ok ? `agent ${name}: subscribed to ${machine ?? 'this machine'}'s health alarms` : `agent ${name}: not subscribed to ${machine ?? 'this machine'}'s health alarms: ${last(subscribed.err)}`);
      if (!subscribed.ok) failed++;
    }
  }
  if (healthOnly || !mailAgent.every_machine) continue;
  for (const machine of machines) {
    const opened = await run([supercodeBin, 'open', '--on', machine, '--new', mailAgent.program ?? 'claude', '--key', `agent-${name}`, '--cwd', real, '--detach',
      '--input', `You are agent ${name}'s instance on machine ${machine}. Your profile is ${resolve(real, 'AGENTS.md')}: read it now and act as it. First declare yourself this machine's ${name}: supercode agent declare ${name} --main <your own session id> --folder ${real}.`], real);
    say(opened.ok ? `agent ${name} on ${machine}: ${last(opened.out)}` : `agent ${name} not opened on ${machine}: ${last(opened.err)}`);
    if (!opened.ok) failed++;
  }
}
process.exit(failed ? 1 : 0);
