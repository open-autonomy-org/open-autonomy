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

/** The same stub, but the FIRST `show` answers `done` — a spent idempotency key. Hermes resolves
 *  `--idempotency-key` with `status != 'archived'`, so a finished card comes back as a hit with the same
 *  `Created <id>` receipt and exit 0; both implementations must detect that and retry under a discriminated
 *  key AND a fresh branch. A counter file makes the answer depend on call order, which is the only way to
 *  drive a retry loop from a stub. */
const STUB_SPENT_KEY = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$RUNNER_ARGV_LOG"
case "$*" in
  *" create "*) echo "Created t_stub00  (ready, assignee)";;
  *" show "*)
    n=0
    [ -f "$STUB_COUNTER" ] && n=$(cat "$STUB_COUNTER")
    n=$((n + 1)); echo "$n" > "$STUB_COUNTER"
    if [ "$n" = "1" ]; then st=done; else st=ready; fi
    echo "{\\"task\\":{\\"id\\":\\"t_stub00\\",\\"title\\":\\"t\\",\\"body\\":null,\\"assignee\\":\\"develop\\",\\"status\\":\\"$st\\",\\"workspace_kind\\":\\"worktree\\",\\"branch_name\\":\\"LOCAL-1-abc\\"},\\"children\\":[]}"
    ;;
  *) echo '[]';;
esac
`;

function stubRepo(stub: string = STUB): { dir: string; bin: string; log: string; counter: string } {
  const dir = mkdtempSync(join(tmpdir(), 'oa-frontend-'));
  mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
  writeFileSync(join(dir, '.open-autonomy', 'autonomy.json'), JSON.stringify(MANIFEST));
  const bin = join(dir, 'hermes-stub');
  writeFileSync(bin, stub);
  chmodSync(bin, 0o755);
  return { dir, bin, log: join(dir, 'argv.log'), counter: join(dir, 'counter') };
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

test('...and the SESSION SHAPE they print agrees for every card status, not just the argv', async () => {
  // The gap that let a real bug through. This file's header claims it is the seam that keeps the two
  // implementations honest — but it only ever compared the kanban argv handed to the stub, never the JSON
  // either side PRINTS. So when `triage` was corrected from a healthy `running` session to `paused` on
  // HermesRunner, the emitted frontend kept reporting a wedged card as running, and this test stayed
  // green. The frontend is the surface the PM actually reads; a status divergence there is the whole
  // failure, and the argv was identical throughout.
  for (const status of ['triage', 'todo', 'scheduled', 'ready', 'running', 'review', 'blocked', 'done', 'archived']) {
    const a = stubRepo();
    writeFileSync(join(a.dir, 'runner.ts'), runnerFrontendSrc());
    writeFileSync(join(a.dir, 'hermes-stub'), STUB.replace('"status":"ready"', `"status":"${status}"`));
    chmodSync(join(a.dir, 'hermes-stub'), 0o755);
    const fromRunner = await new HermesRunner({
      cwd: a.dir, installDir: a.dir, bin: a.bin, env: { ...process.env, RUNNER_ARGV_LOG: a.log },
    }).get('t_stub00');

    const run = spawnSync('bun', [join(a.dir, 'runner.ts'), 'get', 't_stub00', '--json'], {
      cwd: a.dir, encoding: 'utf8',
      env: { ...process.env, RUNNER_ARGV_LOG: `${a.log}.f`, HERMES_BIN: a.bin },
    });
    expect(run.status, `frontend get failed for ${status}: ${run.stderr}`).toBe(0);
    const fromFrontend = JSON.parse(run.stdout);
    // `status` is the contract vocabulary both must agree on. The frontend additionally carries `card`
    // (the raw Hermes status) and `branch`/`workspace`/`params`, which HermesRunner returns differently —
    // those are deliberate, the status mapping is not.
    expect(fromFrontend.status, `status disagrees for card status "${status}"`).toBe(fromRunner!.status);
  }
});

test('a SPENT idempotency key retries under a new key AND a new branch — in both implementations', async () => {
  // THE REWORK PATH, and until now it was exercised by nothing on either side. Hermes matches
  // `--idempotency-key` on `status != 'archived'`, so after a reviewer requests changes the proposal card
  // is `done` and re-filing returns THAT card with exit 0 and a `Created` receipt — no new card, no worker,
  // no error, and `list` hides `done`, so the PM re-files forever. Both implementations detect the spent
  // key and retry.
  //
  // The FRESH BRANCH is the half that reviewers caught and a test did not: the argv is built once, so a
  // retry that reuses the first branch hands git a branch already checked out in the previous card's
  // worktree (which Hermes never removes), the spawn fails, and the card auto-blocks. That would have
  // turned "rework silently does nothing" into "rework reliably wedges".
  const runs: Array<{ log: string; dir: string }> = [];

  const a = stubRepo(STUB_SPENT_KEY);
  await new HermesRunner({
    cwd: a.dir,
    installDir: a.dir,
    bin: a.bin,
    env: { ...process.env, RUNNER_ARGV_LOG: a.log, STUB_COUNTER: a.counter },
  }).launch('develop', { ZTRACK_ISSUE: 'LOCAL-1' });
  runs.push({ log: a.log, dir: a.dir });

  const b = stubRepo(STUB_SPENT_KEY);
  writeFileSync(join(b.dir, 'runner.ts'), runnerFrontendSrc());
  const run = spawnSync('bun', [join(b.dir, 'runner.ts'), 'launch', 'develop', '--ref', 'LOCAL-1'], {
    cwd: b.dir,
    encoding: 'utf8',
    env: { ...process.env, RUNNER_ARGV_LOG: b.log, STUB_COUNTER: b.counter, HERMES_BIN: b.bin },
  });
  expect(run.status, `frontend failed: ${run.stdout}${run.stderr}`).toBe(0);
  runs.push({ log: b.log, dir: b.dir });

  for (const { log, dir } of runs) {
    const raw = readFileSync(log, 'utf8');
    const which = dir === a.dir ? 'HermesRunner' : 'frontend';

    // THREE creates: the proposal, its retry under the spent key, and the review card.
    const creates = raw.split('\n').filter((l) => l.includes(' create '));
    expect(creates.length, `${which}: expected proposal + retry + review card`).toBe(3);

    // The retry is discriminated, and only the retry. Keys are pulled from the RAW log rather than the
    // `create` lines: the card body is multi-line, and every flag after `--body` therefore lands on a later
    // line of the argv log than the word `create` does.
    const keys = [...raw.matchAll(/--idempotency-key (open-autonomy:\S+(?: \(attempt \d+\))?)/g)].map((m) => m[1]!);
    expect(keys, `${which}: proposal, its retry, then the review card`).toEqual([
      'open-autonomy:develop:LOCAL-1',
      'open-autonomy:develop:LOCAL-1 (attempt 2)',
      'open-autonomy:review:LOCAL-1:t_stub00',
    ]);

    // ...and it carries a DIFFERENT branch. Compared before `normalize`, which masks branch tokens on
    // purpose — so this assertion cannot live in the equivalence comparison below.
    const branches = [...raw.matchAll(/--branch (\S+)/g)].map((m) => m[1]!);
    expect(branches.length, `${which}: one branch per proposal attempt`).toBe(2);
    expect(branches[0], `${which}: the retry reused the first branch`).not.toBe(branches[1]);
  }

  // And the two implementations did all of that identically.
  expect(normalize(b.log, b.dir)).toEqual(normalize(a.log, a.dir));
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
