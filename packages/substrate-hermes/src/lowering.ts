// The IR -> Hermes correspondence, as pure data + pure functions. Everything here was OBSERVED against a
// real Hermes kanban kernel (the twin repo's cookbook/hermes-sdlc run drove the real dispatcher, real
// claim leases and real workers with only Anthropic/GitHub/Slack twinned) — not read off documentation.
// Two of the entries below were recorded as "does not lower" first and corrected only after being run;
// the comments say which, because the mistake is instructive and the correction is the load-bearing part.
import { cronOf, isScript, type AutonomyIR, type IRAgent } from '@open-autonomy/core';

/** The Hermes toolsets an OA capability grants. Both registries are CLOSED (docs/SPEC.md#capabilities;
 *  Hermes' toolsets.py), so this dict is the ENTIRE correspondence — a capability absent here grants no
 *  tools, and that is a finding (`loweringFindings`), never a silent drop.
 *
 *  `kanban` is not granted by "being a worker": Hermes activates it automatically for anything the
 *  dispatcher spawned (HERMES_KANBAN_TASK is set in the worker's env), which is how a worker reports at
 *  all. It appears below for the capabilities whose tools live in that toolset either way. */
export const CAPABILITY_TOOLSETS: Readonly<Record<string, readonly string[]>> = {
  'tasks:converse': ['kanban'], // kanban_comment
  'tasks:author': ['kanban'], // kanban_create / kanban_link
  'code:propose': ['terminal', 'file'],
  'code:review': ['terminal', 'file'],
  'agent:list': ['kanban'], // kanban_list — STANDING ONLY, see ORCHESTRATOR_ONLY_CAPABILITIES
  // agent:update => the card's lifecycle verbs: kanban_complete (done), kanban_block (paused/failed),
  // kanban_unblock (back to running). Only the LAST of those is orchestrator-gated, which is why this
  // capability is a PARTIAL loss on a per-card worker rather than an all-or-nothing one.
  'agent:update': ['kanban'],
  // agent:launch => kanban_create: enqueue a card the kernel then dispatches. First recorded as "no native
  // realization", read off the toolset's own description string ("only active when spawned by the kanban
  // dispatcher") rather than off the gate. The gate (`_check_kanban_mode`) admits a SECOND route: a profile
  // whose config declares `kanban` — what Hermes calls an ORCHESTRATOR PROFILE, which is exactly what a
  // standing OA `agent:launch` holder is. Proven by running: a `hermes -p pm chat` session with no
  // HERMES_KANBAN_TASK in its environment enqueued a card assigned to another actor.
  'agent:launch': ['kanban'],
  // agent:cancel is realized by `kanban reclaim` (runner.ts), which frees the card AND calls
  // `_terminate_reclaimed_worker`. It grants no agent-callable TOOL, and that is the correct shape rather
  // than a gap: cancel is authority over a run, held by the operator/substrate, not a move an agent makes.
  // (Also first recorded as "does not lower", on the grounds that the kanban tool surface has no cancel —
  // true, and irrelevant: the tool surface is what an agent may call, not what the substrate can do.)
  'agent:cancel': [],
};

/** Capabilities whose Hermes tool is hidden from a DISPATCHER-SPAWNED worker and offered only to a
 *  STANDING profile. Hermes gates exactly two tools this way — `kanban_list` and `kanban_unblock`
 *  (`_check_kanban_orchestrator_mode` + the `_require_orchestrator_tool` runtime backstop): a worker
 *  scoped to one task closes that task, it does not enumerate or re-route the board. The gate is on the
 *  ENVIRONMENT (`HERMES_KANBAN_TASK` being set), not on the profile's config, so declaring the toolset
 *  cannot buy a worker back in.
 *
 *  Note what is NOT here, because an earlier writeup of mine got this wrong in the other direction and
 *  claimed `kanban_create`/`kanban_link` were orchestrator-only too: they carry the permissive
 *  `_check_kanban_mode`, so a dispatched worker CAN create and link cards. Only enumerate and unblock are
 *  reserved. Read off the registration table (tools/kanban_tools.py's `check_fn=` per tool), not prose. */
export const ORCHESTRATOR_ONLY_CAPABILITIES: ReadonlyMap<string, string> = new Map([
  ['agent:list', 'entirely (`kanban_list` is its only realization)'],
  ['agent:update', 'partially (`kanban_complete`/`kanban_block` still work; `kanban_unblock`, which resumes a paused session, does not)'],
]);

/** Is this actor STANDING (a long-lived profile Hermes fires on its own cron) rather than
 *  DISPATCHER-SPAWNED (a worker the kanban dispatcher starts for one card)? A cron trigger lowers to a
 *  Hermes cron job, which fires an ordinary session with no `HERMES_KANBAN_TASK` — that, and only that, is
 *  what puts an actor on the orchestrator side of the gate above. */
export function isStanding(agent: IRAgent): boolean {
  return cronOf(agent) !== undefined;
}

/** A capability may be SCOPED (`code:propose@docs/audits`); the scope is the profile's data and Hermes has
 *  no native expression for it, so the toolset is granted on the bare axis and the scope is reported by
 *  `loweringFindings` rather than silently honored. */
export function capabilityAxis(capability: string): string {
  return capability.split('@')[0]!;
}

/** The toolsets an actor's capability set grants, de-duplicated, in first-granted order.
 *
 *  `trackerIsCli` adds `terminal` for the `tasks:*` axes, and it is a CORRECTNESS fix rather than a
 *  convenience. The table above assumes the work-item store is the kanban board, so `tasks:author` /
 *  `tasks:converse` grant only the `kanban` toolset. When the profile declares an EXTERNAL tracker
 *  (`policy.box.tracker.ztrackPreset`), those same verbs are performed against that tracker's CLI, and an
 *  actor granted `kanban` alone is toolset-starved: it is told by its own SOUL.md to run `ztrack ...` and
 *  has no tool that can. That was latent in this profile from the start — `pm` lowered to `['kanban']`
 *  under its previous capability set too — and it fails SILENTLY, which is the failure mode this package
 *  exists to eliminate: the session prepares a call it cannot make. */
export function toolsetsFor(capabilities: readonly string[], trackerIsCli = false): string[] {
  const out: string[] = [];
  for (const cap of capabilities) {
    const axis = capabilityAxis(cap);
    for (const toolset of CAPABILITY_TOOLSETS[axis] ?? []) {
      if (!out.includes(toolset)) out.push(toolset);
    }
    if (trackerIsCli && axis.startsWith('tasks:') && !out.includes('terminal')) out.push('terminal');
  }
  return out;
}

/** The profile's external tracker CLI preset, if it declares one. `policy.box` is opaque governance DATA
 *  the core carries verbatim, so this reads it defensively rather than asking the core to type it. Lives
 *  here rather than beside the done-gate so the toolset rule above has no import cycle. */
export function ztrackPresetOf(ir: AutonomyIR): string | undefined {
  const tracker = (ir.policy.box as Record<string, unknown> | undefined)?.tracker;
  if (!tracker || typeof tracker !== 'object') return undefined;
  const preset = (tracker as Record<string, unknown>).ztrackPreset;
  return typeof preset === 'string' && preset.trim() ? preset : undefined;
}

/** Hermes' `--workspace` for an actor's portable `execution.workspace`. `isolated` asks a realizing runner
 *  for a fresh workspace per launch (docs/SPEC.md#the-runner); Hermes' native answer is a git worktree it
 *  creates and owns per card. `shared` (or omitted) is `dir` — the ordinary checkout itself.
 *
 *  `dir`, NOT `scratch`, and the difference cost a live run. Hermes has THREE workspace kinds
 *  (`VALID_WORKSPACE_KINDS = {scratch, worktree, dir}`) and `scratch` is not "the shared checkout" — it is a
 *  fresh EMPTY directory under `<board-root>/workspaces/<card-id>/`, auto-deleted on completion. A reviewer
 *  lowered to `scratch` is dispatched into an empty dir with `TERMINAL_CWD` pinned to it: no repo, no git
 *  history to review, and no repo-local tooling — the live reviewer had to go HUNTING for the checkout by
 *  path, and `ztrack check` exited 127 there because the ztrack shim resolves `node_modules/.bin/ztrack` by
 *  walking UP from cwd and a scratch dir is nowhere near the repo. `dir:<repo>` is Hermes' own name for
 *  "run in this existing directory", which is exactly what OA's `shared` means. (An isolated actor is
 *  unaffected: a worktree lives at `<repo>/.worktrees/<id>`, so the upward walk finds the repo either way,
 *  which is why only the reviewer surfaced this.)
 *
 *  Both kinds need a PATH the pure lowering does not have; the runner supplies it (`dir:${cwd}`), because
 *  a bare kind defers to the board's `default_workdir` and a board without one spawn-fails every card. */
export function workspaceFor(agent: IRAgent): 'dir' | 'worktree' {
  return agent.execution?.workspace === 'isolated' ? 'worktree' : 'dir';
}

/** A `kind: human` actor. It deliberately gets NO Hermes profile: a person is not something the dispatcher
 *  can spawn, and inventing a profile for one would make the human seam look like an agent that simply
 *  never answers. Hermes already has the right shape — a worker calls `kanban_block(kind="needs_input")`
 *  and the card waits for a real operator's `kanban unblock`. Proven: the card stayed blocked across three
 *  further dispatch ticks; nothing promoted it and no timeout resolved it. */
export function isHuman(agent: IRAgent): boolean {
  return agent.kind === 'human';
}

/** One lowered Hermes profile. `config.yaml`'s two toolset keys are BOTH written by the installer — see
 *  `HERMES_TOOLSET_KEYS` for why that is not redundancy. */
export interface HermesProfile {
  role: string;
  /** the actor's `behavior` — the skill folder whose SKILL.md becomes this profile's SOUL.md */
  behavior: string;
  capabilities: string[];
  toolsets: string[];
  workspace: 'dir' | 'worktree';
  /** Hermes `--max-runtime` seconds for a card dispatched to this profile (IR `timeout` is minutes). */
  maxRuntimeSeconds?: number;
  /** true when the actor is fired by its own cron rather than spawned per-card by the dispatcher — the
   *  side of Hermes' `_check_kanban_orchestrator_mode` gate it lands on. The installer writes the same
   *  toolsets either way; this decides which of them are actually OFFERED at runtime. */
  standing: boolean;
}

/** The two config keys a Hermes profile must carry, and why writing only one is the trap that cost two
 *  runs to find:
 *    `platform_toolsets` scopes which tools a given PLATFORM (cli/slack/...) may surface;
 *    `toolsets` is the profile's OWN declared set — and it is the one the orchestrator gate reads
 *    (`_profile_has_kanban_toolset` -> `load_config().get("toolsets", [])`).
 *  Declaring only `platform_toolsets` puts `kanban_create` in the model's tool schema — the session
 *  visibly "prepares" the call — and then the orchestrator check refuses it at execution. The tool is
 *  offered and silently does nothing. With a scripted model (which ignores tool results) success and
 *  failure look IDENTICAL, which is why this survived two green-looking runs. Write both. */
export const HERMES_TOOLSET_KEYS = ['toolsets', 'platform_toolsets'] as const;

/** A construct the IR declares that this substrate does not realize. Reported, never silently dropped —
 *  compileHermes surfaces these so an operator learns what is unenforced BEFORE running the loop. */
export interface LoweringFinding {
  /** dotted IR path of the construct */
  construct: string;
  detail: string;
}

/** Every IR construct this substrate cannot realize. Empty ⇒ the profile lowers whole.
 *
 *  Deliberately NOT listed here, because it is not the substrate's to realize: `policy.box.*` is opaque
 *  governance DATA the manifest carries verbatim and the AGENTS read (docs/SPEC.md) — the day-one dispatch
 *  fence `policy.box.dispatch.allow_label` is applied by the pm skill's own prose against the TRACKER's
 *  labels, exactly as it is on the local substrate, which does not enforce it either. Since a Hermes
 *  profile's SOUL.md IS the actor's SKILL.md verbatim and `.open-autonomy/autonomy.yml` is installed
 *  identically, that fence lowers as well as it lowers anywhere. (Recorded as "does not lower" in an
 *  earlier writeup — a mis-attribution to the substrate layer of something no substrate implements.) */
export function loweringFindings(ir: AutonomyIR): LoweringFinding[] {
  const findings: LoweringFinding[] = [];
  for (const [role, agent] of Object.entries(ir.agents)) {
    for (const cap of agent.capabilities ?? []) {
      const axis = capabilityAxis(cap);
      if (!(axis in CAPABILITY_TOOLSETS)) {
        findings.push({
          construct: `agents.${role}.capabilities[${cap}]`,
          detail: `capability "${cap}" has no entry in CAPABILITY_TOOLSETS — the actor is lowered WITHOUT it (no Hermes toolset grants that authority)`,
        });
        continue;
      }
      // The gate is on the runtime ENVIRONMENT, so this cannot be fixed by declaring more toolsets: a
      // dispatcher-spawned worker never sees kanban_list/kanban_unblock. An actor that needs one must earn
      // a standing seat by carrying a cron trigger.
      const orchestratorOnly = ORCHESTRATOR_ONLY_CAPABILITIES.get(axis);
      if (orchestratorOnly && !isHuman(agent) && !isStanding(agent)) {
        findings.push({
          construct: `agents.${role}.capabilities[${cap}]`,
          detail: `"${axis}" is lost ${orchestratorOnly} on a per-card worker — Hermes hides those tools from dispatcher-spawned sessions (\`_check_kanban_orchestrator_mode\`, gated on HERMES_KANBAN_TASK being set, so declaring more toolsets cannot buy them back). This actor has no cron trigger, so it is only ever spawned per-card; give it one to lower this capability.`,
        });
      }
      if (cap.includes('@')) {
        findings.push({
          construct: `agents.${role}.capabilities[${cap}]`,
          detail: `capability scope "@${cap.split('@')[1]}" is not natively enforced — Hermes grants the toolset on the bare axis; the scope holds only as skill doctrine`,
        });
      }
    }
    // An `event` trigger is the substrate-native escape hatch. Hermes fires cron (its own cron jobs) and
    // dispatch (the kanban dispatcher); it has no webhook listener, so a native event has nowhere to land.
    for (const t of agent.triggers ?? []) {
      if ('event' in t) {
        findings.push({
          construct: `agents.${role}.triggers[event: ${t.event}]`,
          detail: `Hermes fires cron and dispatch natively but has no event listener — this trigger is not delivered`,
        });
      }
    }
  }
  return findings;
}

/** Lower an IR to its Hermes profile roster. A `kind: human` actor is EXCLUDED by design (see `isHuman`);
 *  `humanRoles` names them so the receipt records the omission as a decision rather than a silence. */
export function loweredProfiles(ir: AutonomyIR): { profiles: HermesProfile[]; humanRoles: string[] } {
  const profiles: HermesProfile[] = [];
  const humanRoles: string[] = [];
  for (const [role, agent] of Object.entries(ir.agents)) {
    if (isHuman(agent)) {
      humanRoles.push(role);
      continue;
    }
    const capabilities = agent.capabilities ?? [];
    const toolsets = toolsetsFor(capabilities, ztrackPresetOf(ir) !== undefined);
    profiles.push({
      role,
      behavior: agent.behavior,
      capabilities: [...capabilities],
      toolsets,
      workspace: workspaceFor(agent),
      ...(typeof agent.timeout === 'number' ? { maxRuntimeSeconds: agent.timeout * 60 } : {}),
      standing: isStanding(agent),
    });
  }
  return { profiles, humanRoles };
}

/** The board-level knobs. `policy.maxConcurrent` (the IR's global fleet cap) and Hermes'
 *  `kanban.max_in_progress` are the SAME quantity, so this one lowers cleanly — with one semantic worth
 *  writing down, because it deadlocked a run: `kanban dispatch --max N` is a CONCURRENCY CAP, not a
 *  per-tick spawn budget. The dispatcher counts tasks already `running` against N, so a tick at `--max 1`
 *  while any worker is still running spawns nothing at all. */
export function boardConfig(ir: AutonomyIR): { max_in_progress: number } {
  return { max_in_progress: ir.policy.maxConcurrent ?? 3 };
}

/** A script behavior (`scripts/foo.ts`) is a deterministic implementation, not prose — it has no SKILL.md
 *  to become a SOUL.md. Hermes profiles are model-driven, so a script actor cannot be lowered to one; it
 *  is reported rather than given an empty soul. */
export function scriptActors(ir: AutonomyIR): string[] {
  return Object.entries(ir.agents)
    .filter(([, a]) => !isHuman(a) && isScript(a.behavior))
    .map(([role]) => role);
}
