// THE PRICE OF A SELF-CONTAINED FRONTEND, paid here.
//
// `scripts/runner.ts` cannot import `@open-autonomy/substrate-hermes` — the substrate packages are
// `private: true`, so an installed repo has nothing to resolve — which means the emitted CLI carries its
// OWN copy of the launch rules: the card body encoding, the workspace kind, the branch derivation, the
// idempotency key, and above all the review edge (`review: <role>` -> a linked child card, which is the
// merge boundary). Two copies of a rule is exactly the drift the one-owner discipline forbids, and the
// failure would be SILENT in the worst possible way: a PM dispatching through a frontend whose review edge
// had quietly stopped matching would file proposals nobody is scheduled to review, while `HermesRunner`,
// the tests, and every document still said the boundary was there.
//
// So this is the seam instead of a convention: both implementations are run against a STUB `hermes` that
// records the argv it is handed, and the two recordings must be identical. Not a paraphrase of the rules —
// the actual commands, byte for byte.
import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HermesRunner } from './runner';
import { runnerFrontendSrc } from './runner-frontend';

/** The manifest both implementations read: an isolated proposer that declares a reviewer, and a shared
 *  reviewer — the shape that exercises every branch of the launch path at once. */
const MANIFEST = {
  agents: {
    develop: {
      execution: { workspace: 'isolated' },
      timeout: 45,
      review: 'review',
      params: { ZTRACK_ISSUE: 'subject.ref' },
    },
    review: { execution: { workspace: 'shared' }, params: { ZTRACK_ISSUE: 'subject.ref' } },
  },
};

/** A stand-in for `hermes` that appends each invocation's argv to a log and answers `kanban create` with
 *  the kernel's real one-line receipt, so both callers parse a card id the same way they would live. */
const STUB = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$RUNNER_ARGV_LOG"
case "$*" in
  *" create "*) echo "Created t_stub00  (ready, assignee)";;
  *" show "*)   echo '{"task":{"id":"t_stub00","title":"t","body":null,"assignee":"develop","status":"ready","workspace_kind":"worktree","branch_name":"LOCAL-1-abc"},"children":[]}';;
  *)            echo '[]';;
esac
`;

function stubRepo(): { dir: string; bin: string; log: string } {
  const dir = mkdtempSync(join(tmpdir(), 'oa-frontend-'));
  mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
  writeFileSync(join(dir, '.open-autonomy', 'autonomy.json'), JSON.stringify(MANIFEST));
  const bin = join(dir, 'hermes-stub');
  writeFileSync(bin, STUB);
  chmodSync(bin, 0o755);
  return { dir, bin, log: join(dir, 'argv.log') };
}

/** Exactly two things legitimately differ between the runs and both are identity, not rule: each gets its
 *  own temp repo, and the branch carries a creation-time token (`branchFor`, distinct per card by design).
 *  Normalising those two is what lets everything else — workspace kind AND path, body, timeout, idempotency
 *  key, the review card's parent and its placement in the proposal's worktree — be compared exactly. */
const normalize = (log: string, dir: string) =>
  readFileSync(log, 'utf8')
    .replaceAll(dir, '<repo>')
    .replace(/LOCAL-1-[0-9a-z]+-[0-9a-z]+/g, 'LOCAL-1-<token>')
    .trim()
    .split('\n');

test('the emitted frontend and HermesRunner issue IDENTICAL kanban commands for a launch', async () => {
  const a = stubRepo();
  await new HermesRunner({
    cwd: a.dir,
    installDir: a.dir,
    bin: a.bin,
    env: { ...process.env, RUNNER_ARGV_LOG: a.log },
  }).launch('develop', { ZTRACK_ISSUE: 'LOCAL-1' });

  const b = stubRepo();
  writeFileSync(join(b.dir, 'runner.ts'), runnerFrontendSrc());
  const run = spawnSync('bun', [join(b.dir, 'runner.ts'), 'launch', 'develop', '--ref', 'LOCAL-1'], {
    cwd: b.dir,
    encoding: 'utf8',
    env: { ...process.env, RUNNER_ARGV_LOG: b.log, HERMES_BIN: b.bin },
  });
  expect(run.status, `frontend failed: ${run.stdout}${run.stderr}`).toBe(0);

  const [fromRunner, fromFrontend] = [normalize(a.log, a.dir), normalize(b.log, b.dir)];
  // Two creates — the proposal, then its review card. If the frontend ever stops opening the second one,
  // this is what catches it.
  expect(fromRunner.filter((l) => l.includes(' create ')).length).toBe(2);
  expect(fromFrontend).toEqual(fromRunner);
});

test('...and for list / get / cancel too — every verb, not just the one that was easy to check', async () => {
  // The first version of this file covered `launch` only, which is exactly the shape of coverage that
  // reads as a guarantee and is not one: the other three verbs could drift freely while the test stayed
  // green. `cancel` matters most — it archives CHILDREN first, and a frontend that forgot to would strand
  // every review card of a cancelled proposal in `todo` forever, waiting on a parent that never completes.
  for (const argv of [['list'], ['get', 't_stub00'], ['cancel', 't_stub00']]) {
    const a = stubRepo();
    const runner = new HermesRunner({ cwd: a.dir, installDir: a.dir, bin: a.bin, env: { ...process.env, RUNNER_ARGV_LOG: a.log } });
    if (argv[0] === 'list') await runner.list();
    else if (argv[0] === 'get') await runner.get('t_stub00');
    else await runner.cancel('t_stub00');

    const b = stubRepo();
    writeFileSync(join(b.dir, 'runner.ts'), runnerFrontendSrc());
    const run = spawnSync('bun', [join(b.dir, 'runner.ts'), ...argv], {
      cwd: b.dir, encoding: 'utf8',
      env: { ...process.env, RUNNER_ARGV_LOG: b.log, HERMES_BIN: b.bin },
    });
    expect(run.status, `frontend ${argv[0]} failed: ${run.stdout}${run.stderr}`).toBe(0);
    expect(normalize(b.log, b.dir), `verb: ${argv[0]}`).toEqual(normalize(a.log, a.dir));
  }
});

test('the frontend refuses --branch instead of ignoring it, and names git’s constraint', () => {
  const b = stubRepo();
  writeFileSync(join(b.dir, 'runner.ts'), runnerFrontendSrc());
  const run = spawnSync(
    'bun',
    [join(b.dir, 'runner.ts'), 'launch', 'develop', '--ref', 'LOCAL-1', '--branch', 'agent/issue-LOCAL-1'],
    { cwd: b.dir, encoding: 'utf8', env: { ...process.env, RUNNER_ARGV_LOG: b.log, HERMES_BIN: b.bin } },
  );
  // Non-zero AND no card created: a silently-ignored --branch would let a PM believe it had placed two
  // workers in one worktree, which is the collision that auto-blocks both cards.
  expect(run.status).not.toBe(0);
  expect(run.stderr).toContain('one branch in two worktrees');
  expect(existsSync(b.log)).toBe(false);
});
