#!/usr/bin/env bun
// The adoption story's operator: the person's own acts around a session the board did not start. The board's acts
// (the manager's adoption, supervision, review, close) are the board's and its agents' own.
//
//   world attach <name> --root <state> -- bun world/operators/native.ts start   # the held card and the outside session
//   world attach <name> --root <state> -- bun world/operators/native.ts ask     # the owner asks the manager to adopt it
//   world attach <name> --root <state> -- bun world/operators/native.ts work    # the person asks the session to work the card
//   world attach <name> --root <state> -- bun world/operators/native.ts end     # once the board let it go, the person ends it
//   world attach <name> --root <state> -- bun world/operators/native.ts show    # the card, its PR and the twin's merge state
//
// start: creates the story's card held (`--no-start`) on the World's first machine, checks out the card's branch in
// the worktree the board would make for it (`<checkout>/.worktrees/<card>` on `wt/<card>`), and starts Claude Code
// there in a terminal of the person's own (its own tmux server, `vorg-<world>-outside`, not the machine daemon's
// panes), with a session id it names. Its state is kept in the World's data (outside.json); the World's stop ends the
// outside terminal with the machine's own. ask: the owner's line to the manager, through the session service as
// world/owner.ts sends one, naming the session and the card.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADOPT_PHRASE, NATIVE_TITLE } from '../model/card.ts';
import { ACCOUNT, DATA, MACHINE, NAME, git, need } from '../lib.ts';

const bin = need('VO_SUPERCODE_BIN'), home = need('HOME'), project = need('VO_AGENT_PROJECT'), github = need('GITHUB_TWIN_URL');
const socket = `vorg-${NAME}-outside`, stateFile = resolve(DATA, 'outside.json');
const run = (cmd: string[], cwd?: string) => {
  const done = Bun.spawnSync({ cmd, cwd, stdout: 'pipe', stderr: 'pipe' });
  if (done.exitCode !== 0) throw new Error(`${cmd.slice(0, 3).join(' ')}: ${done.stderr.toString().trim().split('\n').at(-1)}`);
  return done.stdout.toString();
};
const workflow = (...args: string[]) => run([bin, 'workflow', ...args, '--root', home]);
const tmux = (...args: string[]) => run(['tmux', '-L', socket, ...args]);
/** The person types a line into the outside terminal: its text, then Enter on its own (a TUI takes a pasted Enter as text). */
const type = async (line: string) => { tmux('send-keys', '-t', 'outside', '-l', line); await Bun.sleep(400); tmux('send-keys', '-t', 'outside', 'Enter'); };
const state = () => JSON.parse(readFileSync(stateFile, 'utf8')) as { card: string; session: string; address: string; worktree: string };

const verb = process.argv[2];
if (verb === 'start') {
  if (existsSync(stateFile)) throw new Error(`the adoption story already started: ${readFileSync(stateFile, 'utf8')}`);
  const card = /t_[0-9a-f]+/.exec(workflow('create', NATIVE_TITLE, '--no-start', '--assignee', 'coder', '--machine', MACHINE, '--workspace', `worktree:${project}`,
    '--body', 'Add one line to REHEARSAL.md saying an adopted session worked one board card end to end, on a PR to main.'))?.[0];
  if (!card) throw new Error('no card id from workflow create');
  const worktree = resolve(project, '.worktrees', card);
  await git(project, 'worktree', 'add', '-q', '-b', `wt/${card}`, worktree, 'origin/main');
  // The person has trusted this folder before, as they trusted the install's own.
  const claudeJson = resolve(home, '.claude.json'), config = JSON.parse(readFileSync(claudeJson, 'utf8'));
  config.projects = { ...config.projects, [worktree]: { hasTrustDialogAccepted: true } };
  writeFileSync(claudeJson, `${JSON.stringify(config, null, 2)}\n`);
  const session = crypto.randomUUID(), address = `sc:${MACHINE}:claude-code:${session}`;
  tmux('new-session', '-d', '-s', 'outside', '-x', '160', '-y', '40', '-c', worktree, `claude --session-id ${session} --dangerously-skip-permissions`);
  writeFileSync(stateFile, `${JSON.stringify({ card, session, address, worktree, pid: Number(tmux('list-panes', '-F', '#{pane_pid}').trim()) })}\n`);
  // The person's opening line: a session is on its machine's record (its transcript) once it has had a turn.
  await Bun.sleep(5000);
  await type('Good morning. The manager will hand you a card.');
  console.log(`held card ${card}; outside session ${address} in ${worktree}`);
} else if (verb === 'ask') {
  const { card, address } = state();
  const { SupercodeHarnessClient } = await import(need('VO_SUPERCODE_SDK'));
  const client = new SupercodeHarnessClient({ command: bin });
  await client.messageSession({ harness: 'agent', session_id: 'manager' }, `${ADOPT_PHRASE} ${address} onto card ${card}: it works the card from here.`, { fromName: 'owner', senderName: 'Aaron', asUser: true });
  console.log(`the owner asked the manager to adopt ${address} onto ${card}`);
  await client.close?.();
  process.exit(0);
} else if (verb === 'work') {
  const { card } = state();
  await type(`Work card ${card}: ${NATIVE_TITLE}`);
  console.log(`asked the outside session to work ${card}`);
} else if (verb === 'end') {
  // The board releases an adopted session when its run ends (it closes only what it launched); the person ends it then.
  const { card } = state();
  for (let i = 0; !/review_requested/.test(workflow('runs', card)); i++) { if (i > 600) throw new Error(`${card}'s run did not end`); await Bun.sleep(500); }
  await type('/exit');
  for (let i = 0; i < 40 && Bun.spawnSync({ cmd: ['tmux', '-L', socket, 'has-session'] }).exitCode === 0; i++) await Bun.sleep(250);
  console.log(`${card}'s run ended and the board released the session; the person ended it`);
} else if (verb === 'show') {
  const { card, address } = state();
  console.log(workflow('show', card).trim());
  const pulls = await (await fetch(`${github}/repos/${ACCOUNT}/pulls?state=all&per_page=100`, { headers: { authorization: 'Bearer world-bot' } })).json() as Array<{ number: number; merged_at: string | null; state: string; head: { ref: string; sha: string } }>;
  const pr = pulls.find((p) => p.head.ref === `wt/${card}`);
  console.log(`\noutside session ${address}\n${pr ? `PR #${pr.number}: head ${pr.head.sha.slice(0, 8)}, ${pr.merged_at ? `merged at ${pr.merged_at}` : pr.state}` : `no PR from wt/${card} yet`}`);
} else throw new Error('native.ts start | ask | work | end | show');
