// The attention sweep, run for real against a stub `hermes`.
//
// This is the human seam's other half, and its failure mode is SILENCE — the same failure it exists to
// remove. A sweep that stops reporting looks exactly like a healthy board, so nothing downstream would ever
// notice; that is what earns it a test rather than a read-through.
//
// It is also the file where reading was demonstrably not enough: the first version pulled the block reason
// only from events of kind `blocked`, and a card driven to `triage` therefore reported the FIRST block's
// reason and "recurrence 1" while the `block_loop_detected` event beside it carried the real last reason
// and "recurrences 2". That was found by running it against a live board, not by reviewing it.
import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ATTENTION_SWEEP_SCRIPT } from './notifications';

/** A `hermes` stand-in that answers `kanban list` / `kanban show` from files the test writes. Keeping the
 *  fixtures on disk (rather than baked into the stub) is what lets one sweep run see a different board than
 *  the next, which is the whole point of the state-diff. */
const STUB = `#!/usr/bin/env bash
case "$*" in
  *"kanban list"*) cat "$STUB_LIST";;
  *"kanban show"*) cat "$STUB_SHOW";;
  *) exit 1;;
esac
`;

/** The real event shapes, copied from a live board (`kanban show --json`): `events` is a SIBLING of `task`,
 *  and a block event's payload carries `reason` / `kind` / `recurrences`. */
const blockedEvents = (reason: string) => ({
  task: { id: 't_1', status: 'blocked' },
  events: [
    { kind: 'created', payload: { status: 'ready' } },
    { kind: 'blocked', payload: { reason, kind: 'needs_input', recurrences: 1 } },
  ],
});

/** The kernel's unblock-loop breaker: the TERMINAL event carries its own, later reason. */
const triagedEvents = {
  task: { id: 't_1', status: 'triage' },
  events: [
    { kind: 'blocked', payload: { reason: 'the FIRST reason', kind: 'needs_input', recurrences: 1 } },
    { kind: 'unblocked', payload: null },
    { kind: 'block_loop_detected', payload: { reason: 'the LAST reason', kind: 'needs_input', recurrences: 2, limit: 2 } },
  ],
};

function rig() {
  const dir = mkdtempSync(join(tmpdir(), 'oa-sweep-'));
  const bin = join(dir, 'hermes-stub');
  writeFileSync(bin, STUB);
  chmodSync(bin, 0o755);
  const sweep = join(dir, 'sweep.py');
  writeFileSync(sweep, ATTENTION_SWEEP_SCRIPT);
  const paths = {
    dir,
    list: join(dir, 'list.json'),
    show: join(dir, 'show.json'),
    state: join(dir, 'state.json'),
    log: join(dir, 'attention.log'),
  };
  const run = (board: unknown[], shown: unknown) => {
    writeFileSync(paths.list, JSON.stringify(board));
    writeFileSync(paths.show, JSON.stringify(shown));
    const r = spawnSync('python3', [sweep], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HERMES_BIN: bin,
        STUB_LIST: paths.list,
        STUB_SHOW: paths.show,
        OPEN_AUTONOMY_ATTENTION_STATE: paths.state,
        OPEN_AUTONOMY_ATTENTION_LOG: paths.log,
      },
    });
    // Always 0: a sweep that crashes must not take a gateway tick with it.
    expect(r.status, `sweep exited ${r.status}: ${r.stderr}`).toBe(0);
    return r.stdout;
  };
  return { ...paths, run };
}

const PARKED = [{ id: 't_1', status: 'blocked', title: 'implement LOCAL-1', assignee: 'develop' }];

test('a newly parked card is reported once, then the board goes quiet', () => {
  const r = rig();

  const first = r.run(PARKED, blockedEvents('which auth mode?'));
  expect(first).toContain('t_1');
  expect(first).toContain('which auth mode?');
  expect(first).toContain('a worker is asking for a human');
  // The operator gets the two commands that actually resolve it, not a bare alert.
  expect(first).toContain('hermes kanban show t_1 --json');
  expect(first).toContain('hermes kanban unblock t_1');

  // SILENCE is the contract for an unchanged board: under `cron --no-agent`, empty stdout means no
  // delivery at all, so a healthy fleet costs the operator nothing.
  expect(r.run(PARKED, blockedEvents('which auth mode?'))).toBe('');
});

test('a healthy board prints NOTHING and creates no log', () => {
  const r = rig();
  expect(r.run([{ id: 't_9', status: 'running', title: 'live work' }], {})).toBe('');
  expect(existsSync(r.log)).toBe(false);
});

test('a card that unparks and re-parks is reported AGAIN', () => {
  // The state is keyed id -> status over the CURRENTLY parked set, so leaving the set drops the entry.
  // Without that, a card answered on Monday and re-blocked on Friday would never be mentioned again.
  const r = rig();
  r.run(PARKED, blockedEvents('first ask'));
  expect(r.run([{ id: 't_1', status: 'running', title: 'implement LOCAL-1' }], {})).toBe('');
  expect(r.run(PARKED, blockedEvents('second ask'))).toContain('second ask');
});

test('a KERNEL give-up is not reported as a human question, and carries the TERMINAL reason', () => {
  // The distinction that decides what the operator does: a `needs_input` block is a question waiting for an
  // answer; a kernel give-up is an environment to fix, with nobody left to ask. And the reason must come
  // from the terminal event — reading only `blocked` reported the stale first ask.
  const r = rig();
  const out = r.run([{ id: 't_1', status: 'triage', title: 'implement LOCAL-1', assignee: 'develop' }], triagedEvents);
  expect(out).toContain('THE KERNEL GAVE UP');
  expect(out).toContain('the LAST reason');
  expect(out).not.toContain('the FIRST reason');
  expect(out).toContain('recurrence 2');
  // `unblock` does not move a triage card, and saying otherwise sends the operator down a dead end.
  expect(out).toContain('will NOT move a triage card');
});

test('an unreadable board is silent on stdout but loud on stderr — never a false all-clear', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oa-sweep-fail-'));
  const sweep = join(dir, 'sweep.py');
  writeFileSync(sweep, ATTENTION_SWEEP_SCRIPT);
  const r = spawnSync('python3', [sweep], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HERMES_BIN: join(dir, 'does-not-exist'),
      OPEN_AUTONOMY_ATTENTION_STATE: join(dir, 'state.json'),
      OPEN_AUTONOMY_ATTENTION_LOG: join(dir, 'log'),
    },
  });
  expect(r.status).toBe(0);
  expect(r.stdout).toBe('');
  expect(r.stderr).toContain('attention sweep');
});

test('every reported card is appended to the durable log, not only delivered', () => {
  // Delivery can fail (no platform configured, a gateway down). The log is what makes the report
  // recoverable after the fact.
  const r = rig();
  r.run(PARKED, blockedEvents('which auth mode?'));
  mkdirSync(r.dir, { recursive: true });
  expect(readFileSync(r.log, 'utf8')).toContain('which auth mode?');
});
