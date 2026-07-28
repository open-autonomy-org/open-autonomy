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

test('execution.workspace: isolated lowers to a Hermes worktree, shared/omitted to scratch', () => {
  const { profiles } = loweredProfiles(
    ir(
      `  a:\n    behavior: a\n    capabilities: [code:propose]\n    execution: { workspace: isolated }\n    triggers: [{ dispatch: true }]\n` +
        `  b:\n    behavior: b\n    capabilities: [code:propose]\n    triggers: [{ dispatch: true }]\n`,
    ),
  );
  expect(profiles.map((p) => p.workspace)).toEqual(['worktree', 'scratch']);
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
    `  develop:\n    behavior: develop\n    capabilities: [code:propose]\n    triggers: [{ dispatch: true }]\n` +
    `  review:\n    behavior: review\n    capabilities: [code:review]\n    triggers: [{ dispatch: true }]\n` +
    `  audit:\n    behavior: audit\n    capabilities: [code:propose@docs/audits]\n    triggers: [{ dispatch: true }]\n`;
  const tracker = 'policy: { maxConcurrent: 2, box: { tracker: { ztrackPreset: simple-sdlc } } }';
  // A scoped capability still gates on its AXIS — `audit` proposes commits like anyone else.
  expect(loweringFor(ir(source, tracker)).ztrack?.gatedRoles).toEqual(['develop', 'audit']);
  // No tracker declared ⇒ no verification plane ⇒ no gate emitted, rather than an inert one.
  expect(loweringFor(ir(source)).ztrack).toBeUndefined();
  expect(compileHermes(ir(source)).generated['hermes/hooks/ztrack-done-gate.py']).toBeUndefined();
  expect(compileHermes(ir(source, tracker)).generated['hermes/hooks/ztrack-done-gate.py']).toContain('--auto-scope');
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
