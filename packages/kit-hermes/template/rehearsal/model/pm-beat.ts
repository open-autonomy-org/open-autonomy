#!/usr/bin/env bun
// The scripted PM's judgment for one scrum, run by the model twin as the brain's terminal call (rehearsal/model/
// scenario.ts). It walks the PM skill's own doors the way the real PM does — prepare the planning worktree, read what
// arrived, plan, land the plan through the landing convention the world plays, acknowledge the inputs — with the
// judgment fixed: every new issue becomes a planned outcome on the roadmap, sourced to it, held until a person says
// otherwise. Its last line is the verdict the scenario keys on. Runs in the brain's checkout.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const project = process.cwd();
const run = (cmd: string[], cwd = project): string => {
  const r = Bun.spawnSync({ cmd, cwd, stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode) throw new Error(`${cmd.slice(0, 3).join(' ')}: ${r.stderr.toString().trim().slice(-600)}`);
  return r.stdout.toString().trim();
};
const scrum = (...args: string[]) => run(['bun', '.open-autonomy/scrum.ts', ...args]);
const community = (...args: string[]) => run(['bun', '.open-autonomy/community.ts', ...args]);

const snapshot = JSON.parse(scrum('prepare')) as { worktree: string; branch: string; snapshot: { id: string; main: string }; main: string };
const plan = snapshot.worktree;
const poll = community('poll', 'pm');
const issues = poll.split('\n').filter((l) => l.startsWith('NEW issue ')).map((l) => JSON.parse(l.slice('NEW issue '.length)) as { number: number; title: string; body?: string; html_url: string });

let draft = readFileSync(resolve(plan, 'ROADMAP.md'), 'utf8');
let planned = 0;
for (const issue of issues) {
  const key = `request-${issue.number}`;
  if (draft.includes(`## ${key}: `)) continue;
  const ask = (issue.body ?? '').split('\n').find((l) => l.trim()) ?? issue.title;
  draft += `\n## ${key}: ${issue.title}\n\nStatus: planned; a person confirms the direction before dispatch.\nDispatch: hold\n\nSource: [issue #${issue.number}](${issue.html_url}). ${ask}\n\nCompletion:\n- the request is answered on the issue\n- when built, the change lands with the check green\n`;
  planned++;
}
if (planned) {
  writeFileSync(resolve(plan, 'ROADMAP.md'), draft);
  run(['git', 'add', 'ROADMAP.md'], plan);
  run(['git', 'commit', '-q', '-m', `scrum: ${planned} request(s) planned from the community`], plan);
  run(['git', 'push', '-q', '-u', 'origin', snapshot.branch], plan);
  // The landing convention the world plays: the pull request opens, the check runs, the merge lands on main.
  const landed = (): boolean => { run(['git', 'fetch', '-q', 'origin', 'main'], plan); return Bun.spawnSync({ cmd: ['git', 'merge-base', '--is-ancestor', 'HEAD', 'origin/main'], cwd: plan }).exitCode === 0; };
  const deadline = Date.now() + 240_000;
  while (!landed()) { if (Date.now() > deadline) throw new Error(`the plan on ${snapshot.branch} did not land within four minutes`); Bun.sleepSync(3000); }
}
scrum('finish', snapshot.snapshot.id, 'main', 'sessions');
community('mark', 'pm');
console.log(`PM_BEAT_DONE ${planned} request(s) planned`);
