// What substrate am I on? — appended to every installed SOUL.md.
//
// THE DEFECT: a Hermes profile's SOUL.md is its SKILL.md VERBATIM, and those skills are PORTABLE prose
// shared with the `local` and `gh-actions` substrates. So a worker here is handed doctrine that names
// `scripts/run-agent.mjs`, `oa dispatch`, `$AUTONOMY_TRIGGER_KIND`, `gh api`, and `.github/workflows/` —
// none of which exist — and nothing in the 500 lines it reads ever says the word "hermes" or "kanban".
// `audit` is the worst case: it is the CONFORMANCE auditor of this install, its own doctrine tells it to
// report "which board substrate is live", and it is structurally blind to the answer. Every structural
// check it runs reports a broken local/gh-actions install. (`grep -ci hermes` on the installed
// profiles/audit/SOUL.md: 0.)
//
// It cannot be fixed by editing the skill: `bin/check-profiles.ts`'s SHARED_SKILLS guard requires `audit`
// to stay byte-identical across profiles, and that guard is correct — the audit doctrine is deliberately
// one artifact. So the substrate states its own facts the same way it states the result-envelope contract:
// an appendix the installer adds, leaving the portable file untouched. Prose the worker actually reads is
// the only channel a model-driven profile has.
import type { AutonomyIR } from '@open-autonomy/core';
import type { HermesLowering } from './emit';

export const SUBSTRATE_FACTS_FILE = 'SUBSTRATE-FACTS.md';

export function substrateFacts(ir: AutonomyIR, lowering: HermesLowering, role: string): string {
  const profile = lowering.profiles.find((p) => p.role === role);
  // A BOUND REVIEWER IS NOT ON TRUNK, and saying so in a section declared authoritative was the worst kind
  // of wrong: `review` lowers to `dir`, so the naive reading of `profile.workspace` is "the shared
  // checkout" — but `openReviewCard` places a bound, non-isolated reviewer in the PROPOSAL'S worktree, and
  // its skill REQUIRES it to commit its verdict there. An appendix that both outranks the skill and
  // contradicts it leaves the worker with no correct move: refuse to commit (the verdict never lands) or
  // abort on its own branch assertion. So the workspace line is derived from the review EDGE, not from the
  // lowered kind alone.
  const boundReviewerOf = Object.entries(ir.agents).find(
    ([, a]) => a.review === role && a.execution?.workspace === 'isolated',
  )?.[0];
  const inProposalWorktree = !!boundReviewerOf && profile?.workspace !== 'worktree';
  const gated = lowering.ztrack?.gatedRoles.includes(role) ?? false;
  const standing = profile?.standing ?? false;
  // An actor can be BOTH. `audit` declares a cron trigger AND a dispatch trigger, and `isStanding` is just
  // "has a cron" — so a binary branch told a DISPATCHED audit worker it owned no card and that
  // `kanban_complete` would fail. Obeying that (the section declares itself authoritative) ends the turn
  // without completing, the card sits `running` until its lease expires, gets reclaimed, and re-dispatches
  // forever. `standing` is a property of the RUN, not of the actor, and prose cannot know the run — so when
  // both are possible the appendix must describe both and tell the worker how to tell them apart.
  const dispatchable = (ir.agents[role]?.triggers ?? []).some((t) => 'dispatch' in t);
  const dualMode = standing && dispatchable;
  const ungatedProposer =
    !!lowering.ztrack && !gated && (ir.agents[role]?.capabilities ?? []).some((c) => c.split('@')[0] === 'code:propose');

  return `
---

# Where you are actually running

Your instructions above are **portable doctrine**, shared with substrates that work differently from this
one. Where they disagree with this section, **this section wins** — it describes the machine you are on.

You are a **Hermes** profile (\`${role}\`), and the work item you were given is a **kanban card**. There is no
\`scripts/run-agent.mjs\`, no \`oa\` command, no \`$AUTONOMY_TRIGGER_KIND\`, no GitHub Actions workflow, and no
\`gh\` CLI here. Do not look for them, and do not report their absence as a defect — this install is not
supposed to have them.

What exists instead:

| you may need | here it is |
|---|---|
| your work item | ${
    standing
      ? dualMode
        ? '**check `$HERMES_KANBAN_TASK` first.** Set ⇒ it names your card. Unset ⇒ you were fired by cron and own none; read the board with `bun scripts/runner.ts list --all --json`.'
        : 'nothing — you fire on a schedule, own no card, and `$HERMES_KANBAN_TASK` is UNSET. Read the board with `bun scripts/runner.ts list --all --json`.'
      : 'the kanban card named by `$HERMES_KANBAN_TASK` (`hermes kanban show "$HERMES_KANBAN_TASK" --json`)'
  } |
| your workspace | ${
    inProposalWorktree
      ? `**the \`${boundReviewerOf}\` worktree you were opened for** — its branch is checked out, its commits are here, and its worker has already finished. Commit your verdict HERE, beside the evidence.`
      : profile?.workspace === 'worktree'
        ? 'your own git worktree, on a branch named for your issue'
        : 'the shared repository checkout (you are on trunk — do NOT commit there unless your doctrine says you integrate)'
  } |
${
    (ir.agents[role]?.capabilities ?? []).some((c) => c.split('@')[0] === 'agent:launch')
      ? '| launching work | `bun scripts/runner.ts launch <actor> --ref <issue>` — the only sanctioned path. It also opens the review card. Never create a board card by hand. |'
      : '| launching work | **not yours.** You do not hold `agent:launch`; filing work for another actor is the PM\'s job. |'
  }
| what is in flight | \`bun scripts/runner.ts list --json\` — add \`--all\` to include FINISHED cards, which is what integration needs |
| reaching a human | \`kanban_block\` with kind \`needs_input\`. The card then waits for a real operator's \`hermes kanban unblock\`. That is the ONLY human seam; there is no \`runner.ts update\`. |
| finishing | ${
    standing
      ? dualMode
        ? '`kanban_complete` **if `$HERMES_KANBAN_TASK` is set**; otherwise just end your turn — with no card there is nothing to complete and the call fails.'
        : 'just end your turn — you own no card, so `kanban_complete` has nothing to complete and will fail.'
      : `\`kanban_complete\`${gated ? ' — **gated**: it is REFUSED until `ztrack check` is green in your workspace, and the refusal hands you the findings' : ''}`
  } |
| what this install granted you | \`hermes/lowering.json\` — the compile's receipt: every actor's capabilities, toolsets, workspace, and the honest \`findings\` list of what this substrate does NOT enforce |

Your tools are exactly: \`${(profile?.toolsets ?? []).join('`, `') || '(none)'}\`. If your doctrine tells you to
run something you have no tool for, that is a real finding — report it, do not improvise around it.

${
    dualMode
      ? `You can be fired BOTH WAYS, so decide from the environment, not from memory: with \`$HERMES_KANBAN_TASK\` SET you are a per-card worker and must complete that card; UNSET you are a cron run that owns nothing. Hermes also offers the board-wide tools (\`kanban_list\`) only in the second mode.\n`
      : standing
        ? `You run on your OWN SCHEDULE (a Hermes cron job), not per-card. \`$HERMES_KANBAN_TASK\` is unset in that mode, and Hermes offers you the board-wide tools (\`kanban_list\`) that a per-card worker is denied.\n`
        : `You were spawned by the dispatcher for ONE card and you end when it does.\n`
  }${
    ungatedProposer
      ? `\n**You are NOT behind the done-gate.** You propose commits, but you run in the shared checkout with no issue branch, so \`ztrack check --auto-scope\` has nothing to resolve from and the gate cannot be armed on you. Nothing verifies your completion — your \`done\` means only that you returned. Hold yourself to the standard the gate would have applied.\n`
      : ''
  }
The scheduler is the **kernel**, not you and not the PM: it decides when a card runs, caps concurrency,
leases claims, kills overruns, and re-queues dead workers. Do not re-implement any of that, and do not
count workers to decide whether you may act.
`;
}
