// `update()` must never report a block it cannot vouch for.
//
// Two states are indistinguishable to a boolean and mean opposite things. The kernel's unblock-loop breaker
// can accept a block AND take the card to `triage`, where it is undispatchable and `kanban unblock` will not
// move it — `true` there reads as an ordinary pause. And `readCard` returns `undefined` for both "no such
// task" and a board that cannot be read (`kanban show <missing>` exits 0, so the JSON parse is the only
// detector), which makes the triage check a silent no-op — `ok` there is the kernel's exit code standing in
// for an observation nobody made. Both throw; this file is why they stay throwing.
import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HermesRunner } from './runner';

/** A `hermes` stand-in whose `show` answers change per call, so a block's before/after can differ.
 *  `$STUB_SHOW_SEQUENCE` is a `|`-separated list of statuses; the Nth `show` gets the Nth entry (the last
 *  one repeats). The literal `UNREADABLE` emits non-JSON, which is exactly what a locked db or a missing
 *  card looks like through `readCard`. */
const STUB = `#!/usr/bin/env bash
case "$*" in
  *" show "*)
    n=0
    [ -f "$STUB_COUNTER" ] && n=$(cat "$STUB_COUNTER")
    n=$((n + 1)); echo "$n" > "$STUB_COUNTER"
    i=0; picked=""
    IFS='|' read -ra seq <<< "$STUB_SHOW_SEQUENCE"
    for s in "\${seq[@]}"; do
      i=$((i + 1))
      picked="$s"
      [ "$i" -ge "$n" ] && break
    done
    if [ "$picked" = "UNREADABLE" ]; then
      echo "no such task: t_stub00"
    else
      echo "{\\"task\\":{\\"id\\":\\"t_stub00\\",\\"title\\":\\"t\\",\\"body\\":null,\\"assignee\\":\\"develop\\",\\"status\\":\\"$picked\\"},\\"children\\":[]}"
    fi
    ;;
  *) exit 0;;
esac
`;

function runnerWith(sequence: string): HermesRunner {
  const dir = mkdtempSync(join(tmpdir(), 'oa-update-'));
  mkdirSync(join(dir, '.open-autonomy'), { recursive: true });
  writeFileSync(join(dir, '.open-autonomy', 'autonomy.json'), JSON.stringify({ agents: {} }));
  const bin = join(dir, 'hermes-stub');
  writeFileSync(bin, STUB);
  chmodSync(bin, 0o755);
  return new HermesRunner({
    cwd: dir,
    installDir: dir,
    bin,
    env: { ...process.env, STUB_SHOW_SEQUENCE: sequence, STUB_COUNTER: join(dir, 'counter') },
  });
}

test('a block that wedges the card into `triage` REJECTS rather than returning true', async () => {
  // before=blocked, after=triage: the breaker fired on a repeated same-kind block.
  const runner = runnerWith('blocked|triage');
  await expect(runner.update('t_stub00', { status: 'paused' })).rejects.toThrow(/triage/);
});

test('...and `failed` routes through the same guard, not just `paused`', async () => {
  // The first version of this fix guarded only one of the two branches, and each kind trips the breaker on
  // its OWN repeat (`same_cause = prev_kind == kind`), so guarding one leaves the other silently wedging.
  const runner = runnerWith('blocked|triage');
  await expect(runner.update('t_stub00', { status: 'failed' })).rejects.toThrow(/triage/);
});

test('a block whose card cannot be read afterwards REJECTS instead of reporting the exit code', async () => {
  // The `block` call itself exits 0; the post-block read is unparseable. Whether the card wedged is
  // unknown, so success would be a guess — and the guess would hide the exact wedge above.
  const runner = runnerWith('blocked|UNREADABLE');
  await expect(runner.update('t_stub00', { status: 'paused' })).rejects.toThrow(/could not be read/);
});

test('an ordinary block still returns true', async () => {
  // The guards must not make every block loud — a healthy park is the common case.
  const runner = runnerWith('running|blocked');
  expect(await runner.update('t_stub00', { status: 'paused' })).toBe(true);
});
