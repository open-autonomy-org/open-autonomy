// Manual release-planning rehearsal controls. GitHub is seeded through its API;
// product decisions run in the actual PM cron through release-beat.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, ENC, STACK, api, need } from '../../.open-autonomy/rehearsal/lib.ts';
import { hermesBin } from '../hooks.ts';
const project = resolve(STACK, 'project');
const home = resolve(STACK, 'home');
const env = { ...process.env, HERMES_HOME: home, PATH: `${hermesBin()}:${process.env.PATH}`, GITHUB_API_URL: need('GITHUB_TWIN_URL'), GITHUB_TOKEN: 'world-bot', OPEN_AUTONOMY_BASE_URL: `${need('PLATFORM_URL')}/v1` };
const run = (cmd: string[], cwd = project) => {
  const r = Bun.spawnSync({ cmd, cwd, env, stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode) throw new Error(r.stderr.toString());
  return r.stdout.toString().trim();
};
const gh = api(need('GITHUB_TWIN_URL'));
const sync = async () => {
  const result = await api(need('PLATFORM_URL'), { 'x-admin-token': process.env.AGENT_PROXY_ADMIN_TOKEN ?? 'world-admin' }).post(`/admin/accounts/${ENC}/sync`);
  if (result.status !== 200) throw new Error(result.text);
  return (await api(need('PLATFORM_URL')).get(`/v1/accounts/${ENC}`)).body.live;
};
const reconcile = () => {
  console.log(run(['bun', '.open-autonomy/maintain.ts', 'ship']));
  console.log('PM checks the review conversation on its next scrum.');
};
const field = (text: string, name: string) => text.split('\n').find((line) => line.startsWith(`${name}:`))?.slice(name.length + 1).trim();
const packageFile = resolve(home, 'release-review.md');
const [command] = process.argv.slice(2);
if (['accumulate', 'prepare', 'request-review', 'defer'].includes(command)) {
  const issues = (await gh.get(`/repos/${ACCOUNT}/issues?state=all&per_page=100`)).body;
  const prior = issues.find((i: { title: string }) => i.title === 'release: target schedule');
  const body = `Phase: ${command}\n\nSchedule scenario: target October 1, 2026, 14:00–16:00 UTC, with review by September 30, 14:00 UTC. PM chooses whether the baseline is ready and proposes a calendar version under the deployment procedure. A date or another merge is not permission to release. ${command === 'defer' ? 'New evidence: postpone the proposal and stop the previous review request.' : ''}`;
  const result = prior ? await gh.patch(`/repos/${ACCOUNT}/issues/${prior.number}`, { body }) : await gh.post(`/repos/${ACCOUNT}/issues`, { title: 'release: target schedule', body });
  if (![200, 201].includes(result.status)) throw new Error(result.text);
  console.log({ source: result.body.html_url, phase: command, live: await sync() });
} else if (command === 'inspect') {
  run(['git', 'fetch', '-q', 'origin', 'main']);
  console.log({ live: await sync() });
  console.log(run(['git', 'show', 'origin/main:ROADMAP.md']));
  console.log(run(['hermes', 'kanban', 'list', '--archived', '--json']));
  const issues = (await gh.get(`/repos/${ACCOUNT}/issues?state=all&per_page=100`)).body;
  for (const i of issues) console.log({ number: i.number, title: i.title, state: i.state, body: i.body, comments: (await gh.get(`/repos/${ACCOUNT}/issues/${i.number}/comments`)).body });
} else if (command === 'landed') {
  const plan = resolve(home, 'scrum-plan');
  const until = Date.now() + 30_000;
  while (true) {
    run(['git', 'fetch', '-q', 'origin', 'main']);
    const landed = Bun.spawnSync({ cmd: ['git', 'merge-base', '--is-ancestor', 'HEAD', 'origin/main'], cwd: plan, env, stdout: 'pipe', stderr: 'pipe' }).exitCode === 0;
    if (landed) { console.log('Planning branch is now on main.'); break; }
    if (Date.now() >= until) throw new Error('Planning branch still awaits landing; preserve it and inspect the PR.');
    await Bun.sleep(500);
  }
} else if (command === 'later') {
  // An ordinary later contribution lands without changing the chosen release.
  const snapshot = JSON.parse(run(['bun', '.open-autonomy/scrum.ts', 'prepare']));
  const plan = snapshot.worktree;
  writeFileSync(resolve(plan, 'LATER.md'), 'This later contribution belongs to a subsequent release.\n');
  run(['bun', 'run', 'check'], plan);
  run(['git', 'add', 'LATER.md'], plan);
  run(['git', '-c', 'user.name=Outside contributor', '-c', 'user.email=contributor@example.test', '-c', 'core.hooksPath=/dev/null', 'commit', '-s', '-m', `${snapshot.branch.slice(6)}: later contribution`], plan);
  run(['git', 'push', '-u', 'origin', snapshot.branch], plan);
  console.log({ laterContribution: run(['git', 'rev-parse', 'HEAD'], plan) });
} else if (command === 'finish-later') {
  const snapshot = JSON.parse(run(['bun', '.open-autonomy/scrum.ts', 'prepare']));
  console.log(run(['bun', '.open-autonomy/scrum.ts', 'finish', snapshot.snapshot.id]));
  console.log({ live: await sync() });
  reconcile();
 } else if (command === 'premature-package') {
  run(['git', 'fetch', '-q', 'origin', 'main']);
  const roadmap = run(['git', 'show', 'origin/main:ROADMAP.md']);
  const plan = run(['git', 'rev-parse', 'origin/main']);
  const candidate = field(roadmap, 'Candidate');
  writeFileSync(packageFile, `Release: release-next\nPlan: ${plan}\nCandidate: ${candidate}\nVersion: ${field(roadmap, 'Target version')}\nVerification: [Candidate](https://github.com/${ACCOUNT}/commit/${candidate}).\nRisks: Readiness and human review remain outstanding.\nHuman action: Review only after PM decides this release is ready.\n`);
  reconcile();
} else if (command === 'invalid-package') {
  const original = readFileSync(packageFile, 'utf8');
  writeFileSync(packageFile, original.replace(/^Version: .+$/m, 'Version: unapproved-version'));
  reconcile();
  writeFileSync(packageFile, original);
  console.log('Restored the original package; the existing authorized request remains valid.');
} else if (command === 'deployed' || command === 'unknown') {
  const candidate = field(readFileSync(packageFile, 'utf8'), 'Candidate');
  // This is the world's app-owned live-observation fixture, not a deploy or vendor handler mutation.
  const result = await api(need('LIVE_SERVICE_URL')).post('/_world/commit', command === 'deployed' ? { commit: candidate, reachable: true } : { reachable: false });
  if (result.status !== 200) throw new Error(result.text);
  console.log({ live: await sync() });
  reconcile();
} else if (command === 'reconcile') {
  console.log({ live: await sync() });
  reconcile();
} else throw new Error('usage: release.ts accumulate | prepare | request-review | defer | inspect | landed | later | finish-later | premature-package | invalid-package | deployed | unknown | reconcile');
