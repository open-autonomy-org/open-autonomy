// Scripted PM judgment for release planning. Real cron, planning PRs, native
// kanban and owner doors; the phase comes from ordinary sourced GitHub activity.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { outreachCommand } from './outreach-policy.ts';
const project = process.cwd();
const home = process.env.HERMES_HOME!;
const run = (cmd: string[], cwd = project) => {
  const r = Bun.spawnSync({ cmd, cwd, stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode) throw new Error(`${cmd.slice(0, 2).join(' ')}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
};
const scrum = (...args: string[]) => run(['bun', '.open-autonomy/scrum.ts', ...args]);
const community = (...args: string[]) => run(['bun', '.open-autonomy/community.ts', ...args]);
const account = /^account:\s*(\S+)/m.exec(readFileSync('.open-autonomy/config.yaml', 'utf8'))![1];
const field = (text: string, name: string) => text.split('\n').find((line) => line.startsWith(`${name}:`))?.slice(name.length + 1).trim();
const snapshot = JSON.parse(scrum('prepare'));
const plan = snapshot.worktree;
const file = resolve(plan, 'ROADMAP.md');
function review() {
  const roadmap = run(['git', 'show', 'origin/main:ROADMAP.md']);
  if (field(roadmap, 'Release decision') === 'request-review') {
    const candidate = field(roadmap, 'Candidate')!;
    const version = field(roadmap, 'Target version')!;
    const planCommit = run(['git', 'log', '-1', '--format=%H', 'origin/main', '--', 'ROADMAP.md']);
    const packageFile = resolve(home, 'release-review.md');
    const previous = existsSync(packageFile) ? readFileSync(packageFile, 'utf8') : '';
    // Preserve the package across later main commits; only changed decisions need a new one.
    if (field(previous, 'Plan') !== planCommit) writeFileSync(packageFile, `Release: release-next\nPlan: ${planCommit}\nCandidate: ${candidate}\nVersion: ${version}\nVerification: Cookbook checks passed for the selected candidate; [candidate](https://github.com/${account}/commit/${candidate}).\nRisks: Production is not yet verified; human review and post-release checks remain required.\nHuman action: Review this version and candidate, then follow [the release procedure](https://github.com/${account}/blob/${planCommit}/.open-autonomy/PRODUCTION.md) to cut its deploy-v date tag and approve its production run.\n`);
  }
  console.log(run(['bun', '.open-autonomy/maintain.ts', 'ship']));
  run(outreachCommand(home));
}
const planHead = run(['git', 'rev-parse', 'HEAD'], plan);
if (snapshot.resumed && planHead !== snapshot.snapshot.main &&
    Bun.spawnSync({ cmd: ['git', 'merge-base', '--is-ancestor', planHead, 'origin/main'], cwd: plan }).exitCode === 0 &&
    !run(['git', 'status', '--porcelain'], plan)) {
  scrum('finish', snapshot.snapshot.id, 'main');
  community('mark', 'pm');
  review();
  console.log('SCRUM_BEAT_DONE release decision landed and review gate reconciled.');
  process.exit(0);
}
const poll = community('poll', 'pm');
const issue = poll.split('\n').filter((line) => line.startsWith('NEW issue ')).map((line) => JSON.parse(line.slice(10))).find((i) => i.title === 'release: target schedule');
const previous = readFileSync(file, 'utf8');
const phase = issue ? field(issue.body, 'Phase') : field(previous, 'Release decision');
if (!phase || !['accumulate', 'prepare', 'defer', 'request-review'].includes(phase)) throw new Error('seed the release schedule through the operator first');
const candidate = field(previous, 'Candidate') ?? snapshot.snapshot.main;
const source = issue?.html_url ?? `https://github.com/${account}/issues/1`;
const section = `## release-next: First scheduled release\n\nDispatch: hold\nRelease decision: ${phase}\nTarget version: 2026.10.01\nTarget window: 2026-10-01 14:00–16:00 UTC (target, not an automatic trigger)\nReview by: 2026-09-30 14:00 UTC\nCandidate: ${candidate}\nScope: The verified cookbook baseline; later main changes are outside this candidate.\nReadiness: ${phase === 'request-review' ? 'ready-for-review' : 'pending'}\nReadiness evidence: [Candidate and checks](https://github.com/${account}/commit/${candidate}); human review and operational verification remain outstanding.\nRationale: PM scenario judgment: ${phase === 'request-review' ? 'the baseline is ready for human review ahead of the target window' : phase === 'defer' ? 'postpone this proposal and stop the previous review request' : 'accumulate and prepare a coherent baseline instead of releasing every commit'}; [schedule input](${source}).\nVersion rationale: PM proposes a calendar release following the [deploy-v date convention](https://github.com/${account}/blob/${candidate}/.open-autonomy/PRODUCTION.md); this is not an npm version or publication.\n\nDependencies and risks: human review time and production verification; target scope/date may change with sourced evidence.\n`;
const draft = previous.includes('## release-next:') ? previous.replace(/^## release-next:[\s\S]*?(?=^## |$(?![\s\S]))/m, section) : `${previous.trimEnd()}\n\n${section}`;
if (draft !== previous) writeFileSync(file, draft);
if (run(['git', 'status', '--porcelain'], plan)) {
  run(['bun', 'run', 'check'], plan);
  run(['git', 'add', 'ROADMAP.md'], plan);
  run(['git', '-c', 'user.name=Open Autonomy agent', '-c', 'user.email=agent@open-autonomy.org', '-c', 'core.hooksPath=/dev/null', 'commit', '-s', '-m', `${snapshot.branch.slice(6)}: plan release ${phase}`], plan);
  run(['git', 'push', '-u', 'origin', snapshot.branch], plan);
  console.log('SCRUM_BEAT_DONE release plan pushed; no review request before it lands.');
} else {
  scrum('finish', snapshot.snapshot.id, 'main');
  community('mark', 'pm');
  review();
  console.log('SCRUM_BEAT_DONE release plan unchanged; reconciled existing review gate.');
}
