// Opening position for the scrum rehearsal: people use GitHub's ordinary doors.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, DATA, api, git, need } from './lib.ts';
const gh = api(need('GITHUB_TWIN_URL'));
for (const [title, body] of [
  ['scrum: owner direction', 'Owner direction: prioritize the add command. CSV export is later. Keep release review with the maintainer.'],
  ['scrum: documentation commitment', "I'll do the usage documentation. Please acknowledge that scope; I have not agreed a deadline."],
  ['scrum: optional help', 'Could someone help with translations? This is a suggestion; nobody has volunteered.'],
  ['scrum: conflicting proposal', 'Proposal: do CSV export before the add command. This conflicts with the owner direction and needs reconciliation.'],
]) {
  const r = await gh.post(`/repos/${ACCOUNT}/issues`, { title, body });
  if (r.status !== 201) throw new Error(`scrum seed issue: ${r.status} ${r.text}`);
}
const work = resolve(DATA, 'work');
await git(work, 'checkout', '-b', 'contributor/release-notes');
writeFileSync(resolve(work, 'OUTSIDE.md'), 'An outside contributor supplied release notes. This does not release the project.\n');
await git(work, 'add', 'OUTSIDE.md');
await git(work, 'commit', '-m', 'contributor: release notes');
await git(work, 'push', 'origin', 'contributor/release-notes');
const pr = await gh.post(`/repos/${ACCOUNT}/pulls`, { title: 'scrum: outside release notes', head: 'contributor/release-notes', base: 'main', body: 'Outside contribution overlaps planned release notes. Review and integrate; release review remains required.' });
if (pr.status !== 201) throw new Error(`scrum seed PR: ${pr.status} ${pr.text}`);
await git(work, 'checkout', 'main');
console.log('scrum: seeded owner direction, a volunteer, an unanswered suggestion, a contradiction and an outside PR.');
