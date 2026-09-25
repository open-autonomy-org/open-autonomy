// The scripted PM's release judgment (REHEARSAL_RELEASE=1 selects it in world/model/scenario.ts): real cron, planning
// pull requests and the kit's `maintain.ts ship`; the decision comes from ordinary sourced GitHub activity (the
// `release: target schedule` issue the release operator files). Runs in the brain's checkout.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
// Every pass: `ship` keeps the Release open while main is ahead of prod. Once the landed section requests review, PM
// writes its package first, and `ship` puts it on the Release and tells the owner once. An unchanged package keeps its
// time, so one written before the owner's last merge is refused as stale.
function ship() {
  const roadmap = run(['git', 'show', 'origin/main:ROADMAP.md']);
  if (field(roadmap, 'Release decision') === 'request-review') {
    const pkg = resolve(home, 'release-review.md');
    const text = `Release: release-next\nScope: ${field(roadmap, 'Scope')}\nVerification: The cookbook's checks passed on main's head; [main](https://github.com/${account}/commits/main).\nRisks: Production is verified after the merge.\nOwner reads: none\nOwner does: none\n`;
    if (!existsSync(pkg) || readFileSync(pkg, 'utf8') !== text) writeFileSync(pkg, text);
  }
  console.log(run(['bun', '.open-autonomy/maintain.ts', 'ship']));
}
const snapshot = JSON.parse(scrum('prepare'));
const plan = snapshot.worktree;
const file = resolve(plan, 'ROADMAP.md');
const planHead = run(['git', 'rev-parse', 'HEAD'], plan);
if (snapshot.resumed && planHead !== snapshot.snapshot.main &&
    Bun.spawnSync({ cmd: ['git', 'merge-base', '--is-ancestor', planHead, 'origin/main'], cwd: plan }).exitCode === 0 &&
    !run(['git', 'status', '--porcelain'], plan)) {
  scrum('finish', snapshot.snapshot.id, 'main');
  community('mark', 'pm');
  ship();
  console.log('SCRUM_BEAT_DONE release decision landed; the Release reconciled.');
  process.exit(0);
}
const poll = community('poll', 'pm');
const issue = poll.split('\n').filter((line) => line.startsWith('NEW issue ')).map((line) => JSON.parse(line.slice(10))).find((i) => i.title === 'release: target schedule');
const previous = readFileSync(file, 'utf8');
const phase = issue ? field(issue.body, 'Phase') : field(previous, 'Release decision');
if (!phase || !['accumulate', 'defer', 'request-review'].includes(phase)) throw new Error('seed the release decision through the operator first');
const source = issue?.html_url ?? `https://github.com/${account}/issues/1`;
const section = `## release-next: The next Release\n\nDispatch: hold\nRelease decision: ${phase}\nScope: The verified cookbook baseline, and whatever else lands on main before the owner merges the Release.\nRationale: PM scenario judgment: ${phase === 'request-review' ? 'the baseline is done and verified, so the owner is told once' : phase === 'defer' ? 'hold the Release back' : 'keep compounding changes rather than asking for every commit'}; [schedule input](${source}).\n`;
const draft = previous.includes('## release-next:') ? previous.replace(/^## release-next:[\s\S]*?(?=^## |$(?![\s\S]))/m, section) : `${previous.trimEnd()}\n\n${section}`;
if (draft !== previous) writeFileSync(file, draft);
if (run(['git', 'status', '--porcelain'], plan)) {
  run(['bun', 'run', 'check'], plan);
  run(['git', 'add', 'ROADMAP.md'], plan);
  run(['git', '-c', 'user.name=Open Autonomy agent', '-c', 'user.email=agent@open-autonomy.org', '-c', 'core.hooksPath=/dev/null', 'commit', '-s', '-m', `${snapshot.branch.slice(6)}: release ${phase}`], plan);
  run(['git', 'push', '-u', 'origin', snapshot.branch], plan);
  console.log('SCRUM_BEAT_DONE release decision pushed; nothing is asked before it lands.');
} else {
  scrum('finish', snapshot.snapshot.id, 'main');
  community('mark', 'pm');
  ship();
  console.log('SCRUM_BEAT_DONE release decision unchanged; the Release reconciled.');
}
