#!/usr/bin/env bun
// A supercode machine daemon of the World's own: its panes (the mail agents' main and thread sessions) run under the
// World's HOME, so their mailboxes, agents and threads are the World's, never the host's. The daemon serves a socket;
// this service answers on its World port with what the daemon reported when it started, and stops the daemon with
// itself.
//
// With the World's Teams server (TEAMS_URL), the machine signs in and is enrolled under its name (`teams connect`), so
// the install reaches the World's other machines through it. A second machine (RFC 0022 row 6) is this script again
// with VO_MACHINE=<name>: its own HOME (so its own supercode home, as another machine has; a Claude session's tool shell
// drops a SUPERCODE_HOME override), tmux socket and machine file, with Claude's onboarding and settings the first
// machine's; the owner's bootstrap credential signs it in.
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { MACHINE } from './lib.ts';

const second = process.env.VO_MACHINE;
const name = second ?? MACHINE;
const firstHome = process.env.HOME!;
const home = second ? `${process.env.VOLTER_WORLD_DATA}/${second}/home` : firstHome;
if (second) {
  mkdirSync(`${home}/.claude`, { recursive: true });
  for (const file of ['.claude.json', '.claude/settings.json']) { rmSync(`${home}/${file}`, { force: true }); symlinkSync(`${firstHome}/${file}`, `${home}/${file}`); }
}
const supercodeHome = `${home}/.config/supercode`;
const socket = `vorg-${process.env.VO_WORLD_NAME}${second ? `-${second}` : ''}`;
// A machine may run its own supercode (VO_MACHINE_SUPERCODE_BIN, set per machine service by prepare.ts), as another box
// runs whatever release it installed; its panes find that binary first on PATH.
const own = process.env.VO_MACHINE_SUPERCODE_BIN;
const bin = own ?? process.env.VO_SUPERCODE_BIN!;
// The World's panes are headless: no terminal window opens on the owner's screen.
// Its own supercode runs its own Teams package (beside it, as an install's is), not the one the World names for the rest.
const { SUPERCODE_TEAMS_ENTRY: _teams, ...inherited } = process.env;
const env = { ...(own ? inherited : process.env), ...(own ? { SUPERCODE_BIN: own, PATH: `${dirname(own)}:${process.env.PATH}` } : {}), SUPERCODE_POPUP_TERMINAL: 'none', HOME: home, SUPERCODE_HOME: supercodeHome, ANTHROPIC_BASE_URL: process.env.ANTHROPIC_TWIN_URL!, ANTHROPIC_API_KEY: 'sk-twin', SUPERCODE_ORCHESTRATOR_ENTRY: process.env.VO_ORCHESTRATOR_BIN! , ...(process.env.TEAMS_URL && process.env.VO_HEALTH_ALARMS ? { SUPERCODE_HEALTH_ENTRY: `${process.env.VO_SUPERCODE_TREE}/sdk/health/bin/health.mjs` } : {}) };
const run = (cmd: string[], stdin?: string) => {
  const done = Bun.spawnSync({ cmd, env, stdin: stdin === undefined ? 'ignore' : new TextEncoder().encode(stdin), stdout: 'pipe', stderr: 'pipe' });
  if (done.exitCode !== 0) throw new Error(`${cmd.slice(1, 4).join(' ')}: ${done.stderr.toString().trim().split('\n').at(-1)}`);
};
const teams = process.env.TEAMS_URL;
if (teams) {
  // The owner's bootstrap credential, which the server wrote under the first machine's home.
  const owner = JSON.parse(readFileSync(`${firstHome}/.config/supercode/teams/server/bootstrap-credential.json`, 'utf8')).token as string;
  run([bin, 'teams', 'login', teams, '--team', 'Volter', '--as', 'volter', '--token-stdin'], owner);
  run([bin, 'context', 'use', 'volter']);
  // A second machine may be enrolled by a custodian of its own (VO_MACHINE_CUSTODIAN, a member the owner invites), as a
  // box someone else runs: the install then reaches it only through the grants that custodian's team gives it.
  const custodian = second ? process.env.VO_MACHINE_CUSTODIAN : undefined;
  if (custodian) {
    const invitation = `${supercodeHome}/${custodian}-invitation.json`;
    rmSync(invitation, { force: true });
    run([bin, 'teams', 'members', 'invite', custodian, '--out', invitation, '--context', 'volter']);
    run([bin, 'teams', 'login', teams, '--team', 'Volter', '--as', custodian, '--invite-stdin'], JSON.parse(readFileSync(invitation, 'utf8')).enrollment_code);
    rmSync(invitation, { force: true });
    run([bin, 'context', 'use', custodian]);
  }
  // The workplace a Room's DM reads a session from (the rehearsal RH2), trusted as the team admin trusts one: registered
  // with its exact issuer as a session integration and installed (supercode docs/guides/teams-apps.md).
  const rh2 = process.env.VO_RH2_URL;
  if (!second && rh2) {
    const issuer = new URL(rh2).origin;
    const file = (name: string, body: unknown) => { const at = `${home}/.config/supercode/${name}`; writeFileSync(at, JSON.stringify(body)); return at; };
    const registered = JSON.parse(Bun.spawnSync({ cmd: [bin, 'teams', 'apps', 'register', '--body-file', file('rh2-app.json', { name: 'RH2', description: 'The workplace: a Room\'s DM reads the session bound to it', actions: ['delegation.sessions'], event_kinds: [], redirect_urls: [`${issuer}/teams/callback`], issuer }), '--json'], env, stdout: 'pipe', stderr: 'pipe' }).stdout.toString() || '{}');
    const app = registered.data?.app?.id ?? registered.data?.id ?? registered.app?.id;
    if (!app) throw new Error(`registering RH2 as a session integration: ${JSON.stringify(registered).slice(0, 200)}`);
    run([bin, 'teams', 'apps', 'install', app, '--body-file', file('rh2-consent.json', { redirect_url: `${issuer}/teams/callback`, state: crypto.randomUUID(), actions: ['delegation.sessions'] }), '--json']);
    console.log(`machine: RH2 (${issuer}) is an installed session integration`);
  }
}
// The install's machine is connected from the install's profiles folder, so its agents' sessions (a mail agent's main,
// its threads) are in the team's catalog under the owner's sync rule, as the owner shares them; a session's view binding
// (an agent's DM in its Room) needs it there.
const shared = second ? undefined : `${home}/profiles`;
if (shared) mkdirSync(shared, { recursive: true });
// The machine-health pack (supercode sdk/health, the RFC 0022 probe): the connector runs it on an enrolled machine, and
// it mails this machine's maintainer agent alone. The World's alarm lines (VO_HEALTH_ALARMS) are its maintainer's
// config, in this machine's own supercode home.
if (teams && process.env.VO_HEALTH_ALARMS) {
  mkdirSync(`${supercodeHome}/health`, { recursive: true });
  const lines = JSON.parse(process.env.VO_HEALTH_ALARMS);
  // Both World machines share one physical box: the runaway's line is the first machine's, so only its maintainer acts.
  if (second) delete lines.alarms['process.cpu'];
  writeFileSync(`${supercodeHome}/health/config.json`, JSON.stringify({ maintainers: [`sc:${name}:agent:box-maintainer`], ...lines }, null, 2));
}
const daemon = Bun.spawn({
  ...(shared && teams ? { cwd: shared } : {}),
  cmd: teams
    ? [bin, 'teams', 'connect', '--name', name, '--foreground', '--tmux-socket', socket]
    : [bin, 'teams', 'machine', 'start', '--supercode', bin, '--tmux-socket', socket],
  env, stdout: 'pipe', stderr: 'inherit',
});
if (shared && teams) void (async () => {
  for (let i = 0; i < 60; i++) {
    const added = Bun.spawnSync({ cmd: [bin, 'teams', 'sync', 'add', '--repo', shared, '--harness', 'claude-code', '--visibility', 'restricted', '--backfill', 'all'], env, stdout: 'pipe', stderr: 'pipe' });
    if (added.exitCode === 0 || /already/i.test(added.stderr.toString())) { console.log(`machine: ${shared} is synced to the team`); return; }
    await Bun.sleep(2000);
  }
  console.error(`machine: the sync rule for ${shared} was not added`);
})();
let started = '';
(async () => { for await (const chunk of daemon.stdout) { const text = new TextDecoder().decode(chunk); started += text; process.stdout.write(text); } })();
Bun.serve({ port: Number(process.env.PORT), hostname: '127.0.0.1', fetch: () => (started ? new Response(started, { headers: { 'content-type': 'application/json' } }) : new Response('starting', { status: 503 })) });
// The World's stop takes the machine's panes with it: the daemon leaves its tmux server running (sessions outlive a
// daemon restart), and a stopped World owns nothing that still runs.
let stopping = false;
const stop = () => { stopping = true; daemon.kill('SIGTERM'); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
const code = await daemon.exited;
// The person's own outside terminal (operators/native.ts) runs on this World's first machine and stops with it.
if (stopping) for (const server of second ? [socket] : [socket, `${socket}-outside`]) Bun.spawnSync({ cmd: ['tmux', '-L', server, 'kill-server'], stdout: 'ignore', stderr: 'ignore' });
process.exit(code);
