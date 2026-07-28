// The hermes lowering's load-bearing rules. Each case below encodes a fact about Hermes' own gates that
// was READ WRONG at least once while building this substrate — twice in opposite directions for the
// orchestrator gate. They are here because the failure mode is SILENT: a mis-lowered actor installs
// cleanly, dispatches, and then quietly cannot do the thing its capability says it can, and with a
// scripted model (which ignores tool results) a refusal and a success look identical.
import { expect, test } from 'bun:test';
import { parseIr } from '@open-autonomy/core';
import { compileHermes, loweringFor } from './emit';
import { CAPABILITY_TOOLSETS, ORCHESTRATOR_ONLY_CAPABILITIES, isStanding, loweredProfiles, toolsetsFor } from './lowering';

const ir = (agents: string, policy = 'policy: { maxConcurrent: 2, box: {} }') =>
  parseIr(`schema: autonomy.ir.v1\ntargets: [hermes]\nagents:\n${agents}\n${policy}\nresources: []\n`);

test('agent:list needs a STANDING actor — Hermes hides kanban_list from dispatcher-spawned workers', () => {
  // The gate (`_check_kanban_orchestrator_mode`) keys on HERMES_KANBAN_TASK being set in the ENVIRONMENT,
  // so a dispatch-only actor cannot buy its way in by declaring more toolsets. The only fix is a cron
  // trigger, which lowers to a Hermes cron job — an ordinary session with no HERMES_KANBAN_TASK.
  const dispatched = loweringFor(
    ir(`  pm:\n    behavior: pm\n    capabilities: [agent:list]\n    triggers: [{ dispatch: true }]\n`),
  );
  expect(dispatched.findings.map((f) => f.construct)).toEqual(['agents.pm.capabilities[agent:list]']);
  expect(dispatched.findings[0]!.detail).toContain('no cron trigger');

  const standing = loweringFor(
    ir(`  pm:\n    behavior: pm\n    capabilities: [agent:list]\n    triggers: [{ cron: "*/15 * * * *" }]\n`),
  );
  expect(standing.findings).toEqual([]);
  expect(standing.profiles[0]!.standing).toBe(true);
});

test('agent:launch is NOT orchestrator-gated — a dispatched worker may still enqueue', () => {
  // The correction that matters most, because it was recorded as "does not lower" first. kanban_create
  // carries the permissive `_check_kanban_mode`; only kanban_list and kanban_unblock are reserved. So an
  // `agent:launch` holder lowers on EITHER side of the gate and produces no finding.
  const out = loweringFor(
    ir(`  pm:\n    behavior: pm\n    capabilities: [agent:launch]\n    triggers: [{ dispatch: true }]\n`),
  );
  expect(out.findings).toEqual([]);
  expect(out.profiles[0]!.toolsets).toEqual(['kanban']);
  expect(ORCHESTRATOR_ONLY_CAPABILITIES.has('agent:launch')).toBe(false);
});

test('agent:cancel grants no agent-callable tool, and that is the realization, not a gap', () => {
  // `kanban reclaim` frees the card AND terminates the worker, but it is an operator/substrate verb
  // (HermesRunner.cancel), never a tool an agent calls. So the capability lowers to an empty toolset and
  // must NOT be reported as unrealized.
  expect(CAPABILITY_TOOLSETS['agent:cancel']).toEqual([]);
  const out = loweringFor(
    ir(`  pm:\n    behavior: pm\n    capabilities: [agent:cancel]\n    triggers: [{ cron: "*/15 * * * *" }]\n`),
  );
  expect(out.findings).toEqual([]);
  expect(out.profiles[0]!.toolsets).toEqual([]);
});

test('a kind:human actor is given NO profile, and the omission is named rather than silent', () => {
  const source = `  maintainer:\n    kind: human\n    behavior: maintainer\n    capabilities: [tasks:converse]\n    triggers: [{ dispatch: true }]\n  develop:\n    behavior: develop\n    capabilities: [code:propose]\n    triggers: [{ dispatch: true }]\n`;
  const out = loweringFor(ir(source));
  expect(out.profiles.map((p) => p.role)).toEqual(['develop']);
  expect(out.humanRoles).toEqual(['maintainer']);

  // ...and no SOUL.md is copied for it. Inventing a profile for a person would make the human seam look
  // like an agent that simply never answers; Hermes' own seam (kanban_block needs_input) is the realization.
  const compiled = compileHermes(ir(source));
  expect(compiled.copies.filter((c) => c.to.includes('maintainer'))).toEqual([]);
  expect(compiled.copies).toContainEqual({ from: 'skills/develop/SKILL.md', to: 'hermes/profiles/develop/SOUL.md' });
});

test('execution.workspace: isolated lowers to a worktree, shared/omitted to dir — NEVER scratch', () => {
  // `scratch` was the first lowering of `shared` and it is wrong in a way only a dispatched worker shows:
  // Hermes' scratch is a fresh EMPTY dir under `<board-root>/workspaces/<card>/`, not the checkout. The
  // live reviewer landed in one with no repo, no git history to review, and `ztrack check` exiting 127
  // (the ztrack shim finds `node_modules/.bin/ztrack` by walking UP from cwd, and a scratch dir is nowhere
  // near the repo). `dir:<repo>` is Hermes' own name for "run in this existing directory".
  const { profiles } = loweredProfiles(
    ir(
      `  a:\n    behavior: a\n    capabilities: [code:propose]\n    execution: { workspace: isolated }\n    triggers: [{ dispatch: true }]\n` +
        `  b:\n    behavior: b\n    capabilities: [code:propose]\n    execution: { workspace: shared }\n    triggers: [{ dispatch: true }]\n` +
        `  c:\n    behavior: c\n    capabilities: [code:propose]\n    triggers: [{ dispatch: true }]\n`,
    ),
  );
  expect(profiles.map((p) => p.workspace)).toEqual(['worktree', 'dir', 'dir']);
});

test('a declared trigger param binds to the worker SHELL, and only for actors that declare one', () => {
  // Hermes' spawn path builds a worker's env from `dict(os.environ)` of the DISPATCHER plus its own pins;
  // there is no per-card passthrough anywhere in it. So `params: { ZTRACK_ISSUE: subject.ref }` reached a
  // live worker as an EMPTY STRING while every skill opened with `echo "$ZTRACK_ISSUE"` — the silent class
  // this package exists to kill. The realization is `terminal.shell_init_files`, sourced by the session-env
  // login shell before `export -p` snapshots the environment.
  const source =
    `  develop:\n    behavior: develop\n    capabilities: [code:propose]\n    triggers: [{ dispatch: true, params: { ZTRACK_ISSUE: subject.ref } }]\n` +
    `  audit:\n    behavior: audit\n    capabilities: [tasks:converse]\n    triggers: [{ cron: "0 * * * *" }]\n` +
    `  maintainer:\n    kind: human\n    behavior: maintainer\n    capabilities: [tasks:converse]\n    triggers: [{ dispatch: true, params: { ZTRACK_ISSUE: subject.ref } }]\n`;
  const out = loweringFor(ir(source));
  // `audit` declares no params (no shim), and `maintainer` is a human with no profile to configure at all —
  // boundRoles must stay a subset of the roster the installer actually writes.
  expect(out.sessionEnv?.boundRoles).toEqual(['develop']);
  const compiled = compileHermes(ir(source));
  expect(compiled.generated['hermes/hooks/oa-session-env.sh']).toContain('HERMES_KANBAN_TASK');
  expect(compiled.generated['hermes/hooks/oa-session-params.py']).toContain('kanban');

  // No actor binds anything ⇒ no shim emitted, rather than an inert one.
  const bare = ir(`  a:\n    behavior: a\n    capabilities: [code:propose]\n    triggers: [{ dispatch: true }]\n`);
  expect(loweringFor(bare).sessionEnv).toBeUndefined();
  expect(compileHermes(bare).generated['hermes/hooks/oa-session-env.sh']).toBeUndefined();
});

test('a script behavior refuses to compile — a Hermes profile has no soul to write for one', () => {
  expect(() =>
    compileHermes(ir(`  tick:\n    behavior: scripts/tick.ts\n    capabilities: []\n    triggers: [{ cron: "*/5 * * * *" }]\n`)),
  ).toThrow(/SCRIPT behavior/);
});

test('an event trigger is reported — Hermes fires cron and dispatch, and has no event listener', () => {
  const out = loweringFor(
    ir(`  a:\n    behavior: a\n    capabilities: [code:review]\n    triggers: [{ event: pull_request }]\n`),
  );
  expect(out.findings.map((f) => f.construct)).toEqual(['agents.a.triggers[event: pull_request]']);
});

test('agent:update is a PARTIAL loss on a per-card worker, not an all-or-nothing one', () => {
  // Of its three realizations only kanban_unblock is reserved — a worker can still complete and block its
  // own card. The finding has to say which half survives, or an operator reads it as "update does not work".
  const dispatched = loweringFor(
    ir(`  a:\n    behavior: a\n    capabilities: [agent:update]\n    triggers: [{ dispatch: true }]\n`),
  );
  expect(dispatched.findings[0]!.detail).toContain('kanban_complete');
  expect(dispatched.findings[0]!.detail).toContain('kanban_unblock');
  expect(
    loweringFor(ir(`  a:\n    behavior: a\n    capabilities: [agent:update]\n    triggers: [{ cron: "0 * * * *" }]\n`)).findings,
  ).toEqual([]);
});

test('capabilities compose into a de-duplicated toolset list, and an UNMAPPED axis is reported', () => {
  expect(toolsetsFor(['code:propose', 'tasks:converse', 'code:review'])).toEqual(['terminal', 'file', 'kanban']);
  // The catalog is additive-only, so a capability can enter core BEFORE this substrate maps it (exactly what
  // happened to `agent:update` while this package was being written). Built by hand rather than via parseIr
  // because core rejects an unknown capability up front — the case this guards is a KNOWN capability that
  // this table has not caught up with, which must surface as a finding, never as a silent grant of nothing.
  const unmapped = {
    schema: 'autonomy.ir.v1',
    targets: ['hermes'],
    agents: { a: { behavior: 'a', capabilities: ['agent:teleport'], triggers: [{ dispatch: true as const }] } },
    policy: { box: {} },
    resources: [],
  } as const;
  const out = loweringFor(unmapped as unknown as Parameters<typeof loweringFor>[0]);
  expect(out.findings[0]!.detail).toContain('no entry in CAPABILITY_TOOLSETS');
  expect(out.profiles[0]!.toolsets).toEqual([]);
});

test('the ztrack done-gate is armed only on code:propose holders, and only when a preset is declared', () => {
  // Gating the wrong actor is a WEDGE, not a warning: the gate fails closed, and `ztrack check --auto-scope`
  // cannot resolve an issue for an actor whose card has no issue branch (pm/draft file work in a scratch
  // workspace), so a mis-gated actor could never complete a card at all. `review` is excluded for a
  // different reason — its done-ness is a verdict, and its contract is already the standard review envelope.
  const source =
    `  pm:\n    behavior: pm\n    capabilities: [tasks:author]\n    triggers: [{ cron: "0 * * * *" }]\n` +
    `  develop:\n    behavior: develop\n    capabilities: [code:propose]\n    execution: { workspace: isolated }\n    triggers: [{ dispatch: true }]\n` +
    `  review:\n    behavior: review\n    capabilities: [code:review]\n    triggers: [{ dispatch: true }]\n` +
    `  audit:\n    behavior: audit\n    capabilities: [code:propose@docs/audits]\n    triggers: [{ dispatch: true }]\n` +
    `  auditor2:\n    behavior: audit\n    capabilities: [code:propose@docs/audits]\n    execution: { workspace: isolated }\n    triggers: [{ dispatch: true }]\n`;
  const tracker = 'policy: { maxConcurrent: 2, box: { tracker: { ztrackPreset: simple-sdlc } } }';
  // `audit` is NOT gated, and that correction cost a permanently wedged actor. The gate runs
  // `ztrack check --auto-scope`, which resolves the issue from the BRANCH NAME — and only an isolated
  // actor gets a branch named for its issue. A shared-checkout actor sits on trunk, where auto-scope
  // reports "unresolved" and gates the whole tracker, so the gate fails closed on EVERY card it sees.
  // `auditor2` is byte-identical except for `workspace: isolated`, and that alone earns the gate.
  const gated = loweringFor(ir(source, tracker));
  expect(gated.ztrack?.gatedRoles).toEqual(['develop', 'auditor2']);
  // The un-gateable actor's lost guarantee is REPORTED, never silently dropped.
  expect(gated.findings.map((f) => f.detail).join('\n')).toContain('NOT verified');
  // No tracker declared ⇒ no verification plane ⇒ no gate emitted, rather than an inert one.
  expect(loweringFor(ir(source)).ztrack).toBeUndefined();
  expect(compileHermes(ir(source)).generated['hermes/hooks/ztrack-done-gate.py']).toBeUndefined();
  expect(compileHermes(ir(source, tracker)).generated['hermes/hooks/ztrack-done-gate.py']).toContain('--auto-scope');
});

test('a declared result.schema becomes PROSE the worker reads, not just a manifest field', () => {
  // The defect a full live loop found: `result.schema` was declared, resolved, compiled into the manifest,
  // and read back by `HermesRunner.result()` — while NOTHING ANYWHERE TOLD THE WORKER TO PRODUCE ONE. The
  // live develop worker completed with thoughtful freeform metadata under no namespace, because that is
  // what a competent model does when handed a metadata field and no contract. A Hermes profile is directed
  // by prose, so the realization is prose appended to its soul.
  const source =
    `  develop:\n    behavior: develop\n    capabilities: [code:propose]\n    result: { schema: { $id: x.v1, type: object, additionalProperties: false, required: [outcome], properties: { outcome: { enum: [proposed] } } } }\n    triggers: [{ dispatch: true }]\n` +
    `  review:\n    behavior: review\n    capabilities: [code:review]\n    result: { schema: open-autonomy.review.v1 }\n    triggers: [{ dispatch: true }]\n` +
    `  audit:\n    behavior: audit\n    capabilities: [tasks:converse]\n    triggers: [{ dispatch: true }]\n`;
  const out = loweringFor(ir(source));
  // An actor with no `result` gets no contract — a completion with no declared shape is not improved by
  // inventing one.
  expect(out.resultContractRoles).toEqual(['develop', 'review']);

  const compiled = compileHermes(ir(source));
  const develop = compiled.generated['hermes/profiles/develop/RESULT-CONTRACT.md']!;
  // The namespace is the load-bearing part: Hermes stamps `worker_session_id` into EVERY completion's
  // metadata, which invalidates any envelope declaring `additionalProperties: false` — as this one does.
  expect(develop).toContain('open_autonomy');
  expect(develop).toContain('"$id": "x.v1"');
  // A named standard schema must resolve to its actual JSON Schema, not be quoted as an opaque string —
  // a worker told only "satisfy open-autonomy.review.v1" has been told nothing.
  expect(compiled.generated['hermes/profiles/review/RESULT-CONTRACT.md']).toContain('"properties"');
  expect(compiled.generated['hermes/profiles/audit/RESULT-CONTRACT.md']).toBeUndefined();
});

test('every soul is told which substrate it is on, and an ungated proposer is told it is unverified', () => {
  // A SOUL.md is its SKILL.md VERBATIM, and those skills are portable prose naming `oa dispatch`,
  // `$AUTONOMY_TRIGGER_KIND`, `gh api` — none of which exist here. `audit` is the sharp case: it is the
  // conformance auditor of THIS install, and `grep -ci hermes` on its installed soul was 0. The skill
  // cannot be edited (check-profiles' SHARED_SKILLS guard requires `audit` byte-identical across
  // profiles, correctly), so the substrate states its own facts as an appendix instead.
  const source =
    `  develop:\n    behavior: develop\n    capabilities: [code:propose]\n    execution: { workspace: isolated }\n    triggers: [{ dispatch: true }]\n` +
    `  audit:\n    behavior: audit\n    capabilities: [code:propose@docs/audits]\n    triggers: [{ cron: "0 * * * *" }]\n`;
  const tracker = 'policy: { maxConcurrent: 2, box: { tracker: { ztrackPreset: simple-sdlc } } }';
  const g = compileHermes(ir(source, tracker)).generated;
  expect(g['hermes/profiles/audit/SUBSTRATE-FACTS.md']).toContain('Hermes');
  // The gate cannot be armed on a shared-checkout proposer, so its soul must SAY its done is unverified —
  // the alternative is an actor that believes a gate is protecting it.
  expect(g['hermes/profiles/audit/SUBSTRATE-FACTS.md']).toContain('NOT behind the done-gate');
  expect(g['hermes/profiles/develop/SUBSTRATE-FACTS.md']).not.toContain('NOT behind the done-gate');
  // ...and a standing actor is told its dispatch model differs from a per-card worker's.
  expect(g['hermes/profiles/audit/SUBSTRATE-FACTS.md']).toContain('OWN SCHEDULE');
});

test('policy.maxConcurrent is the board cap, and only a cron trigger makes an actor standing', () => {
  const parsed = ir(
    `  a:\n    behavior: a\n    capabilities: []\n    triggers: [{ cron: "0 * * * *" }, { dispatch: true }]\n` +
      `  b:\n    behavior: b\n    capabilities: []\n    triggers: [{ dispatch: true }]\n`,
  );
  expect(loweringFor(parsed).board.max_in_progress).toBe(2);
  expect(isStanding(parsed.agents.a!)).toBe(true);
  expect(isStanding(parsed.agents.b!)).toBe(false);
});
