// A parked card must REACH somebody. The substrate's realization of the human seam's other half.
//
// THE DEFECT THIS CLOSES. `kanban_block` with kind `needs_input` is this profile's ONLY human seam — every
// skill says so, and SUBSTRATE-FACTS tells every worker that the card "then waits for a real operator's
// `hermes kanban unblock`". Nothing ever told the operator. For an unattended loop that is worse than a
// crash: a crash stops and is noticed, a silent park looks exactly like work in progress, and the board
// drains to a halt while every surface still reads healthy. The same silence covers the kernel's own
// parking — the consecutive-failure breaker (`gave_up`) and the unblock-loop breaker
// (`block_loop_detected`) — which is the case an operator can least afford to miss, because no worker is
// coming back to report it.
//
// WHY A SCRIPT ON A SCHEDULE RATHER THAN A HOOK. A worker-side `post_tool_call` hook on `kanban_block`
// would only see blocks a WORKER performs. The kernel parks cards with no tool call involved at all
// (spawn failure, lease expiry past the failure threshold, the block-loop breaker), and those are exactly
// the ones nobody is left to report. A sweep over the board sees both, so it is the seam that cannot have
// a blind spot.
//
// WHY `--no-agent` CRON RATHER THAN AN AGENT PROMPT. Hermes' `cron create --script <f> --no-agent` is a
// documented watchdog: the script IS the job, its stdout is delivered verbatim, and EMPTY STDOUT IS
// SILENT. That is precisely the contract wanted here — no LLM in the loop, no model deciding whether an
// operator should be told, and no per-tick token cost for a board that is fine. Delivery is the job's own
// `--deliver` target, so this file adds NO second sender: `hermes send` is what `--deliver` already uses.
//
// WHERE THE JOB LIVES, and this is the trap the installer already documents for the standing actors:
// Hermes stores AND EXECUTES cron per profile, and a gateway is per-profile. A job registered in the ROOT
// home would never fire, because nobody runs a root gateway — the identical "standing actor silently never
// fires" failure this package fixed once already. So the sweep is registered in EVERY standing profile's
// home, and it fires from whichever gateway the operator actually runs. That is safe because the KANBAN
// BOARD IS SHARED ACROSS PROFILES BY DESIGN (`kanban_home()` resolves `<root>` from
// `<root>/profiles/<name>`, deliberately, "resolving through the active profile's HERMES_HOME would
// silently fork the board per profile"), so every copy sweeps the same cards, and they share one state
// file under the root home so a card is reported once no matter which gateway noticed it.
import type { AutonomyIR } from '@open-autonomy/core';
import { HERMES_BIN_PLACEHOLDER } from './session-env';

/** Where the sweep lands in the compile output, and where the installer copies it inside each standing
 *  profile's home. The subpath is `scripts/` because Hermes' cron scheduler resolves `--script` against
 *  `$HERMES_HOME/scripts/` and REFUSES anything that resolves outside it (`scheduler.py`: "Blocked: script
 *  path resolves outside the scripts directory"). */
export const ATTENTION_SWEEP_PATH = 'hermes/hooks/oa-attention-sweep.py';
export const ATTENTION_SWEEP_INSTALLED_SUBPATH = 'scripts/oa-attention-sweep.py';

/** Shared across every copy of the sweep, so a card is reported once however many gateways are running.
 *  Under the ROOT home beside the other open-autonomy install state, not under a profile. */
export const ATTENTION_STATE_SUBPATH = 'open-autonomy/attention-notified.json';
export const ATTENTION_LOG_SUBPATH = 'open-autonomy/attention.log';

/** Tokens `hermes/install.py` fills in once it knows the absolute paths. */
export const ATTENTION_STATE_PLACEHOLDER = '@@OPEN_AUTONOMY_ATTENTION_STATE@@';
export const ATTENTION_LOG_PLACEHOLDER = '@@OPEN_AUTONOMY_ATTENTION_LOG@@';

/** Every 10 minutes. Fast enough that an operator is not the last to know, slow enough to cost nothing —
 *  the sweep is one `kanban list` plus a `kanban show` per NEWLY parked card, and a healthy board makes the
 *  second call zero times and prints nothing at all. */
export const ATTENTION_SCHEDULE = '*/10 * * * *';

/** Does this profile have a human seam worth watching? Every kanban board can park a card, so the sweep is
 *  installed whenever the substrate manages a board at all — which is always. Kept as a function because
 *  the ANSWER is a fact about the IR and the caller should not have to know it is currently constant. */
export function declaresAttentionSweep(ir: AutonomyIR): boolean {
  return Object.keys(ir.agents ?? {}).length > 0;
}

// The sweep. Python because it is Hermes' own interpreter — the one runtime guaranteed present in a worker
// image — and because `.py` is what the scheduler runs without a shell.
//
// EVERY FIELD BELOW WAS READ OFF A REAL BOARD, not inferred. `kanban show --json` returns
// `{task, latest_summary, parents, children, comments, events, runs}` — `events` is a SIBLING of `task`,
// never a field on it, which is how a discriminator in this package managed to be dead code twice — and a
// block event is `{"kind": "blocked", "payload": {"reason": ..., "kind": "needs_input", "recurrences": N},
// "created_at": ..., "run_id": ...}`. `kanban list --json` carries no reason at all, which is why the
// per-card `show` exists.
export const ATTENTION_SWEEP_SCRIPT = `#!/usr/bin/env python3
"""open-autonomy: report kanban cards that are parked waiting for a human.

Run by Hermes cron as \`--script oa-attention-sweep.py --no-agent\`: this script IS the job, its stdout is
delivered verbatim to the job's \`--deliver\` target, and EMPTY STDOUT IS SILENT. So a healthy board says
nothing, and every newly parked card is reported exactly once.

Also safe to run by hand — it prints the same report and appends it to the log either way.

Exits 0 always. A sweep that crashes must not take a gateway tick with it, and its failures are reported
the only way that survives a silent runner: on stderr and in the log.
"""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

HERMES = os.environ.get("HERMES_BIN") or "${HERMES_BIN_PLACEHOLDER}"
STATE = Path(os.environ.get("OPEN_AUTONOMY_ATTENTION_STATE") or "${ATTENTION_STATE_PLACEHOLDER}")
LOG = Path(os.environ.get("OPEN_AUTONOMY_ATTENTION_LOG") or "${ATTENTION_LOG_PLACEHOLDER}")

# The two columns a card cannot leave on its own. \`blocked\` is a deliberate park (a worker's
# kanban_block, or the runner's) and \`triage\` is where the unblock-loop breaker puts a card that is
# undispatchable and that \`kanban unblock\` will NOT move.
PARKED = ("blocked", "triage")
# Terminal kernel events: the kernel gave up, no worker is coming back, and no human was asked anything.
# (Taken from the kernel's own writes — \`gave_up\` past the consecutive-failure threshold,
# \`block_loop_detected\` from the unblock-loop breaker. The per-attempt kinds — crashed, reclaimed,
# spawn_failed, timed_out — are deliberately NOT here: they fire on healthy retries too.)
KERNEL_GAVE_UP = ("gave_up", "block_loop_detected")


def hermes(*args):
    """Run a hermes subcommand, returning parsed JSON or None. Never raises."""
    try:
        r = subprocess.run([HERMES, *args], capture_output=True, text=True, timeout=120)
    except Exception as exc:
        sys.stderr.write("open-autonomy attention sweep: cannot run %s (%s)\\n" % (HERMES, exc))
        return None
    if r.returncode != 0:
        sys.stderr.write("open-autonomy attention sweep: %s failed: %s\\n" % (" ".join(args), (r.stderr or r.stdout).strip()[:300]))
        return None
    try:
        return json.loads(r.stdout)
    except Exception:
        return None


def why(card_id):
    """The reason a card is parked, and WHO parked it — the distinction that decides what an operator does.

    A \`needs_input\` block is a question waiting for an answer. A kernel give-up is an environment to fix,
    with nobody left to ask. Reporting both as 'blocked' makes the second look like the first.
    """
    shown = hermes("kanban", "show", card_id, "--json") or {}
    events = shown.get("events") or []
    kernel = any(e.get("kind") in KERNEL_GAVE_UP for e in events if isinstance(e, dict))
    reason, kind, recurrences = None, None, None
    # The TERMINAL events carry their own reason payload, and reading only \`blocked\` missed it — observed
    # on a real board: a card driven to \`triage\` reported the FIRST block's reason and "recurrence 1"
    # while the \`block_loop_detected\` event beside it held the actual last reason and "recurrences 2,
    # limit 2". That understates what happened and points the operator at the wrong question. Events are
    # chronological, so matching all three kinds and letting the last one win reports what actually parked
    # the card.
    for event in events:
        if isinstance(event, dict) and (event.get("kind") == "blocked" or event.get("kind") in KERNEL_GAVE_UP):
            payload = event.get("payload") or {}
            reason = payload.get("reason") or reason
            kind = payload.get("kind") or kind
            recurrences = payload.get("recurrences", recurrences)
    return reason, kind, recurrences, kernel


cards = hermes("kanban", "list", "--json")
if cards is None:
    sys.exit(0)   # the board could not be read; stderr already says so, and a false 'all clear' is silent by design

parked = {}
for card in cards if isinstance(cards, list) else []:
    if isinstance(card, dict) and card.get("status") in PARKED:
        parked[str(card.get("id"))] = card

try:
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
    if not isinstance(state, dict):
        state = {}
except Exception:
    state = {}

# Keyed by id -> status, so a card that is unblocked and later re-blocked notifies AGAIN (it left the state
# when it left the parked set), while a card sitting parked across many ticks notifies once.
fresh = [cid for cid, card in parked.items() if state.get(cid) != card.get("status")]

lines = []
for cid in sorted(fresh):
    card = parked[cid]
    reason, kind, recurrences, kernel = why(cid)
    who = "THE KERNEL GAVE UP (no worker is coming back; nobody was asked)" if kernel else (
        "a worker is asking for a human" if kind == "needs_input" else "parked (kind: %s)" % (kind or "unknown"))
    lines.append(
        "- %s  [%s]  %s\\n"
        "    assignee: %s\\n"
        "    why: %s\\n"
        "    reason: %s%s\\n"
        "    inspect: hermes kanban show %s --json\\n"
        "    release: hermes kanban unblock %s%s"
        % (
            cid,
            card.get("status"),
            (card.get("title") or "(untitled)")[:120],
            card.get("assignee") or "(unassigned)",
            who,
            (reason or "(none recorded)")[:400],
            ("  (recurrence %s)" % recurrences) if recurrences else "",
            cid,
            cid,
            "   <- will NOT move a triage card; it needs \`hermes kanban specify\` or a cancel"
            if card.get("status") == "triage"
            else "",
        )
    )

if lines:
    report = "open-autonomy: %d card(s) need a human\\n\\n%s" % (len(lines), "\\n".join(lines))
    try:
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open("a", encoding="utf-8") as f:
            f.write("[%s] %s\\n" % (time.strftime("%Y-%m-%dT%H:%M:%S%z"), report))
    except Exception as exc:
        sys.stderr.write("open-autonomy attention sweep: could not append to %s (%s)\\n" % (LOG, exc))
    # STDOUT IS THE DELIVERY. Under \`cron --no-agent\` this is what reaches the operator's platform;
    # printing nothing (the healthy case) is how the job stays silent.
    sys.stdout.write(report + "\\n")

try:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps({cid: card.get("status") for cid, card in parked.items()}, indent=2), encoding="utf-8")
except Exception as exc:
    sys.stderr.write("open-autonomy attention sweep: could not write %s (%s) — cards may be reported twice\\n" % (STATE, exc))

sys.exit(0)
`;
