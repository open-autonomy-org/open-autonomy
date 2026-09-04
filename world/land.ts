#!/usr/bin/env bun
// Land the agent's branches on the GitHub twin (bun world/run.ts land). On GitHub this is land.yml plus
// native auto-merge on the required checks; the twin has no Actions, so the world performs the same rule as
// the maintainer would: for each agent/* branch, run the project's own check on it and merge it to main only
// if the check passes. Labelled as exactly that — our rule by hand, not a fake of GitHub.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { ACCOUNT, DATA, WORK, git, need } from './lib.ts';

need('GITHUB_TWIN_URL');
if (!existsSync(WORK)) throw new Error(`${WORK} is missing — run \`bun world/run.ts seed\` first`);
await git(WORK, 'fetch', '-q', '--prune', 'origin');
const branches = (await git(WORK, 'for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/agent/')).split('\n').map((b) => b.trim()).filter(Boolean);
if (!branches.length) { console.log('land: no agent/* branch on the twin'); process.exit(0); }
const trees = resolve(DATA, 'land');
mkdirSync(trees, { recursive: true });
for (const remote of branches) {
  const branch = remote.replace(/^origin\//, '');
  const tree = resolve(trees, branch.replace(/\//g, '__'));
  rmSync(tree, { recursive: true, force: true });
  await git(WORK, 'worktree', 'prune');
  await git(WORK, 'worktree', 'add', '-q', '--detach', tree, remote);
  // The project's own check, on the branch's head: the required status check, performed here (installing
  // from the lockfile first, as CI would; bun's cache keeps that inside the sealed world).
  const install = existsSync(resolve(tree, 'bun.lock')) ? Bun.spawnSync({ cmd: ['bun', 'install', '--frozen-lockfile'], cwd: tree, stdout: 'pipe', stderr: 'pipe' }) : null;
  const check = install && install.exitCode !== 0 ? install : Bun.spawnSync({ cmd: ['bun', 'run', 'check'], cwd: tree, stdout: 'pipe', stderr: 'pipe' });
  const green = check.exitCode === 0;
  await git(WORK, 'worktree', 'remove', '--force', tree);
  if (!green) { console.log(`land: ${branch} — check FAILED, not merged\n${check.stderr.toString().slice(-600)}`); continue; }
  await git(WORK, 'checkout', '-q', 'main');
  await git(WORK, 'reset', '-q', '--hard', 'origin/main');
  await git(WORK, '-c', 'user.name=landing', '-c', 'user.email=landing@example.test', 'merge', '--no-ff', '-q', '-m', `Merge ${branch} (checks passed)`, remote);
  await git(WORK, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  await git(WORK, 'push', '-q', 'origin', '--delete', branch);
  console.log(`land: ${branch} — check passed, merged to main on the twin`);
}
