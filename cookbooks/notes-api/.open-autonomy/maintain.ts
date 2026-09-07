#!/usr/bin/env bun
// The PM's bounded maintenance: inspect releases, land an idle kit upgrade, request a
// drained restart, and keep one owner task for code awaiting deployment. Never deploys.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const project = resolve(import.meta.dir, '..');
const home = process.env.HERMES_HOME;
if (!home) throw new Error('maintenance requires HERMES_HOME from the running stack');
const command = process.argv[2] ?? 'status';
const run = (cmd: string[], cwd = project): string => {
  const result = Bun.spawnSync({ cmd, cwd, stdout: 'pipe', stderr: 'pipe' });
  if (result.exitCode !== 0) throw new Error(`${cmd.slice(0, 3).join(' ')} failed: ${result.stderr.toString().trim()}`);
  return result.stdout.toString().trim();
};
const git = (...args: string[]) => run(['git', ...args]);
const board = () => JSON.parse(run(['hermes', 'kanban', 'list', '--json'])) as Array<{ id: string; title: string; status: string; body?: string }>;
const idle = () => !board().some((t) => ['running', 'review'].includes(t.status));
const record = (text: string) => JSON.parse(text) as { version: string };
const installed = record(readFileSync(resolve(project, '.open-autonomy/kit.json'), 'utf8')).version;
const runningFile = resolve(home, 'running-kit.json');
const running = existsSync(runningFile) ? record(readFileSync(runningFile, 'utf8')).version : null;
const stable = (version: string) => /^\d+\.\d+\.\d+$/.test(version);
const newer = (a: string, b: string) => {
  if (!stable(a) || !stable(b)) throw new Error(`expected stable kit versions, got ${a} and ${b}`);
  const aa = a.split('.').map(Number), bb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i]! > bb[i]!;
  return false;
};

if (command === 'ship') {
  const config = Bun.YAML.parse(readFileSync(resolve(project, '.open-autonomy/config.yaml'), 'utf8')) as { account: string; live?: string };
  if (!config.live) { console.log('No live address configured.'); process.exit(0); }
  const base = process.env.OPEN_AUTONOMY_BASE_URL;
  if (!base) throw new Error('OPEN_AUTONOMY_BASE_URL is required to read deployment status');
  const response = await fetch(`${base.replace(/\/$/, '')}/accounts/${encodeURIComponent(config.account)}`);
  if (!response.ok) throw new Error(`deployment status returned ${response.status}`);
  const { live } = await response.json() as { live?: { ahead: number | null; head?: string; commit?: string } };
  const tasks = board();
  let task = tasks.find((t) => t.title === 'ship what has landed' && t.body?.includes('<!-- open-autonomy:ship -->') && t.status !== 'archived');
  if (live?.ahead === 0) {
    if (task?.status === 'blocked') run(['hermes', 'kanban', 'unblock', task.id]);
    console.log('The deployed service is up to date.');
  } else if (live && typeof live.ahead === 'number' && live.ahead > 0 && /^[a-f0-9]{7,40}$/i.test(live.head ?? '')) {
    const tag = `deploy-v${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`;
    const ask = `Read the money/auth diff, then choose an unused deploy tag (add .1, .2 if needed): git tag -a ${tag} ${live.head} -m "Deploy ${live.head}" && git push origin ${tag}. Approve the waiting production run at https://github.com/${config.account}/actions. ${live.ahead} commits have landed since ${live.commit}.`;
    if (!task || task.status === 'done') {
      task = JSON.parse(run(['hermes', 'kanban', 'create', 'ship what has landed', '--body', `<!-- open-autonomy:ship -->\n${ask}\nWhen resumed, read the live status; hand off only when ahead is zero. Never deploy.`, '--assignee', 'default', '--workspace', `dir:${project}`, '--idempotency-key', `pm:ship:${live.head}`, '--json']));
    }
    if (task && ['ready', 'running'].includes(task.status)) run(['hermes', 'kanban', 'block', task.id, ask, '--kind', 'needs_input']);
    console.log(ask);
  } else console.log('Live deployment status is unknown; no shipping task is released.');
} else if (command === 'restart') {
  if (!idle()) { console.log('A task is running or under review; restart waits for an idle hour.'); process.exit(0); }
  git('fetch', '-q', 'origin', 'main');
  const landed = record(git('show', 'origin/main:.open-autonomy/kit.json')).version;
  if (running === landed) { console.log(`Gateway already runs kit ${landed}.`); process.exit(0); }
  if (!running) throw new Error('the running stack predates managed restarts; owner must restart it once with the current start script');
  if (git('status', '--porcelain')) throw new Error('checkout has uncommitted work; restart waits until it is preserved');
  writeFileSync(resolve(home, 'kit-restart.json'), JSON.stringify({ version: landed }));
  console.log(`Kit ${landed} landed; the supervisor will drain the gateway and restart the complete stack.`);
} else if (command === 'status' || command === 'upgrade') {
  const latest = run(['npm', 'view', 'create-open-autonomy', 'version']).trim();
  console.log(JSON.stringify({ installed, running, latest, idle: idle() }));
  if (command === 'status' || !newer(latest, installed)) process.exit(0);
  if (!idle()) { console.log('A task is running or under review; upgrade waits for an idle hour.'); process.exit(0); }
  git('fetch', '-q', 'origin', 'main');
  const landed = record(git('show', 'origin/main:.open-autonomy/kit.json')).version;
  if (!newer(latest, landed)) { console.log(`Kit ${landed} already landed; request a restart.`); process.exit(0); }
  const branch = `land/kit-${latest}`;
  if (git('ls-remote', '--heads', 'origin', branch)) {
    console.log(`Upgrade ${branch} is already pushed. If its pull request changes .github/, ask the owner to approve that pull request through the escalation hook.`);
    process.exit(0);
  }
  const parent = resolve(home, 'kit-upgrades');
  mkdirSync(parent, { recursive: true });
  const worktree = resolve(parent, latest);
  if (existsSync(worktree)) {
    if (run(['git', 'branch', '--show-current'], worktree) !== branch) throw new Error(`${worktree} is not the expected upgrade branch ${branch}`);
    console.log(`Resuming the preserved upgrade at ${worktree}.`);
  } else git('worktree', 'add', '-b', branch, worktree, 'origin/main');
  const stagedVersion = record(readFileSync(resolve(worktree, '.open-autonomy/kit.json'), 'utf8')).version;
  if (stagedVersion !== latest) run(['bunx', `create-open-autonomy@${latest}`, 'upgrade', '.'], worktree);
  run(['bun', 'install', '--frozen-lockfile'], worktree);
  run(['bun', 'run', 'check'], worktree);
  if (!idle()) throw new Error(`a task started during the upgrade; ${worktree} is preserved and has not been pushed`);
  run(['git', 'add', '-A'], worktree);
  // Older adopters ignore every hook except seed; the new kit hook is source, not runtime state.
  run(['git', 'add', '-f', 'hermes/hooks/escalate/HOOK.yaml', 'hermes/hooks/escalate/handler.py'], worktree);
  if (run(['git', 'status', '--porcelain'], worktree)) run(['git', '-c', 'core.hooksPath=/dev/null', 'commit', '-s', '--author=Open Autonomy agent <agent@open-autonomy.org>', '-m', `kit-${latest}: take the kit upgrade`], worktree);
  run(['git', 'push', '-u', 'origin', branch], worktree);
  git('worktree', 'remove', worktree);
  console.log(`Pushed ${branch}; the landing workflow opens its pull request. Workflow changes need the owner's review.`);
} else throw new Error('usage: maintain.ts status | upgrade | restart | ship');
