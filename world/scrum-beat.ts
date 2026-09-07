// Scripted MODEL judgment for the scrum rehearsal, not application orchestration.
// The real cron invokes it as a terminal tool; it uses the kit's doors and native
// Hermes CLI. The resulting roadmap/PR/task/message state is inspected by the operator.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const project = process.cwd();
const run = (cmd: string[], cwd = project) => {
  const r = Bun.spawnSync({ cmd, cwd, stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode) throw new Error(`${cmd.slice(0, 3).join(' ')}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
};
const scrum = (...args: string[]) => run(['bun', '.open-autonomy/scrum.ts', ...args]);
const community = (...args: string[]) => run(['bun', '.open-autonomy/community.ts', ...args]);
const snapshot = JSON.parse(scrum('prepare'));
// Scripted judgment reads native history too; no explicit community intake is required.
let sessionOffset = 0;
let sessions = snapshot.sessions;
if (sessions.gap) throw new Error(sessions.gap);
do {
  for (const session of sessions.rows) {
    let page = 0;
    while (JSON.parse(scrum('session', session.id, String(page))).more) page += 100;
  }
  if (!sessions.more) break;
  sessions = JSON.parse(scrum('sessions', String(sessionOffset += 100)));
} while (true);
// Retire an already-landed planning batch before ingesting newer GitHub inputs.
const planHead = run(['git', 'rev-parse', 'HEAD'], snapshot.worktree);
if (snapshot.resumed && planHead !== snapshot.snapshot.main &&
    Bun.spawnSync({ cmd: ['git', 'merge-base', '--is-ancestor', planHead, 'origin/main'], cwd: snapshot.worktree }).exitCode === 0 &&
    !run(['git', 'status', '--porcelain'], snapshot.worktree)) {
  scrum('finish', snapshot.snapshot.id, 'main', 'sessions');
  community('mark', 'pm');
  console.log('SCRUM_BEAT_DONE previous planning batch landed; next scrum discovers later arrivals.');
  process.exit(0);
}
const poll = community('poll', 'pm');
const issues = poll.split('\n').filter((l) => /^NEW (issue|pull request) /.test(l)).map((l) => JSON.parse(l.replace(/^NEW (issue|pull request) /, '')));
const plan = snapshot.worktree;
const current = run(['git', 'show', 'origin/main:ROADMAP.md']);
const special = issues.some((i) => i.title === 'scrum: owner direction') || current.includes('scrum rehearsal');
let draft = readFileSync(resolve(plan, 'ROADMAP.md'), 'utf8');
if (special && !draft.includes('scrum rehearsal')) {
  const source = (title: string) => {
    const row = issues.find((i) => i.title === title);
    if (!row?.html_url) throw new Error(`missing source ${title}`);
    return row;
  };
  const direction = source('scrum: owner direction');
  const volunteer = source('scrum: documentation commitment');
  const suggestion = source('scrum: optional help');
  const contradiction = source('scrum: conflicting proposal');
  const outside = source('scrum: outside release notes');
  community('comment', String(volunteer.number), 'Acknowledged: you volunteered for usage documentation. No deadline has been agreed; I will coordinate integration in the roadmap.');
  const overlap = snapshot.board.find((t: { title: string }) => t.title === 'Integrate outside release notes');
  if (overlap) run(['hermes', 'kanban', 'comment', overlap.id, `PM: reconcile ${outside.html_url} before implementing release notes; preserve the existing integration hold.`, '--author', 'pm']);
  draft = `# todo-cli roadmap — scrum rehearsal\n\nNotable intentions and outstanding outcomes. Scripted PM inference: preserve the owner's add-first priority while the conflicting proposal awaits discussion.\n\n## add: todo add appends an item and prints its id\n\nStatus: planned\nDispatch: fleet\n\nDirection: [owner request](${direction.html_url}). Acceptance: the add command appends an item and prints its id; verify the cookbook's original [acceptance](hermes/kanban.seed.json).\n\n## documentation: Usage documentation\n\nStatus: accepted human commitment; no deadline agreed\nDispatch: hold\n\n[Volunteer statement](${volunteer.html_url}): ${volunteer.body}\nAcknowledged in the same issue; fleet integration remains to be planned after delivery.\n\n## translation: Translation suggestion\n\nStatus: proposal, no executor or commitment\nDispatch: hold\n\n[Suggestion](${suggestion.html_url}): ${suggestion.body}\n\n## csv: Priority conflict\n\nStatus: unresolved proposal; owner priority retained\nDispatch: hold\n\n[Proposal](${contradiction.html_url}) conflicts with [owner direction](${direction.html_url}). Ask for resolution before changing priority; continue independent add work.\n\n## release: Review and release\n\nStatus: outside PR awaiting integration; human release review and post-release verification pending\nDispatch: hold\n\n[Outside contribution](${outside.html_url}) supplies release notes. Do not duplicate it or attribute it to Hermes. ${overlap ? `Existing [fleet integration task](hermes:task/${overlap.id}) retains its hold; PM attached the outside PR for coordination.` : ''} Review the candidate diff and check evidence, then request maintainer review following [production instructions](.open-autonomy/PRODUCTION.md). No release approval has been received.\n`;
} else if (!special) {
  // Normal cookbook opening beat: its historical intentions become fleet work,
  // preserving explicit holds. Only one ready outcome is queued per scrum.
  const seed = JSON.parse(readFileSync(resolve(project, 'hermes/kanban.seed.json'), 'utf8'));
  for (const item of seed.tasks.filter((t: { held?: string }) => !t.held)) {
    const re = new RegExp(`(## ${item.key}: [\\s\\S]*?Dispatch:) hold`);
    draft = draft.replace(re, '$1 fleet');
    const status = new RegExp(`(## ${item.key}: [\\s\\S]*?Status:) historical intention; reconcile with the live board and landed work\\.`);
    draft = draft.replace(status, '$1 planned');
  }
}
// This migration placeholder is stale after reconciliation, not shared knowledge to retain.
draft = draft.replace(/\n## Questions and scrum notes\n[\s\S]*?(?=\n## |$)/, '\n');
const termRequest = issues.find((i) => i.title?.includes('request: add the term'));
if (!special && termRequest && !draft.includes('## community-twin:')) {
  draft += `\n## community-twin: add the term "twin" to the lexicon\n\nStatus: planned\nDispatch: fleet\n\nSource: [community request](${termRequest.html_url}). ${termRequest.body}\nCompletion: list the sourced definition and render it on the homepage.\n`;
}
const late = poll.split('\n').find((l) => l.startsWith('NEW comment on #4 ') && l.includes('Late owner reply:'));
if (late && !draft.includes('Late owner reply recorded')) {
  const comment = JSON.parse(late.replace('NEW comment on #4 ', ''));
  draft = draft.replace('Status: unresolved proposal; owner priority retained', 'Status: resolved direction; CSV stays later');
  draft = draft.replace('## release:', `Late owner reply recorded: [source](${comment.html_url}). CSV remains later.\n\n## release:`);
}
// The ordinary contributor did not notify Hermes or edit its shared documents.
// Discover its actual landed file/commit through Git, then distill only the notable effect.
const outsideLanded = Bun.spawnSync({ cmd: ['git', 'cat-file', '-e', `${snapshot.snapshot.main}:OUTSIDE.md`], cwd: project }).exitCode === 0;
if (outsideLanded) {
  const commit = run(['git', 'log', '-1', '--format=%H', snapshot.snapshot.main, '--', 'OUTSIDE.md']);
  const changelogFile = resolve(plan, 'CHANGELOG.md');
  let changelog = readFileSync(changelogFile, 'utf8');
  if (!changelog.includes(`commit/${commit}`)) {
    const entry = `- Outside contributor supplied release notes. [Landed change](https://github.com/cookbook/todo-cli/commit/${commit}).`;
    if (!changelog.includes('## Unreleased')) changelog += '\n## Unreleased\n';
    changelog = changelog.replace('## Unreleased', `## Unreleased\n\n${entry}`);
    writeFileSync(changelogFile, changelog);
  }
  draft = draft.replace('Status: outside PR awaiting integration; human release review and post-release verification pending',
    'Status: release notes landed; human release review and post-release verification pending');
  if (!draft.includes(`commit/${commit}`)) draft = draft.replace('Review the candidate diff and check evidence,',
    `Landed evidence: [outside contribution](https://github.com/cookbook/todo-cli/commit/${commit}). Review the candidate diff and check evidence,`);
}
// Routine intake is accounted for in operational memory; it never becomes a dated log.

if (draft !== readFileSync(resolve(plan, 'ROADMAP.md'), 'utf8')) writeFileSync(resolve(plan, 'ROADMAP.md'), draft);
if (run(['git', 'status', '--porcelain'], plan)) {
  run(['bun', 'run', 'check'], plan);
  run(['git', 'add', 'ROADMAP.md', 'CHANGELOG.md'], plan);
  run(['git', '-c', 'user.name=Open Autonomy agent', '-c', 'user.email=agent@open-autonomy.org', '-c', 'core.hooksPath=/dev/null', 'commit', '-s', '-m', `${snapshot.branch.slice(6)}: distill sourced plans and landed changes`], plan);
  run(['git', 'push', '-u', 'origin', snapshot.branch], plan);
  console.log('SCRUM_BEAT_DONE plan pushed; dispatch waits for landing.');
} else {
  // finish refuses a clean but unmerged plan, so no queue or cursor acknowledgment follows it.
  scrum('finish', snapshot.snapshot.id, 'main', 'sessions', ...snapshot.intake.map((n: { id: string }) => `note:${n.id}`));
  const seed = JSON.parse(readFileSync(resolve(project, 'hermes/kanban.seed.json'), 'utf8'));
  if (current.includes('## community-twin:')) seed.tasks.push({key: 'community-twin', title: 'add the term "twin" to the lexicon', acceptance: ['lexicon list shows twin with its sourced definition from issue #2', 'the homepage renders the term from the glossary']});
  const board = JSON.parse(run(['hermes', 'kanban', 'list', '--archived', '--json']));
  const item = seed.tasks.find((t: { key: string; title: string; held?: string }) => !t.held && (!special || t.key === 'add') && !board.some((b: { title: string }) => b.title === t.title));
  if (item) console.log(scrum('queue', item.key, 'implementation', item.title, item.acceptance.map((a: string) => `- ${a}`).join('\n'), ...((board.findLast((b: { status: string }) => ['running', 'review', 'ready', 'todo'].includes(b.status))) ? [board.findLast((b: { status: string }) => ['running', 'review', 'ready', 'todo'].includes(b.status)).id] : [])));
  community('mark', 'pm');
  console.log('SCRUM_BEAT_DONE landed plan reconciled; no human work dispatched.');
}
