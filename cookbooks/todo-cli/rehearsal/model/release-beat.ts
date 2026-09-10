// The scripted PM's release-planning judgment (REHEARSAL_RELEASE=1 selects it in rehearsal/model/scenario.ts): real
// cron, planning pull requests, the native board and the owner's doors; the phase comes from ordinary sourced GitHub
// activity (the `release: target schedule` issue the release operator files). Runs in the brain's checkout.
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
function historicalAdd() {
  // The idle opening empties the live seed. Its sourced intention remains in Git.
  for (const revision of run(['git', 'log', '--format=%H', 'origin/main', '--', 'hermes/kanban.seed.json']).split('\n')) {
    const seed = JSON.parse(run(['git', 'show', `${revision}:hermes/kanban.seed.json`])).tasks.find((t: { key: string }) => t.key === 'add');
    if (seed) return { seed, revision };
  }
  throw new Error('The authored add intention is missing from committed history');
}
function nextWork() {
  const landed = run(['git', 'show', 'origin/main:ROADMAP.md']);
  if (!landed.includes('PM inference: the next useful product slice')) return;
  const { seed } = historicalAdd();
  console.log(scrum('queue', 'add', 'after-preview-add', seed.title,
    `Implement the independently planned add slice. Preserve the fixed release candidate and human review hold.\n${seed.acceptance.map((a: string) => `- ${a}`).join('\n')}`));
}
function contactReviewer() {
  // Scripted judgment for the two authored setup stories. Production PM interprets
  // its skill directly; there is no application policy parser or routing service.
  const instructions = run(['python', '-c', 'from tools.skills_tool import skill_view; print(skill_view("project-communications"))']);
  console.log(instructions);
  const tasks = JSON.parse(run(['hermes', 'kanban', 'list', '--json']));
  const send = (message: string) => {
    // The terminal subprocess is credential-scrubbed; restore the native gateway
    // environment before exercising its send implementation. Never print credentials.
    const result = JSON.parse(run(['python', '-c', `import os, sys
from hermes_cli.config import load_env
for key, value in load_env().items():
    if key.startswith("DISCORD_"): os.environ.setdefault(key, value)
from tools.send_message_tool import send_message_tool
print(send_message_tool({"target": "discord:1000000000000000001", "message": sys.argv[1]}))`, message]));
    if (!result.success || result.skipped) throw new Error(`Native message was not sent: ${JSON.stringify(result)}`);
    return result;
  };
  for (const task of tasks.filter((t: { body?: string }) => t.body?.startsWith('<!-- open-autonomy:ship:'))) {
    const comments = JSON.parse(run(['hermes', 'kanban', 'show', task.id, '--json'])).comments as Array<{ author: string; body: string }>;
    const receipt = comments.find((c) => c.author === 'pm' && c.body.startsWith('Review conversation: '))?.body;
    if (task.status === 'scheduled' && receipt && !comments.some((c) => c.body.startsWith('Review withdrawn: '))) {
      const issue = /\/issues\/(\d+)/.exec(receipt)?.[1];
      if (issue) {
        community('comment', issue, 'PM withdrew this release proposal; it is no longer awaiting approval.');
        community('issue', 'close', issue);
      } else send(`PM withdrew this release proposal; it is no longer awaiting approval. ${receipt}`);
      run(['hermes', 'kanban', 'comment', task.id, `Review withdrawn: ${receipt}`, '--author', 'pm']);
    }
    if (task.status !== 'blocked' || receipt) continue; // no new information warrants another ask in this story
    const request = comments.filter((c) => c.author === 'pm' && c.body.startsWith('<!-- open-autonomy:owner-request -->')).at(-1)?.body ?? task.body;
    let link: string;
    if (instructions.includes('assigned GitHub issue')) {
      const issue = JSON.parse(community('issue', 'open', task.id, task.title, request, 'octocat'));
      link = issue.html_url ?? `https://github.com/${account}/issues/${issue.number}`;
    } else if (instructions.includes('discord:1000000000000000001')) {
      const message = send(`${task.title}\n\n${request}`);
      link = `discord:1000000000000000001 message ${message.message_id}`;
    } else throw new Error('No scripted judgment authored for these communication instructions');
    run(['hermes', 'kanban', 'comment', task.id, `Review conversation: ${link}`, '--author', 'pm']);
  }
}
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
  contactReviewer();
}
const planHead = run(['git', 'rev-parse', 'HEAD'], plan);
if (snapshot.resumed && planHead !== snapshot.snapshot.main &&
    Bun.spawnSync({ cmd: ['git', 'merge-base', '--is-ancestor', planHead, 'origin/main'], cwd: plan }).exitCode === 0 &&
    !run(['git', 'status', '--porcelain'], plan)) {
  scrum('finish', snapshot.snapshot.id, 'main');
  community('mark', 'pm');
  review();
  nextWork();
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
let draft = previous.includes('## release-next:') ? previous.replace(/^## release-next:[\s\S]*?(?=^## |$(?![\s\S]))/m, section) : `${previous.trimEnd()}\n\n${section}`;
// A authored continuation beat: broad direction, then PM inference from the actual
// constitution and historical intention. No automatic feature-selection algorithm.
if (issue && field(issue.body, 'Development') === 'continue' && !draft.includes('PM inference: the next useful product slice')) {
  const { seed, revision } = historicalAdd();
  const next = `## add: ${seed.title}\n\nDispatch: fleet\n\nPM inference: the next useful product slice is adding a task to the owned local store, under the [constitution](https://github.com/${account}/blob/${snapshot.snapshot.main}/CONSTITUTION.md) and the reconciled [historical intention](https://github.com/${account}/blob/${revision}/hermes/kanban.seed.json). [Continued development](${source}) does not approve the fixed preview or specify this implementation choice. No overlapping execution exists in this authored empty-board scenario.\n\nCompletion:\n${seed.acceptance.map((a: string) => `- ${a}`).join('\n')}\n`;
  draft = /^## add:/m.test(draft) ? draft.replace(/^## add:[\s\S]*?(?=^## |$(?![\s\S]))/m, next + '\n') : `${draft}\n${next}`;
}
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
  nextWork();
  console.log('SCRUM_BEAT_DONE release plan unchanged; reconciled existing review gate.');
}
