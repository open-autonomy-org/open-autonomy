// The done-gate: `kanban_complete` is REFUSED until `ztrack check` is green.
//
// This is where OA's "done is verified, not presumed" becomes literally true on Hermes, and it is the one
// place the two planes touch. Hermes' kanban kernel owns DISPATCH (board, WIP, leases, worktrees, the
// review lane); ztrack owns VERIFICATION (a checked acceptance criterion must cite a commit SHA that
// exists in git). Neither reads the other's storage — they meet at a branch name and an exit code.
//
// WHY A TOOL GATE RATHER THAN A PORT OF `ztrack loop`
// A CORRECTION FIRST, because this comment used to justify the design with a false fact: it claimed Hermes
// fires "exactly five hook events... and none of them can extend a turn". Both halves are wrong.
// `hermes_cli/plugins.py` registers far more, and one of them — `pre_verify` — exists for precisely the
// thing the old comment called impossible: it fires once per turn when the agent has edited code and is
// about to finish, and a callback returning `{"action": "continue", "message": ...}` KEEPS THE TURN GOING
// (it even accepts Claude Code's `{"decision": "block", "reason": ...}` Stop shape verbatim). So `ztrack
// loop` has a native landing place here after all.
//
// The tool gate is still the right choice, on its own merits rather than for lack of an alternative:
// `pre_verify` fires when the model is "about to verify/finish", which is a HEURISTIC about the model's
// intent, whereas `kanban_complete` is the exact, unambiguous act of declaring the card done. Blocking that
// call makes `done` UNREACHABLE rather than merely nagged at, and the block `reason` is fed back to the
// model, so the worker reads its own ztrack findings and fixes them — the ralph loop, achieved by refusal.
// A `pre_verify` nudge would be a good ADDITION (it would surface findings earlier, mid-turn) and is
// deliberately not implemented yet; it is an enhancement, not the missing foundation.
//
// Hermes' own answer to "is it done" is `goal_mode`, whose judge is an auxiliary LLM re-reading the card
// (hermes_cli/goals.py). That is precisely the PRESUMPTION this profile exists to reject: the twin run
// proved a `develop` worker that produced nothing still drove its card to `done`, because the kernel sees
// only that a worker returned. A model judging its own output cannot close that hole; a typechecker over
// git can.
import type { IRAgent } from '@open-autonomy/core';
import { capabilityAxis } from './lowering';

export { ztrackPresetOf } from './lowering';

/** Where the generated gate lands in the install, and where the installer copies it inside $HERMES_HOME.
 *  The profile config references the hook by ABSOLUTE path (Hermes `shlex.split`s the command with
 *  `shell=False`, so there is no shell to expand `~` or resolve a relative path against). */
export const ZTRACK_GATE_PATH = 'hermes/hooks/ztrack-done-gate.py';
export const ZTRACK_GATE_INSTALLED_SUBPATH = 'open-autonomy/ztrack-done-gate.py';

/** The Hermes tool the gate refuses. A regex `fullmatch` against `tool_name` (shell_hooks.py's
 *  `matches_tool`), so the hook runs ONLY on the completion call — a gate on every tool call would pay a
 *  `ztrack check` per tool use. */
export const GATED_TOOL = 'kanban_complete';

/** Which actors the gate applies to. TWO conditions, and the second one was missing at first — which
 *  wedged an actor permanently.
 *
 *  1. It holds `code:propose`: its "done" MEANS code exists, and ztrack's guarantee is exactly
 *     commit-backed evidence. (`review`'s done-ness is a VERDICT, and its contract is already the standard
 *     review envelope — the merge gate is the reviewer, not a second check of the same commits. A
 *     `kind: human` actor is never a worker at all.)
 *  2. It runs in an ISOLATED workspace. This is not a preference; it is what makes the gate RESOLVABLE.
 *     The gate runs `ztrack check --auto-scope`, which resolves the issue from the branch name — and only
 *     an isolated actor gets a branch named for its issue (`branchFor`, set by the runner at launch). An
 *     actor in the shared checkout sits on trunk, where `--auto-scope` reports "unresolved (no issue id
 *     found in branch 'master')" and gates the WHOLE TRACKER, so the gate fails closed on every card it
 *     ever sees and the actor can never complete anything.
 *
 *     This exact wedge shipped: `audit` holds `code:propose@docs/audits` and runs in the shared checkout,
 *     so it was gated and permanently unable to finish. The original version of this comment already
 *     excluded `pm`/`draft` for having "no branch for `--auto-scope` to resolve from" — and then failed to
 *     apply its own rule to the one code:propose actor with the same property. Now the rule is the code. */
export function isZtrackGated(agent: IRAgent): boolean {
  if (agent.kind === 'human') return false;
  if (agent.execution?.workspace !== 'isolated') return false;
  return (agent.capabilities ?? []).some((cap) => capabilityAxis(cap) === 'code:propose');
}

/** The `hooks:` block for a gated profile's config.yaml.
 *
 *  TWO KEYS AGAIN, and the second is the trap: a DISPATCHED WORKER IS NOT A TTY. Hermes gates first use of
 *  each `(event, command)` pair behind `~/.hermes/shell-hooks-allowlist.json` and a consent prompt; a
 *  non-TTY caller must supply `accept_hooks` (`--accept-hooks`, `HERMES_ACCEPT_HOOKS=1`, or
 *  `hooks_auto_accept: true` in config — `_resolve_effective_accept`). Without it registration is SKIPPED
 *  WITH A LOG WARNING and the worker runs ungated: the gate silently does not exist. That is the same
 *  silent-no-op class as writing only `platform_toolsets`, and it is why this is emitted as config rather
 *  than left to the operator. */
export function ztrackHooksBlock(gateCommand: string): Record<string, unknown> {
  return {
    hooks: {
      pre_tool_call: [{ command: gateCommand, matcher: GATED_TOOL, timeout: 180 }],
    },
    hooks_auto_accept: true,
  };
}

/** The token `hermes/install.py` swaps for the real gate command once it knows $HERMES_HOME and the
 *  interpreter running Hermes. The config patch is built HERE, serialized into `hermes/lowering.json`, and
 *  substituted there as text — so the hook block's shape has exactly one owner (this file) instead of being
 *  re-implemented in Python and drifting from it. */
export const GATE_COMMAND_PLACEHOLDER = '@@OPEN_AUTONOMY_GATE_COMMAND@@';

// The gate itself. Python for the same reason install.py is: it is the interpreter that RUNS Hermes, so it
// is the one runtime guaranteed present inside a worker — no `jq` dependency to add to the container.
export const ZTRACK_GATE_SCRIPT = `#!/usr/bin/env python3
"""open-autonomy: refuse \`kanban_complete\` until \`ztrack check\` is green.

Registered by hermes/install.py as a Hermes \`pre_tool_call\` shell hook with \`matcher: ${GATED_TOOL}\`.

Wire protocol (agent/shell_hooks.py): the payload arrives as JSON on stdin; printing
\`{"decision": "block", "reason": ...}\` on stdout refuses the call and feeds \`reason\` back to the model.
Printing nothing lets it through.

No arguments are needed. \`ztrack check --auto-scope\` resolves the active issue from the git branch /
worktree name — which the open-autonomy runner set when it created the card (\`kanban create --branch\`) —
and ztrack's own help notes that flag was "built for per-worktree Stop-hook gates". That branch name is the
entire integration between the two planes.
"""
import json
import os
import shutil
import subprocess
import sys

MAX_REASON_CHARS = 4000
TIMEOUT_SECONDS = int(os.environ.get("OPEN_AUTONOMY_ZTRACK_TIMEOUT_S") or "120")


def block(reason):
    """Refuse the completion. Exit 0 — the HOOK succeeded; its verdict is the JSON."""
    json.dump({"decision": "block", "reason": reason[:MAX_REASON_CHARS]}, sys.stdout)
    sys.stdout.write("\\n")
    sys.exit(0)


try:
    payload = json.load(sys.stdin)
except Exception:
    payload = {}

# The matcher already scoped us to ${GATED_TOOL}. Re-checked so a hand-edited config that drops the
# matcher cannot turn this into a gate on every tool call.
tool_name = payload.get("tool_name")
if tool_name is not None and tool_name != "${GATED_TOOL}":
    sys.exit(0)

cwd = payload.get("cwd") or os.getcwd()
ztrack = os.environ.get("ZTRACK_BIN") or shutil.which("ztrack")

# FAIL CLOSED, deliberately, and in both directions below. A wedged card is loud and recoverable (the
# reason says exactly what to install, and an operator can \`kanban block\`/unblock it); a silently ungated
# fleet is the exact failure this gate exists to prevent, and it looks identical to success.
if not ztrack:
    block(
        "open-autonomy: cannot verify completion — no \`ztrack\` on PATH, and this profile declares a "
        "ztrack tracker, so 'done' cannot be checked. Completion is refused rather than presumed. "
        "Install ztrack (or set ZTRACK_BIN) in the worker's environment."
    )

try:
    result = subprocess.run(
        [ztrack, "check", "--auto-scope", "--errors-only"],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=TIMEOUT_SECONDS,
    )
except subprocess.TimeoutExpired:
    block(
        "open-autonomy: \`ztrack check\` did not finish within %ds, so completion cannot be verified and is "
        "refused. Re-run it by hand in this workspace to see what is slow "
        "(OPEN_AUTONOMY_ZTRACK_TIMEOUT_S raises the budget)." % TIMEOUT_SECONDS
    )
except OSError as exc:
    block(
        "open-autonomy: could not execute \`ztrack\` (%s), so completion cannot be verified and is refused."
        % exc
    )

if result.returncode == 0:
    sys.exit(0)

findings = (result.stdout or "").strip() or (result.stderr or "").strip() or "(no output)"
block(
    "open-autonomy: completion refused — \`ztrack check\` is not green in this workspace, so this work is "
    "not done yet.\\n\\n"
    "A checked acceptance criterion must cite a commit SHA that EXISTS in git, plus whatever proof the "
    "preset requires. Fix the findings below, commit real evidence, then call ${GATED_TOOL} again. Do not "
    "edit the tracker to make the check pass without doing the work.\\n\\n"
    "$ ztrack check --auto-scope --errors-only\\n"
    + findings
)
`;
