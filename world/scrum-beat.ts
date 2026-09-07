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
  const captured = JSON.parse(scrum('note', volunteer.html_url, volunteer.user?.login ?? 'GitHub participant', volunteer.body));
  const overlap = snapshot.board.find((t: { title: string }) => t.title === 'Integrate outside release notes');
  if (overlap) run(['hermes', 'kanban', 'comment', overlap.id, `PM: reconcile ${outside.html_url} before implementing release notes; preserve the existing integration hold.`, '--author', 'pm']);
  draft = `# todo-cli roadmap — scrum rehearsal\n\nSourced planning notes. Scripted PM inference: preserve the owner's add-first priority while the conflicting proposal awaits discussion.\n\n## add: todo add appends an item and prints its id\n\nStatus: planned\nDispatch: fleet\n\nDirection: [owner request](${direction.html_url}). Acceptance: the add command appends an item and prints its id; verify the cookbook's original [acceptance](hermes/kanban.seed.json).\n\n## documentation: Usage documentation\n\nStatus: accepted human commitment; no deadline agreed\nDispatch: hold\n\n[Volunteer statement](${volunteer.html_url}): ${volunteer.body}\nAcknowledged in the same issue; fleet integration remains to be planned after delivery.\n\n## translation: Translation suggestion\n\nStatus: proposal, no executor or commitment\nDispatch: hold\n\n[Suggestion](${suggestion.html_url}): ${suggestion.body}\n\n## csv: Priority conflict\n\nStatus: unresolved proposal; owner priority retained\nDispatch: hold\n\n[Proposal](${contradiction.html_url}) conflicts with [owner direction](${direction.html_url}). Ask for resolution before changing priority; continue independent add work.\n\n## release: Review and release\n\nStatus: outside PR awaiting integration; human release review and post-release verification pending\nDispatch: hold\n\n[Outside contribution](${outside.html_url}) supplies release notes. Do not duplicate it or attribute it to Hermes. ${overlap ? `Existing [fleet integration task](hermes:task/${overlap.id}) retains its hold; PM attached the outside PR for coordination.` : ''} Review the candidate diff and check evidence, then request maintainer review following [production instructions](.open-autonomy/PRODUCTION.md). No release approval has been received.\n\n## Scrum record\n\nReviewed the five GitHub sources above. Captured the volunteer in durable intake as ${captured.id}. Sources and decisions survive a restart; future scrums must inspect actual progress.\n`;
} else if (!special) {
  // Normal cookbook opening beat: its historical intentions become fleet work,
  // preserving explicit holds. Only one ready outcome is queued per scrum.
  const seed = JSON.parse(readFileSync(resolve(project, 'hermes/kanban.seed.json'), 'utf8'));
  for (const item of seed.tasks.filter((t: { held?: string }) => !t.held)) {
    const re = new RegExp(`(## ${item.key}: [\\s\\S]*?Dispatch:) hold`);
    draft = draft.replace(re, '$1 fleet');
  }
}
const termRequest = issues.find((i) => i.title?.includes('request: add the term'));
if (!special && termRequest && !draft.includes('## community-twin:')) {
  draft += `\n## community-twin: add the term "twin" to the lexicon\n\nStatus: planned\nDispatch: fleet\n\nSource: [community request](${termRequest.html_url}). ${termRequest.body}\nCompletion: list the sourced definition and render it on the homepage.\n`;
}
const late = poll.split('\n').find((l) => l.startsWith('NEW comment on #4 ') && l.includes('Late owner reply:'));
if (late && !draft.includes('Late owner reply recorded')) {
  const comment = JSON.parse(late.replace('NEW comment on #4 ', ''));
  draft = draft.replace('Status: unresolved proposal; owner priority retained', 'Status: resolved direction; CSV stays later');
  draft += `\nLate owner reply recorded: [source](${comment.html_url}). ${comment.body}\n`;
}
for (const note of snapshot.intake) if (!draft.includes(note.id)) draft += `\nIntake ${note.id}: [${note.author}](${note.source}) — ${note.body}\n`;
if (draft !== readFileSync(resolve(plan, 'ROADMAP.md'), 'utf8')) writeFileSync(resolve(plan, 'ROADMAP.md'), draft);
if (run(['git', 'status', '--porcelain'], plan)) {
  run(['bun', 'run', 'check'], plan);
  run(['git', 'add', 'ROADMAP.md'], plan);
  run(['git', '-c', 'user.name=Open Autonomy agent', '-c', 'user.email=agent@open-autonomy.org', '-c', 'core.hooksPath=/dev/null', 'commit', '-s', '-m', `${snapshot.branch.slice(6)}: reconcile sourced roadmap`], plan);
  run(['git', 'push', '-u', 'origin', snapshot.branch], plan);
  console.log('SCRUM_BEAT_DONE plan pushed; dispatch waits for landing.');
} else {
  // finish refuses a clean but unmerged plan, so no queue or cursor acknowledgment follows it.
  scrum('finish');
  const seed = JSON.parse(readFileSync(resolve(project, 'hermes/kanban.seed.json'), 'utf8'));
  if (current.includes('## community-twin:')) seed.tasks.push({key: 'community-twin', title: 'add the term "twin" to the lexicon', acceptance: ['lexicon list shows twin with its sourced definition from issue #2', 'the homepage renders the term from the glossary']});
  const board = JSON.parse(run(['hermes', 'kanban', 'list', '--archived', '--json']));
  const item = seed.tasks.find((t: { key: string; title: string; held?: string }) => !t.held && (!special || t.key === 'add') && !board.some((b: { title: string }) => b.title === t.title));
  if (item) console.log(scrum('queue', item.key, 'implementation', item.title, item.acceptance.map((a: string) => `- ${a}`).join('\n'), ...((board.findLast((b: { status: string }) => ['running', 'review', 'ready', 'todo'].includes(b.status))) ? [board.findLast((b: { status: string }) => ['running', 'review', 'ready', 'todo'].includes(b.status)).id] : [])));
  community('mark', 'pm');
  console.log('SCRUM_BEAT_DONE landed plan reconciled; no human work dispatched.');
}
