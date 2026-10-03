// Manual release rehearsal controls (docs/decisions/0015). The owner's side goes through the GitHub twin as the world's
// human; the PM's side runs in the actual PM cron through release-beat.ts, and `ship` runs the kit's
// `maintain.ts ship` through the project's App, as the PM does.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, OWNER, STACK, api, need } from '../lib.ts';
import { hermesBin } from '../lib.ts';
const project = resolve(STACK, 'project');
const home = resolve(STACK, 'home');
const env = { ...process.env, HERMES_HOME: home, PATH: `${hermesBin()}:${process.env.PATH}`, GITHUB_API_URL: need('GITHUB_TWIN_URL'), GITHUB_TOKEN: 'world-bot' };
const run = (cmd: string[], cwd = project) => {
  const r = Bun.spawnSync({ cmd, cwd, env, stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode) throw new Error(r.stderr.toString());
  return r.stdout.toString().trim();
};
const owner = api(need('GITHUB_TWIN_URL'));
const repo = `/repos/${ACCOUNT}`;
const show = (label: string, r: { status: number; body: any; text: string }) => console.log(label, r.status, r.body?.message ?? '');
const theRelease = async () => ((await owner.get(`${repo}/pulls?state=open&base=prod`)).body ?? []).find((p: { head: { ref: string } }) => p.head.ref === 'main');
const ship = () => console.log(run(['bun', '.open-autonomy/maintain.ts', 'ship']));
const [command] = process.argv.slice(2);
if (command === 'prod') {
  // What `setup --with production` makes: an owners team of the owner with write access, `prod` at main's first commit,
  // and `prod-protected`, which admits only a merged pull request that team approved.
  const login = (await owner.get('/user')).body.login;
  let team = await owner.get(`/orgs/${OWNER}/teams/owners`);
  if (team.status !== 200) { team = await owner.post(`/orgs/${OWNER}/teams`, { name: 'owners', privacy: 'closed' }); show('owners team', team); }
  show('membership', await owner.put(`/orgs/${OWNER}/teams/owners/memberships/${login}`, { role: 'maintainer' }));
  show('team access', await owner.put(`/orgs/${OWNER}/teams/owners/repos/${ACCOUNT}`, { permission: 'push' }));
  run(['git', 'fetch', '-q', 'origin', 'main']);
  const root = run(['git', 'rev-list', '--max-parents=0', 'origin/main']).split('\n').at(-1)!;
  show('prod branch', await owner.post(`${repo}/git/refs`, { ref: 'refs/heads/prod', sha: root }));
  show('prod-protected', await owner.post(`${repo}/rulesets`, { name: 'prod-protected', target: 'branch', enforcement: 'active', bypass_actors: [], conditions: { ref_name: { include: ['refs/heads/prod'], exclude: [] } }, rules: [{ type: 'deletion' }, { type: 'non_fast_forward' }, { type: 'pull_request', parameters: { required_approving_review_count: 1, dismiss_stale_reviews_on_push: true, require_code_owner_review: false, require_last_push_approval: false, required_review_thread_resolution: false, allowed_merge_methods: ['merge'], required_reviewers: [{ minimum_approvals: 1, file_patterns: ['*'], reviewer: { id: team.body.id, type: 'Team' } }] } }] }));
} else if (['accumulate', 'request-review', 'defer'].includes(command)) {
  // The PM's source for its decision: an ordinary issue the scripted judgment reads.
  const issues = (await owner.get(`${repo}/issues?state=all&per_page=100`)).body;
  const prior = issues.find((i: { title: string }) => i.title === 'release: target schedule');
  const body = `Phase: ${command}\n\n${command === 'request-review' ? 'The baseline is done and verified; PM may tell the owner the Release is ready.' : command === 'defer' ? 'Hold the Release back.' : 'Keep compounding changes on main.'} A date or another merge is not a release.`;
  const result = prior ? await owner.patch(`${repo}/issues/${prior.number}`, { body }) : await owner.post(`${repo}/issues`, { title: 'release: target schedule', body });
  if (![200, 201].includes(result.status)) throw new Error(result.text);
  console.log({ source: result.body.html_url, phase: command });
} else if (command === 'inspect') {
  run(['git', 'fetch', '-q', 'origin', 'main']);
  console.log(run(['git', 'show', 'origin/main:ROADMAP.md']));
  const compare = await owner.get(`${repo}/compare/prod...main`);
  console.log({ aheadOfProd: compare.body?.ahead_by ?? compare.status });
  const pkg = resolve(home, 'release-review.md');
  console.log({ package: existsSync(pkg) ? readFileSync(pkg, 'utf8') : null });
  const pr = await theRelease();
  if (!pr) { console.log('No Release is open.'); process.exit(0); }
  console.log({ release: pr.number, title: pr.title, body: pr.body });
  console.log({ comments: (await owner.get(`${repo}/issues/${pr.number}/comments`)).body.map((c: { user: { login: string }; body: string }) => ({ by: c.user.login, body: c.body })) });
  console.log({ reviews: (await owner.get(`${repo}/pulls/${pr.number}/reviews`)).body.map((r: { user: { login: string }; state: string; commit_id: string }) => ({ by: r.user.login, state: r.state, commit: r.commit_id })) });
} else if (command === 'later') {
  // An ordinary later contribution lands on main: it joins the open Release.
  const snapshot = JSON.parse(run(['bun', '.open-autonomy/scrum.ts', 'prepare']));
  const plan = snapshot.worktree;
  writeFileSync(resolve(plan, 'LATER.md'), 'This later contribution joins the open Release.\n');
  run(['bun', 'run', 'check'], plan);
  run(['git', 'add', 'LATER.md'], plan);
  run(['git', '-c', 'user.name=Outside contributor', '-c', 'user.email=contributor@example.test', '-c', 'core.hooksPath=/dev/null', 'commit', '-s', '-m', `${snapshot.branch.slice(6)}: later contribution`], plan);
  run(['git', 'push', '-u', 'origin', snapshot.branch], plan);
  console.log({ laterContribution: run(['git', 'rev-parse', 'HEAD'], plan) });
} else if (command === 'finish-later') {
  const snapshot = JSON.parse(run(['bun', '.open-autonomy/scrum.ts', 'prepare']));
  console.log(run(['bun', '.open-autonomy/scrum.ts', 'finish', snapshot.snapshot.id]));
} else if (command === 'app-approve') {
  // The project's App may review pull requests into main; its approval must not ship the Release.
  const pr = await theRelease();
  if (!pr) throw new Error('no Release is open');
  const bot = api(need('GITHUB_TWIN_URL'), { authorization: 'token world-bot' });
  show('App approves the Release', await bot.post(`${repo}/pulls/${pr.number}/reviews`, { event: 'APPROVE', body: 'An agent approving the Release.', commit_id: pr.head.sha }));
  show('merge after the App alone', await owner.put(`${repo}/pulls/${pr.number}/merge`, { merge_method: 'merge' }));
} else if (command === 'approve' || command === 'merge') {
  const pr = await theRelease();
  if (!pr) throw new Error('no Release is open');
  if (command === 'approve') show('owner approves', await owner.post(`${repo}/pulls/${pr.number}/reviews`, { event: 'APPROVE', body: 'Read the Release; ship it.', commit_id: pr.head.sha }));
  else show('owner merges', await owner.put(`${repo}/pulls/${pr.number}/merge`, { merge_method: 'merge' }));
} else if (command === 'ship') {
  ship();
} else throw new Error('usage: release.ts prod | accumulate | request-review | defer | inspect | later | finish-later | app-approve | approve | merge | ship');
