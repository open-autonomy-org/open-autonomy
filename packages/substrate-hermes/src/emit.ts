// Compile an IR to a HERMES installation: the substrate-neutral manifest, plus the Hermes profile roster
// the kanban kernel dispatches. "Native" means Hermes is not a shell an agent is launched into — Hermes'
// own kernel IS the board (claim leases, heartbeats, recompute_ready, enforce_max_runtime, reclaim_task),
// its dispatched workers ARE the launched sessions, and its standing profiles are the orchestrators.
//
// The correspondence itself lives in ./lowering.ts (pure + unit-tested). This module only decides WHERE
// the lowered artifacts land and emits the installer that writes them into a real $HERMES_HOME.
import { emitAutonomy, withGeneratedManifest, type AutonomyIR, type CompileOutput } from '@open-autonomy/core';
import { stringify as stringifyYaml } from 'yaml';
import { boardConfig, loweredProfiles, loweringFindings, scriptActors, type HermesProfile, type LoweringFinding } from './lowering';
import { RESULT_CONTRACT_FILE, resultContracts } from './result-envelope';
import { SUBSTRATE_FACTS_FILE, substrateFacts } from './substrate-facts';
import { runnerFrontendSrc } from './runner-frontend';
import {
  HERMES_BIN_PLACEHOLDER,
  PARAMS_COMMAND_PLACEHOLDER,
  SESSION_ENV_FILE_PLACEHOLDER,
  SESSION_ENV_INSTALLED_SUBPATH,
  SESSION_ENV_PATH,
  SESSION_ENV_RESOLVER_INSTALLED_SUBPATH,
  SESSION_ENV_RESOLVER_PATH,
  SESSION_ENV_RESOLVER_SCRIPT,
  SESSION_ENV_SCRIPT,
  declaresParams,
  sessionEnvBlock,
} from './session-env';
import {
  ATTENTION_LOG_PLACEHOLDER,
  ATTENTION_LOG_SUBPATH,
  ATTENTION_SCHEDULE,
  ATTENTION_STATE_PLACEHOLDER,
  ATTENTION_STATE_SUBPATH,
  ATTENTION_SWEEP_INSTALLED_SUBPATH,
  ATTENTION_SWEEP_PATH,
  ATTENTION_SWEEP_SCRIPT,
  declaresAttentionSweep,
} from './notifications';
import {
  GATE_COMMAND_PLACEHOLDER,
  ZTRACK_GATE_INSTALLED_SUBPATH,
  ZTRACK_GATE_PATH,
  ZTRACK_GATE_SCRIPT,
  isZtrackGated,
  ztrackHooksBlock,
  ztrackPresetOf,
} from './ztrack-gate';

/** Where the lowered Hermes artifacts live inside the installed repo. Not `$HERMES_HOME` — a Hermes home
 *  is mutable per-machine STATE (a live kanban.db, session logs, credentials), and an OA install is
 *  committed source. So the compile emits the derivation + an installer, and the operator applies it to
 *  whichever home they run. */
export const HERMES_DIR = 'hermes';
export const LOWERING_PATH = `${HERMES_DIR}/lowering.json`;
export const INSTALLER_PATH = `${HERMES_DIR}/install.py`;

/** The receipt: the full derived lowering, as data. Written to the install so an operator (and the audit
 *  actor) can read what each actor was granted WITHOUT re-deriving it, and so a diff of two compiles shows
 *  exactly which authority moved. `findings` is the honest column — what the IR declares and this
 *  substrate does not realize. */
export interface HermesLowering {
  schema: 'open-autonomy.hermes-lowering.v1';
  board: { max_in_progress: number };
  profiles: HermesProfile[];
  /** actors deliberately NOT given a profile — see lowering.ts's `isHuman` */
  humanRoles: string[];
  findings: LoweringFinding[];
  /** The verification plane, when the profile declares a ztrack tracker. Absent ⇒ no done-gate is
   *  installed, and `kanban_complete` means whatever the kernel means by it (a worker returned). */
  ztrack?: {
    preset: string;
    /** roles whose `kanban_complete` is refused until `ztrack check` is green (see `isZtrackGated`) */
    gatedRoles: string[];
    installedSubpath: string;
    /** merged into each gated profile's config.yaml by the installer, after substituting the real gate
     *  command for `GATE_COMMAND_PLACEHOLDER` */
    configPatch: Record<string, unknown>;
  };
  /** Roles whose SOUL.md gets the result-envelope contract appended (they declare a resolvable
   *  `result.schema`). Without it the declaration is decorative — see result-envelope.ts. */
  resultContractRoles?: string[];
  /** The human seam's other half: a scheduled sweep that reports parked cards to an operator (see
   *  notifications.ts). Without it `kanban_block(needs_input)` — the profile's ONLY human seam — waits
   *  forever on someone who was never told. Absent ⇒ no actors, so no board to watch. */
  attention?: {
    /** relative to each standing profile's home; Hermes' cron refuses a script outside `$HERMES_HOME/scripts/` */
    installedSubpath: string;
    /** shared across every copy of the sweep, under the ROOT home — one report per card, not one per gateway */
    stateSubpath: string;
    logSubpath: string;
    schedule: string;
    /** the standing roles whose homes get the job. Hermes executes cron PER PROFILE and no gateway runs in
     *  the root home, so a root-home job would never fire — the same silent-never-fires failure the
     *  standing-actor cron block exists to fix. Empty ⇒ nothing is standing, and the installer says so. */
    homes: string[];
  };
  /** The trigger-param binding: which profiles get the session-env shim that exports a card's declared
   *  launch params into its worker's shell (see session-env.ts). Absent ⇒ no actor declares params. */
  sessionEnv?: {
    /** roles whose sessions export their card's params (see `declaresParams`) */
    boundRoles: string[];
    installedSubpath: string;
    resolverInstalledSubpath: string;
    /** merged into each bound profile's config.yaml, after substituting the installed shim's real path */
    configPatch: Record<string, unknown>;
  };
}

export function loweringFor(ir: AutonomyIR): HermesLowering {
  const { profiles, humanRoles } = loweredProfiles(ir);
  const preset = ztrackPresetOf(ir);
  const gatedRoles = preset
    ? Object.entries(ir.agents)
        .filter(([, agent]) => isZtrackGated(agent))
        .map(([role]) => role)
    : [];
  // A `kind: human` actor gets no profile at all, so it can bind nothing — filtering by the lowered roster
  // rather than by ir.agents keeps `boundRoles` a subset of the profiles the installer will actually write.
  const lowered = new Set(profiles.map((p) => p.role));
  const boundRoles = Object.entries(ir.agents)
    .filter(([role, agent]) => lowered.has(role) && declaresParams(agent))
    .map(([role]) => role);
  const contractRoles = Object.keys(resultContracts(ir, [...lowered]));
  return {
    schema: 'open-autonomy.hermes-lowering.v1',
    board: boardConfig(ir),
    profiles,
    humanRoles,
    findings: loweringFindings(ir),
    ...(preset && gatedRoles.length
      ? {
          ztrack: {
            preset,
            gatedRoles,
            installedSubpath: ZTRACK_GATE_INSTALLED_SUBPATH,
            configPatch: ztrackHooksBlock(GATE_COMMAND_PLACEHOLDER),
          },
        }
      : {}),
    ...(contractRoles.length ? { resultContractRoles: contractRoles } : {}),
    ...(declaresAttentionSweep(ir)
      ? {
          attention: {
            installedSubpath: ATTENTION_SWEEP_INSTALLED_SUBPATH,
            stateSubpath: ATTENTION_STATE_SUBPATH,
            logSubpath: ATTENTION_LOG_SUBPATH,
            schedule: ATTENTION_SCHEDULE,
            homes: profiles.filter((p) => p.cron).map((p) => p.role),
          },
        }
      : {}),
    ...(boundRoles.length
      ? {
          sessionEnv: {
            boundRoles,
            installedSubpath: SESSION_ENV_INSTALLED_SUBPATH,
            resolverInstalledSubpath: SESSION_ENV_RESOLVER_INSTALLED_SUBPATH,
            configPatch: sessionEnvBlock(SESSION_ENV_FILE_PLACEHOLDER),
          },
        }
      : {}),
  };
}

// The installer. Python, not .mjs, for one concrete reason: a Hermes profile's `config.yaml` is a FULL
// REPLACEMENT of the home config, not an overlay — `get_config_path()` is `get_hermes_home()/config.yaml`
// and an active profile IS the home (hermes_constants.get_hermes_home). So every profile config must carry
// the operator's whole model/provider/credential block, which means the installer has to READ the
// operator's base YAML, not just append to it. PyYAML is a hard dependency of Hermes itself, so running
// this with the same interpreter that runs Hermes is the one environment where the round-trip is
// guaranteed available — and it keeps generated credentials out of the committed install entirely.
const INSTALLER = `#!/usr/bin/env python3
"""Apply an open-autonomy Hermes lowering to a real \$HERMES_HOME.

    HERMES_HOME=~/.hermes <hermes-venv>/bin/python hermes/install.py

Reads hermes/lowering.json (the compile's receipt) and writes one Hermes profile per lowered actor. The
operator's existing home config supplies model/provider/credentials; this script never invents them and
never writes a secret into the repo. Idempotent: re-running overwrites the derived files and nothing else.
"""
import copy, json, os, re, shlex, shutil, subprocess, sys
from pathlib import Path


def _substitute(value, token, replacement):
    """Replace \`token\` inside a parsed JSON structure. Never inside JSON *text*: a Windows path carries
    backslashes, which become invalid escapes the moment they are spliced into a serialized document."""
    if isinstance(value, dict):
        return {k: _substitute(v, token, replacement) for k, v in value.items()}
    if isinstance(value, list):
        return [_substitute(v, token, replacement) for v in value]
    if isinstance(value, str):
        return value.replace(token, replacement)
    return value


def _merge(target, patch):
    """One-level-deep merge of a generated config patch into a profile config.

    NOT \`dict.update\`. A patch key like \`terminal\` names a block the operator's base config already fills
    (docker image, timeouts, home_mode, env passthrough); assigning over it to add one key would silently
    reset all of it. Lists are UNIONED in order for the same reason — \`terminal.shell_init_files\` may
    already name the operator's own rc file, and appending is the only non-destructive answer.
    """
    for key, value in patch.items():
        current = target.get(key)
        if isinstance(value, dict) and isinstance(current, dict):
            _merge(current, value)
        elif isinstance(value, list) and isinstance(current, list):
            target[key] = current + [item for item in value if item not in current]
        else:
            target[key] = value
    return target

try:
    import yaml
except ImportError:
    sys.exit("hermes/install.py: PyYAML not found — run this with the interpreter that runs Hermes, e.g.\\n"
             "  HERMES_HOME=~/.hermes ~/hermes-agent/.venv/bin/python hermes/install.py")

here = Path(__file__).resolve().parent
lowering = json.loads((here / "lowering.json").read_text(encoding="utf-8"))
home = Path(os.environ.get("HERMES_HOME") or (Path.home() / ".hermes"))
base_config_path = home / "config.yaml"
if not base_config_path.exists():
    sys.exit(f"hermes/install.py: no {base_config_path} — run \`hermes setup\` first. A Hermes PROFILE config\\n"
             "is a full replacement of the home config (an active profile IS the home), so each generated\\n"
             "profile must carry your model/provider block; there is nothing to derive it from yet.")
base = yaml.safe_load(base_config_path.read_text(encoding="utf-8")) or {}

# The board's own knob. \`policy.maxConcurrent\` (the IR's global fleet cap) and \`kanban.max_in_progress\`
# are the same quantity. NOTE the semantics that deadlocked a proving run: \`kanban dispatch --max N\` is a
# CONCURRENCY cap, not a per-tick spawn budget — the dispatcher counts already-running tasks against N.
kanban = base.setdefault("kanban", {})
kanban["max_in_progress"] = lowering["board"]["max_in_progress"]
base_config_path.write_text(yaml.safe_dump(base, sort_keys=False), encoding="utf-8")

# ---- the ztrack done-gate (the verification plane) ----
# Installed as a Hermes \`pre_tool_call\` shell hook that REFUSES \`kanban_complete\` until
# \`ztrack check --auto-scope\` is green, so "done" is verified rather than presumed. See
# packages/substrate-hermes/src/ztrack-gate.ts for why this is a tool gate and not a port of \`ztrack loop\`.
ztrack = lowering.get("ztrack")
gate_command = None
if ztrack:
    gate_src = here / "hooks" / "ztrack-done-gate.py"
    if not gate_src.exists():
        sys.exit(f"hermes/install.py: missing {gate_src} — the install is incomplete; re-run the compile.")
    gate_dest = home / ztrack["installedSubpath"]
    gate_dest.parent.mkdir(parents=True, exist_ok=True)
    gate_dest.write_text(gate_src.read_text(encoding="utf-8"), encoding="utf-8")
    gate_dest.chmod(0o755)
    # Run the gate with the interpreter that runs HERMES rather than whatever \`python3\` resolves to in a
    # worker's PATH. Hermes \`shlex.split\`s the command with shell=False, so "<python> <script>" is two
    # argv entries and needs no shell.
    # SHELL-QUOTED, because Hermes \`shlex.split\`s this command and runs it with shell=False. An unquoted
    # space anywhere in the interpreter path or $HERMES_HOME (\`C:\\Program Files\\...\`, \`~/My Hermes/\`)
    # splits into 3+ argv, the spawn raises "command not found", and Hermes' hook runner LOGS A WARNING AND
    # RETURNS None — which ALLOWS the tool call. An unquoted path is therefore a silently ungated fleet.
    gate_command = f"{shlex.quote(sys.executable)} {shlex.quote(str(gate_dest))}"
    # ...and prove the command actually EXECUTES before trusting it, with a payload for a tool the gate must
    # ignore. If this cannot run at install time it will not run in a worker either, and the failure mode is
    # invisible: every completion sails through, logged only at WARNING inside the agent log.
    try:
        probe = subprocess.run(shlex.split(gate_command), input=json.dumps({"tool_name": "terminal"}),
                               capture_output=True, text=True, timeout=60)
    except subprocess.TimeoutExpired:
        sys.exit("hermes/install.py: the done-gate command hung for 60s on a no-op payload:\\n"
                 f"    {gate_command}\\n"
                 "A gate that cannot answer promptly will TIME OUT in a worker, and Hermes ALLOWS a tool\\n"
                 "call whose hook timed out -- refusing to install it.")
    if probe.returncode != 0 or probe.stdout.strip():
        sys.exit("hermes/install.py: the done-gate command does not execute cleanly:\\n"
                 f"    {gate_command}\\n"
                 f"    exit={probe.returncode} stdout={probe.stdout.strip()[:200]!r} "
                 f"stderr={probe.stderr.strip()[:200]!r}\\n"
                 "Hermes ALLOWS a tool call when its hook cannot run, so an unrunnable gate is a silently\\n"
                 "ungated fleet -- refusing to install one.")

# ---- the trigger-param binding (the session-env shim) ----
# Hermes' spawn path has NO per-card environment passthrough, so a declared \`params: { ZTRACK_ISSUE:
# subject.ref }\` reached the worker as an empty string and every skill that opens with \`echo
# "\$ZTRACK_ISSUE"\` read nothing. This installs a file into \`terminal.shell_init_files\`, which Hermes'
# session-env login shell sources before snapshotting the environment with \`export -p\`; the file resolves
# the card by \$HERMES_KANBAN_TASK and exports its params. See substrate-hermes/src/session-env.ts.
# The \`hermes\` CLI this install drives — the session-env resolver shells out to it, and the cron
# reconcile below runs it directly. Prefer the sibling of the interpreter running THIS script (that is the
# venv whose \`hermes\` is the one being configured) and fall back to PATH.
hermes_bin = Path(sys.executable).parent / ("hermes.exe" if os.name == "nt" else "hermes")
if not hermes_bin.exists():
    found = shutil.which("hermes")
    hermes_bin = Path(found) if found else None

session_env = lowering.get("sessionEnv")
session_env_file = None
if session_env:
    if hermes_bin is None:
        sys.exit("hermes/install.py: no \`hermes\` executable beside " + str(sys.executable) + " or on PATH,\\n"
                 "and the session-env shim shells out to it to read each card's launch params. Run this\\n"
                 "with the venv interpreter that runs Hermes.")
    dest_dir = home / "open-autonomy"
    dest_dir.mkdir(parents=True, exist_ok=True)
    resolver_src = here / "hooks" / "oa-session-params.py"
    shim_src = here / "hooks" / "oa-session-env.sh"
    for src in (resolver_src, shim_src):
        if not src.exists():
            sys.exit(f"hermes/install.py: missing {src} — the install is incomplete; re-run the compile.")
    resolver_dest = home / session_env["resolverInstalledSubpath"]
    resolver_dest.write_text(
        # repr(), not raw interpolation: the path is substituted into a Python string LITERAL in the
        # generated resolver, so a backslash would be read as an escape sequence there too.
        resolver_src.read_text(encoding="utf-8").replace('"${HERMES_BIN_PLACEHOLDER}"', repr(str(hermes_bin))),
        encoding="utf-8",
    )
    resolver_dest.chmod(0o755)
    session_env_file = home / session_env["installedSubpath"]
    session_env_file.write_text(
        shim_src.read_text(encoding="utf-8").replace(
            "${PARAMS_COMMAND_PLACEHOLDER}", f"{shlex.quote(sys.executable)} {shlex.quote(str(resolver_dest))}"
        ),
        encoding="utf-8",
    )

written = []
gated = []
bound = []
contracted = []
for profile in lowering["profiles"]:
    role = profile["role"]
    profile_dir = home / "profiles" / role
    profile_dir.mkdir(parents=True, exist_ok=True)

    config = copy.deepcopy(base)
    # TWO KEYS, TWO JOBS — and the difference is load-bearing:
    #   \`platform_toolsets\` scopes which tools a given platform (cli/slack/...) may surface;
    #   \`toolsets\` is the profile's OWN declared set, and it is the one the orchestrator gate reads
    #   (\`_profile_has_kanban_toolset\` -> \`load_config().get("toolsets", [])\`, tools/kanban_tools.py).
    # Writing only \`platform_toolsets\` puts kanban_create in the model's schema and then fails the
    # orchestrator check at EXECUTION: the tool is offered and silently does nothing. Declare both.
    # Two SEPARATE list objects, not one shared reference: PyYAML emits an anchor/alias pair
    # (\`toolsets: &id001 [...]\` / \`platform_toolsets: {cli: *id001}\`) for a list it sees twice. safe_load
    # resolves that correctly, but the config is also read by eyes and by other tooling, and a config whose
    # second toolset key is a bare \`*id001\` is exactly the kind of thing that reads as "not set".
    config["toolsets"] = list(profile["toolsets"])
    platform_toolsets = dict(config.get("platform_toolsets") or {})
    platform_toolsets["cli"] = list(profile["toolsets"])
    config["platform_toolsets"] = platform_toolsets

    # THE SAME TRAP AS ABOVE, ONE LAYER OUT. A profile config REPLACES the home config, so the hooks block
    # has to be written into every gated profile — a hooks block that lives only in the home config is not
    # read by a profile session at all. And a DISPATCHED WORKER IS NOT A TTY: without
    # \`hooks_auto_accept: true\` Hermes skips registration with a log warning and the worker runs UNGATED,
    # which looks exactly like a worker that passed. Both keys come from ztrack-gate.ts's
    # \`ztrackHooksBlock\` so the shape has one owner; only the command path is filled in here.
    if ztrack and role in ztrack["gatedRoles"]:
        # Substituted STRUCTURALLY, not by text-replacing inside a JSON document. The old form spliced a
        # filesystem path into the serialized JSON, so a single backslash (\`C:\\Python\\python.exe\`) became an
        # invalid escape and json.loads raised — on the platform this file explicitly branches for.
        patch = _substitute(ztrack["configPatch"], "${GATE_COMMAND_PLACEHOLDER}", gate_command)
        _merge(config, patch)
        gated.append(role)

    # Same trap, third instance: \`terminal\` is a block the base config already fills, so this MERGES.
    if session_env and role in session_env["boundRoles"]:
        # Hermes sources the user's rc files ONLY when \`shell_init_files\` is empty:
        #   if explicit: candidates = explicit
        #   elif auto_source_bashrc: candidates = [~/.profile, ~/.bash_profile, ~/.bashrc]
        # (tools/environments/local.py::_resolve_shell_init_files). So merging the shim into an EMPTY list
        # turns the list explicit and silently drops every rc-derived PATH entry from the session snapshot.
        # The most likely casualty is \`ztrack\` itself when node came from nvm/n -- which then trips the
        # done-gate's fail-closed path on every card. Seed Hermes' own defaults first so adding the shim
        # ADDS to the environment instead of replacing it.
        terminal_cfg = config.get("terminal") or {}
        if not (terminal_cfg.get("shell_init_files") or []) and terminal_cfg.get("auto_source_bashrc", True) \\
           and os.name != "nt":
            defaults = [os.path.expanduser(f) for f in ("~/.profile", "~/.bash_profile", "~/.bashrc")]
            existing = [f for f in defaults if os.path.isfile(f)]
            if existing:
                _merge(config, {"terminal": {"shell_init_files": existing}})
        patch = _substitute(session_env["configPatch"], "${SESSION_ENV_FILE_PLACEHOLDER}", str(session_env_file))
        _merge(config, patch)
        bound.append(role)

    (profile_dir / "config.yaml").write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")

    # THE SOUL IS THE SKILL. An OA actor's \`behavior\` names a skill folder whose SKILL.md is the prose that
    # directs it; a Hermes profile's SOUL.md is the prose that directs it. Same artifact, same role — so it
    # is copied verbatim rather than paraphrased. The compile already staged it beside this script.
    soul_src = here / "profiles" / role / "SOUL.md"
    if not soul_src.exists():
        sys.exit(f"hermes/install.py: missing {soul_src} — the install is incomplete; re-run the compile.")
    # THE SOUL PLUS ITS RESULT CONTRACT. The skill is portable prose and stays verbatim; the envelope
    # requirement is THIS substrate's realization of the actor's declared \`result.schema\`, appended rather
    # than spliced so the portable file is never edited. Without it the declaration is decorative: a live
    # worker completed with thoughtful freeform metadata under no namespace, because nothing had ever told
    # it there was a contract, and \`HermesRunner.result()\` found nothing to read.
    soul = soul_src.read_text(encoding="utf-8")
    # WHERE AM I RUNNING — appended to every soul. The skill is portable prose naming artifacts this
    # substrate does not have; without this the worker has no way to know which machine it is on, and the
    # audit actor could not name the substrate it audits.
    facts_src = here / "profiles" / role / "SUBSTRATE-FACTS.md"
    if not facts_src.exists():
        sys.exit(f"hermes/install.py: missing {facts_src} — the install is incomplete; re-run the compile.")
    soul = soul + facts_src.read_text(encoding="utf-8")
    contract_src = here / "profiles" / role / "RESULT-CONTRACT.md"
    if role in (lowering.get("resultContractRoles") or []):
        if not contract_src.exists():
            sys.exit(f"hermes/install.py: missing {contract_src} — the install is incomplete; re-run the compile.")
        soul = soul + contract_src.read_text(encoding="utf-8")
        contracted.append(role)
    (profile_dir / "SOUL.md").write_text(soul, encoding="utf-8")
    (profile_dir / ".profile.json").write_text(
        (here / "profiles" / role / ".profile.json").read_text(encoding="utf-8"), encoding="utf-8")
    written.append(f"{role}[{','.join(profile['toolsets']) or 'no-toolsets'}]")

# ---- standing actors get a REAL cron job ----
# \`standing\` was a classification and nothing else for a while: the roster printed "standing (own cron)"
# while no cron job was ever created, so pm and audit silently never fired. A schedule that exists only as
# a boolean is not a schedule. Reconciled BY NAME so re-running the installer replaces rather than stacks
# — \`cron create\` has no idempotency key, and a duplicated PM tick is two orchestrators on one board.
scheduled = []
for profile in lowering["profiles"]:
    schedule = profile.get("cron")
    if not schedule:
        continue
    role = profile["role"]
    if hermes_bin is None:
        print(f"[hermes-lowering] WARNING  cannot create the cron job for '{role}' -- no \`hermes\` executable "
              f"beside {sys.executable} or on PATH. This actor is STANDING and will never fire.", file=sys.stderr)
        continue
    job_name = f"open-autonomy:{role}"
    cron_env = dict(os.environ)
    cron_env["HERMES_HOME"] = str(home / "profiles" / role)   # cron jobs are per-profile state

    def _cron(*args):
        return subprocess.run([str(hermes_bin), "cron", *args], capture_output=True, text=True, env=cron_env)

    listed = _cron("list", "--all").stdout or ""
    job_id = None
    for line in listed.splitlines():
        m = re.match(r"\\s+([0-9a-f]{6,})\\s+\\[", line)
        if m:
            job_id = m.group(1)
        elif job_id and line.strip().startswith("Name:") and line.split("Name:", 1)[1].strip() == job_name:
            _cron("remove", job_id)
            job_id = None
    made = _cron("create", schedule, f"Run one {role} tick now, following your SOUL.md.",
                 "--name", job_name, "--workdir", str(here.parent))
    if made.returncode == 0:
        scheduled.append(f"{role}[{schedule}]")
    else:
        print(f"[hermes-lowering] WARNING  could not create the cron job for '{role}': "
              f"{(made.stderr or made.stdout).strip()[:300]}", file=sys.stderr)

# ---- the attention sweep: a parked card must REACH somebody ----
# \`kanban_block(needs_input)\` is this profile's only human seam, and nothing ever told the human. Same for
# the kernel's own parking (gave_up / block_loop_detected), which is worse — no worker is coming back to
# report it. Installed as Hermes' documented \`--no-agent\` watchdog: the script IS the job, its stdout is
# delivered verbatim, empty stdout is silent, and no LLM decides whether an operator should be told.
#
# PER STANDING PROFILE, deliberately: Hermes executes cron under the profile home that owns the job and no
# gateway runs in the ROOT home, so a root-home job would never fire (the same silent-never-fires failure
# the standing-actor block above exists to fix). The board is SHARED across profiles by design, so every
# copy sweeps the same cards, and one shared state file means one report per card however many fire.
attention = lowering.get("attention")
swept = []
if attention:
    sweep_src = here / "hooks" / "oa-attention-sweep.py"
    if not sweep_src.exists():
        sys.exit(f"hermes/install.py: missing {sweep_src} — the install is incomplete; re-run the compile.")
    if hermes_bin is None:
        print("[hermes-lowering] WARNING  no \`hermes\` executable — the attention sweep cannot be scheduled, "
              "so a card parked for a human will reach NOBODY.", file=sys.stderr)
    elif not attention["homes"]:
        print("[hermes-lowering] WARNING  no STANDING actor, so there is no profile gateway to run the "
              "attention sweep from. A card parked for a human will reach NOBODY until you schedule "
              f"{attention['installedSubpath']} yourself.", file=sys.stderr)
    else:
        state_file = home / attention["stateSubpath"]
        log_file = home / attention["logSubpath"]
        state_file.parent.mkdir(parents=True, exist_ok=True)
        # repr(), not raw interpolation: these land inside Python string LITERALS in the generated sweep,
        # where a Windows backslash would be read as an escape.
        sweep_body = (sweep_src.read_text(encoding="utf-8")
                      .replace('"${ATTENTION_STATE_PLACEHOLDER}"', repr(str(state_file)))
                      .replace('"${ATTENTION_LOG_PLACEHOLDER}"', repr(str(log_file)))
                      .replace('"${HERMES_BIN_PLACEHOLDER}"', repr(str(hermes_bin))))
        deliver = (os.environ.get("OPEN_AUTONOMY_NOTIFY_TARGET") or "").strip()
        job_name = "open-autonomy:attention"
        for role in attention["homes"]:
            role_home = home / "profiles" / role
            sweep_dest = role_home / attention["installedSubpath"]
            sweep_dest.parent.mkdir(parents=True, exist_ok=True)
            sweep_dest.write_text(sweep_body, encoding="utf-8")
            sweep_dest.chmod(0o755)

            sweep_env = dict(os.environ)
            sweep_env["HERMES_HOME"] = str(role_home)

            def _sweep_cron(*args):
                return subprocess.run([str(hermes_bin), "cron", *args], capture_output=True, text=True, env=sweep_env)

            # Reconciled by name, exactly like the standing-actor jobs: \`cron create\` has no idempotency
            # key, so a re-run would otherwise stack duplicate sweeps.
            listed = _sweep_cron("list", "--all").stdout or ""
            job_id = None
            for line in listed.splitlines():
                m = re.match(r"\\s+([0-9a-f]{6,})\\s+\\[", line)
                if m:
                    job_id = m.group(1)
                elif job_id and line.strip().startswith("Name:") and line.split("Name:", 1)[1].strip() == job_name:
                    _sweep_cron("remove", job_id)
                    job_id = None
            args = [attention["schedule"], "--name", job_name,
                    "--script", Path(attention["installedSubpath"]).name, "--no-agent"]
            if deliver:
                args += ["--deliver", deliver]
            made = _sweep_cron("create", *args)
            if made.returncode == 0:
                swept.append(role)
            else:
                print(f"[hermes-lowering] WARNING  could not schedule the attention sweep in '{role}': "
                      f"{(made.stderr or made.stdout).strip()[:300]}", file=sys.stderr)

print(f"[hermes-lowering] {len(written)} profile(s) into {home}: {' '.join(written)}")
if attention:
    if swept:
        target = (os.environ.get("OPEN_AUTONOMY_NOTIFY_TARGET") or "").strip()
        print(f"[hermes-lowering] attention sweep [{attention['schedule']}] in: {' '.join(swept)} "
              f"-> {target or 'the cron default target'}")
        if not target:
            print("[hermes-lowering] NOTE  set OPEN_AUTONOMY_NOTIFY_TARGET (e.g. 'telegram', 'slack:C0123ABCD') "
                  "before installing to deliver parked-card reports to a real channel; "
                  f"they are always appended to {home / attention['logSubpath']}.")
    print(f"[hermes-lowering]       run it by hand any time:  HERMES_HOME={home / 'profiles' / (swept[0] if swept else '<role>')} "
          f"python3 {home / 'profiles' / (swept[0] if swept else '<role>') / attention['installedSubpath']}")
if any(p.get("cron") for p in lowering["profiles"]):
    print(f"[hermes-lowering] cron jobs for standing actors: {' '.join(scheduled) or '(none)'}")
    # PROFILE-SCOPED, and the first version of this note was not — which made it advice that cannot work.
    # Hermes stores AND executes cron per profile (cron/jobs.py: "a profile's jobs are stored AND executed
    # under that profile's home"), so these jobs live in $HERMES_HOME/profiles/<role>/cron/jobs.json. A bare
    # \`hermes gateway status\` / \`hermes cron tick\` inspects the ROOT home, finds nothing, and reports
    #green — the same "standing actor silently never fires" failure, now with a reassuring install log.
    print("[hermes-lowering] NOTE  these jobs live in each profile's OWN home, and a gateway is per-profile.")
    for role in [p["role"] for p in lowering["profiles"] if p.get("cron")]:
        print(f"[hermes-lowering]         {role}:  hermes -p {role} gateway run      "
              f"(or once by hand: HERMES_HOME={home / 'profiles' / role} hermes cron tick)")
    print("[hermes-lowering]       A bare \`hermes gateway status\` / \`hermes cron tick\` looks at the ROOT "
          "home and will show NOTHING — it is not evidence these are scheduled.")
# WHAT THE FLEET WILL SPEND, said out loud at install time. A profile config is a full REPLACEMENT of the
# home config, so every generated profile necessarily inherits the operator's whole model/provider block —
# there is no way to write a working profile that does not. That inheritance is correct (the fleet runs on
# whatever the operator configured) and it is also invisible: an operator whose home config points at a
# metered provider has just pointed EVERY dispatched worker at it, and the first sign is a bill. One line
# is the whole fix.
_model = (base.get("model") or {})
print(f"[hermes-lowering] every profile inherits model={_model.get('default') or '(unset)'} "
      f"provider={_model.get('provider') or '(unset)'}{' base_url=' + _model['base_url'] if _model.get('base_url') else ''} "
      f"from {base_config_path} -- every dispatched worker bills there")
if ztrack:
    print(f"[hermes-lowering] ztrack done-gate ({ztrack['preset']}) armed on: {' '.join(gated) or '(none)'} "
          f"-- \`{gate_command}\` refuses kanban_complete until \`ztrack check\` is green")
# \`scripts/runner.ts\` is a \`#!/usr/bin/env bun\` script and is the ONLY sanctioned way to file work — a PM
# without it falls back to \`kanban_create\`, which BYPASSES the review edge and produces proposals nobody is
# scheduled to review. The installer checked for hermes and warned about ztrack, and said nothing about bun.
if shutil.which("bun") is None:
    print("[hermes-lowering] WARNING  no \`bun\` on PATH. \`scripts/runner.ts\` is the only sanctioned launch "
          "path; without bun a PM cannot file work through it and may fall back to creating cards by hand, "
          "which SKIPS the review edge. Install bun in the environment the PM runs in.", file=sys.stderr)
if ztrack:
    if shutil.which("ztrack") is None:
        print("[hermes-lowering] WARNING  no \`ztrack\` on PATH here. The gate FAILS CLOSED by design, so a "
              "worker without ztrack cannot complete a card at all. Install ztrack (or set ZTRACK_BIN) in "
              "the environment the WORKERS run in.", file=sys.stderr)
if lowering.get("resultContractRoles"):
    print(f"[hermes-lowering] result envelope contract appended to the soul of: {' '.join(contracted) or '(none)'} "
          f"-- they must complete with metadata.open_autonomy matching their declared result.schema")
if session_env:
    print(f"[hermes-lowering] trigger params exported into the worker shell on: {' '.join(bound) or '(none)'} "
          f"-- via terminal.shell_init_files -> {session_env_file}")
# A kind:human actor gets NO profile. Not an omission — the translation. A person is not something the
# dispatcher can spawn, and inventing a profile for one would make the human seam look like an agent that
# never answers. Hermes reaches people the way it already does: a worker calls
# kanban_block(kind="needs_input") and the card waits for a real operator's \`kanban unblock\`.
print(f"[hermes-lowering] kind:human actors intentionally NOT lowered to profiles: "
      f"{' '.join(lowering['humanRoles']) or '(none)'}")
for finding in lowering["findings"]:
    print(f"[hermes-lowering] NOT REALIZED  {finding['construct']}: {finding['detail']}", file=sys.stderr)
`;

function readme(ir: AutonomyIR, lowering: HermesLowering): string {
  const roles = lowering.profiles.map(
    (p) => `| \`${p.role}\` | ${p.toolsets.join(', ') || '(none)'} | ${p.workspace} | ${p.standing ? 'standing (own cron)' : 'per-card worker'} |`,
  );
  return `# Hermes installation

Compiled from this profile's \`ir.yml\` by \`open-autonomy compile <profile> hermes\`. Hermes' kanban kernel
is the substrate: cards are the work items, dispatched workers are the launched sessions, and a standing
profile that declares the \`kanban\` toolset is an orchestrator that can enqueue.

## Install

\`\`\`sh
HERMES_HOME=~/.hermes <hermes-venv>/bin/python hermes/install.py
\`\`\`

Run it with the interpreter that runs Hermes (PyYAML). It reads \`hermes/lowering.json\` and writes one
profile per actor into \`\$HERMES_HOME/profiles/\`, deriving each profile's model/provider block from your
existing home config — no credential is ever generated into this repo.

## The roster

| actor | toolsets | workspace | fired as |
|---|---|---|---|
${roles.join('\n')}

${lowering.humanRoles.length ? `\`${lowering.humanRoles.join('`, `')}\` ${lowering.humanRoles.length === 1 ? 'is a `kind: human` actor and gets' : 'are `kind: human` actors and get'} **no profile**. A person is not something the dispatcher can spawn. The human seam is Hermes' own: a worker calls \`kanban_block(kind="needs_input")\` and the card waits for a real operator's \`kanban unblock\`.` : 'This profile declares no `kind: human` actor.'}

## Driving it

\`\`\`sh
hermes kanban create "<title>" --assignee <actor> --workspace <scratch|worktree>
hermes kanban dispatch --max ${lowering.board.max_in_progress}   # a CONCURRENCY cap, not a per-tick spawn budget
hermes kanban list --json
hermes kanban reclaim <id>      # frees the card AND terminates the worker
\`\`\`

\`max_in_progress\` is set to ${lowering.board.max_in_progress} from \`policy.maxConcurrent\`. The same verbs are available
programmatically through \`HermesRunner\` (\`@open-autonomy/substrate-hermes\`), which is what an actor
holding \`agent:launch\` / \`agent:list\` / \`agent:cancel\` drives.

## Result envelopes

An actor that declares \`result.schema\` returns its envelope namespaced under \`metadata.open_autonomy\` on
\`kanban_complete\`. It CANNOT be the metadata object itself: Hermes stamps its own \`worker_session_id\`
into every completion's metadata, which invalidates any envelope declaring
\`additionalProperties: false\`. \`HermesRunner.result(id)\` reads it back.

${
    lowering.ztrack
      ? `## Done is verified, not presumed

\`${lowering.ztrack.gatedRoles.join('`, `')}\` run behind a **ztrack done-gate**: a Hermes \`pre_tool_call\`
hook (\`matcher: kanban_complete\`) that refuses the completion unless \`ztrack check --auto-scope\` exits 0
in the worker's workspace. Hermes' kernel marks a card done when a worker RETURNS — a worker that fell over
mid-turn returns just the same — so the gate is what makes the card status mean something.

It needs no arguments: \`--auto-scope\` resolves the issue from the git branch, which the runner set with
\`kanban create --branch\`. That branch name is the whole integration between the board and the tracker;
neither reads the other's storage.

The gate **fails closed** — no \`ztrack\` on PATH, a timeout, or an unresolvable scope all refuse the
completion. A wedged card is loud and recoverable; a silently ungated fleet is the failure this prevents,
and it looks exactly like success. Make sure \`ztrack\` is on PATH in the environment the **workers** run in
(or set \`ZTRACK_BIN\`).

`
      : ''
  }${
    lowering.sessionEnv
      ? `## Trigger params reach the worker's shell

\`${lowering.sessionEnv.boundRoles.join('`, `')}\` declare trigger \`params\`, so their sessions source
\`${lowering.sessionEnv.installedSubpath}\` through \`terminal.shell_init_files\`. It resolves the card by
\`\$HERMES_KANBAN_TASK\`, decodes the params the runner wrote into the card body, and \`export\`s them —
which is what makes a skill's \`echo "\$ZTRACK_ISSUE"\` answer.

This exists because Hermes' spawn path has **no per-card environment passthrough**: a worker's env is the
dispatcher's plus Hermes' own pins. Without the shim a declared binding is simply absent, and the worker
reads an empty string and carries on. Hermes' session-env login shell snapshots with \`export -p\`, so
anything exported there reaches every later tool call.

Each session also gets \`\$OPEN_AUTONOMY_PARAMS\` (the names that bound) and, on failure,
\`\$OPEN_AUTONOMY_PARAMS_ERROR\` — so "the binding did not run" is distinguishable from "the launcher passed
no such param", which is exactly what the silent version destroyed.

`
      : ''
  }${lowering.findings.length ? `## Not realized by this substrate\n\n${lowering.findings.map((f) => `- \`${f.construct}\` — ${f.detail}`).join('\n')}\n` : `## Not realized by this substrate\n\nNothing: every construct this profile declares has a native Hermes realization.\n`}
${ir.codeHost === 'github' ? '\n> `codeHost: github` — Hermes creates worktrees but opens no PRs; the propose/review effects are the agents\' own `gh` calls.\n' : ''}`;
}

export function compileHermes(ir: AutonomyIR, _opts: { destDir?: string } = {}): CompileOutput {
  // A script behavior has no SKILL.md, so it cannot become a SOUL.md — and a Hermes profile is
  // model-driven by construction. Fail loud rather than install a profile with an empty soul that would
  // dispatch, spawn, and do nothing. (compileLocal runs such an actor via `bun <behavior>` instead.)
  const scripts = scriptActors(ir);
  if (scripts.length) {
    throw new Error(
      `open-autonomy: compiling to "hermes" but actor(s) ${scripts.join(', ')} declare a SCRIPT behavior ` +
        `(a scripts/*.{ts,mjs,js} file). A Hermes profile is a model-driven conversation directed by its ` +
        `SOUL.md — there is no soul to write for a script, and installing one would produce a profile that ` +
        `dispatches and does nothing. Fix: give the actor a prose skill folder, or compile this profile ` +
        `onto "local", which runs a script behavior directly.`,
    );
  }

  // `scripts/runner.ts` is emitted at the SAME path the local substrate emits its own frontend to, with
  // different contents, and nothing downstream would notice one silently overwriting the other. A profile
  // that targets both is therefore refused up front rather than compiled into whichever target ran last.
  if (ir.targets.includes('local')) {
    throw new Error(
      `open-autonomy: this profile declares \`targets: [${ir.targets.join(', ')}]\`, but "hermes" and "local" ` +
        `both emit \`scripts/runner.ts\` — the Runner frontend — with different contents, so compiling both ` +
        `into one repository would leave whichever ran last, silently. Split the profile, or drop one target.`,
    );
  }

  const lowering = loweringFor(ir);
  const generated: Record<string, string> = {};
  const copies: Array<{ from: string; to: string }> = [];

  // Shared layer: the substrate-NEUTRAL manifest, generated the same way for every substrate. The runner
  // reads it (execution.workspace, timeout, kind, result.schema) and so does every actor's own skill —
  // which is why an opaque `policy.box` fence like `dispatch.allow_label` lowers here as well as anywhere:
  // the pm's SOUL.md is its SKILL.md verbatim, and it reads the same file it reads on any substrate.
  const manifest = emitAutonomy(ir) as Record<string, unknown>;
  if (!ir.resources.includes('.open-autonomy/autonomy.yml')) {
    generated['.open-autonomy/autonomy.yml'] = stringifyYaml(manifest);
  }
  generated['.open-autonomy/autonomy.json'] = `${JSON.stringify(manifest, null, 2)}\n`;

  generated[LOWERING_PATH] = `${JSON.stringify(lowering, null, 2)}\n`;
  generated[INSTALLER_PATH] = INSTALLER;
  // The done-gate ships only when the profile declares a ztrack tracker — a profile with no verification
  // plane gets no gate rather than an inert one.
  if (lowering.ztrack) generated[ZTRACK_GATE_PATH] = ZTRACK_GATE_SCRIPT;
  // Likewise the session-env shim: emitted only when some actor declares trigger params to bind.
  if (lowering.sessionEnv) {
    generated[SESSION_ENV_PATH] = SESSION_ENV_SCRIPT;
    generated[SESSION_ENV_RESOLVER_PATH] = SESSION_ENV_RESOLVER_SCRIPT;
  }
  // The attention sweep: the human seam's other half. A blocked card that reaches nobody is the failure.
  if (lowering.attention) generated[ATTENTION_SWEEP_PATH] = ATTENTION_SWEEP_SCRIPT;
  generated[`${HERMES_DIR}/README.md`] = readme(ir, lowering);
  // The Runner contract's CLI frontend, at the SAME path the local substrate emits it, so the portable PM
  // doctrine (`bun scripts/runner.ts launch develop --ref <id>`) runs unchanged here. Without it a PM's only
  // way to file work is `kanban_create`, which bypasses the review edge — `review: <role>` is realized in
  // `HermesRunner.launch`, so a directly-created card is a proposal nobody is scheduled to review.
  generated['scripts/runner.ts'] = runnerFrontendSrc();

  // Every profile learns what machine it is on. See substrate-facts.ts: the SOUL is portable prose that
  // names artifacts this substrate does not have, and `audit` — the conformance auditor of this very
  // install — could not name the substrate it audits.
  for (const profile of lowering.profiles) {
    generated[`${HERMES_DIR}/profiles/${profile.role}/${SUBSTRATE_FACTS_FILE}`] = substrateFacts(ir, lowering, profile.role);
  }

  const contracts = resultContracts(ir, lowering.profiles.map((p) => p.role));
  for (const [role, prose] of Object.entries(contracts)) {
    generated[`${HERMES_DIR}/profiles/${role}/${RESULT_CONTRACT_FILE}`] = prose;
  }

  for (const profile of lowering.profiles) {
    copies.push({ from: `skills/${profile.behavior}/SKILL.md`, to: `${HERMES_DIR}/profiles/${profile.role}/SOUL.md` });
    generated[`${HERMES_DIR}/profiles/${profile.role}/.profile.json`] = `${JSON.stringify(
      {
        name: profile.role,
        description: `open-autonomy actor ${profile.role} (${profile.capabilities.join(', ') || 'no capabilities'})`,
      },
      null,
      2,
    )}\n`;
  }

  // Profile resources land at the repo root exactly as they do on every other substrate — a Hermes worker
  // runs in a worktree of this repo, so `standards/*.md` and the harness config are where its skill expects.
  for (const r of ir.resources) {
    copies.push({ from: r === '.gitignore' ? 'gitignore' : r, to: r });
  }

  // `.open-autonomy/generated.json` — the file manifest, which only compileLocal was producing. Without it
  // the CLI's own receipt points at a file that does not exist, `doctor` reports "not a compiled install",
  // and `materialize`'s orphan prune has no prior manifest, so a generated file that is renamed or dropped
  // is never cleaned up on recompile — silently.
  return withGeneratedManifest({ generated, copies });
}
