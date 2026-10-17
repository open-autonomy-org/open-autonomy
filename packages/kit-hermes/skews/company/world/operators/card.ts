#!/usr/bin/env bun
// The board-card story's operator: it creates the story's one card on the install's board, as the owner would, and
// prints the card, its PR and the GitHub twin's merge state. Claim, launch, review and close are the board's own; this
// creates nothing else and moves nothing. Run again while the card is open, it creates no second card and prints where
// the first one is; once that card is done or cancelled, a run creates the story's next card.
//
//   world attach <name> --root <state> -- bun world/operators/card.ts
//
// VO_CARD_MACHINE names the machine the card runs on (the World's first machine when unset).
import { CARD_TITLE } from '../model/card.ts';
import { ACCOUNT, MACHINE, need } from '../lib.ts';

const bin = need('VO_SUPERCODE_BIN'), home = need('HOME'), github = need('GITHUB_TWIN_URL');
const supercode = (...args: string[]) => {
  const done = Bun.spawnSync({ cmd: [bin, 'workflow', ...args, '--root', home], stdout: 'pipe', stderr: 'pipe' });
  if (done.exitCode !== 0) throw new Error(`supercode workflow ${args[0]}: ${done.stderr.toString().trim().split('\n').at(-1)}`);
  return done.stdout.toString();
};
const listed = JSON.parse(supercode('list', '--json')) as unknown;
const cards = (Array.isArray(listed) ? listed : (listed as { data?: unknown[] }).data ?? []) as Array<{ id: string; title: string; status: string }>;
let id = cards.find((c) => c.title === CARD_TITLE && !['done', 'cancelled', 'archived'].includes(c.status))?.id;
if (!id) {
  const created = supercode('create', CARD_TITLE, '--assignee', 'coder', '--workspace', `worktree:${need('VO_AGENT_PROJECT')}`,
    '--machine', process.env.VO_CARD_MACHINE ?? MACHINE,
    '--body', 'Add one line to REHEARSAL.md saying the rehearsal ran one board card end to end, on a PR to main.');
  id = /t_[0-9a-f]+/.exec(created)?.[0];
  if (!id) throw new Error(`no card id in: ${created.trim()}`);
  console.log(`created ${id}`);
}
console.log(supercode('show', id).trim());
const pulls = await (await fetch(`${github}/repos/${ACCOUNT}/pulls?state=all&per_page=100`, { headers: { authorization: 'Bearer world-bot' } })).json() as Array<{ number: number; html_url: string; state: string; merged_at: string | null; head: { ref: string; sha: string } }>;
const pr = pulls.find((p) => p.head.ref === `wt/${id}`);
console.log(pr
  ? `\nPR #${pr.number} ${pr.html_url}: head ${pr.head.ref} at ${pr.head.sha.slice(0, 8)}, ${pr.merged_at ? `merged at ${pr.merged_at}` : pr.state}`
  : `\nno PR from wt/${id} on the GitHub twin yet`);
