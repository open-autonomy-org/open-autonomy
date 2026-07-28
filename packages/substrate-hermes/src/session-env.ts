// Trigger params -> the worker's ENVIRONMENT. The substrate's realization of the IR's `params:` binding.
//
// THE DEFECT THIS CLOSES, observed on a live worker: the profile declares
// `triggers: [{ dispatch: true, params: { ZTRACK_ISSUE: subject.ref } }]` and every skill that reads it
// opens with `echo "$ZTRACK_ISSUE"`. On Hermes that printed an EMPTY LINE. The runner round-trips params
// through the card BODY (the Runner contract says params are opaque pass-through, and the body is the only
// place a card can carry an arbitrary blob), and Hermes' spawn path builds a worker's environment from
// `dict(os.environ)` of the DISPATCHER plus its own pins — HERMES_KANBAN_TASK, _BRANCH, _WORKSPACE, _DB,
// _BOARD. There is no per-card env passthrough anywhere in it. So a declared binding that every skill
// depends on simply did not exist, and it failed the way this package exists to eliminate: silently, with
// the worker continuing on an empty string.
//
// WHY NOT JUST CHANGE THE SKILLS. The skills are PORTABLE doctrine, shared with every other substrate; on
// `local` the runner exports the binding before spawn. Teaching them to read a Hermes card body would put
// substrate knowledge into portable prose — the same inversion this profile spent a whole pass removing.
// A declared binding is a contract the SUBSTRATE honors.
//
// HOW, WITHOUT AN UPSTREAM CHANGE. Hermes builds each session's shell environment once, in a login shell,
// and snapshots it with `export -p` (tools/environments/base.py `init_session`); every later terminal call
// sources that snapshot. `terminal.shell_init_files` is the documented config key naming extra files that
// login shell sources — it exists for exactly this class of thing (nvm/pyenv/asdf PATH registration). That
// login shell inherits the worker's environment, so it can see HERMES_KANBAN_TASK; a file sourced there can
// resolve the card and `export` its params, and `export -p` then carries them into every tool call. The
// binding is realized at session-env time instead of at spawn time, which is the same observable result.
//
// The resolver reads the card through `hermes kanban show --json` — the published surface — rather than
// opening kanban.db, for the same reason HermesRunner does: the schema is Hermes' private business.
import type { IRAgent } from '@open-autonomy/core';

/** Where the two generated files land in the install, and where the installer copies them in $HERMES_HOME.
 *  Two files because the sourced one must be shell (bash `source` cannot run a Python file) while the work
 *  is JSON+subprocess, which shell does badly and which would otherwise add a `jq` dependency to every
 *  worker image. Python is Hermes' own interpreter, so it is the one runtime guaranteed present. */
export const SESSION_ENV_PATH = 'hermes/hooks/oa-session-env.sh';
export const SESSION_ENV_RESOLVER_PATH = 'hermes/hooks/oa-session-params.py';
export const SESSION_ENV_INSTALLED_SUBPATH = 'open-autonomy/oa-session-env.sh';
export const SESSION_ENV_RESOLVER_INSTALLED_SUBPATH = 'open-autonomy/oa-session-params.py';

/** Tokens `hermes/install.py` fills in once it knows $HERMES_HOME and which interpreter/CLI run Hermes. */
export const PARAMS_COMMAND_PLACEHOLDER = '@@OPEN_AUTONOMY_PARAMS_COMMAND@@';
export const HERMES_BIN_PLACEHOLDER = '@@OPEN_AUTONOMY_HERMES_BIN@@';
export const SESSION_ENV_FILE_PLACEHOLDER = '@@OPEN_AUTONOMY_SESSION_ENV_FILE@@';

/** Does this actor declare any trigger params? Only those profiles get the shim — an actor that binds
 *  nothing gets no init file rather than an inert one, so a config diff shows exactly who needs it. */
export function declaresParams(agent: IRAgent): boolean {
  return (agent.triggers ?? []).some((t) => Object.keys((t as { params?: Record<string, string> }).params ?? {}).length > 0);
}

/** The `terminal.shell_init_files` block for a param-binding profile's config.yaml.
 *
 *  MERGED, not assigned — see the installer's `_merge`. `terminal` is a large block the operator's base
 *  config already fills (docker image, timeouts, home_mode); replacing it wholesale to add one key would
 *  silently reset all of it, and `shell_init_files` may legitimately already name the operator's own rc
 *  file. This is the same class of trap as the two toolset keys, one layer out. */
export function sessionEnvBlock(sessionEnvFile: string): Record<string, unknown> {
  return { terminal: { shell_init_files: [sessionEnvFile] } };
}

// The file Hermes' login shell sources. Deliberately tiny and total: it must not be able to fail the
// bootstrap. Hermes wraps each init file as `[ -r f ] && . f 2>/dev/null || true`, so stderr is DISCARDED
// and a non-zero exit is neutralised — which means a broken resolver would restore the exact silence this
// closes. So failure is reported the only way that survives: as an exported variable
// (OPEN_AUTONOMY_PARAMS_ERROR) that lands in the snapshot and is visible to the worker, its skills, and any
// operator who runs `env`.
export const SESSION_ENV_SCRIPT = `# open-autonomy: export this card's declared launch params into the worker's shell environment.
#
# Sourced by Hermes' session-env login shell (terminal.shell_init_files). Everything it exports is captured
# by \`export -p\` into the session snapshot, so every later terminal call sees it — which is what makes a
# skill's \`echo "\$ZTRACK_ISSUE"\` answer.
#
# No-ops outside a dispatched card (HERMES_KANBAN_TASK unset), so an interactive \`hermes -p <role> chat\`
# in the same profile is unaffected.
if [ -n "\${HERMES_KANBAN_TASK:-}" ]; then
  __oa_exports="\$(${PARAMS_COMMAND_PLACEHOLDER} 2>/dev/null)" || __oa_exports=""
  if [ -n "\$__oa_exports" ]; then
    eval "\$__oa_exports"
  else
    export OPEN_AUTONOMY_PARAMS_ERROR="open-autonomy: the params resolver produced nothing for \$HERMES_KANBAN_TASK"
  fi
  unset __oa_exports
fi
`;

export const SESSION_ENV_RESOLVER_SCRIPT = `#!/usr/bin/env python3
"""open-autonomy: print \`export\` lines for the launch params carried by a Hermes card.

Invoked by ${SESSION_ENV_INSTALLED_SUBPATH.split('/').pop()} inside Hermes' session-env login shell, which
\`eval\`s the output. Reads the card named by \$HERMES_KANBAN_TASK through \`hermes kanban show --json\` — the
published surface, never kanban.db — and decodes the params block HermesRunner encoded into its body.

Always exits 0. A failure here must degrade to a NAMED error in the environment, never to a broken shell
bootstrap: this file is sourced before every worker's first tool call.
"""
import json
import os
import re
import shlex
import subprocess
import sys

# Must match PARAMS_MARKER + the fenced block in substrate-hermes/src/runner.ts \`encodeParams\`.
MARKER = "<!-- open-autonomy:params -->"
FENCE = re.compile(r"\`\`\`json\\n(.*?)\\n\`\`\`", re.S)
# A param NAME is the profile's own choice and reaches this file as untrusted card content, so only a
# genuine POSIX env-var name is ever exported. Values are shell-quoted rather than filtered.
NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
RESERVED = {"PATH", "HOME", "IFS", "SHELL", "LD_PRELOAD", "LD_LIBRARY_PATH", "BASH_ENV", "ENV", "PS1", "PS4"}


def emit(key, value):
    sys.stdout.write("export %s=%s\\n" % (key, shlex.quote(str(value))))


def fail(detail):
    emit("OPEN_AUTONOMY_PARAMS_ERROR", "open-autonomy: %s" % detail[:400])
    sys.exit(0)


task = os.environ.get("HERMES_KANBAN_TASK")
if not task:
    sys.exit(0)

hermes = os.environ.get("HERMES_BIN") or "${HERMES_BIN_PLACEHOLDER}"
try:
    shown = subprocess.run(
        [hermes, "kanban", "show", task, "--json"],
        capture_output=True, text=True, timeout=60,
    )
except Exception as exc:
    fail("could not run %s (%s), so this card's launch params are not in the environment" % (hermes, exc))

if shown.returncode != 0:
    fail("hermes kanban show %s failed: %s" % (task, ((shown.stderr or shown.stdout).strip() or "no output")))

try:
    body = ((json.loads(shown.stdout) or {}).get("task") or {}).get("body") or ""
except Exception as exc:
    fail("could not parse \`hermes kanban show %s --json\` (%s)" % (task, exc))

at = body.find(MARKER)
if at < 0:
    # Not an open-autonomy card (a hand-created one, say). Nothing to bind, and that is not an error.
    sys.exit(0)

match = FENCE.search(body[at + len(MARKER):])
if not match:
    fail("card %s carries an open-autonomy params marker with no JSON block after it" % task)

try:
    params = json.loads(match.group(1))
except Exception as exc:
    fail("card %s has an unparseable params block (%s)" % (task, exc))

if not isinstance(params, dict):
    fail("card %s params block is %s, expected an object" % (task, type(params).__name__))

exported = []
skipped = []
for key in sorted(params):
    value = params[key]
    if not NAME.match(key) or key in RESERVED or not isinstance(value, str):
        skipped.append(key)
        continue
    emit(key, value)
    exported.append(key)

# The receipt. A skill reading an empty \$ZTRACK_ISSUE can tell "the binding did not run" (this is unset)
# from "the launcher passed no such param" (it is set and does not list the key) — the distinction the
# original silent failure destroyed.
emit("OPEN_AUTONOMY_PARAMS", " ".join(exported))
if skipped:
    emit("OPEN_AUTONOMY_PARAMS_SKIPPED", " ".join(skipped))
`;
